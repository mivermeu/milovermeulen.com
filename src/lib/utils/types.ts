// General data types.

export type Location = {
    city: string,
    country: string
}

export type Company = {
    name: string,
    location: Location
}

export type ExperienceEntry = {
    companies: [Company, ...Company[]],  // Require at least one company.
    title: string,
    start: Date,
    stop?: Date,
    short_description: string,
    tags: string[]
    accomplishments?: string[]  // TODO: List these on auto-generated resume.
}

export type Thesis = {
    name: string,
    link?: string,
    short_description: string  // Layman's summary of internship contents.
}

export type EducationEntry = {
    companies: [Company, ...Company[]],  // Require at least one company.
    name: string,
    start: Date,
    stop: Date,
    thesis: Thesis
}

export type Project = {
    name: string,
    description: string,
    link?: string,
    source_code?: string,
    tags: string[]
}
