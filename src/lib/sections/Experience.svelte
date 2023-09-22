<script lang='ts'>
    import { jobs } from '$lib/data/experience';
    import type { ExperienceEntry } from '$lib/utils/types';
    import Card from '$lib/components/Card.svelte';
    import CompanyList from '$lib/components/CompanyList.svelte';
    import { month_plus_year } from '$lib/utils/datetime';

    const open_to_work: boolean = true;

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

<h2>Experience</h2>
<div class='job-list'>
    {#each sorted_jobs as job}
        <Card additional_class='job-card' href={job.href} details_present={job.details !== undefined}>
            <div class='content' slot='content'>
                <div class='job-body'>
                    <h3>{job.title}</h3>
                    <CompanyList companies={job.companies} />
                    <p>{@html job.short_description}</p>
                </div>
                <div class='job-timeline'>
                    <div class='job-timeline-body'>
                        <div class='stop-date'>
                            <div class='timeline-ball' />
                            {#if job.stop_text}
                                {job.stop_text}
                            {:else if job.stop}
                                {month_plus_year(job.stop)}
                            {:else}
                                Current
                            {/if}
                        </div>
                        <div class='start-date'>
                            <div class='timeline-ball' />
                            {job.start_text? job.start_text: month_plus_year(job.start)}
                        </div>
                    </div>
                </div>
            </div>
            <div class='details' slot='details'>
                {#if job.details}
                    <ul class='detail-list'>
                        {#each job.details as detail}
                            <li class='detail-entry'>{detail}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </Card>
    {/each}
</div>

<style lang="scss">
    .job-list {
        --date-width: 150px;
        --timeline-width: 2px;
        --card-spacing: 60px;
        --ball-diameter: 12px;

        max-width: 700px;
        margin: auto;
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
        }
    }

    .content {
        display: flex;
    }

    .job-body {
        flex: 1 1 auto;
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
            background-color: white;
        }

        .job-timeline-body {
            box-sizing: border-box;
            padding-left: var(--text-padding-card);
            height: 100%;
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-content: center;
        }
    }

    .start-date, .stop-date {
        position: relative;
    }

    .timeline-ball {
        width: var(--ball-diameter);
        height: var(--ball-diameter);
        outline: solid var(--timeline-width);
        border-radius: 50%;
        position: absolute;
        background-color: var(--color-bg);
        left: calc(-1 * var(--text-padding-card) + var(--timeline-width) / 2 - var(--ball-diameter) / 2);
        bottom: calc(var(--font-size-body) / 2);
    }

    .detail-entry + .detail-entry {
        margin-top: 20px;
    }
</style>
