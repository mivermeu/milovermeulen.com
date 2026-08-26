import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ParsedSatellite } from '$lib/satellites/types';

const EARTH_RADIUS_KM = 6371;
export const GLOBE_RADIUS = 6.4;
export const SCALE = GLOBE_RADIUS / EARTH_RADIUS_KM;

const DEG2RAD = Math.PI / 180;
const POSITION_CADENCE_MS = 120;
const ORBIT_POINTS_PER_SAT = 200;

export interface GlobeSceneCallbacks {
    onSatCount?: (count: number) => void;
    onError?: (message: string) => void;
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
    private readonly resizeObserver: ResizeObserver;

    private speed = 1;
    private ready = false;
    private simTimeMs = Date.now();
    private lastFrameWall = performance.now();
    private lastRequestWall = 0;
    private positionRequestPending = false;
    private positionRequestSeq = 0;
    private orbitRequestSeq = 0;
    private showOrbits = true;
    private orbitsReady = false;

    private prevPositions: Float32Array | null = null;
    private nextPositions: Float32Array | null = null;
    private prevEpoch = 0;
    private nextEpoch = 0;
    private raf = 0;
    private disposed = false;

    constructor(
        canvas: HTMLCanvasElement,
        private readonly satellites: ParsedSatellite[],
        private readonly callbacks: GlobeSceneCallbacks = {}
    ) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
        this.renderer.setClearColor(0x1a1a1f, 1);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.camera.position.set(0, 0, 30);

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 9;
        this.controls.maxDistance = 90;

        this.scene.add(this.buildGraticule());
        this.scene.add(this.buildEquatorRing());

        this.pointsGeometry = new THREE.BufferGeometry();
        this.positionArray = new Float32Array(satellites.length * 3);
        this.pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positionArray, 3));
        this.points = new THREE.Points(
            this.pointsGeometry,
            new THREE.PointsMaterial({
                size: 0.1,
                sizeAttenuation: true,
                vertexColors: true,
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
                color: 0x4a5a78,
                transparent: true,
                opacity: 0.45,
                depthWrite: false
            })
        );
        this.orbitMesh.frustumCulled = false;
        this.orbitMesh.visible = false;
        this.scene.add(this.orbitMesh);

        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
        this.handleResize();

        this.worker = new Worker(new URL('../workers/sgp4.worker.ts', import.meta.url), {
            type: 'module'
        });
        this.worker.onmessage = (event) => this.handleWorkerMessage(event);
        this.worker.onerror = (event) => this.callbacks.onError?.(event.message || 'Worker error');
        this.worker.postMessage({ type: 'init', satellites, scale: SCALE });

        this.raf = requestAnimationFrame(() => this.loop());
    }

    private buildGraticule(): THREE.LineSegments {
        const vertices: number[] = [];
        // Meridians
        for (let lon = -180; lon < 180; lon += 15) {
            let previous: THREE.Vector3 | null = null;
            for (let lat = -80; lat <= 80; lat += 2) {
                const point = latLonToVector(lat, lon, GLOBE_RADIUS);
                if (previous) vertices.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
                previous = point;
            }
        }
        // Parallels (equator drawn separately)
        for (let lat = -75; lat <= 75; lat += 15) {
            let previous: THREE.Vector3 | null = null;
            for (let lon = -180; lon <= 180; lon += 2) {
                const point = latLonToVector(lat, lon, GLOBE_RADIUS);
                if (previous) vertices.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
                previous = point;
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({ color: 0x3a4a63, transparent: true, opacity: 0.55 })
        );
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
        this.pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positionArray, 3));
        this.pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(message.colors ?? new Float32Array(0), 3));
        this.callbacks.onSatCount?.(count);
        if (count === 0) {
            this.callbacks.onError?.('No propagable satellites found in catalog.');
            return;
        }
        this.requestPositions();
        if (this.showOrbits) this.requestOrbits();
    }

    private onPositions(message: WorkerResponse): void {
        if (message.requestId !== this.positionRequestSeq) return;
        this.positionRequestPending = false;
        const positions = message.positions;
        const epoch = message.epoch ?? this.simTimeMs;
        if (!positions) return;
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
        const attribute = new THREE.Float32BufferAttribute(positions, 3);
        this.orbitGeometry.setAttribute('position', attribute);
        this.orbitGeometry.setDrawRange(0, vertexCount / 3);
        this.orbitsReady = true;
        this.orbitMesh.visible = this.showOrbits;
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
            epoch: Math.round(this.simTimeMs),
            requestId: this.positionRequestSeq
        });
    }

    private requestOrbits(): void {
        this.orbitRequestSeq++;
        this.worker.postMessage({
            type: 'buildOrbits',
            epoch: Math.round(this.simTimeMs),
            requestId: this.orbitRequestSeq,
            pointsPerOrbit: ORBIT_POINTS_PER_SAT
        });
    }

    private loop = (): void => {
        if (this.disposed) return;
        const now = performance.now();
        const deltaSeconds = Math.min((now - this.lastFrameWall) / 1000, 0.1);
        this.lastFrameWall = now;

        if (this.speed > 0) {
            this.simTimeMs += deltaSeconds * this.speed * 1000;
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

        this.updatePositions();
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
        this.worker.terminate();
        this.controls.dispose();
        this.pointsGeometry.dispose();
        (this.points.material as THREE.Material).dispose();
        this.orbitGeometry.dispose();
        (this.orbitMesh.material as THREE.Material).dispose();
        this.renderer.dispose();
    }
}

function latLonToVector(latitudeDeg: number, longitudeDeg: number, radius: number): THREE.Vector3 {
    const lat = latitudeDeg * DEG2RAD;
    const lon = longitudeDeg * DEG2RAD;
    return new THREE.Vector3(
        radius * Math.cos(lat) * Math.cos(lon),
        radius * Math.sin(lat),
        radius * Math.cos(lat) * Math.sin(lon)
    );
}