// Work experience.

import type { ExperienceEntry } from '$lib/utils/types';
import { stcorp, nikhef, cern, uh } from '$lib/data/companies'


export const jobs = [
    {
        companies: [stcorp],
        title: 'Scientific Software Engineer',
        start: new Date(2021, 6, 1),
        stop: new Date(2023, 6, 1),
        short_description: 'Created an interactive monitoring tool for the ground segment of two ESA satellite missions.',
        tags: ['Python', 'Django', 'Postgres', 'Docker']
    },
    {
        companies: [nikhef, cern, uh],
        title: 'PhD Candidate',
        start: new Date(2016, 8, 1),
        stop: new Date(2021, 2, 1),
        short_description: 'Investigated impostor particle signatures in a large-scale neutrino experiment and ' + 
            'created performant data-acquisition code.',
        tags: ['C++', 'Python', 'Particle physics']
    }
] as ExperienceEntry[];