// List of educations received.

import type { EducationEntry } from "$lib/utils/types"
import { nikhef, ru, goteborg, felix, cern, uh } from '$lib/data/companies'

import phd_thesis_cover from '$lib/images/covers/phd_thesis_cover.svg'
import master_thesis_cover from '$lib/images/covers/master_thesis_cover.svg'
import bachelor_thesis_cover from '$lib/images/covers/bachelor_thesis_cover.svg'

import phd_thesis from '$lib/documents/A_Blessing_in_Disguise.pdf'
import master_thesis from '$lib/documents/Calcium_Enrichment_for_the_Study_of_Neutrinoless_Double_Beta_Decay.pdf'
import bachelor_thesis from '$lib/documents/The_Scanning_Problem_of_FLARE_and_THz_Pulse_Slicing.pdf'

export const phd: EducationEntry = {
    companies: [nikhef, cern, uh],
    name: 'PhD Particle Physics',
    start: new Date(2016, 9, 1),
    stop: new Date(2021, 2, 1),
    description: `
        During my doctoral research, I found a way to unmask impostor particles that act
        like the particle we were actually after in our large-scale neutrino
        experiment. I also created low-level and performant data-acquisition code.
    `,
    thesis: {
        name: 'A Blessing in Disguise - Characterisations of ProtoDUNE photon showers for neutrino measurements in DUNE',
        link: phd_thesis,
        image: phd_thesis_cover
    }
}

export const master: EducationEntry = {
    companies: [ru],
    name: 'Master\'s Physics and Astronomy',
    start: new Date(2014, 8, 1),
    stop: new Date(2016, 8, 1),
    description: `
        My thesis research may have landed me on a couple of watch-lists: I
        studied the isotopic enrichment of calcium. I tested a number of
        possible methods for this, including an isotopic difference in resin
        affinity, crystallisation and electrophoresis.
    `,
    thesis: {
        name: 'Calcium Enrichment for the Study of Neutrinoless Double Beta Decay',
        link: master_thesis,
        image: master_thesis_cover
    }
}

export const bachelor: EducationEntry = {
    companies: [ru, felix, goteborg],
    name: 'Bachelor\'s Physics and Astronomy',
    start: new Date(2013, 8, 1),
    stop: new Date(2014, 8, 1),
    description: `
        For my thesis research I characterised free-electron laser radiation and
        ultra-fast THz mirror switching. I also joined the honurs programme, in
        which I researched tumour treatment using paramagnetic nanoparticles in
        a cross-functional team.
    `,
    thesis: {
        name: 'The Scanning Problem of FLARE and THz Pulse Slicing',
        link: bachelor_thesis,
        image: bachelor_thesis_cover
    }
}
