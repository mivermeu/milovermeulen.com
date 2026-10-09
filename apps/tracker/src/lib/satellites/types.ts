export interface ParsedSatellite {
    name: string;
    line1: string;
    line2: string;
    // SATCAT type from the local API ('payload' | 'rocket-body' | 'debris' | 'unknown').
    objectType?: string;
}

export type DataSource = 'loading' | 'local-api' | 'celestrak' | 'sample' | 'error';

export interface CatalogResult {
    satellites: ParsedSatellite[];
    source: Exclude<DataSource, 'loading'>;
    error?: string;
    staleHidden?: number;
}
