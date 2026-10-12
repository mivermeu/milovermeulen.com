import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { gstime } from 'satellite.js';
import { base } from '$app/paths';
import { trackerState } from '$lib/state.svelte';
import type { ParsedSatellite } from '$lib/satellites/types';
import { propagation, blendInto, type WorkerResponse } from '$lib/propagation';
import { eciDirectionToEcf, sunEciDirection, type Vec3 } from '$lib/sun';
import { renderEpochMs } from '$lib/state.svelte';
import { epochAction, renderBlend } from '$lib/simclock';
import { isContiguousPairs, firstVertexAtOrAfter, slideUniformWindow } from '$lib/trackSlide';

const EARTH_RADIUS_KM = 6371;
export const GLOBE_RADIUS = 6.4;
export const SCALE = GLOBE_RADIUS / EARTH_RADIUS_KM;

const DEG2RAD = Math.PI / 180;
const ORBIT_REBUILD_INTERVAL_MS = 5000;
// Ground-track draw window: one orbital period in per-period steps — must
// match the worker's ground-track sampling (`POINTS`) so a slid window's
// vertex indices line up with the bake.
const GROUND_WINDOW_STEPS = 128;
// Catalog size ceiling for per-frame slid orbit windows: rebuilding every
// satellite's window each frame costs ~half the bake as a memcpy, so beyond
// this the mesh keeps the old cadence-rebuilt static draw instead.
const ORBIT_SLIDE_MAX_SATS = 1500;
// While paused, scene geometry is static unless the clock is scrubbed; only
// re-ask the worker when the simulated epoch drifted well away from the last
// orbit build — throttled so dragging the slider doesn't queue a storm.
const ORBIT_PAUSE_DRIFT_MS = 60_000;
const ORBIT_PAUSE_REBUILD_MS = 1000;
const POINTER_THROTTLE_MS = 66;
// The sun's motion is ~15°/hour in longitude, but the ephemeris + ring refill
// is cheap enough to run per rendered frame, so the terminator tracks the
// rendered clock exactly instead of stepping on a refresh cadence.
const TERMINATOR_POINTS = 128;

export interface GlobeSceneCallbacks {
    onError?: (message: string) => void;
    onHover?: (index: number, name: string | null, screenX: number, screenY: number) => void;
    onSelect?: (index: number) => void;
}

export class GlobeScene {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly unsubscribe: () => void;
    private readonly points: THREE.Points;
    private readonly pointsGeometry: THREE.BufferGeometry;
    private positionArray: Float32Array;
    private readonly orbitMesh: THREE.LineSegments;
    private readonly orbitGeometry: THREE.BufferGeometry;
    private readonly equatorRing: THREE.LineLoop;
    private readonly equatorialPlane: THREE.Mesh;
    private readonly ascendingNode: THREE.LineLoop;
    private readonly descendingNode: THREE.LineLoop;
    private readonly landMesh: LineSegments2;
    private readonly landGeometry: LineSegmentsGeometry;
    private readonly earth: THREE.Mesh;
    private readonly resizeObserver: ResizeObserver;
    private readonly highlightMesh: THREE.LineSegments;
    private readonly highlightGeometry: THREE.BufferGeometry;
    private readonly nightOverlay: THREE.Mesh;
    private readonly terminatorRing: THREE.LineLoop;
    private sunEci: Vec3 = sunEciDirection(0);
    private readonly termScratchA = new THREE.Vector3();
    private readonly termScratchB = new THREE.Vector3();
    private readonly groundTrackMesh: THREE.LineSegments;
    private readonly groundTrackGeometry: THREE.BufferGeometry;
    private showGroundTrack = true;
    private groundTrackIndex = -1;
    private groundTrackReady = false;
    private groundRequestSeq = 0;
    private lastGroundTrackWall = 0;
    // Sliding-window bookkeeping for the ground track (decoupled cadence/draw —
    // see lib/trackSlide).
    private groundMaster: Float32Array | null = null;
    private groundTrackEpoch = 0;
    private groundPeriodMs = 0;
    private groundContiguous = false;
    private readonly groundScratch = new Float32Array(GROUND_WINDOW_STEPS * 6);

    private readonly onPointerMove: (event: PointerEvent) => void;
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private readonly onPointerEnter = (): void => {
        this.pointerOverCanvas = true;
    };
    private readonly onPointerLeave = (): void => {
        this.pointerOverCanvas = false;
        this.callbacks.onHover?.(-1, null, 0, 0);
    };
    private readonly canvas: HTMLCanvasElement;

    private ready = false;
    private lastFrameWall = performance.now();
    private lastOrbitBuildWall = 0;
    private lastReferenceFrame: 'ecf' | 'eci' = 'ecf';
    private orbitRequestSeq = 0;
    private showOrbits = true;
    private orbitsAutoDisabled = false;
    private orbitsReady = false;
    private orbitRanges: number[] = [];
    private orbitPositions: Float32Array | null = null;
    private orbitBuildGmst = 0;
    private highlightIndex = -1;
    private pointerOverCanvas = false;
    private lastPointerMoveWall = 0;
    private pointerDownX = 0;
    private pointerDownY = 0;
    private filteredToOriginal = new Map<number, number>();

    // Sliding-window bookkeeping for the highlighted orbit polyline.
    private highlightScratch: Float32Array | null = null;
    // Slid-window bookkeeping for orbit chains (see setupOrbitWindows).
    private orbitWindowMode = false;
    private orbitVertexTimes: Float32Array | null = null;
    private orbitPeriods: number[] = [];
    private orbitVertexCounts: number[] = [];
    private orbitVertexOffsets: number[] = [];
    private orbitSlideEligible = new Uint8Array(0);
    private orbitWindowScratch: Float32Array | null = null;

    private prevPositions: Float32Array | null = null;
    private nextPositions: Float32Array | null = null;
    private prevEpoch = 0;
    private nextEpoch = 0;
    private orbitRequestEpoch = 0;
    /**
     * Data regime of the held-forward snapshot (`message.revision`). -1 forces
     * the very first snapshot to snap; an older revision incoming is stale and
     * dropped; a newer one (catalog init / element-mode switch, even while
     * paused) snaps so the fresh regime takes effect immediately.
     */
    private snapshotRevision = -1;
    private catalogGeneration = 0;
    private raf = 0;
    private disposed = false;

