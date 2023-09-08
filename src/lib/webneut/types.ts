export type Parameter = {
    values: number[],
    label: string,
    snaps: number[],
    precision: number,
    limits: [number, number],
    animating: boolean,
};

export type OscillationParameters = {
    [key: string]: Parameter,
    plot_type: Parameter,
    nsteps: Parameter,
    animation_period: Parameter,
    nu: Parameter,
    anti: Parameter,
    E: Parameter,
    L: Parameter,
    th12: Parameter,
    th23: Parameter,
    th13: Parameter,
    Dm21sq: Parameter,
    Dm31sq: Parameter,
    dCP: Parameter,
    rho: Parameter
}

export enum PlotType {
    Linear,
    Ternary
}