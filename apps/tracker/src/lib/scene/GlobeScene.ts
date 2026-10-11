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

const EARTH_RADIUS_KM = 6371;
export const GLOBE_RADIUS = 6.4;
export const SCALE = GLOBE_RADIUS / EARTH_RADIUS_KM;

const DEG2RAD = Math.PI / 180;
const ORBIT_REBUILD_INTERVAL_MS = 5000;
const POINTER_THROTTLE_MS = 66;
// The sun's apparent motion is ~15°/hour; an ephemeris refresh every minute
// keeps the terminator well under a degree of drift at a per-frame cost of
// one ECI→ECF rotation of a cached vector.
const SUN_RECOMPUTE_INTERVAL_MS = 60_000;
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
    private sunEci: Vec3 | null = null;
    private lastSunComputeMs = 0;
    private readonly groundTrackMesh: THREE.LineSegments;
    private readonly groundTrackGeometry: THREE.BufferGeometry;
    private showGroundTrack = true;
    private groundTrackIndex = -1;
    private groundTrackReady = false;
    private groundRequestSeq = 0;
    private lastGroundTrackWall = 0;

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

    private prevPositions: Float32Array | null = null;
    private nextPositions: Float32Array | null = null;
    private prevEpoch = 0;
    private nextEpoch = 0;
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
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                depthWrite: false
            })
        );
        this.groundTrackMesh.frustumCulled = false;
        this.groundTrackMesh.renderOrder = 998;
        this.groundTrackMesh.visible = false;
        this.scene.add(this.groundTrackMesh);

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
        // Orthonormal basis ⊥ sun for the circle in that plane.
        const axis =
            Math.abs(sun.z) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const sunVec = new THREE.Vector3(sun.x, sun.y, sun.z).normalize();
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
     * (the sun barely moves), but the ECF rotation is refreshed every frame
     * from the GMST we already computed — cheap and keeps the terminator
     * synchronized with the shared-propagation scene.
     */
    private updateSun(gmst: number): void {
        const nowMs = Date.now();
        if (!this.sunEci || nowMs - this.lastSunComputeMs >= SUN_RECOMPUTE_INTERVAL_MS) {
            this.sunEci = sunEciDirection(nowMs);
            this.updateTerminatorGeometry(this.sunEci);
            this.lastSunComputeMs = nowMs;
        }
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
        const epoch = message.epoch ?? Date.now();
        if (!positions) return;
        if (epoch <= this.nextEpoch && this.nextPositions) return;
        this.prevPositions = this.nextPositions;
        this.prevEpoch = this.nextEpoch;
        this.nextPositions = positions;
        this.nextEpoch = epoch;
        this.applySunlitColors(message.colors);
        if (!this.prevPositions) {
            this.prevPositions = new Float32Array(positions.length);
            this.prevPositions.set(positions);
            this.prevEpoch = epoch;
        }
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
        this.orbitBuildGmst = gstime(new Date());
        this.orbitsReady = true;
        this.applyOrbitGeometry();
        if (this.highlightIndex >= 0) this.showHighlight(this.highlightIndex);
    }

    private onGroundTrack(message: WorkerResponse): void {
        if (message.requestId !== this.groundRequestSeq) return;
        if (message.generation !== undefined && message.generation !== this.catalogGeneration) {
            return;
        }
        const positions = message.positions;
        this.groundTrackReady = !!positions && positions.length > 0;
        if (this.groundTrackReady && positions) {
            this.groundTrackGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(positions, 3)
            );
        }
        this.groundTrackMesh.visible =
            this.groundTrackReady && this.groundTrackIndex >= 0 && this.showGroundTrack;
    }

    private applyOrbitGeometry(): void {
        const full = this.orbitPositions;
        if (!full) return;
        let array = full;
        if (this.highlightIndex >= 0) {
            const a = this.orbitRanges[this.highlightIndex * 2];
            const b = this.orbitRanges[this.highlightIndex * 2 + 1];
            if (b > a) {
                const out = new Float32Array(full.length - (b - a));
                out.set(full.subarray(0, a), 0);
                out.set(full.subarray(b), a);
                array = out;
            }
        }
        this.orbitGeometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
        this.orbitGeometry.setDrawRange(0, array.length / 3);
        this.orbitMesh.visible = this.showOrbits && this.orbitsReady;
        // Highlight mesh stays visible when focused, regardless of showOrbits.
        this.highlightMesh.visible = this.highlightIndex >= 0 && this.orbitsReady;
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
        const array = master.subarray(start, end);
        this.highlightGeometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
        this.highlightMesh.visible = true;
        this.highlightIndex = index;
        this.updateNodeMarkers(array);
        this.applyOrbitGeometry();
    }

    hideHighlight(): void {
        if (this.highlightIndex === -1) return;
        this.highlightIndex = -1;
        this.highlightMesh.visible = false;
        this.ascendingNode.visible = false;
        this.descendingNode.visible = false;
        this.applyOrbitGeometry();
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
        this.groundTrackGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(0), 3)
        );
        this.groundTrackMesh.visible = false;
        if (filteredIndex >= 0 && this.ready && this.showGroundTrack) {
            this.requestGroundTrack();
        }
    }

    setShowGroundTrack(show: boolean): void {
        this.showGroundTrack = show;
        if (show && this.ready && this.groundTrackIndex >= 0 && !this.groundTrackReady) {
            this.requestGroundTrack();
        } else {
            this.groundTrackMesh.visible =
                show && this.groundTrackReady && this.groundTrackIndex >= 0;
        }
    }

    private requestGroundTrack(): void {
        this.lastGroundTrackWall = performance.now();
        this.groundRequestSeq++;
        propagation.buildGroundTrack(
            Math.round(Date.now()),
            this.groundRequestSeq,
            this.groundTrackIndex
        );
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
        propagation.buildOrbits(
            Math.round(Date.now()),
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
            now - this.lastOrbitBuildWall >= ORBIT_REBUILD_INTERVAL_MS
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

        const gmst = gstime(new Date());
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
        const span = this.nextEpoch - this.prevEpoch;
        let blend = span > 0 ? (Date.now() - this.prevEpoch) / span : 1;
        if (blend < 0) blend = 0;
        if (blend > 1) blend = 1;
        blendInto(this.prevPositions, this.nextPositions, this.positionArray, blend, 3, []);
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
