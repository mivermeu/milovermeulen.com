import { PlotType } from './types';

export const PLOT_TYPES: { name: string; value: PlotType }[] = [
    { name: 'Linear', value: PlotType.Linear },
    { name: 'Ternary', value: PlotType.Ternary }
];

export const NEUTRINO_OPTIONS: { nu: number; anti: number; flavor: string }[] = [
    { nu: 0, anti: 1, flavor: 'e' },
    { nu: 1, anti: 1, flavor: '\u03BC' },
    { nu: 2, anti: 1, flavor: '\u03C4' },
    { nu: 0, anti: -1, flavor: 'e' },
    { nu: 1, anti: -1, flavor: '\u03BC' },
    { nu: 2, anti: -1, flavor: '\u03C4' }
];
