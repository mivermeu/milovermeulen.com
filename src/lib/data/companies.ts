// List all companies.

import type { Company } from '$lib/utils/types'

import stcorp_logo from '$lib/images/logos/stcorp.svg'
import uh_logo from '$lib/images/logos/uh.svg'
import nikhef_logo from '$lib/images/logos/nikhef.svg'
import cern_logo from '$lib/images/logos/cern.svg'
import ru_logo from '$lib/images/logos/ru.svg'
import felix_logo from '$lib/images/logos/felix.svg'
import goteborg_logo from '$lib/images/logos/goteborg.svg'

export const ru: Company = {
    name: 'Radboud University',
    location: {city: 'Nijmegen', country: 'Netherlands'},
    website: 'https://www.ru.nl',
    logo: ru_logo
}

export const felix: Company = {
    name: 'FELIX Laboratory',
    location: {city: 'Nijmegen', country: 'Netherlands'},
    website: 'https://www.ru.nl/felix',
    logo: felix_logo
}

export const goteborg: Company = {
    name: 'University of Gothenburg',
    location: {city: 'Gothenburg', country: 'Sweden'},
    website: 'https://www.gu.se',
    logo: goteborg_logo
}

export const stcorp: Company = {
    name: 'Science [&] Technology',
    location: {city: 'Delft', country: 'Netherlands'},
    website: 'https://www.stcorp.nl',
    logo: stcorp_logo
}

export const nikhef: Company = {
    name: 'Nikhef',
    location: {city: 'Amsterdam', country: 'Netherlands'},
    website: 'https://www.nikhef.nl',
    logo: nikhef_logo
}

export const cern: Company = {
    name: 'CERN',
    location: {city: 'Genève', country: 'Switzerland'},
    website: 'https://www.cern.ch',
    logo: cern_logo
}

export const uh: Company = {
    name: 'University of Houston',
    location: {city: 'Houston', country: 'USA'},
    website: 'https://www.uh.edu',
    logo: uh_logo
}