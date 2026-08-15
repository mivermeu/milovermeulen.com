import type { EducationEntry } from '$lib/utils/types';
import { companies } from '$lib/data/companies';

export const phd: EducationEntry = {
    companies: [companies.nikhef, companies.cern, companies.uh],
    title: 'PhD Particle Physics',
    start: new Date(2016, 9, 1),
    stop: new Date(2021, 2, 1),
    description: `
        Developed a method to discriminate impostor particle signatures from
        genuine neutrino interactions in the DUNE experiment. Authored
        low-level, performant data-acquisition firmware.
    `,
    thesis: {
        name: 'A Blessing in Disguise - Characterisations of ProtoDUNE photon showers for neutrino measurements in DUNE'
    }
};

export const master: EducationEntry = {
    companies: [companies.ru],
    title: "Master's Physics and Astronomy",
    start: new Date(2014, 8, 1),
    stop: new Date(2016, 8, 1),
    description: `
        My thesis research may have landed me on a couple of watch-lists: I
        studied the isotopic enrichment of calcium. I tested an isotopic difference
        in resin affinity, crystallisation and electrophoresis.
    `,
    thesis: {
        name: 'Calcium Enrichment for the Study of Neutrinoless Double Beta Decay'
    }
};

export const bachelor: EducationEntry = {
    companies: [companies.ru, companies.felix, companies.goteborg],
    title: "Bachelor's Physics and Astronomy",
    start: new Date(2013, 8, 1),
    stop: new Date(2014, 8, 1),
    description: `
        For my thesis research I characterised free-electron laser radiation and
        ultra-fast THz mirror switching. I also joined the honours programme, in
        which I researched tumour treatment using paramagnetic nanoparticles in
        a cross-functional team.
    `,
    thesis: {
        name: 'The Scanning Problem of FLARE and THz Pulse Slicing'
    }
};
