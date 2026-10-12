export interface ParsedSatellite {
    name: string;
    line1: string;
    line2: string;
    // NORAD catalog ID from TLE line 1 (cols 3-7), alpha-5 decoded; null if unparsable.
    noradId: number | null;
    // SATCAT type from the local API ('payload' | 'rocket-body' | 'debris' | 'unknown').
    objectType?: string;
    // Function category from the local API (CelesTrak groups), e.g. 'navigation'.
    category?: string;
}

export type DataSource = 'loading' | 'local-api' | 'celestrak' | 'sample' | 'error';

export interface CatalogResult {
    satellites: ParsedSatellite[];
    source: Exclude<DataSource, 'loading'>;
    error?: string;
    staleHidden?: number;
}
