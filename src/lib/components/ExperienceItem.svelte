<script lang="ts">
    import { month_plus_year } from '$lib/utils/datetime';
    import type { EducationEntry, ExperienceEntry } from '$lib/utils/types';
    import InlineButton from './InlineButton.svelte';

    interface Props {
        className?: string;
        job: ExperienceEntry | EducationEntry;
    }

    let { className = '', job }: Props = $props();

    const job_start_text = $derived(month_plus_year(job.start));
    const job_stop_text = $derived(job.stop ? month_plus_year(job.stop) : 'Current');
</script>

<div class="border-l border-white pl-4 {className}">
    <h3 class="text-lg font-medium text-white">{job.title.toLowerCase()}</h3>
    <p class="text-sm">
        <span class="my-2 flex items-center gap-1">
            {#each job.companies as company (company.name)}
                <InlineButton title={company.name} href={company.website} />
            {/each}
            · {job_start_text} - {job_stop_text}
        </span>
    </p>
    <p>{job.description}</p>
</div>
