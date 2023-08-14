<!-- Define a card that shows the experience gained in a job. -->

<script lang="ts">
    import type { ExperienceEntry } from "$lib/utils/types";
    import CompanyList from "./CompanyList.svelte";
    import { month_plus_year } from "$lib/utils/datetime";

    export let job: ExperienceEntry
</script>

<div class='job-card'>
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

<style lang="scss">
    .job-card {
        --date-width: 150px;
        --timeline-width: 2px;
        --card-spacing: 60px;
        --ball-diameter: 12px;
        background-color: var(--color-card);
        box-shadow: var(--shadow-card);
        border-radius: var(--border-radius-card);

        display: flex;

        position: relative;
        margin-bottom: var(--card-spacing);

        // Add a little line between cards.
        &:before {
            border: none;
            border-right: dashed var(--timeline-width);
            content: '';
            position: absolute;
            width: 0;
            height: var(--card-spacing);
            right: calc(var(--date-width) - var(--timeline-width));
            top: 100%;
            // z-index: -1;
        }

        .job-body {
            flex: 1 1 auto;
            padding: var(--text-padding-card);
            padding-left: calc(var(--text-padding-card) * 2);
        }
        
        .job-timeline {
            position: relative;
            flex: 0 0 var(--date-width);

            &:before {
                position: absolute;
                top: calc(var(--text-padding-card) + var(--font-size-body));
                content: '';
                width: var(--timeline-width);
                height: calc(100% - 2 * var(--text-padding-card) - 2 * var(--font-size-body));
                background-color: white;
            }

            .job-timeline-body {
                box-sizing: border-box;
                padding: var(--text-padding-card);
                height: 100%;
                width: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-content: center;
            }
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