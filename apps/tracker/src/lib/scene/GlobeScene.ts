import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { gstime } from 'satellite.js';
import { base } from '$app/paths';
import { trackerState } from '$lib/state.svelte';
import type { ParsedSatellite } from '$lib/satellites/types';

const EARTH_RADIUS_KM = 6371;
export const GLOBE_RADIUS = 6.4;
export const SCALE = GLOBE_RADIUS / EARTH_RADIUS_KM;

const DEG2RAD = Math.PI / 180;
const POSITION_CADENCE_MS = 120;
const ORBIT_POINTS_PER_SAT = 96;
const ORBIT_REBUILD_INTERVAL_MS = 5000;
const POINTER_THROTTLE_MS = 66;

export interface GlobeSceneCallbacks {
    onSatCount?: (count: number) => void;
    onError?: (message: string) => void;
    onHover?: (index: number, name: string | null, screenX: number, screenY: number) => void;
    onSelect?: (index: number) => void;
}

interface WorkerResponse {
    type: string;
    requestId?: number;
    count?: number;
    vertexCount?: number;
    epoch?: number;
    colors?: Float32Array;
    positions?: Float32Array;
    message?: string;
    ranges?: number[];
}

export class GlobeScene {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly worker: Worker;
    private readonly points: THREE.Points;
    private readonly pointsGeometry: THREE.BufferGeometry;
    private positionArray: Float32Array;
    private readonly orbitMesh: THREE.LineSegments;
    private readonly orbitGeometry: THREE.BufferGeometry;
    private readonly equatorRing: THREE.LineLoop;
    private readonly landMesh: LineSegments2;
    private readonly landGeometry: LineSegmentsGeometry;
    private readonly earth: THREE.Mesh;
    private readonly resizeObserver: ResizeObserver;
    private readonly highlightMesh: THREE.LineSegments;
    private readonly highlightGeometry: THREE.BufferGeometry;
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointerNdc = new THREE.Vector2();
    private readonly onPointerMove: (event: PointerEvent) => void;
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private readonly canvas: HTMLCanvasElement;

    private speed = 1;
    private ready = false;
    private simTimeMs = Date.now();
    private lastFrameWall = performance.now();
    private lastRequestWall = 0;
    private lastOrbitBuildWall = 0;
    private lastDateTimeUpdate = 0;
    private lastReferenceFrame: 'ecf' | 'eci' = 'ecf';
    private positionRequestPending = false;
    private positionRequestSeq = 0;
    private orbitRequestSeq = 0;
    private showOrbits = true;
    private orbitsReady = false;
    private orbitRanges: number[] = [];
    private orbitPositions: Float32Array | null = null;
    private orbitBuildGmst = 0;
    private highlightIndex = -1;
    private lastPointerMoveWall = 0;
    private pointerDownX = 0;
    private pointerDownY = 0;

