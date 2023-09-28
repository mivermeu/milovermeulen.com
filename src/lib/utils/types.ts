// General data types.

export type Location = {
    city: string,
    country: string
}

export type Company = {
    name: string,
    location: Location,
    website: string,
    logo: any
}

export type ExperienceEntry = {
    companies: Company[],
    title: string,
    start: Date,
    stop?: Date,
    // Custom start/stop text that takes precedence over dates.
    start_text?: string,
    stop_text?: string,
    short_description: string,
    details?: ExperienceDetail[],
    href?: string,
    tags: string[]
}

export type ExperienceDetail = {
    name: string,
    description: string,
    icon: string
}

export type Thesis = {
    name: string,
    short_description: string,  // Layman's summary of internship contents.
    link: string,
    image: string
}

export type EducationEntry = {
    companies: Company[],
    name: string,
    start: Date,
    stop: Date,
    thesis: Thesis
}

export type Project = {
    name: string,
    description: string,
    image: string,
    link?: string,
    source_code?: string,
    tags: string[]
}

export type Social = {
    name: string,
    icon: string,
    link: string
}
