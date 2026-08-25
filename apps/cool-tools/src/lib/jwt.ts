/** Decode a base64url JWT segment (padding optional) into its parsed JSON value. */
export function b64urlToJson(seg: string): unknown {
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (seg.length % 4)) % 4);
    return JSON.parse(atob(b64));
}