    static create(
        canvas: HTMLCanvasElement,
        satellites: ParsedSatellite[],
        callbacks: GlobeSceneCallbacks = {}
    ): GlobeScene | null {
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
            renderer.setClearColor(0x1a1a1f, 1);
        } catch {
            callbacks.onError?.('WebGL is not available on this browser or device.');
            return null;
        }
        return new GlobeScene(canvas, satellites, callbacks, renderer);
    }

    private constructor(
        canvas: HTMLCanvasElement,
        private satellites: ParsedSatellite[],
        private readonly callbacks: GlobeSceneCallbacks,
        renderer: THREE.WebGLRenderer
    ) {
        this.renderer = renderer;
        this.filteredToOriginal = new Map();

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
        this.camera.up.set(0, 0, 1);
        this.camera.position.copy(latLonToVector(17, 8, this.initialCameraDistance()));

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 9;
        this.controls.maxDistance = 500;
        this.controls.listenToKeyEvents(canvas);

        this.earth = new THREE.Mesh(
            new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
            new THREE.MeshBasicMaterial({ color: 0x262e42 })
        );
        this.scene.add(this.earth);

        this.equatorRing = this.buildEquatorRing();
        this.scene.add(this.equatorRing);

        const planeGeo = new THREE.CircleGeometry(120, 96);
        const equatorialMat = new THREE.MeshBasicMaterial({
            color: 0x818cf8,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.equatorialPlane = new THREE.Mesh(planeGeo, equatorialMat);
        this.equatorialPlane.visible = false;
        this.scene.add(this.equatorialPlane);

        const nodeVerts: number[] = [];
        for (let a = 0; a <= 360; a += 15) {
            const rad = (a * Math.PI) / 180;
            nodeVerts.push(Math.cos(rad) * 0.15, Math.sin(rad) * 0.15, 0);
        }
        const nodeGeo = new THREE.BufferGeometry();
        nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodeVerts, 3));

        this.ascendingNode = new THREE.LineLoop(
            nodeGeo,
            new THREE.LineBasicMaterial({
                color: 0x22c55e,
                transparent: true,
                opacity: 0.8,
                depthWrite: false
            })
        );
        this.ascendingNode.visible = false;
        this.scene.add(this.ascendingNode);

        this.descendingNode = new THREE.LineLoop(
            nodeGeo.clone(),
            new THREE.LineBasicMaterial({
                color: 0xef4444,
                transparent: true,
                opacity: 0.8,
                depthWrite: false
            })
        );
        this.descendingNode.visible = false;
        this.scene.add(this.descendingNode);

        this.landGeometry = new LineSegmentsGeometry();
        this.landMesh = new LineSegments2(
            this.landGeometry,
            new LineMaterial({ color: 0x6b8ab8, linewidth: 0.01, worldUnits: true })
        );
        this.landMesh.frustumCulled = false;
        this.scene.add(this.landMesh);
        this.loadLandmass();

        this.pointsGeometry = new THREE.BufferGeometry();
        this.positionArray = new Float32Array(satellites.length * 3);
        this.pointsGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positionArray, 3)
        );
        this.points = new THREE.Points(
            this.pointsGeometry,
            new THREE.PointsMaterial({
                size: 0.25,
                sizeAttenuation: true,
                vertexColors: true,
                map: buildCircleTexture(),
                depthWrite: false,
                transparent: true,
                opacity: 0.95
            })
        );
        this.points.frustumCulled = false;
        this.points.visible = false;
        this.scene.add(this.points);

        this.orbitGeometry = new THREE.BufferGeometry();
        this.orbitMesh = new THREE.LineSegments(
            this.orbitGeometry,
            new THREE.LineBasicMaterial({
                color: 0x6a7fa8,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            })
        );
        this.orbitMesh.frustumCulled = false;
        this.orbitMesh.visible = false;
        this.scene.add(this.orbitMesh);

        this.highlightGeometry = new THREE.BufferGeometry();
        this.highlightMesh = new THREE.LineSegments(
            this.highlightGeometry,
            new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        );
        this.highlightMesh.frustumCulled = false;
        this.highlightMesh.renderOrder = 999;
        this.highlightMesh.visible = false;
        this.scene.add(this.highlightMesh);

        // Night-side dimming: a slightly oversized sphere whose alpha follows
        // the angular distance from the anti-sun limb. renderOrder -1 keeps it
        // ahead of every other transparent object, so dots/orbit lines/highlight
        // (all default order) stay on top and keep their own frequencies.
        // The globe never rotates (worker emits ECF), so object-space normal ==
        // ECF direction; the sun uniform lives in the same frame.
        this.nightOverlay = new THREE.Mesh(
            new THREE.SphereGeometry(GLOBE_RADIUS + 0.02, 48, 32),
            new THREE.ShaderMaterial({
                uniforms: { uSunDirEcf: { value: new THREE.Vector3(1, 0, 0) } },
                vertexShader: `
                    varying vec3 vEcfNormal;
                    void main() {
                        vEcfNormal = normal;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    varying vec3 vEcfNormal;
                    uniform vec3 uSunDirEcf;
                    void main() {
                        float d = dot(normalize(vEcfNormal), uSunDirEcf);
                        float day = smoothstep(-0.12, 0.22, d);
                        gl_FragColor = vec4(0.0, 0.0, 0.05, 0.5 * (1.0 - day));
                    }
                `,
                transparent: true,
                depthWrite: false
            })
        );
        this.nightOverlay.renderOrder = -1;
        this.scene.add(this.nightOverlay);

        this.terminatorRing = this.buildTerminatorRing();
        this.scene.add(this.terminatorRing);

        // Pinned-satellite ground track: nadir subpoint polyline on the globe
        // surface (always ECF, no GMST rotation semantics — unlike orbit lines).
        // Styled like the hover/pin highlight (bright accent over the surface).
        this.groundTrackGeometry = new THREE.BufferGeometry();
        this.groundTrackGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(0), 3)
        );
        this.groundTrackMesh = new THREE.LineSegments(
            this.groundTrackGeometry,
            new THREE.LineBasicMaterial({
                color: 0x8b9cc9,
                transparent: true,
                opacity: 0.45,
                depthWrite: false
            })
        );
        this.groundTrackMesh.frustumCulled = false;
        this.groundTrackMesh.renderOrder = 998;
        this.groundTrackMesh.visible = false;
        this.scene.add(this.groundTrackMesh);

        // Prime the sun state so frame 0 already has the terminator and the
        // night overlay oriented correctly to the (real-time default) clock.
        this.updateSun(gstime(new Date(renderEpochMs())));

        this.canvas = canvas;
        this.onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
        this.onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
        this.onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('pointerenter', this.onPointerEnter);
        canvas.addEventListener('pointerleave', this.onPointerLeave);

        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
        this.handleResize();

        this.unsubscribe = propagation.subscribe((message) => this.handleWorkerMessage(message));
        propagation.init(satellites, SCALE, trackerState.elementMode);

        this.raf = requestAnimationFrame(() => this.loop());
    }

    /**
     * Initial camera distance: back off on narrow viewports so the globe's
     * full diameter fits the short axis (fov 45°, globe + breathing room).
     */
    private initialCameraDistance(): number {
        const container = this.renderer.domElement.parentElement;
        const width = container?.clientWidth || 1;
        const height = container?.clientHeight || 1;
        const aspect = Math.min(1, width / height);
        const halfSpan = GLOBE_RADIUS + 1.5;
        return Math.min(42, Math.max(25, halfSpan / (Math.tan((45 * Math.PI) / 360) * aspect)));
    }

    /**
     * Terminator great circle: every point 90° from the sun direction —
     * built in ECF (earth never moves in-scene) with enough vertical samples
     * to look smooth. Animates only via the shared slow-cadence recompute.
     */
    private buildTerminatorRing(): THREE.LineLoop {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(new Float32Array(TERMINATOR_POINTS * 3), 3)
        );
        return new THREE.LineLoop(
            geometry,
            new THREE.LineBasicMaterial({
                color: 0xf59e0b,
                transparent: true,
                opacity: 0.28,
                depthWrite: false
            })
        );
    }

    /** Refill the terminator ring's vertex buffer from the sun direction. */
    private updateTerminatorGeometry(sun: Vec3): void {
        // Orthonormal basis ⊥ sun for the circle in that plane. Preallocated
        // scratch — this runs every frame.
        const axis =
            Math.abs(sun.z) > 0.99
                ? this.termScratchA.set(1, 0, 0)
                : this.termScratchA.set(0, 0, 1);
        const sunVec = this.termScratchB.set(sun.x, sun.y, sun.z).normalize();
        const u = new THREE.Vector3().crossVectors(axis, sunVec).normalize();
        const v = new THREE.Vector3().crossVectors(sunVec, u);
        const radius = GLOBE_RADIUS + 0.02;
        const attr = this.terminatorRing.geometry.getAttribute('position') as THREE.BufferAttribute;
        const out = attr.array as Float32Array;
        for (let k = 0; k < TERMINATOR_POINTS; k++) {
            const t = ((k + 0.5) / TERMINATOR_POINTS) * Math.PI * 2;
            const cu = Math.cos(t);
            const cv = Math.sin(t);
            out[k * 3] = radius * (cu * u.x + cv * v.x);
            out[k * 3 + 1] = radius * (cu * u.y + cv * v.y);
            out[k * 3 + 2] = radius * (cu * u.z + cv * v.z);
        }
        attr.needsUpdate = true;
    }

    /**
     * Sun bookkeeping: the ECI direction is recomputed on a slow wall cadence
     * (the sun barely moves), then rotated to ECF with the frame's GMST. Both
     * meshes live in the ECF frame, so the terminator geometry is built from
     * the same rotated vector the shader uses — building it from the ECI
     * vector would disagree with the night shading by the GMST angle. The 60 s
     * recompute cadence bounds the ring's own drift to ~0.25°.
     */
    /**
     * Sun bookkeeping — fully per frame: the low-precision ephemeris is a
     * handful of trig calls and the ring refill writes 128 points, so running
     * both on every rendered frame costs effectively nothing while keeping the
     * terminator and the night shading exactly in step with the *rendered*
     * simulated epoch — including through scrubs and high speeds, where the
     * old 60 s-simulated recompute cadence made the ring lag the shader and
     * then visibly snap into place. Both meshes live in the ECF frame, so the
     * geometry is rebuilt from the same GMST-rotated vector the shader uses.
     */
    private updateSun(gmst: number): void {
        const nowMs = renderEpochMs();
        this.sunEci = sunEciDirection(nowMs);
        this.updateTerminatorGeometry(eciDirectionToEcf(this.sunEci, gmst));
        const sunEcf = eciDirectionToEcf(this.sunEci, gmst);
        const mat = this.nightOverlay.material as THREE.ShaderMaterial;
        (mat.uniforms.uSunDirEcf.value as THREE.Vector3).set(sunEcf.x, sunEcf.y, sunEcf.z);
    }

    private buildEquatorRing(): THREE.LineLoop {
        const vertices: number[] = [];
        for (let lon = -180; lon <= 180; lon += 2) {
            const point = latLonToVector(0, lon, GLOBE_RADIUS);
            vertices.push(point.x, point.y, point.z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return new THREE.LineLoop(
            geometry,
            new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.55 })
        );
    }

    private async loadLandmass(): Promise<void> {
        try {
            const resp = await fetch(`${base}/land-110m.json`);
            if (!resp.ok) return;
            const geojson = await resp.json();
            const outline = buildLandmass(geojson, GLOBE_RADIUS);
            if (outline.length > 0) {
                const verts = new Float32Array(outline);
                this.landGeometry.setPositions(verts);
            }
        } catch {
            // silently ignore — globe renders fine without land
        }
    }

    private handleResize(): void {
        const container = this.renderer.domElement.parentElement;
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width === 0 || height === 0) return;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    private handleWorkerMessage(message: WorkerResponse): void {
        switch (message.type) {
            case 'ready':
                this.onReady(message);
                break;
            case 'positions':
                this.onPositions(message);
                break;
            case 'orbits':
                this.onOrbits(message);
                break;
            case 'groundTrack':
                this.onGroundTrack(message);
                break;
            case 'error':
                this.callbacks.onError?.(message.message ?? 'Worker error');
                break;
        }
    }

    private onReady(message: WorkerResponse): void {
        const count = message.count ?? 0;
        this.ready = true;
        this.catalogGeneration = message.generation ?? 0;
        this.positionArray = new Float32Array(count * 3);
        this.pointsGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positionArray, 3)
        );
        this.pointsGeometry.setAttribute(
            'color',
            new THREE.Float32BufferAttribute(message.colors ?? new Float32Array(0), 3)
        );
        if (count === 0) {
            this.callbacks.onError?.('No propagable satellites found in catalog.');
            return;
        }
        this.callbacks.onError?.('');
        if (this.showOrbits) this.requestOrbits();
    }

    private onPositions(message: WorkerResponse): void {
        if (!this.ready) return;
        // Drop snapshots from before the current catalog's init (stale race).
        if (message.generation !== this.catalogGeneration) return;
        const positions = message.positions;
        const epoch = message.epoch ?? trackerState.simEpochMs;
        if (!positions) return;
        // Eclipse colors describe "now", not the snapshot's epoch — applying
        // them before the stale-snapshot drop means a crossed eclipse boundary
        // is never lost to a duplicate/out-of-order positions message.
        this.applySunlitColors(message.colors);
        // Data-regime versioning: a newer revision (catalog init or
        // element-mode switch — even while paused) snaps in replacement data;
        // an older one is stale and dropped.
        const revision = message.revision ?? -1;
        if (revision < this.snapshotRevision) return;
        // Same-revision backwards epoch: a watchdog-refired request overtaking
        // a slow original response — the worker is FIFO, so the late arrival
        // can only be superseded data. Intentional backwards jumps (scrubs)
        // always ride a revision bump, handled below, so dropping here can
        // never eat them.
        if (revision === this.snapshotRevision && epoch < this.nextEpoch) return;
        if (
            revision > this.snapshotRevision ||
            epochAction(this.nextEpoch, epoch, propagation.cadenceMs * trackerState.simSpeed) ===
                'snap'
        ) {
            // Discontinuous simulated epoch (scrub jump/reverse) or a fresh
            // regime — replace the pair outright instead of blending across it.
            this.snapshotRevision = revision;
            this.prevPositions = positions;
            this.prevEpoch = epoch;
            this.nextPositions = positions;
            this.nextEpoch = epoch;
            this.points.visible = true;
            return;
        }
        if (epoch === this.nextEpoch) return; // same epoch → same data (paused clock)
        this.prevPositions = this.nextPositions;
        this.prevEpoch = this.nextEpoch;
        this.nextPositions = positions;
        this.nextEpoch = epoch;
        this.points.visible = true;
    }

    /** Swap the per-point colors for the latest sunlit/eclipsed classification. */
    private applySunlitColors(colors: Float32Array | undefined): void {
        if (!colors || colors.length === 0) return;
        const attr = this.pointsGeometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        if (!attr || colors.length !== attr.count * 3) return;
        (attr.array as Float32Array).set(colors);
        attr.needsUpdate = true;
    }

    private onOrbits(message: WorkerResponse): void {
        if (message.requestId !== this.orbitRequestSeq) return;
        const positions = message.positions;
        if (!positions || positions.length === 0) return;
        this.orbitPositions = positions;
        this.orbitRanges = message.ranges ?? [];
        // GMST of the epoch the orbits were built for (simulated time), not of
        // wall-clock now — otherwise the mesh would drift out of alignment with
        // the simulated clock.
        this.orbitBuildGmst = gstime(new Date(this.orbitRequestEpoch));
        this.orbitsReady = true;
        this.setupOrbitWindows(message);
        this.updateOrbitVisibility();
        if (this.highlightIndex >= 0) this.showHighlight(this.highlightIndex);
    }

    /**
     * Digest an orbit bake for slid windows. The bake holds two ν-continuity
     * chains per satellite plus per-sat chain vertex times and periods; for
     * catalogs under the slide cap the merged mesh is rebuilt per frame, each
     * satellite's drawn window sliding to start at its live dot position. For
     * larger catalogs (or broken chain metadata) the mesh shows the bake's
     * first period statically, as before sliding.
     */
    private setupOrbitWindows(message: WorkerResponse): void {
        const ranges = this.orbitRanges;
        const satCount = ranges.length / 2;
        const times = message.vertexTimes ?? null;
        const periods = message.periods ?? [];
        const counts = message.vertexCounts ?? [];
        const slideCapable =
            !!times &&
            periods.length === satCount &&
            counts.length === satCount &&
            this.satellites.length <= ORBIT_SLIDE_MAX_SATS &&
            times.length > 0;
        if (!slideCapable) {
            this.orbitWindowMode = false;
            // Static first period per satellite (the doubled bake's second half
            // would double-draw every orbit).
            const staticBuffer = this.buildStaticOrbits();
            if (staticBuffer.length > 0) {
                this.orbitGeometry.setAttribute(
                    'position',
                    new THREE.BufferAttribute(staticBuffer, 3)
                );
                this.orbitGeometry.setDrawRange(0, staticBuffer.length / 3);
            }
            return;
        }

        this.orbitWindowMode = true;
        this.orbitVertexTimes = times;
        this.orbitPeriods = periods;
        this.orbitVertexCounts = counts;
        const offsets = new Array<number>(satCount + 1).fill(0);
        const eligible = new Uint8Array(satCount);
        let totalWindowPairs = 0;
        for (let s = 0; s < satCount; s++) {
            const pairs2 = this.chainPairCount(s);
            // Single contiguous run ⇔ vertex count = pair count + 1: fragmented
            // chains (SGP4-failure gaps between runs) can't slide coherently.
            const ok = periods[s] > 0 && pairs2 >= 2 && counts[s] === pairs2 + 1;
            eligible[s] = ok ? 1 : 0;
            totalWindowPairs += ok ? (counts[s] - 1) / 2 : Math.floor(pairs2 / 2);
            offsets[s + 1] = offsets[s] + counts[s];
        }
        this.orbitVertexOffsets = offsets;
        this.orbitSlideEligible = eligible;
        this.orbitWindowScratch = new Float32Array(totalWindowPairs * 6);
        this.orbitGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.orbitWindowScratch, 3)
        );
        this.rebuildOrbitWindows();
    }

    private chainPairCount(satIndex: number): number {
        const start = this.orbitRanges[satIndex * 2];
        const end = this.orbitRanges[satIndex * 2 + 1];
        return Math.max(0, (end - start) / 6);
    }

    /** Static (non-sliding) mesh: each satellite's bake's first period only. */
    private buildStaticOrbits(): Float32Array {
        const master = this.orbitPositions;
        if (!master) return new Float32Array(0);
        const satCount = this.orbitRanges.length / 2;
        let total = 0;
        for (let s = 0; s < satCount; s++) {
            total += Math.floor(this.chainPairCount(s) / 2) * 6;
        }
        const out = new Float32Array(total);
        let w = 0;
        for (let s = 0; s < satCount; s++) {
            const start = this.orbitRanges[s * 2];
            const pairs = Math.floor(this.chainPairCount(s) / 2);
            for (let j = 0; j < pairs; j++) {
                out.set(master.subarray(start + j * 6, start + j * 6 + 6), w);
                w += 6;
            }
        }
        return out;
    }

    /** Visibility only — window geometry is painted per frame while sliding. */
    private updateOrbitVisibility(): void {
        this.orbitMesh.visible = this.showOrbits && this.orbitsReady;
        // Highlight mesh stays visible when focused, regardless of showOrbits.
        this.highlightMesh.visible = this.highlightIndex >= 0 && this.orbitsReady;
    }

    /**
     * Per-frame rebuild of the merged orbit mesh: every satellite's drawn
     * window slides along its doubled ν-bake so it starts at the satellite's
     * live dot position and runs one full period ahead — identical treatment
     * for every drawn orbit, pinned or not.
     *
     * Like the ground track, the window is future-only: it never closes back
     * onto the anchor (in ECF the one-period track's endpoints sit ~22° apart
     * — the earth rotates under the orbit — so bridging start and end would
     * draw a giant false chord). When the render epoch runs past the bake
     * (an overdue rebuild), the freshest full period is drawn instead.
     */
    private rebuildOrbitWindows(): void {
        if (!this.orbitWindowMode || !this.orbitPositions || !this.orbitVertexTimes) return;
        const master = this.orbitPositions;
        const times = this.orbitVertexTimes;
        const scratch = this.orbitWindowScratch;
        if (!scratch) return;
        // Per-sat times are offsets (ms) from the shared bake epoch.
        const target = renderEpochMs() - this.orbitRequestEpoch;
        const satCount = this.orbitPeriods.length;
        let w = 0;
        for (let s = 0; s < satCount; s++) {
            const start = this.orbitRanges[s * 2];
            const end = this.orbitRanges[s * 2 + 1];
            if (end <= start) continue;
            const chainPairs = this.chainPairCount(s);
            // The focused satellite's window is painted by the highlight mesh
            // (brighter, thicker) — skip it in the merged layer.
            const isFocus = s === this.highlightIndex && this.highlightIndex >= 0;
            if (this.orbitSlideEligible[s] !== 1) {
                // Fragmented/metadata-broken chain: static first period.
                const staticPairs = Math.max(0, Math.floor(chainPairs / 2));
                if (isFocus) {
                    this.writeStaticHighlight(master, start, staticPairs);
                } else {
                    for (let j = 0; j < staticPairs; j++) {
                        scratch.set(master.subarray(start + j * 6, start + j * 6 + 6), w);
                        w += 6;
                    }
                }
                continue;
            }
            const vOff = this.orbitVertexOffsets[s];
            const vCount = this.orbitVertexCounts[s];
            const v0Pairs = (vCount - 1) / 2;
            const k0 = firstVertexAtOrAfter(times, vOff, vCount, target);
            if (k0 < 0 || k0 > v0Pairs) {
                // Stale bake (the render epoch ran past it): draw the freshest
                // full period as a static window, no anchor splice.
                const base = start + v0Pairs * 6;
                for (let j = 0; j < v0Pairs; j++) {
                    scratch.set(master.subarray(base + j * 6, base + j * 6 + 6), w);
                    w += 6;
                }
                if (isFocus) this.writeHighlightFrom(w - v0Pairs * 6, v0Pairs);
                continue;
            }
            const i = s * 3;
            const ax = this.positionArray[i];
            const ay = this.positionArray[i + 1];
            const az = this.positionArray[i + 2];
            const anchorOk = Number.isFinite(ax + ay + az);
            // Future-only window: the first edge replaces the chain's own lead
            // edge with one starting at the exact live dot position; the rest
            // come straight from the bake.
            for (let j = 0; j < v0Pairs; j++) {
                if (anchorOk) {
                    if (j === 0) {
                        scratch[w++] = ax;
                        scratch[w++] = ay;
                        scratch[w++] = az;
                    } else {
                        this.copyChainVertex(master, start, chainPairs, k0 + j - 1, scratch, w);
                        w += 3;
                    }
                    this.copyChainVertex(master, start, chainPairs, k0 + j, scratch, w);
                    w += 3;
                } else {
                    this.copyChainVertex(master, start, chainPairs, k0 + j, scratch, w);
                    w += 3;
                    this.copyChainVertex(master, start, chainPairs, k0 + j + 1, scratch, w);
                    w += 3;
                }
            }
            if (isFocus) this.writeHighlightFrom(w - v0Pairs * 6, v0Pairs);
        }
        (this.orbitGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        this.orbitGeometry.setDrawRange(0, w / 3);
    }

    private writeHighlightFrom(off: number, pairs: number): void {
        if (pairs < 2) return;
        const scratch = this.orbitWindowScratch;
        if (!scratch || off < 0) return;
        const need = pairs * 6;
        if (!this.highlightScratch || this.highlightScratch.length !== need) {
            this.highlightScratch = new Float32Array(need);
            this.highlightGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.highlightScratch, 3)
            );
        }
        this.highlightScratch.set(scratch.subarray(off, off + need));
        (this.highlightGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
            true;
    }

    /** Highlight fallback: copy `pairs` flat pairs straight from a master slice. */
    private writeStaticHighlight(master: Float32Array, start: number, pairs: number): void {
        if (pairs < 2) return;
        const need = pairs * 6;
        if (!this.highlightScratch || this.highlightScratch.length !== need) {
            this.highlightScratch = new Float32Array(need);
            this.highlightGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.highlightScratch, 3)
            );
        }
        this.highlightScratch.set(master.subarray(start, start + need));
        (this.highlightGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
            true;
    }

    /** Copy chain vertex k of a satellite's pair-chain into `out[offset..]`. */
    private copyChainVertex(
        master: Float32Array,
        start: number,
        chainPairs: number,
        k: number,
        out: Float32Array,
        offset: number
    ): void {
        // The chain stores pairs (v_j, v_j+1): vertex k < chainPairs lives at
        // k·6; the final vertex exists only as the last pair's b.
        const src = k < chainPairs ? k * 6 : (k - 1) * 6 + 3;
        if (offset + 3 > out.length) return;
        out[offset] = master[start + src];
        out[offset + 1] = master[start + src + 1];
        out[offset + 2] = master[start + src + 2];
    }

    private onGroundTrack(message: WorkerResponse): void {
        if (message.requestId !== this.groundRequestSeq) return;
        if (message.generation !== undefined && message.generation !== this.catalogGeneration) {
            return;
        }
        const positions = message.positions;
        if (positions && positions.length >= 2) {
            this.groundMaster = positions;
            this.groundTrackEpoch = message.epoch ?? 0;
            this.groundPeriodMs = message.periodMs ?? 0;
            this.groundContiguous = isContiguousPairs(positions);
            this.groundTrackReady = true;
        } else {
            this.groundTrackReady = false;
        }
        this.slideGroundTrack();
        this.updateGroundTrackVisibility();
    }

    /**
     * Per-frame window slide for the ground track: the visible track always
     * starts at the satellite's current subpoint (taken from the live blended
     * dot) and runs one full period ahead, re-derived from the baked master's
     * uniform time grid. The worker's cadence still refreshes the bake (and
     * catches J2 drift); the slide covers every frame in between, so at 600×
     * the track no longer trails the dot by half an orbit. See lib/trackSlide.
     */
    private slideGroundTrack(): void {
        const master = this.groundMaster;
        if (!master || !this.groundTrackReady || this.groundTrackIndex < 0) return;

        const attr = this.groundTrackGeometry.getAttribute('position') as
            THREE.BufferAttribute | undefined;
        if (!this.groundContiguous || !(this.groundPeriodMs > 0)) {
            // Fragmented bake (honest SGP4 gaps): no reliable anchor order —
            // draw the first period of the bake, degenerate-padded to the
            // window length (zero-length segments render nothing).
            const w = this.groundScratch;
            const pairs = Math.min(w.length / 6, master.length / 6);
            let lastX = 0;
            let lastY = 0;
            let lastZ = 0;
            for (let j = 0; j < pairs; j++) {
                w.set(master.subarray(j * 6, j * 6 + 6), j * 6);
                lastX = master[j * 6 + 3];
                lastY = master[j * 6 + 4];
                lastZ = master[j * 6 + 5];
            }
            for (let j = pairs; j < w.length / 6; j++) {
                w.set([lastX, lastY, lastZ, lastX, lastY, lastZ], j * 6);
            }
            if (attr && attr.array === w) attr.needsUpdate = true;
            else this.groundTrackGeometry.setAttribute('position', new THREE.BufferAttribute(w, 3));
            return;
        }

        const i = this.groundTrackIndex * 3;
        const px = this.positionArray[i];
        const py = this.positionArray[i + 1];
        const pz = this.positionArray[i + 2];
        if (!Number.isFinite(px + py + pz)) return;
        const r = Math.hypot(px, py, pz);
        if (!(r > 0)) return;
        // The satellite's subpoint: its live ECF position projected to the
        // globe surface.
        const anchor: [number, number, number] = [
            (px / r) * GLOBE_RADIUS,
            (py / r) * GLOBE_RADIUS,
            (pz / r) * GLOBE_RADIUS
        ];
        // One period has GROUND_WINDOW_STEPS steps; the bake holds two, so a
        // window starting up to one rebuild late still fits.
        const fraction = (renderEpochMs() - this.groundTrackEpoch) / this.groundPeriodMs;
        if (
            slideUniformWindow(master, fraction, GROUND_WINDOW_STEPS, anchor, this.groundScratch) <
            0
        ) {
            // Window past the bake (a badly overdue rebuild) — hold the last
            // frame rather than draw garbage.
            return;
        }
        if (attr && attr.array === this.groundScratch) attr.needsUpdate = true;
        else
            this.groundTrackGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.groundScratch, 3)
            );
    }

    /** Single source of truth for whether the ground track renders. */
    private updateGroundTrackVisibility(): void {
        this.groundTrackMesh.visible =
            this.groundTrackReady && this.groundTrackIndex >= 0 && this.showGroundTrack;
    }

    private handlePointerMove(event: PointerEvent): void {
        const now = performance.now();
        if (now - this.lastPointerMoveWall < POINTER_THROTTLE_MS) return;
        this.lastPointerMoveWall = now;
        if (!this.ready || !this.points.visible) {
            this.callbacks.onHover?.(-1, null, 0, 0);
            return;
        }
        const index = this.raycastSatellite(event);
        if (index < 0) {
            this.callbacks.onHover?.(-1, null, 0, 0);
        } else {
            const sat = this.satellites[index];
            if (sat) {
                const pos = new THREE.Vector3(
                    this.positionArray[index * 3],
                    this.positionArray[index * 3 + 1],
                    this.positionArray[index * 3 + 2]
                );
                pos.project(this.camera);
                const rect = this.canvas.getBoundingClientRect();
                const sx = ((pos.x + 1) / 2) * rect.width;
                const sy = ((-pos.y + 1) / 2) * rect.height;
                this.callbacks.onHover?.(index, sat.name, sx, sy);
            }
        }
    }

    private handlePointerDown(event: PointerEvent): void {
        this.pointerDownX = event.clientX;
        this.pointerDownY = event.clientY;
    }

    private handlePointerUp(event: PointerEvent): void {
        if (!this.ready || !this.points.visible) return;
        const dx = event.clientX - this.pointerDownX;
        const dy = event.clientY - this.pointerDownY;
        if (dx * dx + dy * dy > 25) return;
        const index = this.raycastSatellite(event);
        this.callbacks.onSelect?.(index);
    }

    private raycastSatellite(event: PointerEvent): number {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return -1;
        // Fingertips are imprecise and touch has no hover — widen the catch
        // radius so a tap on/near a dot selects it.
        const threshold = event.pointerType === 'touch' ? 18 : 10;
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;

        const camPos = this.camera.position;
        const earthCenter = this.earth.position;
        const earthR = GLOBE_RADIUS;

        let best = -1;
        let bestDist = Infinity;
        const v = new THREE.Vector3();

        for (let i = 0; i < this.satellites.length; i++) {
            v.set(
                this.positionArray[i * 3],
                this.positionArray[i * 3 + 1],
                this.positionArray[i * 3 + 2]
            );

            const dx = v.x - camPos.x;
            const dy = v.y - camPos.y;
            const dz = v.z - camPos.z;
            const oc = earthCenter;
            const ex = camPos.x - oc.x;
            const ey = camPos.y - oc.y;
            const ez = camPos.z - oc.z;
            const a = dx * dx + dy * dy + dz * dz;
            const b = 2 * (ex * dx + ey * dy + ez * dz);
            const c = ex * ex + ey * ey + ez * ez - earthR * earthR;
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
                const t = (-b - Math.sqrt(disc)) / (2 * a);
                if (t > 0 && t < 1) continue;
            }

            v.project(this.camera);
            if (v.z > 1) continue;
            const sx = ((v.x + 1) / 2) * rect.width;
            const sy = ((-v.y + 1) / 2) * rect.height;
            const dsx = sx - mx;
            const dsy = sy - my;
            const dist = dsx * dsx + dsy * dsy;
            if (dist < threshold * threshold && dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    showHighlight(index: number): void {
        if (index < 0 || index * 2 + 1 >= this.orbitRanges.length) {
            // No orbit data yet — request it so we can show the highlight.
            if (index >= 0 && this.ready && !this.orbitsReady) this.requestOrbits();
            this.highlightIndex = index;
            return;
        }
        const start = this.orbitRanges[index * 2];
        const end = this.orbitRanges[index * 2 + 1];
        const master = this.orbitPositions;
        if (end <= start || !master) {
            this.hideHighlight();
            return;
        }
        this.highlightIndex = index;
        this.updateNodeMarkers(master.subarray(start, end));
        // The focused window is painted per frame by rebuildOrbitWindows
        // (slid to the live dot position); this only owns markers/visibility.
        this.updateOrbitVisibility();
    }

    hideHighlight(): void {
        if (this.highlightIndex === -1) return;
        this.highlightIndex = -1;
        this.highlightMesh.visible = false;
        this.ascendingNode.visible = false;
        this.descendingNode.visible = false;
        this.updateOrbitVisibility();
    }

    private updateNodeMarkers(positions: Float32Array): void {
        // Only show nodes when equatorial plane is visible.
        if (!this.equatorialPlane.visible) {
            this.ascendingNode.visible = false;
            this.descendingNode.visible = false;
            return;
        }
        // Orbit data is line segments: [v0x,v0y,v0z, v1x,v1y,v1z, v1x,v1y,v1z, v2x,v2y,v2z, ...]
        // Extract the vertex chain (first vertex + every second vertex after).
        const chain: number[] = [];
        if (positions.length >= 3) {
            chain.push(positions[0], positions[1], positions[2]);
            for (let i = 6; i < positions.length; i += 6) {
                chain.push(positions[i], positions[i + 1], positions[i + 2]);
            }
            // Last segment endpoint.
            const last = positions.length - 3;
            if (
                last > 0 &&
                (chain.length < 3 ||
                    chain[chain.length - 3] !== positions[last] ||
                    chain[chain.length - 2] !== positions[last + 1] ||
                    chain[chain.length - 1] !== positions[last + 2])
            ) {
                chain.push(positions[last], positions[last + 1], positions[last + 2]);
            }
        }
        let ascPoint: [number, number, number] | null = null;
        let descPoint: [number, number, number] | null = null;
        for (let i = 3; i < chain.length; i += 3) {
            const z0 = chain[i - 1];
            const z1 = chain[i + 2];
            if (z0 * z1 < 0) {
                const t = Math.abs(z0) / (Math.abs(z0) + Math.abs(z1));
                const x = chain[i - 3] + (chain[i] - chain[i - 3]) * t;
                const y = chain[i - 2] + (chain[i + 1] - chain[i - 2]) * t;
                if (z0 < 0 && z1 > 0 && !ascPoint) ascPoint = [x, y, 0];
                if (z0 > 0 && z1 < 0 && !descPoint) descPoint = [x, y, 0];
            }
        }
        if (ascPoint) {
            this.ascendingNode.position.set(ascPoint[0], ascPoint[1], ascPoint[2]);
            this.ascendingNode.visible = true;
        } else {
            this.ascendingNode.visible = false;
        }
        if (descPoint) {
            this.descendingNode.position.set(descPoint[0], descPoint[1], descPoint[2]);
            this.descendingNode.visible = true;
        } else {
            this.descendingNode.visible = false;
        }
    }

    setShowOrbits(show: boolean): void {
        this.showOrbits = show;
        this.orbitsAutoDisabled = false;
        if (show && this.ready && !this.orbitsReady) this.requestOrbits();
        this.orbitMesh.visible = show && this.orbitsReady;
    }

    setShowEquatorial(show: boolean): void {
        this.equatorialPlane.visible = show;
    }

    /**
     * Which filtered satellite's ground track to draw (-1 = none). Called only
     * for the pin — hover must not trigger worker rebuilds. Each new pin
     * requests a fresh track immediately; the loop keeps it on the orbit
     * rebuild cadence afterwards.
     */
    setGroundTrack(filteredIndex: number): void {
        if (this.groundTrackIndex === filteredIndex) return;
        this.groundTrackIndex = filteredIndex;
        this.groundTrackReady = false;
        // A new pin invalidates the previous track's bake entirely.
        this.groundMaster = null;
        this.groundTrackEpoch = 0;
        this.groundPeriodMs = 0;
        this.groundContiguous = false;
        this.groundTrackGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(0), 3)
        );
        this.updateGroundTrackVisibility();
        if (filteredIndex >= 0 && this.ready && this.showGroundTrack) {
            this.requestGroundTrack();
        }
    }

    setShowGroundTrack(show: boolean): void {
        this.showGroundTrack = show;
        if (show && this.ready && this.groundTrackIndex >= 0 && !this.groundTrackReady) {
            this.requestGroundTrack();
        } else {
            this.updateGroundTrackVisibility();
        }
    }

    private requestGroundTrack(): void {
        this.lastGroundTrackWall = performance.now();
        this.groundRequestSeq++;
        // Rebuild for the SHARED SIMULATED clock, not the wall — under the
        // scrubbed clock a wall-anchored track drifted a whole day for each
        // ±30 d of simulated offset and never matched the moving dots.
        const epoch = Math.round(renderEpochMs());
        propagation.buildGroundTrack(epoch, this.groundRequestSeq, this.groundTrackIndex);
    }

    setFilter(filteredSatellites: ParsedSatellite[], activeIndices: number[]): void {
        this.hideHighlight();
        this.orbitsReady = false;
        this.orbitPositions = null;
        this.orbitRanges = [];
        this.orbitMesh.visible = false;
        this.orbitGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(0), 3)
        );
        this.ready = false;
        // Positions from the old catalog arrive before the new 'ready' — with
        // the generation already nulled here they are dropped.
        this.catalogGeneration = -1;
        // Ground track belongs to the old catalog's worker indices.
        this.setGroundTrack(-1);
        // Hide dots until onReady installs the new catalog's buffers.
        this.points.visible = false;
        this.prevPositions = null;
        this.nextPositions = null;

        // Auto-disable orbits for large catalogs; restore when count drops.
        const ORBIT_AUTO_DISABLE = 5000;
        if (activeIndices.length > ORBIT_AUTO_DISABLE) {
            if (this.showOrbits) {
                this.showOrbits = false;
                this.orbitsAutoDisabled = true;
                trackerState.showOrbits = false;
            }
        } else if (this.orbitsAutoDisabled) {
            this.showOrbits = true;
            this.orbitsAutoDisabled = false;
            trackerState.showOrbits = true;
        }

        this.satellites = filteredSatellites;
        this.filteredToOriginal.clear();
        for (let i = 0; i < activeIndices.length; i++) {
            this.filteredToOriginal.set(i, activeIndices[i]);
        }
        this.positionArray = new Float32Array(filteredSatellites.length * 3);
        this.pointsGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positionArray, 3)
        );
        propagation.init(filteredSatellites, SCALE, trackerState.elementMode);
    }

    getOriginalIndex(filteredIndex: number): number {
        return this.filteredToOriginal.get(filteredIndex) ?? -1;
    }

    private requestOrbits(): void {
        this.lastOrbitBuildWall = performance.now();
        this.orbitRequestSeq++;
        // Orbits anchor at the shared simulated epoch, matching the propagated
        // dots — globe and graph never sample different times.
        this.orbitRequestEpoch = Math.round(trackerState.simEpochMs);
        propagation.buildOrbits(
            this.orbitRequestEpoch,
            this.orbitRequestSeq,
            trackerState.referenceFrame
        );
    }

    private loop = (): void => {
        if (this.disposed) return;
        const now = performance.now();
        this.lastFrameWall = now;

        if (
            (this.showOrbits || this.highlightIndex >= 0) &&
            this.ready &&
            // A paused clock renders a static scene; rebuild only when a scrub
            // moved the simulated epoch away from the last build's anchor.
            (trackerState.simPlaying ||
                Math.abs(trackerState.simEpochMs - this.orbitRequestEpoch) >
                    ORBIT_PAUSE_DRIFT_MS) &&
            now - this.lastOrbitBuildWall >=
                (trackerState.simPlaying ? ORBIT_REBUILD_INTERVAL_MS : ORBIT_PAUSE_REBUILD_MS)
        ) {
            this.requestOrbits();
        }

        if (
            this.showGroundTrack &&
            this.groundTrackIndex >= 0 &&
            this.ready &&
            now - this.lastGroundTrackWall >= ORBIT_REBUILD_INTERVAL_MS
        ) {
            this.requestGroundTrack();
        }

        if (trackerState.referenceFrame !== this.lastReferenceFrame) {
            this.lastReferenceFrame = trackerState.referenceFrame;
            if ((this.showOrbits || this.highlightIndex >= 0) && this.ready) this.requestOrbits();
        }

        this.updatePositions();
        this.rebuildOrbitWindows();
        this.slideGroundTrack();

        if (this.highlightIndex >= 0 && this.pointerOverCanvas) {
            const sat = this.satellites[this.highlightIndex];
            const i = this.highlightIndex * 3;
            const pos = new THREE.Vector3(
                this.positionArray[i],
                this.positionArray[i + 1],
                this.positionArray[i + 2]
            );
            pos.project(this.camera);
            const rect = this.canvas.getBoundingClientRect();
            const sx = ((pos.x + 1) / 2) * rect.width;
            const sy = ((-pos.y + 1) / 2) * rect.height;
            this.callbacks.onHover?.(this.highlightIndex, sat?.name ?? null, sx, sy);
        }

        // The ECF/ECI frame delta rotates with the shared simulated clock, so
        // the orbit mesh keeps step with the propagated dots under scrubbing
        // (and the terminator/sun dimming follow the same clock).
        const gmst = gstime(new Date(renderEpochMs()));
        this.updateSun(gmst);
        const eci = trackerState.referenceFrame === 'eci';
        const orbitDelta = eci ? this.orbitBuildGmst - gmst : 0;
        this.orbitMesh.rotation.z = orbitDelta;
        this.highlightMesh.rotation.z = orbitDelta;
        if (this.points.visible) {
            const material = this.points.material as THREE.PointsMaterial;
            material.size = 0.25 * (this.camera.position.length() / 25);
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.raf = requestAnimationFrame(this.loop);
    };

    private updatePositions(): void {
        if (!this.nextPositions || !this.prevPositions) return;
        // Blend against the shared simulated clock — never a per-view wall time.
        // Past the newest snapshot the factor keeps growing (dead reckoning
        // along the pair's velocity, capped in renderBlend), so worker-arrival
        // jitter at high speeds holds no stuttering pauses.
        const simEpoch = renderEpochMs();
        const blend = renderBlend(this.prevEpoch, this.nextEpoch, simEpoch);
        blendInto(this.prevPositions, this.nextPositions, this.positionArray, blend, 3, []);
        this.pointsGeometry.attributes.position.needsUpdate = true;
    }

    /**
     * Per-frame window slide for the highlighted orbit: re-anchors the baked
     * one-period polyline (contiguous chains only) so it starts and ends at
     * the satellite's live dot position — the decoupled mirror of the ground
     * track's slide. The worker's cadence still refreshes the geometry itself.
     */
    dispose(): void {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.resizeObserver.disconnect();
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointerenter', this.onPointerEnter);
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
        this.unsubscribe();
        this.controls.dispose();
        this.pointsGeometry.dispose();
        (this.points.material as THREE.PointsMaterial).map?.dispose();
        (this.points.material as THREE.Material).dispose();
        this.highlightGeometry.dispose();
        (this.highlightMesh.material as THREE.Material).dispose();
        this.orbitGeometry.dispose();
        (this.orbitMesh.material as THREE.Material).dispose();
        this.equatorRing.geometry.dispose();
        (this.equatorRing.material as THREE.Material).dispose();
        this.terminatorRing.geometry.dispose();
        (this.terminatorRing.material as THREE.Material).dispose();
        this.nightOverlay.geometry.dispose();
        (this.nightOverlay.material as THREE.Material).dispose();
        this.groundTrackGeometry.dispose();
        (this.groundTrackMesh.material as THREE.Material).dispose();
        this.equatorialPlane.geometry.dispose();
        (this.equatorialPlane.material as THREE.Material).dispose();
        this.ascendingNode.geometry.dispose();
        (this.ascendingNode.material as THREE.Material).dispose();
        this.descendingNode.geometry.dispose();
        (this.descendingNode.material as THREE.Material).dispose();
        this.landGeometry.dispose();
        (this.landMesh.material as THREE.Material).dispose();
        this.earth.geometry.dispose();
        (this.earth.material as THREE.Material).dispose();
        this.renderer.dispose();
    }
}

function buildCircleTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const gradient = ctx.createRadialGradient(
            size / 2,
            size / 2,
            0,
            size / 2,
            size / 2,
            size / 2
        );
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.65, 'rgba(255,255,255,1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(canvas);
}

function latLonToVector(latitudeDeg: number, longitudeDeg: number, radius: number): THREE.Vector3 {
    const lat = latitudeDeg * DEG2RAD;
    const lon = longitudeDeg * DEG2RAD;
    return new THREE.Vector3(
        radius * Math.cos(lat) * Math.cos(lon),
        radius * Math.cos(lat) * Math.sin(lon),
        radius * Math.sin(lat)
    );
}

function buildLandmass(geojson: GeoJSONFeatureCollection, radius: number): number[] {
    const vertices: number[] = [];
    for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (geom.type === 'Polygon') {
            addPolygon(geom.coordinates, vertices, radius);
        } else if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates) {
                addPolygon(polygon, vertices, radius);
            }
        }
    }
    return vertices;
}

function addPolygon(coordinates: number[][][], vertices: number[], radius: number): void {
    for (const ring of coordinates) {
        let prev: THREE.Vector3 | null = null;
        for (const coord of ring) {
            if (coord[1] <= -89 || coord[1] >= 89) {
                prev = null;
                continue;
            }
            const point = latLonToVector(coord[1], coord[0], radius);
            if (prev) {
                vertices.push(prev.x, prev.y, prev.z, point.x, point.y, point.z);
            }
            prev = point;
        }
    }
}

interface GeoJSONFeatureCollection {
    features: GeoJSONFeature[];
}
interface GeoJSONFeature {
    geometry: GeoJSONGeometry;
}
type GeoJSONGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;
interface GeoJSONPolygon {
    type: 'Polygon';
    coordinates: number[][][];
}
interface GeoJSONMultiPolygon {
    type: 'MultiPolygon';
    coordinates: number[][][][];
}
