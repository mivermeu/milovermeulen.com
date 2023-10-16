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
    link: string,
    image: string
}

export type EducationEntry = {
    companies: Company[],
    name: string,
    start: Date,
    stop: Date,
    description: string,
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

export type CSSProperty = {
    name: string,
    css_name: string,
    type: string,
    value?: string
};

export type Theme = {
    author: string,
    brightness: 'light' | 'dark' | 'other',
    name: string,
    color_bg: string,
    color_text: string,
    color_icon: string,
    color_card: string,
    color_button: string,
    color_shadow: string,
    font_size_title: string,
    font_size_subtitle: string,
    font_size_topic: string,
    font_size_body: string,
    font_weight_title: string,
    font_weight_body: string,
}
