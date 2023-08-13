<script lang='ts'>
    import { jobs } from '$lib/data/experience';
    import CompanyBadge from '$lib/components/CompanyBadge.svelte';
    import { month_plus_year } from '$lib/utils/datetime';
    import CompanyList from '$lib/components/CompanyList.svelte';

</script>

<h2>Experience</h2>
<div class='job-list'>
    {#each jobs.sort(function(a, b) { return b.start.getTime() - a.start.getTime()}) as job}
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
                        {job.stop? month_plus_year(job.stop): 'Current'}
                    </div>
                    <div class='start-date'>
                        <div class='timeline-ball' />
                        {month_plus_year(job.start)}
                    </div>
                </div>
            </div>
        </div>
    {/each}
</div>

<style lang="scss">
    .job-list {
        max-width: 700px;
        margin: auto;
    }

    .job-card {
        --date-width: 150px;
        --timeline-width: 2px;
        --card-spacing: 60px;
        --ball-diameter: 12px;
        background-color: var(--color-card);
        box-shadow: var(--shadow-card);
        border-radius: var(--border-radius-card);

        display: flex;

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

    .job-card + .job-card {
        position: relative;
        margin-top: var(--card-spacing);

        // Add a little line between cards.
        &:before {
            border: none;
            border-right: dashed var(--timeline-width);
            content: '';
            position: absolute;
            width: 0;
            height: var(--card-spacing);
            right: calc(var(--date-width) - var(--timeline-width));
            bottom: 100%;
            z-index: -1;
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
