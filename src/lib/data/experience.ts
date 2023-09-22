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
        details: [
            'Implemented and maintained a Python/Django-based monitoring system for earth-observation satellite missions.',
            'Set up a dynamically generated Grafana-based monitoring user interface.',
            'Led frequent meetings with customers to report progress and set priorities in an agile workflow.',
            'Played a key role in onboarding multiple new members of the team by code walkthroughs and pair-programming sessions.'
        ],
        tags: ['Python', 'Django', 'Postgres', 'Docker']
    },
    {
        companies: [nikhef, cern, uh],
        title: 'PhD Candidate',
        start: new Date(2016, 8, 1),
        stop: new Date(2021, 2, 1),
        short_description: 'Investigated impostor particle signatures in a large-scale neutrino experiment and ' + 
            'created performant data-acquisition code.',
        details: [
            'Demonstrated a method to distinguish positrons from photons in ProtoDUNE, as well as a method to identify π0-particles, a major background to the physics signal in DUNE.',
            'Wrote a neutrino oscillation tool in JavaScript, as well as others in C++ and Python.',
            'Created high-performance compression and readout algorithms for the ProtoDUNE FELIX data acquisition.',
            'Logged over 170 hours of data taking during ProtoDUNE\'s two month beam run.',
            'Oversaw two years of university exercise classes in topics ranging from lab courses to quantum mechanics.',
            'Carried out multiple tours of the ProtoDUNE experiment for groups of CERN visitors.',
        ],
        tags: ['C++', 'Python', 'Particle physics']
    }
] as ExperienceEntry[];