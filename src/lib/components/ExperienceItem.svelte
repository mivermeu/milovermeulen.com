<script lang="ts">
    import { month_plus_year } from '$lib/utils/datetime';
    import type { EducationEntry, ExperienceEntry } from '$lib/utils/types';

    interface Props {
        className?: string;
        job: ExperienceEntry | EducationEntry;
    }

    let { className = '', job }: Props = $props();

    const job_start_text = $derived(month_plus_year(job.start));
    const job_stop_text = $derived(job.stop ? month_plus_year(job.stop) : 'Current');
</script>

<div class="border-l-2 border-white/20 pl-4 {className}">
    <h3 class="text-lg font-medium text-white">{job.title.toLowerCase()}</h3>
    <p class="text-sm text-white/50">
        {job.companies.map((x) => x.name).join(' / ')} · {job_start_text} - {job_stop_text}
    </p>
    <p class="mt-2 text-sm text-white/60">{job.description}</p>
</div>
