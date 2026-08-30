export interface ParsedSatellite {
    name: string;
    line1: string;
    line2: string;
}

export type DataSource = 'loading' | 'local-api' | 'celestrak' | 'sample' | 'error';

export interface CatalogResult {
    satellites: ParsedSatellite[];
    source: Exclude<DataSource, 'loading'>;
    error?: string;
}
