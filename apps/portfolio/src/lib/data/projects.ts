// List of non-work projects.

import type { Project } from '$lib/utils/types';

export const projects: Project[] = [
    {
        name: 'casandramorris.net',
        description: `
        Portfolio site. Static delivery, responsive layout.
        `,
        link: 'https://www.casandramorris.net',
        source_code: '',
        tags: ['Svelte', 'TypeScript', 'UI/UX', 'Web development']
    },
    {
        name: 'milovermeulen.com',
        description: `
        This device interface.
        `,
        link: 'https://github.com/mivermeu/milovermeulen.com',
        source_code: '',
        tags: ['Svelte', 'TypeScript', 'UI/UX', 'Web development']
    },
    {
        name: 'Webneut',
        description: `
        Browser-based neutrino oscillation engine. Three-flavor PMNS
        matrix computation, WASM-accelerated.
        `,
        link: '/webneut',
        source_code: '',
        tags: ['Physics', 'UI/UX', 'Web development']
    },
    {
        name: 'Cool Tools',
        description: `
        Collection of client-side utilities: expense splitter, generators,
        JSON and CSV converters.
        `,
        link: '/cool-tools',
        source_code: '',
        tags: ['Svelte', 'TypeScript', 'UI/UX', 'Web development']
    },
    {
        name: 'Satellite Tracker',
        description: `
        Real-time 3D satellite globe tracker. SGP4 propagation,
        three.js renderer, orbital visualization.
        `,
        link: '/tracker',
        source_code: '',
        tags: ['Physics', 'UI/UX', 'Web development']
    }
];
