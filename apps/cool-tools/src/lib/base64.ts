function toBinaryString(input: ArrayBuffer | Uint8Array): string {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return binary;
}

export function encodeUtf8(text: string): string {
    return btoa(toBinaryString(new TextEncoder().encode(text)));
}

export function decodeUtf8(b64: string): string {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

export function encodeArrayBuffer(buf: ArrayBuffer): string {
    return btoa(toBinaryString(buf));
}
