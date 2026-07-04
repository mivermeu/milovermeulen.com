import type { EducationEntry } from '$lib/utils/types';
import { nikhef, ru, goteborg, felix, cern, uh } from '$lib/data/companies';

export const phd: EducationEntry = {
    companies: [nikhef, cern, uh],
    title: 'PhD Particle Physics',
    start: new Date(2016, 9, 1),
    stop: new Date(2021, 2, 1),
    description: `
        During my doctoral research, I found a way to unmask impostor particles that act
        like the particle we were actually after in our large-scale neutrino
        experiment. I also created low-level and performant data-acquisition code.
    `,
    thesis: {
        name: 'A Blessing in Disguise - Characterisations of ProtoDUNE photon showers for neutrino measurements in DUNE'
    }
};

export const master: EducationEntry = {
    companies: [ru],
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
    companies: [ru, felix, goteborg],
    title: "Bachelor's Physics and Astronomy",
    start: new Date(2013, 8, 1),
    stop: new Date(2014, 8, 1),
    description: `
        For my thesis research I characterised free-electron laser radiation and
        ultra-fast THz mirror switching. I also joined the honurs programme, in
        which I researched tumour treatment using paramagnetic nanoparticles in
        a cross-functional team.
    `,
    thesis: {
        name: 'The Scanning Problem of FLARE and THz Pulse Slicing'
    }
};
