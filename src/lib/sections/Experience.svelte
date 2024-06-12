<script lang='ts'>
    import { jobs } from '$lib/data/experience';
    import type { ExperienceEntry } from '$lib/utils/types';
    import Card from '$lib/components/Card.svelte';
    import CompanyList from '$lib/components/CompanyList.svelte';
    import { month_plus_year } from '$lib/utils/datetime';
    import Badge from '$lib/components/Badge.svelte';
    import resume from '$lib/documents/Resume_Milo_Vermeulen.pdf'
    import Icon from '$lib/components/Icon.svelte';

    const open_to_work: boolean = false;

    const next_job: ExperienceEntry = {
        companies: [],
        title: 'The next adventure',
        start: new Date(1993, 3, 1),  // Dummy date.
        start_text: 'Right now',
        stop_text: 'Who knows?',
        short_description:
            'I\'m open to work! Interested in working with me? '
            + 'Let\'s do it. Send me a message by clicking this card.',
        href: 'mailto:info@milovermeulen.com',
        tags: []
    }

    let sorted_jobs: ExperienceEntry[] = jobs.slice().sort(function(a, b) { return b.start.getTime() - a.start.getTime()});
    if (open_to_work) {
        sorted_jobs.unshift(next_job);
    }
</script>

<section>
    <h2>Work Experience</h2>
    <p class='description'>
        I've had the good fortune to work with inspiring colleagues on
        truly impactful projects. Here is a short summary on my most recent
        positions.
    </p>
    <div class='resume-download'>
        <Badge><a href={resume} target='_blank'>View resume</a></Badge>
    </div>
    <div class='job-list'>
        {#each sorted_jobs as job}
            {@const job_start_text = job.start_text? job.start_text: month_plus_year(job.start)}
            {@const job_stop_text = job.stop_text? job.stop_text: job.stop? month_plus_year(job.stop): 'Current'}
            <Card href={job.href} details_present={job.details !== undefined}>
                <div class='content' slot='content'>
                    <div class='job-body'>
                        <h3>{job.title}</h3>
                        <p class='small-screen-period'>{job_start_text} &#8594; {job_stop_text}</p>
                        <CompanyList companies={job.companies} />
                        <p>{@html job.short_description}</p>
                        {#each job.tags as tag}
                            <Badge>{tag}</Badge>
                        {/each}
                    </div>
                    <div class='job-timeline'>
                        <div class='job-timeline-body'>
                            <div class='stop-date'>
                                <div class='timeline-ball' />
                                {job_stop_text}
                            </div>
                            <div class='start-date'>
                                <div class='timeline-ball' />
                                {job_start_text}
                            </div>
                        </div>
                    </div>
                </div>
                <div class='details' slot='details'>
                    {#if job.details}
                        <div class='detail-list'>
                            {#each job.details as detail, di}
                                <div class='detail-entry'>
                                    <div class='detail-icon'>
                                        <Icon icon_name={detail.icon} />
                                    </div>
                                    <div>
                                        {@html detail.description}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </Card>
        {/each}
    </div>
</section>

<style lang="scss">
    section {
        max-width: 700px;
        margin: auto;
    }

    .description {
        max-width: 500px;
        margin: 0 auto;
    }

    .resume-download {
        text-align: center;
        margin: auto;
        margin-bottom: 1em;
    }

    .job-list {
        --date-width: 150px;
        --timeline-width: 2px;
        --card-spacing: 60px;
        --ball-diameter: 12px;

        display: flex;
        flex-direction: column;
        gap: var(--card-spacing);
        position: relative;

        // Add a little line between cards.
        &:before {
            border: none;
            border-right: dashed var(--timeline-width);
            content: '';
            position: absolute;
            width: 0;
            height: calc(100% - var(--text-padding-card));
            right: calc(var(--date-width) + var(--text-padding-card) - var(--timeline-width));
            top: calc(0.5 * var(--text-padding-card));
            z-index: -1;

            @media screen and (max-width: 550px) {
                right: 50%;
            }
        }
    }

    .content {
        display: flex;
    }

    .job-body {
        flex: 1 1 auto;
    }

    .small-screen-period {
        margin-top: -10px;

        @media screen and (min-width: 550px) {
            display: none;
        }
    }

    .job-timeline {
        position: relative;
        flex: 0 0 var(--date-width);

        &:before {
            position: absolute;
            top: var(--font-size-body);
            content: '';
            width: var(--timeline-width);
            height: calc(100% - 2 * var(--font-size-body));
            background-color: var(--color-icon);
        }

        .job-timeline-body {
            padding-left: var(--text-padding-card);
            height: 100%;
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-content: center;
        }

        @media screen and (max-width: 550px) {
            display: none;
        }
    }

    .start-date, .stop-date {
        position: relative;
    }

    .timeline-ball {
        width: var(--ball-diameter);
        height: var(--ball-diameter);
        outline: solid var(--timeline-width) var(--color-icon);
        border-radius: 50%;
        position: absolute;
        background-color: var(--color-bg);
        left: calc(-1 * var(--text-padding-card) + var(--timeline-width) / 2 - var(--ball-diameter) / 2);
        bottom: calc(var(--font-size-body) / 2);
    }

    .detail-list {
        --icon-gap: 1em;
        --icon-width: 3em;
        --extra-text-padding: calc(var(--icon-width) + var(--icon-gap));

        list-style-type: none;
        display: flex;
        flex-direction: column;
        padding: 2em;

        @media screen and (max-width: 600px) {
            --extra-text-padding: 0;
            padding: 0.5em;
        }

        .detail-entry + .detail-entry {
            margin-top: 2em;
        }

        .detail-entry {
            display: flex;
            gap: var(--icon-gap);
            align-items: center;
        }

        .detail-entry:nth-child(odd) {
            flex-direction: row;
            text-align: left;
            padding-right: var(--extra-text-padding);

            @media screen and (max-width: 350px) {
                flex-direction: column;
            }
        }

        .detail-entry:nth-child(even) {
            flex-direction: row-reverse;
            text-align: right;
            padding-left: var(--extra-text-padding);

            @media screen and (max-width: 350px) {
                flex-direction: column;
            }
        }

        .detail-icon {
            flex-shrink: 0;
            width: var(--icon-width);
            height: var(--icon-width);
        }
    }
</style>
