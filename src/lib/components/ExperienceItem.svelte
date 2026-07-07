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

<div class="grid grid-cols-[auto_1fr] gap-2 {className}">
    <div class="flex flex-col justify-between text-right text-xs whitespace-nowrap">
        <span class="rotate-180 [writing-mode:vertical-rl]">{job_stop_text}</span>
        <span class="rotate-180 [writing-mode:vertical-rl]">{job_start_text}</span>
    </div>
    <div class="border-l border-white pl-4">
        <h3 class="text-lg font-medium text-brand-text-highlight">{job.title.toLowerCase()}</h3>
        <p class="text-sm">
            <span class="my-2 flex flex-wrap items-center gap-1">
                {#each job.companies as company (company.name)}
                    <InlineButton title={company.name} href={company.website} />
                {/each}
            </span>
        </p>
        <p>{job.description}</p>
    </div>
</div>
