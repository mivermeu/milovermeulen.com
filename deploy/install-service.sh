#!/usr/bin/env bash
# Install a long-running service from services/<name> onto this host.
#
#   deploy/install-service.sh transit                     # tests, code, units, daemon-reload
#   deploy/install-service.sh transit --enable            # also enable + restart its units
#   deploy/install-service.sh transit --enable --nginx    # also install deploy/nginx.conf and reload nginx
#   deploy/install-service.sh --all --enable              # every service in the table below
#
# Why a script: the unit templates are generic, but the host needs a real install
# root, a service user and its data directories. Doing that by hand drifts, and
# working directories under /home are unusable by service users (0750 home dirs).
#
# Host layout it produces:
#   code   /opt/milovermeulen/services/<name>   (read-only to the service)
#   units  /etc/systemd/system/<unit>.service   (from services/<name>/systemd)
#   dirs   per-service, see SERVICE_SPECS
#   route  deploy/nginx.conf -> /etc/nginx/sites-available/satellite-api
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
INSTALL_ROOT=/opt/milovermeulen
NGINX_SITE=/etc/nginx/sites-available/satellite-api

# name|service user|data directories (space separated, created if missing)
SERVICE_SPECS=(
    "tracker|milo|/var/www/satellite-api"
    "transit|transit|/var/lib/transit-archive /var/www/transit-api"
)

usage() {
    cat <<'EOF'
Usage: deploy/install-service.sh <service> [more services...] [options]

  --all          every service declared in SERVICE_SPECS
  --enable       enable and restart the units after installing
  --nginx        install deploy/nginx.conf and reload nginx
  --skip-tests   skip the service's pytest run
  -h, --help     this text

Installs code to /opt/milovermeulen/services/<name>, creates the service user and
its data directories, substitutes the unit templates in services/<name>/systemd,
reloads systemd, and optionally enables the units and the nginx vhost.
EOF
    exit "${1:-0}"
}

die() {
    printf 'install-service: %s\n' "$*" >&2
    exit 1
}

spec_for() {
    local name=$1 entry
    for entry in "${SERVICE_SPECS[@]}"; do
        if [ "${entry%%|*}" = "$name" ]; then
            printf '%s\n' "$entry"
            return 0
        fi
    done
    return 1
}

all_services() {
    local entry
    for entry in "${SERVICE_SPECS[@]}"; do
        printf '%s\n' "${entry%%|*}"
    done
}

install_nginx() {
    [ -f "$REPO_ROOT/deploy/nginx.conf" ] || die "deploy/nginx.conf missing"
    sudo install -m 644 -o root -g root "$REPO_ROOT/deploy/nginx.conf" "$NGINX_SITE"
    sudo nginx -t
    sudo systemctl reload nginx
    printf '  nginx: installed %s and reloaded\n' "$NGINX_SITE"
}

