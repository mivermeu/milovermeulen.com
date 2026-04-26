// Work experience.

import type { ExperienceEntry } from '$lib/utils/types';
import { realself, nypc, stcorp } from '$lib/data/companies'


export const jobs = [
    {
        companies: [realself],
        title: 'Fullstack Software Engineer',
        start: new Date(2026, 0, 5),
        short_description: `
            test
        `,
        details: "",
        tags: ['React', 'TypeScript', 'FastAPI', 'AWS']
    },
    {
        companies: [nypc],
        title: 'Clinical Software Engineer',
        start: new Date(2024, 2, 11),
        stop: new Date(2026, 0, 2),
        short_description: `
            As part of the physics group, I helped ensure that proton therapy
            patients receive their planned care. I also managed the center's
            clinical software and was involved in several research
            projects.
        `,
        details: "",
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
        details: "",
        tags: ['Django', 'Python', 'PostgreSQL', 'Docker', 'Grafana']
    },
    // {
    //     companies: [nikhef, cern, uh],
    //     title: 'Particle Physics PhD Candidate',
    //     start: new Date(2016, 8, 1),
    //     stop: new Date(2021, 2, 1),
    //     short_description: `
    //         I worked on the Deep Underground Neutrino Experiment to uncover
    //         impostor particle signatures, characterise photon showers and write
    //         performant data-acquisition code.
    //     `,
    //     details: "",
    //     tags: ['Particle physics', 'Data science', 'C++', 'Python', 'Pandas']
    // }
] as ExperienceEntry[];
