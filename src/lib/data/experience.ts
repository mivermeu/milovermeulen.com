// Work experience.

import type { ExperienceEntry } from '$lib/utils/types';
import { stcorp, nikhef, cern, uh } from '$lib/data/companies'

import agile from '$lib/images/icons/agile.svg'
import group from '$lib/images/icons/group.svg'
import atom from '$lib/images/icons/atom.svg'
import community from '$lib/images/icons/community.svg'
import gui from '$lib/images/icons/GUI.svg'
import satellite from '$lib/images/icons/satellite.svg'
import compression from '$lib/images/icons/compression.svg'
import sine from '$lib/images/icons/sine.svg'
import database_stats from '$lib/images/icons/database_stats.svg'
import teaching from '$lib/images/icons/teaching.svg'


export const jobs = [
    {
        companies: [stcorp],
        title: 'Scientific Software Engineer',
        start: new Date(2021, 6, 1),
        stop: new Date(2023, 6, 1),
        short_description: 'Created an interactive monitoring tool for the ground segment of two ESA satellite missions.',
        details: [
            {
                name: 'Satellite',
                description: 'Implemented and maintained a Python/Django-based monitoring system for earth-observation satellite missions.',
                icon: satellite
            },
            {
                name: 'GUI',
                description: 'Set up a dynamically generated Grafana-based monitoring user interface.',
                icon: gui
            },
            {
                name: 'Agile',
                description: 'Led frequent meetings with customers to report progress and set priorities in an agile workflow.',
                icon: agile
            },
            {
                name: 'Onboarding',
                description: 'Played a key role in onboarding multiple new members of the team by code walkthroughs and pair-programming sessions.',
                icon: group
            },
        ],
        tags: ['Django', 'Python', 'PostgreSQL', 'Docker', 'Grafana']
    },
    {
        companies: [nikhef, cern, uh],
        title: 'PhD Candidate',
        start: new Date(2016, 8, 1),
        stop: new Date(2021, 2, 1),
        short_description: 'Investigated impostor particle signatures in a large-scale neutrino experiment and ' + 
            'created performant data-acquisition code.',
        details: [
            {
                name: 'Pi0',
                description: 'Demonstrated a method to distinguish positrons from photons in ProtoDUNE, as well as a method to identify π&#8304;-particles, a major background to the physics signal in DUNE.',
                icon: atom
            },
            {
                name: 'Neutrino oscillation',
                description: 'Wrote a neutrino oscillation tool in JavaScript, as well as others in C++ and Python.',
                icon: sine
            },
            {
                name: 'Data acquisition',
                description: 'Created high-performance compression and readout algorithms for the ProtoDUNE FELIX data acquisition.',
                icon: compression
            },
            {
                name: 'Data taking',
                description: 'Logged over 170 hours of data taking during ProtoDUNE\'s two month beam run.',
                icon: database_stats
            },
            {
                name: 'Teaching assisting',
                description: 'Oversaw two years of university exercise classes in topics ranging from lab courses to quantum mechanics.',
                icon: teaching
            },
            {
                name: 'Tours',
                description: 'Carried out multiple tours of the ProtoDUNE experiment for groups of CERN visitors.',
                icon: community
            },
        ],
        tags: ['Particle physics', 'Data science', 'C++', 'Python', 'Pandas']
    }
] as ExperienceEntry[];