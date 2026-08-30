export type Parameter = {
    values: number[];
    label: string;
    snaps: number[];
    precision: number;
    limits: [number, number];
};

export type OscillationParameters = {
    [key: string]: Parameter;
    plot_type: Parameter;
    nsteps: Parameter;
    animation_period: Parameter;
    nu: Parameter;
    anti: Parameter;
    mass_ordering: Parameter;
    E: Parameter;
    L: Parameter;
    th12: Parameter;
    th23: Parameter;
    th13: Parameter;
    Dm21sq: Parameter;
    Dm31sq: Parameter;
    dCP: Parameter;
    rho: Parameter;
};

export enum PlotType {
    Linear,
    Ternary
}

export enum PresetCategory {
    Natural = 'Natural',
    Reactor = 'Reactor',
    Accelerator = 'Accelerator'
}
