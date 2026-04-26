// List of non-work projects.

import type { Project } from '$lib/utils/types';

export const projects: Project[] = [
    {
        name: 'casandramorris.net',
        description: `
        A portfolio website for Casandra Morris.
        `,
        link: 'https://www.casandramorris.net',
        source_code: '',
        tags: ['Svelte', 'TypeScript', 'UI/UX', 'Web development']
    },
    {
        name: 'milovermeulen.com',
        description: `
        This website.
        `,
        link: 'https://github.com/mivermeu/milovermeulen.com',
        source_code: '',
        tags: ['Svelte', 'TypeScript', 'UI/UX', 'Web development']
    },
    {
        name: 'Webneut',
        description: `
        Neutrino oscillation visualizer.
        `,
        link: '/webneut',
        source_code: '',
        tags: ['Physics', 'UI/UX', 'Web development']
    }
];
