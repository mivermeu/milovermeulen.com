// General data types.

import type { icons } from '$lib/data/icons';

export type Location = {
    city: string;
    country: string;
};

export type Company = {
    name: string;
    location: Location;
    website: string;
};

export type ExperienceEntry = {
    companies: Company[];
    title: string;
    start: Date;
    stop?: Date;
    // Custom start/stop text that takes precedence over dates.
    start_text?: string;
    stop_text?: string;
    short_description: string;
    details?: string;
    href?: string;
    tags: string[];
};

export type Thesis = {
    name: string;
    // link: string,
    // image: string
};

export type EducationEntry = {
    companies: Company[];
    name: string;
    start: Date;
    stop: Date;
    description: string;
    thesis: Thesis;
};

export type Project = {
    name: string;
    description: string;
    image?: string;
    link?: string;
    source_code?: string;
    tags: string[];
};

export type Social = {
    name: string;
    icon: keyof typeof icons;
    link: string;
};
