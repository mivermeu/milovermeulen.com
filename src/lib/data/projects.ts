// List of non-work projects.

import type { Project } from '$lib/utils/types';
import webneut from '$lib/images/webneut.svg'
import favicon from '$lib/images/icons/favicon/favicon.svg'

export const projects: Project[] = [
    {
        name: 'milovermeulen.com',
        description: `
            It's the website you're looking at right now! I wanted to make this
            version of my website interactive, responsive and fun to build. I
            think I succeeded on all those counts.
        `,
        image: favicon,
        link: 'https://github.com/mivermeu/milovermeulen.com',
        source_code: '',
        tags: ['Svelte', 'TypeScript', 'UI/UX', 'Web development']
    },
    {
        name: 'Webneut',
        description: `
            What neutrino physicist has not made their own neutrino oscillation
            calculations? I made mine into a responsive webtool to play with the
            oscillation parameters and see the results in real-time.
        `,
        image: webneut,
        link: '/webneut',
        source_code: '',
        tags: ['Physics', 'UI/UX', 'Web development']
    }
]