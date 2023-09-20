// List of external links + icons to other places on the internet where I'm present.

import type { Social } from '$lib/utils/types';
import linkedin from '$lib/images/icons/linkedin-plain.svg';
import github from '$lib/images/icons/github-plain.svg';
import email from '$lib/images/icons/email.svg';

export const Socials: Social[] = [
    {
        name: 'LinkedIn',
        link: 'https://www.linkedin.com/in/milo-vermeulen/',
        icon: linkedin
    },
    {
        name: 'GitHub',
        link: 'https://github.com/mivermeu',
        icon: github
    },
    {
        name: 'Email',
        link: 'mailto:info@milovermeulen.com',
        icon: email
    }
]