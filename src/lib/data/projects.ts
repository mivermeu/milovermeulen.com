// List of non-work projects.

import type { Project } from '$lib/utils/types';
import webneut from '$lib/images/webneut.svg'

export const projects: Project[] = [
    {
        name: 'Webneut',
        description:
            'What neutrino physicist has not made their own neutrino oscillation calculations? I made mine into a responsive webtool to ' +
            ' play with the oscillation parameters and see the results in real-time.',
        image: webneut,
        link: '/webneut',
        source_code: '',
        tags: ['Physics', 'UI/UX', 'Web development']
    }
]