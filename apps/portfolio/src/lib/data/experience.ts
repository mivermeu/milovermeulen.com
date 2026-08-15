// Work experience.

import type { ExperienceEntry } from '$lib/utils/types';
import { companies } from '$lib/data/companies';

export const jobs = [
    {
        companies: [companies.realself],
        title: 'Fullstack Software Engineer',
        start: new Date(2026, 0, 5),
        description: `
            Full-stack ownership across feature delivery, performance
            optimization, and infrastructure maintenance.
        `,
        details: '',
        tags: ['React', 'TypeScript', 'FastAPI', 'AWS', 'Terraform']
    },
    {
        companies: [companies.nypc],
        title: 'Clinical Software Engineer',
        start: new Date(2024, 2, 11),
        stop: new Date(2026, 0, 2),
        description: `
            Maintained clinical software systems ensuring continuity of proton
            therapy delivery. Supported research initiatives across the
            treatment center.
        `,
        details: '',
        tags: ['Python', 'Grafana', 'Raystation', 'Varian Eclipse']
    },
    {
        companies: [companies.stcorp, companies.esa],
        title: 'Scientific Software Engineer',
        start: new Date(2021, 6, 1),
        stop: new Date(2023, 6, 1),
        description: `
            Engineered an interactive telemetry monitoring platform for two ESA
            earth-observation missions: EarthCARE and Biomass.
        `,
        details: '',
        tags: ['Django', 'Python', 'PostgreSQL', 'Docker', 'Grafana']
    }
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