install_service() {
    local name=$1 spec user dirs src dst unit_file units=()
    spec=$(spec_for "$name") || die "unknown service '$name' (known: $(all_services | tr '\n' ' '))"
    IFS='|' read -r _ user dirs <<<"$spec"
    src="$REPO_ROOT/services/$name"
    dst="$INSTALL_ROOT/services/$name"

    [ -d "$src" ] || die "no such service directory: services/$name"

    printf '\n== %s ==\n' "$name"

    if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- "services/$name")" ]; then
        die "services/$name has uncommitted changes; commit or stash first"
    fi

    if [ "$skip_tests" = 0 ] && [ -d "$src/tests" ]; then
        local pytest_python=""
        for candidate in python3.12 python3; do
            if "$candidate" -c 'import pytest' >/dev/null 2>&1; then
                pytest_python=$candidate
                break
            fi
        done
        if [ -z "$pytest_python" ]; then
            printf '  tests: SKIPPED (no interpreter with pytest found; CI still gates this)\n'
        else
            printf '  tests (%s): ' "$pytest_python"
            if ! (cd "$REPO_ROOT" && "$pytest_python" -m pytest "services/$name/tests" -q \
                >/tmp/install-service-test.log 2>&1); then
                tail -20 /tmp/install-service-test.log
                die "tests failed for $name (use --skip-tests to bypass)"
            fi
            tail -1 /tmp/install-service-test.log
        fi
    fi

    # Service user and data directories.
    if ! id "$user" >/dev/null 2>&1; then
        sudo useradd --system --shell /usr/sbin/nologin "$user"
        printf '  user: created %s\n' "$user"
    fi
    local dir
    for dir in $dirs; do
        sudo mkdir -p "$dir"
        sudo chown "$user:$user" "$dir"
        sudo chmod 755 "$dir"
    done
    [ -n "$dirs" ] && printf '  dirs: %s (owned by %s)\n' "$dirs" "$user"

    # Code: package modules plus docs, no tests, no bytecode.
    sudo install -d -m 755 "$INSTALL_ROOT/services" "$dst"
    local file
    for file in "$src"/*.py "$src"/README.md; do
        [ -f "$file" ] || continue
        sudo install -m 644 "$file" "$dst/$(basename "$file")"
    done
    sudo chmod -R a+rX "$dst"
    printf '  code: %s\n' "$dst"

    # Units: substitute the install root, refuse anything still pointing elsewhere.
    # Timers are installed alongside their service; only services carry a cwd.
    for unit_file in "$src"/systemd/*.service "$src"/systemd/*.timer; do
        [ -f "$unit_file" ] || continue
        unit=$(basename "$unit_file")
        sed "s|/path/to/milovermeulen.com|$INSTALL_ROOT|g" "$unit_file" >"/tmp/$unit"
        case "$unit" in
            *.service)
                grep -q "^WorkingDirectory=$INSTALL_ROOT\$" "/tmp/$unit" ||
                    die "$unit: WorkingDirectory is not $INSTALL_ROOT after substitution"
                ;;
        esac
        sudo install -m 644 -o root -g root "/tmp/$unit" "/etc/systemd/system/$unit"
        rm -f "/tmp/$unit"
        units+=("$unit")
        printf '  unit: %s\n' "$unit"
    done
    [ "${#units[@]}" -gt 0 ] || die "no systemd units in services/$name/systemd"

    sudo systemctl daemon-reload

    if [ "$enable" = 1 ]; then
        for unit in "${units[@]}"; do
            # Timers are enabled directly. A oneshot service with no [Install]
            # (e.g. a graph rebuild) is triggered by its timer, never enabled.
            if [ "$unit" != "${unit%.timer}" ]; then
                sudo systemctl enable --now "$unit" >/dev/null
            elif grep -q '^\[Install\]' "/etc/systemd/system/$unit"; then
                sudo systemctl enable "$unit" >/dev/null
                sudo systemctl restart "$unit"
            else
                printf '  %-24s %s\n' "$unit" "oneshot (not enabled)"
                continue
            fi
            printf '  %-24s %s\n' "$unit" "$(systemctl is-active "$unit")"
        done
    fi
}

enable=0
skip_tests=0
nginx=0
services=()

while [ $# -gt 0 ]; do
    case "$1" in
        --all) mapfile -t services < <(all_services) ;;
        --enable) enable=1 ;;
        --nginx) nginx=1 ;;
        --skip-tests) skip_tests=1 ;;
        -h | --help) usage 0 ;;
        -*) die "unknown option '$1' (try --help)" ;;
        *) services+=("$1") ;;
    esac
    shift
done

[ "${#services[@]}" -gt 0 ] || usage 1
[ "$(id -u)" -eq 0 ] && die "run as your normal user; the script calls sudo itself"

for name in "${services[@]}"; do
    install_service "$name"
done

[ "$nginx" = 1 ] && install_nginx

printf '\nDone. Logs: journalctl -u <unit> -f\n'
