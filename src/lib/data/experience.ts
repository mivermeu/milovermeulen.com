// Work experience.

import type { Company, ExperienceEntry } from '$lib/utils/types';
import stcorp_logo from '$lib/images/stcorp.svg'
import uh_logo from '$lib/images/uh.svg'
import nikhef_logo from '$lib/images/nikhef.svg'
import cern_logo from '$lib/images/cern.svg'

const stcorp: Company = {
    name: 'Science [&] Technology',
    location: {city: 'Delft', country: 'Netherlands'},
    website: 'https://www.stcorp.nl',
    logo: stcorp_logo
}

const nikhef: Company = {
    name: 'Nikhef',
    location: {city: 'Amsterdam', country: 'Netherlands'},
    website: 'https://www.nikhef.nl',
    logo: nikhef_logo
}

const cern: Company = {
    name: 'CERN',
    location: {city: 'Genève', country: 'Switzerland'},
    website: 'https://www.cern.ch',
    logo: cern_logo
}

const uh: Company = {
    name: 'University of Houston',
    location: {city: 'Houston', country: 'USA'},
    website: 'https://www.uh.edu',
    logo: uh_logo
}


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