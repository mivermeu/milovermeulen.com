/**
 * Low-precision solar ephemeris, hand-rolled from the standard USNO
 * "low accuracy" algorithm (Astronomical Almanac / Meeus ch. 25 light version).
 * Accuracy is ~0.01°–0.3° over the decades near J2000 — far better than the
 * visual needs of a terminator line or cylindrical eclipse classification.
 *
 * Coordinate frames:
 * - ECI (equatorial, of date): x toward the vernal equinox, z toward the north
 *   celestial pole. Close enough to J2000 for our tolerance.
 * - ECF (earth-fixed, Greenwich on the prime meridian): ECI rotated by +GMST.
 *   Matches satellite.js's `gstime`/`eciToEcf` convention, which the scene and
 *   worker already use.
 */

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** Unix epoch's Julian date: 1970-01-01T00:00:00Z = J2440587.5. */
const JULIAN_UNIX_EPOCH = 2440587.5;
const J2000_JULIAN_DATE = 2451545.0;

/** Obliquity of the ecliptic (deg) at J2000, drifting ~-0.0000004°/day. */
const OBLIQUITY_J2000_DEG = 23.439;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Julian date for a unix timestamp in milliseconds (UTC). */
export function julianDate(dateMs: number): number {
    return dateMs / 86400000 + JULIAN_UNIX_EPOCH;
}

/** Days since the J2000 epoch (2000-01-01T12:00:00Z). May be fractional/negative. */
export function daysSinceJ2000(dateMs: number): number {
    return julianDate(dateMs) - J2000_JULIAN_DATE;
}

/**
 * Greenwich mean sidereal time in radians, wrapped [0, 2π). Hand-rolled
 * standard polynomial (IAU 1982) so this module stays dependency-free —
 * numerically equivalent to satellite.js's `gstime`.
 */
export function gmstRadians(dateMs: number): number {
    const n = daysSinceJ2000(dateMs);
    const deg = 280.46061837 + 360.98564736629 * n;
    return (((deg % 360) + 360) % 360) * DEG2RAD;
}

/** Mean anomaly of the sun (deg), wrapped to [0, 360). */
function solarMeanAnomalyDeg(n: number): number {
    return (((357.528 + 0.9856003 * n) % 360) + 360) % 360;
}

/**
 * Distance from Earth's center to the sun in km (low-precision series in AU).
 * Only the direction classifies sunlight, but the distance is useful for a
 * truthful subsolar "sun overhead" framing and costs one extra term.
 */
export function sunDistanceKm(dateMs: number): number {
    const AU_KM = 149597870.7;
    const n = daysSinceJ2000(dateMs);
    const g = solarMeanAnomalyDeg(n) * DEG2RAD;
    const au = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
    return au * AU_KM;
}

/**
 * Unit vector from Earth's center toward the sun in ECI (equatorial frame of
 * date). Magnitude is exactly 1.
 */
export function sunEciDirection(dateMs: number): Vec3 {
    const n = daysSinceJ2000(dateMs);
    const g = solarMeanAnomalyDeg(n) * DEG2RAD;
    const meanLon = 280.46 + 0.9856474 * n;
    // Apparent ecliptic longitude: mean longitude + equation-of-center terms.
    const lambda = (meanLon + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG2RAD;
    const eps = (OBLIQUITY_J2000_DEG - 0.0000004 * n) * DEG2RAD;
    return {
        x: Math.cos(lambda),
        y: Math.cos(eps) * Math.sin(lambda),
        z: Math.sin(eps) * Math.sin(lambda)
    };
}

/** Rotate an ECI direction into ECF by a GMST angle (radians): R(-gmst)·v. */
export function eciDirectionToEcf(v: Vec3, gmst: number): Vec3 {
    const c = Math.cos(gmst);
    const s = Math.sin(gmst);
    return { x: c * v.x + s * v.y, y: -s * v.x + c * v.y, z: v.z };
}

/** Sun unit vector in ECF (earth-fixed): rotate the ECI sun by -GMST(date). */
export function sunEcfDirection(dateMs: number, gmst?: number): Vec3 {
    return eciDirectionToEcf(sunEciDirection(dateMs), gmst ?? gmstRadians(dateMs));
}

export interface SubsolarPoint {
    /** Geodetic-ish latitude of the subsolar point, degrees [-90, 90]. */
    latDeg: number;
    /** Longitude in degrees, wrapped to [-180, 180). */
    lonDeg: number;
}

/** Point on Earth's surface where the sun is at zenith, degrees. */
export function subsolarPoint(dateMs: number, gmst?: number): SubsolarPoint {
    const s = sunEcfDirection(dateMs, gmst);
    const hyp = Math.hypot(s.x, s.y);
    const latDeg = Math.atan2(s.z, hyp) * RAD2DEG;
    let lonDeg = Math.atan2(s.y, s.x) * RAD2DEG;
    if (lonDeg >= 180) lonDeg -= 360;
    return { latDeg, lonDeg };
}

/** Earth's equatorial radius (km, WGS-84) used for shadow interception. */
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;

/**
 * Cylindrical (umbra-only) eclipse test: the satellite is sunlit unless it is
 * behind Earth relative to the sun AND inside the cylinder of Earth's radius
 * around the anti-sun axis. Penumbra and atmosphere refraction are ignored —
 * the classic simplification for visualization.
 */
export function isSunlit(
    positionEciKm: Vec3,
    sunUnitEci: Vec3,
    earthRadiusKm = EARTH_EQUATORIAL_RADIUS_KM
): boolean {
    const axial =
        positionEciKm.x * sunUnitEci.x +
        positionEciKm.y * sunUnitEci.y +
        positionEciKm.z * sunUnitEci.z;
    if (axial > 0) return true; // sunward half-space
    const perp2 =
        positionEciKm.x ** 2 + positionEciKm.y ** 2 + positionEciKm.z ** 2 - axial * axial;
    return perp2 >= earthRadiusKm * earthRadiusKm;
}
