// List all companies.

import type { Company } from '$lib/utils/types';

const realself: Company = {
    name: 'RealSelf',
    location: { city: 'New York City', country: 'United States' },
    website: 'https://www.realself.com'
};

const nypc: Company = {
    name: 'New York Proton Center',
    location: { city: 'New York City', country: 'United States' },
    website: 'https://www.nyproton.com'
};

const ru: Company = {
    name: 'Radboud University',
    location: { city: 'Nijmegen', country: 'Netherlands' },
    website: 'https://www.ru.nl'
};

const felix: Company = {
    name: 'FELIX Laboratory',
    location: { city: 'Nijmegen', country: 'Netherlands' },
    website: 'https://www.ru.nl/felix'
};

const goteborg: Company = {
    name: 'University of Gothenburg',
    location: { city: 'Gothenburg', country: 'Sweden' },
    website: 'https://www.gu.se'
};

const stcorp: Company = {
    name: 'Science [&] Technology',
    location: { city: 'Delft', country: 'Netherlands' },
    website: 'https://www.stcorp.nl'
};

const esa: Company = {
    name: 'ESA',
    location: { city: 'Paris', country: 'France' },
    website: 'https://www.esa.int/'
};

const nikhef: Company = {
    name: 'Nikhef',
    location: { city: 'Amsterdam', country: 'Netherlands' },
    website: 'https://www.nikhef.nl'
};

const cern: Company = {
    name: 'CERN',
    location: { city: 'Genève', country: 'Switzerland' },
    website: 'https://www.cern.ch'
};

const uh: Company = {
    name: 'University of Houston',
    location: { city: 'Houston', country: 'USA' },
    website: 'https://www.uh.edu'
};

export const companies = {
    realself,
    nypc,
    ru,
    felix,
    goteborg,
    stcorp,
    esa,
    nikhef,
    cern,
    uh
} as const;
