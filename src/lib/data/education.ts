// List of educations received.

import type { EducationEntry } from "$lib/utils/types"

export const educations = [
    {
        companies: [{name: 'Radboud University', location: {city: 'Nijmegen', country: 'Netherlands'}}],
        name: 'Master\'s Physics and Astronomy',
        start: new Date(2014, 9, 1),
        stop: new Date(2016, 9, 1),
        thesis: {
            name: 'Calcium Enrichment for the Study of Neutrinoless Double Beta Decay',
            // TODO: link
            short_description: 'Tested possible methods for the isotopic enrichment of calcium, '
                + 'including resin affinity, crystallisation and electrophoresis.'
        }
    },
    {
        companies: [
            {name: 'Radboud University', location: {city: 'Nijmegen', country: 'Netherlands'}},
            {name: 'FELIX Laboratory', location: {city: 'Nijmegen', country: 'Netherlands'}},
            {name: 'Göteborg Universitet', location: {city: 'Göteborg', country: 'Sweden'}}
        ],
        name: 'Bachelor\'s Physics and Astronomy',
        start: new Date(2013, 9, 1),
        stop: new Date(2014, 9, 1),
        thesis: {
            name: 'The Scanning Problem of FLARE and THz Pulse Slicing',
            // TODO: link
            short_description: 'Characterised free-electron laser radiation and ultra-fast THz mirror switching.'
        }
    }
] as EducationEntry[]
