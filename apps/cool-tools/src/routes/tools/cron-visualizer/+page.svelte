<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import { parseField, describeCron } from '$lib/cron';

    let cron = $state('*/5 * * * *');
    let output = $state('');
    let nextTimes: string[] = $state([]);

    const fields = [['minute', '0-59'], ['hour', '0-23'], ['day of month', '1-31'], ['month', '1-12'], ['day of week', '0-7']];

    function analyze() {
        const parts = cron.trim().split(/\s+/);
        if (parts.length < 5) { output = 'Invalid: need 5 fields'; nextTimes = []; return; }
        output = describeCron(parts);

        const mins = parseField(parts[0], 0, 59);
        const hrs = parseField(parts[1], 0, 23);
        const days = parseField(parts[2], 1, 31);
        const months = parseField(parts[3], 1, 12);
        const dows = parseField(parts[4], 0, 7);
        const times: Date[] = [];
        const now = new Date();
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local cursor mutated imperatively, not reactive state
        let cursor = new Date(now);
        cursor.setSeconds(0, 0);
        for (let y = 0; y < 5; y++) {
            for (let m = 0; m < 12; m++) {
                cursor.setMonth(now.getMonth() + m);
                if (!months.includes(cursor.getMonth() + 1)) continue;
                for (let d = 0; d < 31; d++) {
                    cursor.setDate(1);
                    cursor.setDate(d + 1);
                    if (cursor.getMonth() !== (now.getMonth() + m) % 12) break;
                    if (!days.includes(cursor.getDate())) continue;
                    const dow = cursor.getDay();
                    if (!dows.includes(dow) && !dows.includes(dow === 0 ? 7 : dow)) continue;
                    for (const h of hrs) {
                        cursor.setHours(h);
                        for (const mn of mins) {
                            cursor.setMinutes(mn);
                            if (cursor > now) times.push(new Date(cursor));
                            if (times.length >= 10) break;
                        }
                        if (times.length >= 10) break;
                    }
                    if (times.length >= 10) break;
                }
                if (times.length >= 10) break;
            }
            if (times.length >= 10) break;
        }
        nextTimes = times.map((t) => t.toLocaleString());
    }
</script>

<ToolShell title="Cron Visualizer" desc="Parse cron expressions and view upcoming schedules.">
    <div class="mb-3 flex items-center gap-3">
        <input type="text" bind:value={cron} oninput={analyze} class="w-48 font-mono" placeholder="*/5 * * * *" />
    </div>

    <div class="mb-4 text-xs text-brand-text">
        Format: <code class="text-brand-text-highlight">minute hour day month weekday</code>
        <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {#each fields as [name, range] (name)}
                <span>{name}<br class="hidden sm:inline" /><span class="text-brand-text/60"> ({range})</span></span>
            {/each}
        </div>
    </div>

    {#if output && nextTimes.length === 0}
        <p class="mb-4 text-sm text-red-400">{output}</p>
    {/if}

    {#if output && nextTimes.length > 0}
        <div class="mb-4 rounded border border-brand-secondary bg-white/5 p-3 text-sm text-brand-text">
            <span class="font-semibold text-brand-text-highlight">Description:</span> {output}
        </div>
    {/if}

    {#if nextTimes.length > 0}
        <h3>Next 10 Runs</h3>
        <div class="flex flex-col gap-1">
            {#each nextTimes as t (t)}
                <div class="rounded border border-brand-secondary bg-white/5 px-3 py-1.5 font-mono text-xs text-brand-text-highlight">{t}</div>
            {/each}
        </div>
    {/if}
</ToolShell>