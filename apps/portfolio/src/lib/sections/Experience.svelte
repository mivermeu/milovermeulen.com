<script lang="ts">
    import ExperienceItem from '$lib/components/ExperienceItem.svelte';
    import { phd } from '$lib/data/education';
    import { jobs } from '$lib/data/experience';
    import type { ExperienceEntry } from '$lib/utils/types';

    let sorted_jobs: ExperienceEntry[] = jobs.slice().sort(function (a, b) {
        return b.start.getTime() - a.start.getTime();
    });
</script>

<section id="experience">
    <div class="space-y-10">
        {#each sorted_jobs as job, index (index)}
            <ExperienceItem {job} />
        {/each}
    </div>
</section>

<section id="education">
    <div class="space-y-4">
        {#each [phd] as education, index (index)}
            <ExperienceItem job={education} />
        {/each}
    </div>
</section>
