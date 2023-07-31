<script lang='ts'>
    import { jobs } from '$lib/data/experience';
    import CompanyBadge from '$lib/components/CompanyBadge.svelte';

    function month_plus_year(date: Date): string {
        return date.toLocaleDateString('default', {'month': 'short'}) + ' ' + date.getFullYear();
    }
</script>

<h2>Experience</h2>
<div class='job-list'>
    {#each jobs as job}
        <div class='job-card'>
            <div class='job-body'>
                <h3>{job.title}</h3>
                {#each job.companies as company}
                    <CompanyBadge {company} />
                {/each}
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
        --line-width: 2px;
        --text-padding: 20px;
        --card-spacing: 60px;
        --ball-diameter: 12px;
        --shadow: 2px 2px 7px black;

        display: flex;
        background-color: #333;
        grid-column: 1;
        border-radius: 10px;
        box-shadow: var(--shadow);

        .job-body {
            flex: 1 1 auto;
            padding: var(--text-padding);
            padding-left: calc(var(--text-padding) * 2)
        }
        
        .job-timeline {
            position: relative;
            flex: 0 0 var(--date-width);
    
            &:before {
                position: absolute;
                top: calc(var(--text-padding) + var(--font-size-body));
                content: '';
                width: var(--line-width);
                height: calc(100% - 2 * var(--text-padding) - 2 * var(--font-size-body));
                background-color: white;
            }
    
            .job-timeline-body {
                box-sizing: border-box;
                padding: var(--text-padding);
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
            border-right: dashed var(--line-width);
            content: '';
            position: absolute;
            width: 0;
            height: var(--card-spacing);
            right: calc(var(--date-width) - var(--line-width));
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
        outline: solid var(--line-width);
        border-radius: 50%;
        position: absolute;
        background-color: var(--color-bg);
        left: calc(-1 * var(--text-padding) + var(--line-width) / 2 - var(--ball-diameter) / 2);
        bottom: calc(var(--font-size-body) / 2);

        box-shadow: inset var(--shadow);
    }
</style>
