export type Parameter = {
    values: number[],
    label: string,
    snaps: number[],
    precision: number,
    limits: [number, number],
};

export type OscillationParameters = {
    [key: string]: Parameter,
    nsteps: Parameter,
    animspeed: Parameter,
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