    private prevPositions: Float32Array | null = null;
    private nextPositions: Float32Array | null = null;
    private prevEpoch = 0;
    private nextEpoch = 0;
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
        private readonly satellites: ParsedSatellite[],
        private readonly callbacks: GlobeSceneCallbacks,
        renderer: THREE.WebGLRenderer
    ) {
        this.renderer = renderer;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.camera.position.set(0, 25, 0);
        this.camera.up.set(0, 0, 1);

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 9;
        this.controls.maxDistance = 90;
        this.controls.listenToKeyEvents(canvas);

        this.earth = new THREE.Mesh(
            new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
            new THREE.MeshBasicMaterial({ color: 0x262e42 })
        );
        this.scene.add(this.earth);

        this.equatorRing = this.buildEquatorRing();
        this.scene.add(this.equatorRing);

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

        this.canvas = canvas;
        this.onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
        this.onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
        this.onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointerup', this.onPointerUp);

        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
        this.handleResize();

        this.worker = new Worker(new URL('../workers/sgp4.worker.ts', import.meta.url), {
            type: 'module'
        });
        this.worker.onmessage = (event) => this.handleWorkerMessage(event);
        this.worker.onerror = (event) => {
            this.positionRequestPending = false;
            this.callbacks.onError?.(event.message || 'Worker error');
        };
        this.worker.postMessage({
            type: 'init',
            satellites: satellites.map(({ name, line1, line2 }) => ({ name, line1, line2 })),
            scale: SCALE
        });

        trackerState.setSimTime = (ms: number) => {
            this.simTimeMs = ms;
        };

        this.raf = requestAnimationFrame(() => this.loop());
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

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
        const message = event.data;
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
            case 'error':
                this.callbacks.onError?.(message.message ?? 'Worker error');
                break;
        }
    }

    private onReady(message: WorkerResponse): void {
        const count = message.count ?? 0;
        this.ready = true;
        this.positionArray = new Float32Array(count * 3);
        this.pointsGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positionArray, 3)
        );
        this.pointsGeometry.setAttribute(
            'color',
            new THREE.Float32BufferAttribute(message.colors ?? new Float32Array(0), 3)
        );
        this.callbacks.onSatCount?.(count);
        if (count === 0) {
            this.callbacks.onError?.('No propagable satellites found in catalog.');
            return;
        }
        this.requestPositions();
        if (this.showOrbits) this.requestOrbits();
    }

    private onPositions(message: WorkerResponse): void {
        this.positionRequestPending = false;
        const positions = message.positions;
        const epoch = message.epoch ?? this.simTimeMs;
        if (!positions) return;
        if (epoch <= this.nextEpoch && this.nextPositions) return;
        this.prevPositions = this.nextPositions;
        this.prevEpoch = this.nextEpoch;
        this.nextPositions = positions;
        this.nextEpoch = epoch;
        if (!this.prevPositions) {
            this.prevPositions = new Float32Array(positions.length);
            this.prevPositions.set(positions);
            this.prevEpoch = epoch;
        }
        this.points.visible = true;
    }

    private onOrbits(message: WorkerResponse): void {
        if (message.requestId !== this.orbitRequestSeq) return;
        const positions = message.positions;
        const vertexCount = message.vertexCount ?? 0;
        if (!positions || vertexCount === 0) return;
        this.orbitPositions = positions;
        this.orbitRanges = message.ranges ?? [];
        this.orbitBuildGmst = gstime(new Date(this.simTimeMs));
        this.orbitsReady = true;
        this.applyOrbitGeometry();
        if (this.highlightIndex >= 0) this.showHighlight(this.highlightIndex);
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
        this.orbitMesh.visible = this.showOrbits;
    }

    private handlePointerMove(event: PointerEvent): void {
        const now = performance.now();
        if (now - this.lastPointerMoveWall < POINTER_THROTTLE_MS) return;
        this.lastPointerMoveWall = now;
        if (!this.ready || !this.points.visible || !this.showOrbits) {
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
        if (!this.ready || !this.points.visible || !this.showOrbits) return;
        const dx = event.clientX - this.pointerDownX;
        const dy = event.clientY - this.pointerDownY;
        if (dx * dx + dy * dy > 25) return;
        const index = this.raycastSatellite(event);
        this.callbacks.onSelect?.(index);
    }

    private raycastSatellite(event: PointerEvent): number {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return -1;
        this.pointerNdc.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        const size = (this.points.material as THREE.PointsMaterial).size;
        this.raycaster.params.Points.threshold = 3 * size;

        const earthHits = this.raycaster.intersectObject(this.earth, false);
        const earthDist = earthHits.length > 0 ? earthHits[0].distance : Infinity;
        const hits = this.raycaster.intersectObject(this.points, false);
        if (hits.length === 0 || earthDist < hits[0].distance - 1e-3) return -1;
        return hits[0].index ?? -1;
    }

    showHighlight(index: number): void {
        if (index < 0 || index * 2 + 1 >= this.orbitRanges.length) {
            this.hideHighlight();
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
        this.applyOrbitGeometry();
    }

    hideHighlight(): void {
        if (this.highlightIndex === -1) return;
        this.highlightIndex = -1;
        this.highlightMesh.visible = false;
        this.applyOrbitGeometry();
    }

    setSpeed(speed: number): void {
        this.speed = speed;
    }

    setShowOrbits(show: boolean): void {
        this.showOrbits = show;
        if (show && this.ready && !this.orbitsReady) this.requestOrbits();
        this.orbitMesh.visible = show && this.orbitsReady;
    }

    private requestPositions(): void {
        if (!this.ready || this.positionRequestPending) return;
        this.positionRequestPending = true;
        this.positionRequestSeq++;
        this.worker.postMessage({
            type: 'propagate',
            epoch: Math.round(this.simTimeMs + this.speed * POSITION_CADENCE_MS),
            requestId: this.positionRequestSeq
        });
    }

    private requestOrbits(): void {
        this.lastOrbitBuildWall = performance.now();
        this.orbitRequestSeq++;
        this.worker.postMessage({
            type: 'buildOrbits',
            epoch: Math.round(this.simTimeMs),
            requestId: this.orbitRequestSeq,
            pointsPerOrbit: ORBIT_POINTS_PER_SAT,
            frame: trackerState.referenceFrame
        });
    }

    private loop = (): void => {
        if (this.disposed) return;
        const now = performance.now();
        const deltaSeconds = Math.min((now - this.lastFrameWall) / 1000, 0.1);
        this.lastFrameWall = now;

        if (this.speed > 0) {
            this.simTimeMs += deltaSeconds * this.speed * 1000;
            trackerState.simTimeMs = this.simTimeMs;
        }

        if (this.positionRequestPending && now - this.lastRequestWall > 3 * POSITION_CADENCE_MS) {
            this.positionRequestPending = false;
        }

        if (
            this.speed > 0 &&
            this.ready &&
            !this.positionRequestPending &&
            now - this.lastRequestWall >= POSITION_CADENCE_MS
        ) {
            this.lastRequestWall = now;
            this.requestPositions();
        }

        if (
            this.showOrbits &&
            this.ready &&
            now - this.lastOrbitBuildWall >= ORBIT_REBUILD_INTERVAL_MS
        ) {
            this.requestOrbits();
        }

        if (now - this.lastDateTimeUpdate > 1000) {
            this.lastDateTimeUpdate = now;
            trackerState.simDateTime = formatUtc(this.simTimeMs);
        }

        if (trackerState.referenceFrame !== this.lastReferenceFrame) {
            this.lastReferenceFrame = trackerState.referenceFrame;
            this.positionRequestPending = false;
            if (this.showOrbits && this.ready) this.requestOrbits();
        }

        this.updatePositions();

        if (this.highlightIndex >= 0) {
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

        const gmst = gstime(new Date(this.simTimeMs));
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
        let blend = span > 0 ? (this.simTimeMs - this.prevEpoch) / span : 1;
        if (blend < 0) blend = 0;
        if (blend > 1) blend = 1;
        const target = this.nextPositions;
        const start = this.prevPositions;
        for (let i = 0; i < this.positionArray.length; i++) {
            this.positionArray[i] = start[i] + (target[i] - start[i]) * blend;
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
        this.worker.terminate();
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

function formatUtc(ms: number): string {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
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
