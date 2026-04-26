<script lang="ts">
	import { jobs } from "$lib/data/experience";
	import { month_plus_year } from "$lib/utils/datetime";
	import type { ExperienceEntry } from "$lib/utils/types";

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

<section id="experience" class="mb-16">
    <h2 class="mb-4 text-2xl font-medium text-white">experience</h2>
    <div class="space-y-4">
        {#each sorted_jobs as job, index (index)}
            {@const job_start_text = job.start_text? job.start_text: month_plus_year(job.start)}
            {@const job_stop_text = job.stop_text? job.stop_text: job.stop? month_plus_year(job.stop): 'Current'}
            <div class="border-l-2 border-white/20 pl-4">
                <h3 class="text-lg font-medium text-white">{job.title.toLowerCase()}</h3>
                <p class="text-sm text-white/50">{job.companies.map( x => x.name ).join(" / ")} · {job_start_text} - {job_stop_text}</p>
                <p class="mt-2 text-sm text-white/60">{job.short_description}</p>
            </div>
        {/each}
    </div>
</section>
