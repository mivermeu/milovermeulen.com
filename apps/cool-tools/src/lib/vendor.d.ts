declare module 'qrcode' {
    interface Options {
        width?: number;
        errorCorrectionLevel?: string;
        type?: string;
    }
    const api: {
        toDataURL(text: string, options?: Options): Promise<string>;
        toString(text: string, options?: Options): Promise<string>;
    };
    export default api;
}

declare module 'diff' {
    export interface DiffChange {
        value: string;
        added?: boolean;
        removed?: boolean;
    }
    export const diffLines: (oldStr: string, newStr: string) => DiffChange[];
    export const diffChars: (oldStr: string, newStr: string) => DiffChange[];
}
