// Work experience.

import type { ExperienceEntry } from '$lib/utils/types';
import { nypc, stcorp, nikhef, cern, uh } from '$lib/data/companies'


export const jobs = [
    {
        companies: [nypc],
        title: 'Clinical Software Engineer',
        start: new Date(2024, 2, 11),
        short_description: `
            As part of the physics group, I help ensure that proton therapy
            patients receive their planned care. I also manage the center's
            software and version control, and am involved in several research
            projects.
        `,
        details: [
            {
                name: 'Scripting',
                description: `
                    Streamlined dosimetry and physics processes by developing
                    clinical software in Python.
                `,
                icon: 'repetition'
            },
            {
                name: 'Version control',
                description: `
                    Established git-based version control protocols for all of
                    the center's custom software.
                `,
                icon: 'git'
            },
            {
                name: 'Research',
                description: `
                    Investigated various research projects, including
                    improvements to patient imaging and monitoring of treatment
                    delivery.
                `,
                icon: 'clinical_research'
            },
            {
                name: 'Clinical',
                description: `
                    Performed various clinical tasks, such as patient-specific
                    QA and plan evaluations.
                `,
                icon: 'clinical'
            },
        ],
        tags: ['Python', 'Grafana', 'Raystation', 'Varian Eclipse']
    },
    {
        companies: [stcorp],
        title: 'Scientific Software Engineer',
        start: new Date(2021, 6, 1),
        stop: new Date(2023, 6, 1),
        short_description: `
            I worked on a team to develop an interactive monitoring system for
            EarthCARE and Biomass, two ESA satellite missions that aim to
            measure and map changes in our planet's atmosphere and forests.
        `,
        details: [
            {
                name: 'Satellite',
                description: `
                    Built and maintained a Python-based monitoring system
                    for the data processing pipeline of earth-observation
                    satellite missions.
                `,
                icon: 'satellite'
            },
            {
                name: 'Database',
                description: `
                    Used Django to define a PostgreSQL database structure and
                    perform analysis on large streams of data.
                `,
                icon: 'database_configuration'
            },
            {
                name: 'GUI',
                description: `
                    Set up a dynamically generated Grafana-based monitoring user
                    interface.
                `,
                icon: 'gui'
            },
            {
                name: 'Agile',
                description: `
                    Led frequent meetings with customers to report progress and
                    set priorities in an agile workflow.
                `,
                icon: 'agile'
            },
            {
                name: 'Onboarding',
                description: `
                    Played a key role in onboarding multiple new members of the
                    team by code walkthroughs and pair-programming sessions.
                `,
                icon: 'group'
            },
        ],
        tags: ['Django', 'Python', 'PostgreSQL', 'Docker', 'Grafana']
    },
    {
        companies: [nikhef, cern, uh],
        title: 'Particle Physics PhD Candidate',
        start: new Date(2016, 8, 1),
        stop: new Date(2021, 2, 1),
        short_description: `
            I worked on the Deep Underground Neutrino Experiment to uncover
            impostor particle signatures, characterise photon showers and write
            performant data-acquisition code.
        `,
        details: [
            {
                name: 'Pi0',
                description: `
                    Demonstrated a method to distinguish positrons from photons
                    in a large-scale physics experiment, as well as a method to
                    identify π<sup>0</sup>-particles, a major background to the
                    physics signal.
                `,
                icon: 'atom'
            },
            {
                name: 'Neutrino oscillation',
                description: `
                    Developed <a href='/webneut' target='_blank'>an interactive neutrino
                    oscillation tool</a> in TypeScript, now ported to Svelte, as
                    well as previous versions in C++ and Python.
                `,
                icon: 'sine'
            },
            {
                name: 'Data acquisition',
                description: `
                    Created high-performance compression and readout algorithms
                    for our experiment's data acquisition chain.
                `,
                icon: 'compression'
            },
            {
                name: 'Data taking',
                description: `
                    Performed over 170 hours of data taking duties during the
                    two month-long beam run of our physics experiment.
                `,
                icon: 'database_stats'
            },
            {
                name: 'Teaching assisting',
                description: `
                    Oversaw two years of university physics exercise classes in
                    topics ranging from lab courses to quantum mechanics.
                `,
                icon: 'teaching'
            },
            {
                name: 'Tours',
                description: `
                    Participated in outreach efforts by carrying out tours of
                    our experiment for groups of CERN visitors, represented my
                    collaboration at various conferences and more.
                `,
                icon: 'community'
            },
        ],
        tags: ['Particle physics', 'Data science', 'C++', 'Python', 'Pandas']
    }
] as ExperienceEntry[];