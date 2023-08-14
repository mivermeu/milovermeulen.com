<script lang='ts'>
    import { jobs } from '$lib/data/experience';
    import JobCard from '$lib/components/JobCard.svelte';
    import type { ExperienceEntry } from '$lib/utils/types';

    const open_to_work: boolean = true;

    const next_job: ExperienceEntry = {
        companies: [],
        title: 'The next adventure',
        start: new Date(1993, 3, 1),  // Dummy date.
        start_text: 'Right now',
        stop_text: 'Who knows?',
        short_description: 'I\'m open to work! Interested in working with me? Let\'s do it. Send me a message here.',
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
        <JobCard {job} />
    {/each}
</div>

<style lang="scss">
    .job-list {
        max-width: 700px;
        margin: auto;
    }
</style>
