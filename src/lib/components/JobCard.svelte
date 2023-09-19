<!-- Define a card that shows the experience gained in a job. -->

<script lang='ts'>
    import type { ExperienceEntry } from '$lib/utils/types';
    import Card from './Card.svelte';
    import CompanyList from './CompanyList.svelte';
    import { month_plus_year } from '$lib/utils/datetime';

    export let job: ExperienceEntry
</script>

<Card additional_class='job-card'>
    <div class='content' slot='content'>
        <div class='job-body'>
            <h3>{job.title}</h3>
            <CompanyList companies={job.companies} />
            <p>{job.short_description}</p>
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
</Card>

<style lang='scss'>
    :global(.job-card) {
        --date-width: 150px;
        --timeline-width: 2px;
        --card-spacing: 60px;
        --ball-diameter: 12px;
    }

    // Add a little line between cards.
    :global(.job-card+.job-card) {
        margin-top: var(--card-spacing);

        &:before {
            border: none;
            border-right: dashed var(--timeline-width);
            content: '';
            position: absolute;
            width: 0;
            height: var(--card-spacing);
            right: calc(var(--date-width) + var(--text-padding-card) - var(--timeline-width));
            top: calc(-1 * var(--card-spacing));
            z-index: 10000;
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

        box-shadow: inset var(--shadow-card);
    }
</style>