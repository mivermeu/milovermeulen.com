// Work experience.

import type { ExperienceEntry } from "$lib/utils/types"

export const jobs = [
    {
        companies: [{name: 'Science [&] Technology', location: {city: 'Delft', country: 'Netherlands'}}],
        title: 'Scientific Software Engineer',
        start: new Date(2021, 7, 1),
        stop: new Date(2023, 7, 1),
        short_description: 'Created an interactive monitoring tool for the ground segment of two ESA satellite missions.',
        tags: ['Python', 'Django', 'Postgres', 'Docker']
    },
    {
        companies: [
            {name: 'Nikhef', location: {city: 'Amsterdam', country: 'Netherlands'}},
            {name: 'CERN', location: {city: 'Genève', country: 'Switzerland'}},
            {name: 'University of Houston', location: {city: 'Houston', country: 'USA'}}
        ],
        title: 'PhD Candidate',
        start: new Date(2016, 9, 1),
        stop: new Date(2021, 3, 1),
        short_description: 'Investigated impostor particle signatures in a large-scale neutrino experiment and ' + 
            'created performant data-acquisition code.',
        tags: ['C++', 'Python', 'Particle physics']
    }
] as ExperienceEntry[];