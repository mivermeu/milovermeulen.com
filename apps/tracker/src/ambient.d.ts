// Ambient declarations for `three` (the package ships no bundled types and
// @types/three is not installed) and for Vite `?raw` text imports.

declare module '*?raw' {
    const content: string;
    export default content;
}

declare module 'three' {
    export type ColorRepresentation = number | string;

    export class Vector3 {
        constructor(x?: number, y?: number, z?: number);
        x: number;
        y: number;
        z: number;
        set(x: number, y: number, z: number): this;
    }

    export class Euler {
        x: number;
        y: number;
        z: number;
    }

    export class Object3D {
        position: Vector3;
        rotation: Euler;
        visible: boolean;
        frustumCulled: boolean;
    }

    export class Camera extends Object3D {
        updateMatrixWorld(force?: boolean): void;
    }

    export class Scene extends Object3D {
        add(...objects: Object3D[]): this;
        remove(...objects: Object3D[]): this;
        clear(): this;
    }

    export class PerspectiveCamera extends Camera {
        constructor(fov?: number, aspect?: number, near?: number, far?: number);
        aspect: number;
        fov: number;
        updateProjectionMatrix(): void;
        lookAt(target: Vector3 | number): void;
    }

    export class Material {
        dispose(): void;
    }

    export interface LineBasicMaterialParameters {
        color?: ColorRepresentation;
        transparent?: boolean;
        opacity?: number;
        depthWrite?: boolean;
        vertexColors?: boolean;
        size?: number;
        sizeAttenuation?: boolean;
    }

    export class LineBasicMaterial extends Material {
        constructor(parameters?: LineBasicMaterialParameters);
        color: Color;
        transparent: boolean;
        opacity: number;
        depthWrite: boolean;
    }

    export class PointsMaterial extends LineBasicMaterial {
        size: number;
        sizeAttenuation: boolean;
        vertexColors: boolean;
    }

    export class BufferAttribute {
        array: ArrayLike<number>;
        itemSize: number;
        count: number;
        needsUpdate: boolean;
    }

    export class Float32BufferAttribute extends BufferAttribute {
        constructor(array: ArrayLike<number>, itemSize: number);
    }

    export class BufferGeometry {
        attributes: Record<string, BufferAttribute>;
        setAttribute(name: string, attribute: BufferAttribute): this;
        getAttribute(name: string): BufferAttribute;
        setDrawRange(start: number, count: number): this;
        dispose(): void;
    }

    export class Line extends Object3D {
        constructor(geometry?: BufferGeometry, material?: Material);
        geometry: BufferGeometry;
        material: Material;
    }

    export class LineSegments extends Line {}
    export class LineLoop extends Line {}
    export class Points extends Line {}

    export interface WebGLRendererParameters {
        canvas?: HTMLCanvasElement;
        antialias?: boolean;
        alpha?: boolean;
        powerPreference?: string;
    }

    export class WebGLRenderer {
        constructor(parameters?: WebGLRendererParameters);
        domElement: HTMLCanvasElement;
        setSize(width: number, height: number, updateStyle?: boolean): void;
        setPixelRatio(value: number): void;
        setClearColor(color: ColorRepresentation, alpha?: number): void;
        render(scene: Scene, camera: Camera): void;
        dispose(): void;
    }

    export class Color {
        constructor(color?: ColorRepresentation);
    }
}

declare module 'three/addons/controls/OrbitControls.js' {
    export class OrbitControls {
        constructor(object: import('three').Camera, domElement?: HTMLElement);
        enableDamping: boolean;
        dampingFactor: number;
        enablePan: boolean;
        minDistance: number;
        maxDistance: number;
        update(): void;
        dispose(): void;
    }
}