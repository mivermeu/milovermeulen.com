import * as THREE from 'three';
import { twoline2satrec } from 'satellite.js';
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
import { writeWindowEdges } from '$lib/trackSlide';
import { buildOrbitChain, type OrbitChain } from '$lib/orbitTrack';
import { maxCentralAngleDeg, PASS_MIN_EL_DEG } from '$lib/passes';

const EARTH_RADIUS_KM = 6371;
export const GLOBE_RADIUS = 6.4;
export const SCALE = GLOBE_RADIUS / EARTH_RADIUS_KM;

const DEG2RAD = Math.PI / 180;
const ORBIT_REBUILD_INTERVAL_MS = 5000;
// Must match the worker's ground-track sampling (`POINTS`) so slid window indices line up.
const GROUND_WINDOW_STEPS = 128;
const ORBIT_MAX_SATS = 1000;
// Repaint tiers for slid windows: small catalogs every frame, larger ones at
// 20/10/1 Hz (dots stay per-frame; merged arcs are coarse enough to pass).
// Fresh bakes and focus changes always force a repaint.
const ORBIT_WINDOW_SMOOTH_SATS = 150;
const ORBIT_WINDOW_MEDIUM_SATS = 400;
const ORBIT_WINDOW_LARGE_SATS = 900;
const ORBIT_WINDOW_SLOTS_EVERY = 3; // >150 … ≤400 sats → 20 Hz
const ORBIT_WINDOW_SLOTS_EVERY_BIG = 6; // >400 … ≤900 sats → 10 Hz
const ORBIT_WINDOW_SLOTS_EVERY_HUGE = 60; // >900 sats → 1 Hz
// Throttled so slider drags don't queue a storm of worker rebuilds while paused.
const ORBIT_PAUSE_DRIFT_MS = 60_000;
const ORBIT_PAUSE_REBUILD_MS = 1000;
const POINTER_THROTTLE_MS = 66;
const TERMINATOR_POINTS = 128;
/** Visibility-footprint ring resolution (unit circle, auto-closed). */
const FOOTPRINT_SEGMENTS = 128;
/** Lift above the globe surface so the ring never z-fights the earth mesh. */
const FOOTPRINT_LIFT = 0.015;
/** Ring's local plane normal before orientation. */
const FOOTPRINT_UP = new THREE.Vector3(0, 0, 1);

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
    private readonly termScratchU = new THREE.Vector3();
    private readonly termScratchV = new THREE.Vector3();
    private readonly hoverScratch = new THREE.Vector3();
    private readonly groundTrackMesh: THREE.LineSegments;
    private readonly groundTrackGeometry: THREE.BufferGeometry;
    private readonly footprintRing: THREE.LineLoop;
    private readonly footScratch = new THREE.Vector3();
    private showGroundTrack = true;
    private groundTrackIndex = -1;
    private groundTrackReady = false;
    private groundRequestSeq = 0;
    private lastGroundTrackWall = 0;
    // Sliding-window state for the ground track (see lib/trackSlide).
    private groundMaster: {
        positions: Float32Array;
        times: Float32Array;
        vertexCount: number;
    } | null = null;
    private groundTrackEpoch = 0;
    private groundPeriodMs = 0;
    private readonly groundScratch = new Float32Array((GROUND_WINDOW_STEPS + 2) * 6);

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
    private orbitPositions: Float32Array | null = null;
    private orbitBakeEpoch = 0;
    private orbitBuildGmst = 0;
    private highlightIndex = -1;
    // Brush mask in slot order — brushing must never reorder/compact worker arrays.
    private brushMask: Uint8Array | null = null;
    private pointerOverCanvas = false;
    private lastPointerMoveWall = 0;
    private pointerDownX = 0;
    private pointerDownY = 0;
    private filteredToOriginal = new Map<number, number>();

    // Fixed edge-slot range per sat in one shared LineSegments buffer: windows
    // vary per frame in vertex count, slots never do (tails pad degenerate).
    private orbitWindowMode = false;
    private orbitVertexTimes: Float32Array | null = null;
    private orbitPeriods: number[] = [];
    private orbitVertexCounts: number[] = [];
    private orbitVertexOffsets: number[] = []; // chain vertex offset per sat
    private orbitRuns: Int32Array = new Int32Array(0); // [nRuns, verts…] per sat
    private orbitRunsCursor: number[] = []; // per-sat runs[] cursor
    private orbitSlotCaps: number[] = []; // edge-slot capacity per sat
    private orbitSlotOffsets: number[] = []; // edge offset per sat
    private orbitSlotScratch: Float32Array | null = null;
    // Focus orbit built synchronously on the main thread — no worker round-trip.
    private highlightChain: OrbitChain | null = null;
    private highlightScratch: Float32Array | null = null;
    private highlightCapEdges = 0;

    private prevPositions: Float32Array | null = null;
    private nextPositions: Float32Array | null = null;
    private prevEpoch = 0;
    private nextEpoch = 0;
    private orbitRequestEpoch = 0;
    /** Held-forward snapshot regime: older revisions are stale and dropped. */
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
        // Node markers parent to the highlight mesh to inherit its GMST rotation (ECI).
        this.highlightMesh.add(this.ascendingNode);
        this.highlightMesh.add(this.descendingNode);

        // Night-side dimming. renderOrder -1 keeps dots/orbits on top; the globe
        // never rotates (worker emits ECF), so object-space normal == ECF direction.
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

        // Ground track: nadir subpoint polyline, always ECF (no GMST rotation).
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

        // Visibility footprint: horizon circle for PASS_MIN_EL_DEG, re-posed per
        // frame (center R·cos ψ, radius R·sin ψ, plane ⊥ subpoint axis).
        const footVerts = new Float32Array(FOOTPRINT_SEGMENTS * 3);
        for (let k = 0; k < FOOTPRINT_SEGMENTS; k++) {
            const a = (k / FOOTPRINT_SEGMENTS) * Math.PI * 2;
            footVerts[k * 3] = Math.cos(a);
            footVerts[k * 3 + 1] = Math.sin(a);
            footVerts[k * 3 + 2] = 0;
        }
        const footGeo = new THREE.BufferGeometry();
        footGeo.setAttribute('position', new THREE.Float32BufferAttribute(footVerts, 3));
        this.footprintRing = new THREE.LineLoop(
            footGeo,
            new THREE.LineBasicMaterial({
                color: 0x8b9cc9,
                transparent: true,
                opacity: 0.35,
                depthWrite: false
            })
        );
        this.footprintRing.frustumCulled = false;
        this.footprintRing.renderOrder = 997;
        this.footprintRing.visible = false;
        this.scene.add(this.footprintRing);

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

    /** Initial camera distance: fit the globe diameter on narrow viewports. */
    private initialCameraDistance(): number {
        const container = this.renderer.domElement.parentElement;
        const width = container?.clientWidth || 1;
        const height = container?.clientHeight || 1;
        const aspect = Math.min(1, width / height);
        const halfSpan = GLOBE_RADIUS + 1.5;
        return Math.min(42, Math.max(25, halfSpan / (Math.tan((45 * Math.PI) / 360) * aspect)));
    }

    /** Terminator great circle (90° from the sun), built in ECF. */
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

    private updateTerminatorGeometry(sun: Vec3): void {
        const axis =
            Math.abs(sun.z) > 0.99
                ? this.termScratchA.set(1, 0, 0)
                : this.termScratchA.set(0, 0, 1);
        const sunVec = this.termScratchB.set(sun.x, sun.y, sun.z).normalize();
        const u = this.termScratchU.crossVectors(axis, sunVec).normalize();
        const v = this.termScratchV.crossVectors(sunVec, u);
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

    /** Per-frame sun bookkeeping so the terminator tracks the rendered epoch. */
    private updateSun(gmst: number): void {
        const nowMs = renderEpochMs();
        this.sunEci = sunEciDirection(nowMs);
        const sunEcf = eciDirectionToEcf(this.sunEci, gmst);
        this.updateTerminatorGeometry(sunEcf);
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
            // Land is decorative; the globe renders fine without it.
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
        // New catalog invalidates old bakes — including ones with no generation.
        this.orbitsReady = false;
        this.orbitPositions = null;
        this.orbitWindowMode = false;
        this.orbitBakeEpoch = Number.NEGATIVE_INFINITY;
        this.lastWindowTarget = Number.NaN;
        this.lastWindowBake = -1;
        this.orbitMesh.visible = false;
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
        if (this.highlightIndex >= 0) this.showHighlight(this.highlightIndex);
        if (this.showOrbits) this.requestOrbits();
    }

    private onPositions(message: WorkerResponse): void {
        if (!this.ready) return;
        if (message.generation !== this.catalogGeneration) return;
        const positions = message.positions;
        const epoch = message.epoch ?? trackerState.simEpochMs;
        if (!positions) return;
        // Eclipse colors describe "now": apply before the stale-snapshot drop.
        this.applySunlitColors(message.colors);
        const revision = message.revision ?? -1;
        if (revision < this.snapshotRevision) return;
        // Same-revision backwards epoch is a superseded watchdog retry — drop it.
        // (Intentional scrub jumps always ride a revision bump.)
        if (revision === this.snapshotRevision && epoch < this.nextEpoch) return;
        if (
            revision > this.snapshotRevision ||
            epochAction(this.nextEpoch, epoch, propagation.cadenceMs * trackerState.simSpeed) ===
                'snap'
        ) {
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

    private applySunlitColors(colors: Float32Array | undefined): void {
        if (!colors || colors.length === 0) return;
        const attr = this.pointsGeometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        if (!attr || colors.length !== attr.count * 3) return;
        (attr.array as Float32Array).set(colors);
        attr.needsUpdate = true;
    }

    /** Freshness gates on catalog generation, not request id (FIFO worker). No
     * time-regression guard: backwards scrubs must still snap to the new bake. */
    private onOrbits(message: WorkerResponse): void {
        if (message.generation !== undefined && message.generation !== this.catalogGeneration) {
            return;
        }
        const positions = message.positions;
        if (!positions || positions.length === 0) return;
        const incomingEpoch = message.epoch ?? Number.NEGATIVE_INFINITY;
        this.orbitPositions = positions;
        this.orbitBakeEpoch = incomingEpoch;
        // GMST of the bake's simulated epoch — not wall-clock now.
        this.orbitBuildGmst = gstime(new Date(incomingEpoch));
        this.orbitsReady = true;
        this.setupOrbitWindows(message);
        this.updateOrbitVisibility();
        if (this.highlightIndex >= 0) this.showHighlight(this.highlightIndex);
    }

    /** Digest an orbit bake into fixed per-sat edge slots for slid windows. */
    private setupOrbitWindows(message: WorkerResponse): void {
        const positions = this.orbitPositions;
        const satCount = message.vertexCounts?.length ?? 0;
        const times = message.vertexTimes ?? null;
        const periods = message.periods ?? [];
        const counts = message.vertexCounts ?? [];
        const runsList = message.runs ?? new Int32Array(0);
        if (!positions) {
            this.orbitWindowMode = false;
            return;
        }
        if (!times || satCount === 0 || periods.length !== satCount || counts.length !== satCount) {
            this.orbitWindowMode = false;
            this.orbitMesh.visible = false;
            this.highlightGeometry.setDrawRange(0, 0);
            return;
        }
        // Validate packed run layout before the prefix-sum pass reads it.
        {
            let c = 0;
            let valid = true;
            for (let s = 0; s < satCount; s++) {
                if (c >= runsList.length) {
                    valid = false;
                    break;
                }
                const n = runsList[c++];
                if (n < 0 || c + n > runsList.length) {
                    valid = false;
                    break;
                }
                c += n;
            }
            if (!valid || c !== runsList.length) {
                this.orbitWindowMode = false;
                this.orbitMesh.visible = false;
                this.highlightGeometry.setDrawRange(0, 0);
                return;
            }
        }

        this.orbitWindowMode = true;
        this.orbitVertexTimes = times;
        this.orbitPeriods = periods;
        this.orbitVertexCounts = counts;
        this.orbitRuns = runsList;

        const vOffsets = new Array<number>(satCount).fill(0);
        const caps = new Array<number>(satCount).fill(0);
        const cursors = new Array<number>(satCount).fill(0);
        const slotOffsets = new Array<number>(satCount).fill(0);
        let chainCursor = 0;
        let runCursor = 0;
        let slotCursor = 0;
        for (let s = 0; s < satCount; s++) {
            vOffsets[s] = chainCursor;
            chainCursor += counts[s];
            cursors[s] = runCursor;
            runCursor += 1 + runsList[runCursor]; // [nRuns, lens…]
            caps[s] = counts[s] + 2;
            slotOffsets[s] = slotCursor;
            slotCursor += caps[s];
        }
        this.orbitVertexOffsets = vOffsets;
        this.orbitSlotCaps = caps;
        this.orbitSlotOffsets = slotOffsets;
        this.orbitRunsCursor = cursors;

        // Reallocate only when the catalog grew; pin the draw range to the live
        // slot-table size so narrowed filters never draw the buffer's stale tail.
        const need = slotCursor * 6;
        if (!this.orbitSlotScratch || this.orbitSlotScratch.length < need) {
            this.orbitSlotScratch = new Float32Array(need);
            this.orbitGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.orbitSlotScratch, 3)
            );
        }
        this.orbitGeometry.setDrawRange(0, need / 3);

        // Static edges for fragmented/short chains the per-frame pass skips.
        for (let s = 0; s < satCount; s++) {
            const nRuns = runsList[cursors[s]];
            if (nRuns === 1 && counts[s] >= 3) continue;
            const slotEnd = (slotOffsets[s] + caps[s]) * 6;
            let w = slotOffsets[s] * 6;
            let vCursor = vOffsets[s];
            let rc = cursors[s] + 1;
            for (let r = 0; r < nRuns; r++) {
                const len = runsList[rc++];
                for (let k = 1; k < len && w + 6 <= slotEnd; k++) {
                    const a = (vCursor + k - 1) * 3;
                    const b = (vCursor + k) * 3;
                    this.orbitSlotScratch.set(
                        [
                            positions[a],
                            positions[a + 1],
                            positions[a + 2],
                            positions[b],
                            positions[b + 1],
                            positions[b + 2]
                        ],
                        w
                    );
                    w += 6;
                }
                vCursor += len;
            }
            // Degenerate pad to the slot end.
            this.orbitSlotScratch.fill(0, Math.min(w, slotEnd), slotEnd);
        }
        (this.orbitGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        this.rebuildOrbitWindows();
    }

    /** Visibility only — window geometry is painted per frame while sliding. */
    private updateOrbitVisibility(): void {
        this.orbitMesh.visible = this.showOrbits && this.orbitsReady;
        this.highlightMesh.visible = this.highlightIndex >= 0 && !!this.highlightChain;
    }

    private lastWindowTarget = Number.NaN;
    private lastWindowBake = -1;
    private lastWindowFocus = -2;
    private lastWindowMask: Uint8Array | null = null;
    private windowFrameTick = 0;

    private rebuildOrbitWindows(): void {
        if (!this.orbitWindowMode || !this.orbitPositions || !this.orbitVertexTimes) return;
        // Skip when the merged layer is hidden — the highlight paints separately.
        if (!this.showOrbits) return;
        const positions = this.orbitPositions;
        const times = this.orbitVertexTimes;
        const scratch = this.orbitSlotScratch;
        if (!scratch) return;
        const nowMs = renderEpochMs();
        const target = nowMs - this.orbitBakeEpoch;
        const gmstNow = gstime(new Date(nowMs));
        const mask = this.brushMask;
        const maskChanged = mask !== this.lastWindowMask;
        // Paused clock → windows are identical to the last paint: skip the rebuild.
        if (
            target === this.lastWindowTarget &&
            this.orbitBakeEpoch === this.lastWindowBake &&
            !maskChanged
        ) {
            return;
        }
        // Cadence tiers: repaint every Nth frame on bigger catalogs. Fresh bakes
        // and focus changes always repaint; the advancing target must not force one.
        const factor =
            this.satellites.length <= ORBIT_WINDOW_SMOOTH_SATS
                ? 1
                : this.satellites.length <= ORBIT_WINDOW_MEDIUM_SATS
                  ? ORBIT_WINDOW_SLOTS_EVERY
                  : this.satellites.length <= ORBIT_WINDOW_LARGE_SATS
                    ? ORBIT_WINDOW_SLOTS_EVERY_BIG
                    : ORBIT_WINDOW_SLOTS_EVERY_HUGE;
        if (factor > 1) {
            this.windowFrameTick = (this.windowFrameTick + 1) % factor;
            const forced =
                this.orbitBakeEpoch !== this.lastWindowBake ||
                this.highlightIndex !== this.lastWindowFocus ||
                maskChanged;
            if (this.windowFrameTick !== 0 && !forced) return;
        }
        this.lastWindowFocus = this.highlightIndex;
        this.lastWindowBake = this.orbitBakeEpoch;
        this.lastWindowTarget = target;
        this.lastWindowMask = mask;

        for (let s = 0; s < this.orbitVertexCounts.length; s++) {
            const vCount = this.orbitVertexCounts[s];
            if (vCount < 3) continue;
            const vOff = this.orbitVertexOffsets[s];
            const cap = this.orbitSlotCaps[s];
            const slotOff = this.orbitSlotOffsets[s];
            // Brushed-out sats draw nothing: zero the slot (never splice onto
            // the origin-parked dot, which reads as an orbit at earth's center).
            if (mask && s < mask.length && !mask[s]) {
                scratch.fill(0, slotOff * 6, (slotOff + cap) * 6);
                continue;
            }
            const nRuns = this.orbitRuns[this.orbitRunsCursor[s]];
            if (nRuns !== 1) continue; // static slot, installed per bake
            const isFocus = s === this.highlightIndex && this.highlightIndex >= 0;
            if (isFocus) {
                if (!this.highlightScratch || this.highlightScratch.length < cap * 6) {
                    this.highlightScratch = new Float32Array(cap * 6);
                    this.highlightGeometry.setAttribute(
                        'position',
                        new THREE.BufferAttribute(this.highlightScratch, 3)
                    );
                }
                // Focus arc paints via the highlight mesh — clear its merged slot.
                scratch.fill(0, slotOff * 6, (slotOff + cap) * 6);
                continue;
            }
            // ECI: rotate the ECF dot by the inverse build-vs-render GMST delta.
            const dotX0 = this.positionArray[s * 3];
            let dotY = this.positionArray[s * 3 + 1];
            const dotZ = this.positionArray[s * 3 + 2];
            let dotX = dotX0;
            const anchorOk = Number.isFinite(dotX0 + dotY + dotZ) && target >= 0;
            if (anchorOk && trackerState.referenceFrame === 'eci') {
                const delta = this.orbitBuildGmst - gmstNow;
                if (delta !== 0) {
                    const c = Math.cos(delta);
                    const s2 = Math.sin(delta);
                    const rx = c * dotX0 + s2 * dotY;
                    dotX = rx;
                    dotY = -s2 * dotX0 + c * dotY;
                }
            }
            const anchor: [number, number, number] | null = anchorOk ? [dotX, dotY, dotZ] : null;
            writeWindowEdges(
                positions,
                times,
                vOff,
                vCount,
                this.orbitPeriods[s],
                anchor,
                target,
                scratch,
                slotOff * 6,
                cap
            );
        }
        (this.orbitGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    private onGroundTrack(message: WorkerResponse): void {
        if (message.requestId !== this.groundRequestSeq) return;
        if (message.generation !== undefined && message.generation !== this.catalogGeneration) {
            return;
        }
        const positions = message.positions;
        const gTimes = message.vertexTimes;
        if (
            positions &&
            gTimes &&
            positions.length >= 6 &&
            gTimes.length === positions.length / 3
        ) {
            this.groundMaster = {
                positions,
                times: gTimes,
                vertexCount: positions.length / 3
            };
            this.groundTrackEpoch = message.epoch ?? 0;
            this.groundPeriodMs = message.periodMs ?? 0;
            this.groundTrackReady = true;
            this.lastGroundTarget = Number.NaN;
            this.lastGroundFailIndex = -2;
        } else {
            this.groundTrackReady = false;
            this.lastGroundFailWall = performance.now();
            this.lastGroundFailIndex = this.groundTrackIndex;
        }
        this.slideGroundTrack();
        this.updateGroundTrackVisibility();
    }

    /** Slide the ground-track window: one period from the live subpoint. */
    private lastGroundTarget = Number.NaN;
    private lastGroundEpoch = -1;
    // Undrawable pins answer empty — cool down before re-requesting.
    private lastGroundFailWall = 0;
    private lastGroundFailIndex = -2;
    private static readonly GROUND_FAIL_COOLDOWN_MS = 60_000;
    private slideGroundTrack(): void {
        const chain = this.groundMaster;
        if (!chain || !this.groundTrackReady || this.groundTrackIndex < 0) return;

        const attr = this.groundTrackGeometry.getAttribute('position') as
            THREE.BufferAttribute | undefined;
        const i = this.groundTrackIndex * 3;
        const px = this.positionArray[i];
        const py = this.positionArray[i + 1];
        const pz = this.positionArray[i + 2];
        if (!Number.isFinite(px + py + pz)) return;
        const r = Math.hypot(px, py, pz);
        if (!(r > 0)) return;
        const anchor: [number, number, number] = [
            (px / r) * GLOBE_RADIUS,
            (py / r) * GLOBE_RADIUS,
            (pz / r) * GLOBE_RADIUS
        ];
        const cap = GROUND_WINDOW_STEPS + 2;
        const target = renderEpochMs() - this.groundTrackEpoch;
        if (target === this.lastGroundTarget && this.groundTrackEpoch === this.lastGroundEpoch)
            return;
        this.lastGroundTarget = target;
        this.lastGroundEpoch = this.groundTrackEpoch;
        // Backward scrub: no material behind the bake epoch — pass null anchor.
        const windowAnchor = target >= 0 ? anchor : null;
        writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            this.groundPeriodMs,
            windowAnchor,
            target,
            this.groundScratch,
            0,
            cap
        );
        if (attr && attr.array === this.groundScratch) attr.needsUpdate = true;
        else
            this.groundTrackGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.groundScratch, 3)
            );
    }

    private updateGroundTrackVisibility(): void {
        const i = this.groundTrackIndex;
        // Brushed-out pins keep their frozen track hidden.
        const culled =
            i >= 0 && this.brushMask !== null && i < this.brushMask.length && !this.brushMask[i];
        this.groundTrackMesh.visible =
            this.groundTrackReady && i >= 0 && this.showGroundTrack && !culled;
    }

    /** Pose the footprint ring at the pin's live subpoint (ECF: no GMST rotation). */
    private updateFootprint(): void {
        if (!this.groundTrackReady || this.groundTrackIndex < 0 || !this.showGroundTrack) {
            this.footprintRing.visible = false;
            return;
        }
        const i = this.groundTrackIndex * 3;
        const px = this.positionArray[i];
        const py = this.positionArray[i + 1];
        const pz = this.positionArray[i + 2];
        if (!Number.isFinite(px + py + pz)) {
            this.footprintRing.visible = false;
            return;
        }
        const r = Math.hypot(px, py, pz);
        const rKm = r / SCALE;
        if (!(r > 0) || !(rKm > EARTH_RADIUS_KM)) {
            this.footprintRing.visible = false;
            return;
        }
        const psiDeg = maxCentralAngleDeg(rKm, PASS_MIN_EL_DEG);
        if (!(psiDeg > 0)) {
            this.footprintRing.visible = false;
            return;
        }
        const psi = (psiDeg * Math.PI) / 180;
        const surfR = GLOBE_RADIUS + FOOTPRINT_LIFT;
        const dir = this.footScratch.set(px / r, py / r, pz / r);
        this.footprintRing.position.copy(dir).multiplyScalar(surfR * Math.cos(psi));
        this.footprintRing.quaternion.setFromUnitVectors(FOOTPRINT_UP, dir);
        this.footprintRing.scale.setScalar(surfR * Math.sin(psi));
        this.footprintRing.visible = true;
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
                const pos = this.hoverScratch.set(
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
        // Touch has no hover — widen the catch radius for taps.
        const threshold = event.pointerType === 'touch' ? 18 : 10;
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;

        const camPos = this.camera.position;
        const earthCenter = this.earth.position;
        const earthR = GLOBE_RADIUS;

        let best = -1;
        let bestDist = Infinity;
        const v = new THREE.Vector3();
        const mask = this.brushMask;
        const maskLen = mask ? Math.min(mask.length, this.satellites.length) : 0;

        for (let i = 0; i < this.satellites.length; i++) {
            // Brushed-out satellites are unpickable.
            if (i < maskLen && !mask![i]) continue;
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
        if (index < 0 || index >= this.satellites.length || !this.ready) {
            this.highlightIndex = index;
            return;
        }
        this.highlightIndex = index;
        this.reanchorHighlight();
        this.updateOrbitVisibility();
    }

    /** Re-anchor the highlight: build the focus sat's chain synchronously (~1 ms). */
    private reanchorHighlight(): void {
        const idx = this.highlightIndex;
        if (idx < 0 || idx >= this.satellites.length) {
            this.highlightChain = null;
            return;
        }
        const sat = this.satellites[idx];
        try {
            const parsed = twoline2satrec(sat.line1, sat.line2);
            if (parsed.error !== 0) {
                this.highlightChain = null;
                this.highlightMesh.visible = false;
                return;
            }
            const chain = buildOrbitChain({
                rec: parsed,
                anchorEpochMs: Math.round(renderEpochMs()),
                referenceFrame: trackerState.referenceFrame,
                worldPerKm: SCALE
            });
            if (chain) {
                this.highlightChain = chain;
                const capEdges = chain.vertexCount + 2;
                if (!this.highlightScratch || this.highlightScratch.length < capEdges * 6) {
                    this.highlightScratch = new Float32Array(capEdges * 6);
                    this.highlightGeometry.setAttribute(
                        'position',
                        new THREE.BufferAttribute(this.highlightScratch, 3)
                    );
                }
                this.highlightCapEdges = capEdges;
                // Re-arm the draw range here — resets may have zeroed it.
                this.highlightGeometry.setDrawRange(0, capEdges * 2);
                this.updateNodeMarkers(chain.positions);
            } else {
                this.highlightChain = null;
                this.highlightMesh.visible = false;
            }
        } catch {
            this.highlightChain = null;
            this.highlightMesh.visible = false;
        }
    }

    /** Slide the [T, T+period] window over the main-thread chain; re-anchor past its ends. */
    private paintHighlight(): void {
        let chain = this.highlightChain;
        if (!chain || this.highlightIndex < 0) return;
        if (chain.referenceFrame !== trackerState.referenceFrame) {
            this.reanchorHighlight();
            chain = this.highlightChain;
            if (!chain) return;
        }
        let target = renderEpochMs() - chain.anchorEpoch;
        if (target < 0 || target + chain.periodMs > chain.times[chain.vertexCount - 1]) {
            this.reanchorHighlight();
            chain = this.highlightChain;
            if (!chain) return;
            target = renderEpochMs() - chain.anchorEpoch;
            if (target < 0) target = 0;
            if (target + chain.periodMs > chain.times[chain.vertexCount - 1]) {
                return;
            }
        }
        if (this.highlightCapEdges === 0 || !this.highlightScratch) return;
        const scratch = this.highlightScratch;
        // Brushed-out focus: blank the arc instead of splicing onto the parked dot.
        const hm = this.brushMask;
        if (hm && this.highlightIndex < hm.length && !hm[this.highlightIndex]) {
            scratch.fill(0);
            (this.highlightGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
                true;
            return;
        }
        if (chain.runLens.length !== 1) {
            // Fragmented chain: paint static per-run edges, like the merged layer.
            let w = 0;
            let vCursor = 0;
            const end = this.highlightCapEdges * 6;
            for (const len of chain.runLens) {
                for (let k = 1; k < len && w + 6 <= end; k++) {
                    const a = (vCursor + k - 1) * 3;
                    const b = (vCursor + k) * 3;
                    scratch[w] = chain.positions[a];
                    scratch[w + 1] = chain.positions[a + 1];
                    scratch[w + 2] = chain.positions[a + 2];
                    scratch[w + 3] = chain.positions[b];
                    scratch[w + 4] = chain.positions[b + 1];
                    scratch[w + 5] = chain.positions[b + 2];
                    w += 6;
                }
                vCursor += len;
            }
            scratch.fill(0, Math.min(w, end), end);
            (this.highlightGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
                true;
            return;
        }
        let ax = this.positionArray[this.highlightIndex * 3];
        let ay = this.positionArray[this.highlightIndex * 3 + 1];
        const az = this.positionArray[this.highlightIndex * 3 + 2];
        if (!Number.isFinite(ax + ay + az)) return;
        // ECI: rotate the ECF anchor by the inverse bake-vs-render GMST delta.
        if (trackerState.referenceFrame === 'eci') {
            const gmstNow = gstime(new Date(renderEpochMs()));
            const delta = chain.bakeGmst - gmstNow;
            if (delta !== 0) {
                const c = Math.cos(delta);
                const s = Math.sin(delta);
                const rx = c * ax + s * ay;
                ay = -s * ax + c * ay;
                ax = rx;
            }
        }
        writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            [ax, ay, az],
            target,
            scratch,
            0,
            this.highlightCapEdges
        );
        (this.highlightGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
            true;
    }

    hideHighlight(): void {
        if (this.highlightIndex === -1) return;
        this.highlightIndex = -1;
        this.highlightChain = null;
        this.highlightMesh.visible = false;
        this.ascendingNode.visible = false;
        this.descendingNode.visible = false;
        this.updateOrbitVisibility();
    }

    private updateNodeMarkers(chain: Float32Array): void {
        if (!this.equatorialPlane.visible) {
            this.ascendingNode.visible = false;
            this.descendingNode.visible = false;
            return;
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
        this.updateOrbitVisibility();
    }

    setShowEquatorial(show: boolean): void {
        this.equatorialPlane.visible = show;
        if (this.highlightChain) this.updateNodeMarkers(this.highlightChain.positions);
    }

    /** Pin ground track (-1 = none). Pin-only: hover must not trigger rebuilds. */
    setGroundTrack(filteredIndex: number): void {
        if (this.groundTrackIndex === filteredIndex) return;
        this.groundTrackIndex = filteredIndex;
        this.groundTrackReady = false;
        this.groundMaster = null;
        this.groundTrackEpoch = 0;
        this.groundPeriodMs = 0;
        this.lastGroundFailIndex = -2;
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
        // Anchor to the shared simulated clock, not the wall clock.
        const epoch = Math.round(renderEpochMs());
        propagation.buildGroundTrack(epoch, this.groundRequestSeq, this.groundTrackIndex);
    }

    setFilter(filteredSatellites: ParsedSatellite[], activeIndices: number[]): void {
        this.hideHighlight();
        this.brushMask = null;
        this.orbitsReady = false;
        this.orbitPositions = null;
        this.orbitWindowMode = false;
        this.orbitSlotScratch = null;
        this.orbitBakeEpoch = Number.NEGATIVE_INFINITY;
        this.lastWindowTarget = Number.NaN;
        this.lastWindowBake = -1;
        this.highlightChain = null;
        this.highlightScratch = null;
        this.highlightGeometry.setDrawRange(0, 0);
        this.orbitMesh.visible = false;
        this.orbitGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(0), 3)
        );
        this.ready = false;
        // Generation nulled here so old-catalog positions arriving first are dropped.
        this.catalogGeneration = -1;
        this.setGroundTrack(-1);
        this.points.visible = false;
        this.prevPositions = null;
        this.nextPositions = null;

        if (activeIndices.length > ORBIT_MAX_SATS) {
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

    /** Brush cull by filtered-space slot; never re-inits the worker. Null clears. */
    setBrushMask(mask: Uint8Array | null): void {
        const changed = mask !== this.brushMask;
        this.brushMask = mask;
        // Bake-culled slots revive only via re-bake: while paused, re-bake now.
        if (changed && !trackerState.simPlaying && this.ready) this.requestOrbits();
    }

    private requestOrbits(): void {
        const now = performance.now();
        // Coalesce focus-only hover waves (250 ms gap when merged layer is off).
        const minGap = this.showOrbits ? 0 : 250;
        if (now - this.lastOrbitBuildWall < minGap) return;
        this.lastOrbitBuildWall = now;
        this.orbitRequestSeq++;
        // Anchor at the shared simulated epoch; when size-capped, bake only focus.
        this.orbitRequestEpoch = Math.round(renderEpochMs());
        const onlyIndex = this.showOrbits
            ? null
            : this.highlightIndex >= 0
              ? this.highlightIndex
              : null;
        propagation.buildOrbits(
            this.orbitRequestEpoch,
            this.orbitRequestSeq,
            trackerState.referenceFrame,
            onlyIndex,
            this.brushMask
        );
    }

    private loop = (): void => {
        if (this.disposed) return;
        // Schedule next frame first: a per-frame bug errors instead of freezing.
        this.raf = requestAnimationFrame(this.loop);
        const now = performance.now();
        this.lastFrameWall = now;

        if (
            // No merged layer on size-capped catalogs (highlight is main-thread).
            this.showOrbits &&
            this.satellites.length <= ORBIT_MAX_SATS &&
            this.ready &&
            // Paused: rebuild only when a scrub drifted past the last anchor.
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
            // Paused: static clock needs no rebuilds unless a scrub drifted it.
            (trackerState.simPlaying ||
                Math.abs(trackerState.simEpochMs - this.groundTrackEpoch) > ORBIT_PAUSE_DRIFT_MS) &&
            now - this.lastGroundTrackWall >= ORBIT_REBUILD_INTERVAL_MS &&
            !(
                this.groundTrackIndex === this.lastGroundFailIndex &&
                now - this.lastGroundFailWall < GlobeScene.GROUND_FAIL_COOLDOWN_MS
            )
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
        this.updateGroundTrackVisibility();
        this.updateFootprint();

        if (this.highlightIndex >= 0 && this.pointerOverCanvas) {
            const sat = this.satellites[this.highlightIndex];
            const i = this.highlightIndex * 3;
            const ax = this.positionArray[i];
            const ay = this.positionArray[i + 1];
            const az = this.positionArray[i + 2];
            if (Number.isFinite(ax + ay + az)) {
                const pos = this.hoverScratch.set(ax, ay, az);
                pos.project(this.camera);
                const rect = this.canvas.getBoundingClientRect();
                const sx = ((pos.x + 1) / 2) * rect.width;
                const sy = ((-pos.y + 1) / 2) * rect.height;
                this.callbacks.onHover?.(this.highlightIndex, sat?.name ?? null, sx, sy);
            }
        }

        // Frame delta follows the shared simulated clock (scrub-safe).
        const gmst = gstime(new Date(renderEpochMs()));
        this.updateSun(gmst);
        const eci = trackerState.referenceFrame === 'eci';
        const orbitDelta = eci ? this.orbitBuildGmst - gmst : 0;
        this.paintHighlight();
        this.orbitMesh.rotation.z = orbitDelta;
        this.highlightMesh.rotation.z = this.highlightChain
            ? eci
                ? this.highlightChain.bakeGmst - gmst
                : 0
            : orbitDelta;
        if (this.points.visible) {
            const material = this.points.material as THREE.PointsMaterial;
            material.size = 0.25 * (this.camera.position.length() / 25);
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    };

    private updatePositions(): void {
        if (!this.nextPositions || !this.prevPositions) return;
        // Past the newest snapshot the blend keeps growing (dead reckoning).
        const simEpoch = renderEpochMs();
        const blend = renderBlend(this.prevEpoch, this.nextEpoch, simEpoch);
        blendInto(this.prevPositions, this.nextPositions, this.positionArray, blend, 3, []);
        // Brushed-out sats keep their slot, parked at earth's center (occluded,
        // unpickable) — clearing the brush restores them with no re-init.
        const mask = this.brushMask;
        if (mask) {
            const n = Math.min(mask.length, this.positionArray.length / 3);
            for (let i = 0; i < n; i++) {
                if (mask[i]) continue;
                const o = i * 3;
                this.positionArray[o] = 0;
                this.positionArray[o + 1] = 0;
                this.positionArray[o + 2] = 0;
            }
        }
        this.pointsGeometry.attributes.position.needsUpdate = true;
    }

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
