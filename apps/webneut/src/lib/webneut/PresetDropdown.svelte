<script lang="ts">
    import { experimentPresets, applyPreset } from '$lib/webneut/state.svelte';
    import { PresetCategory } from '$lib/webneut/types';

    let open = $state(false);

    const categories = [PresetCategory.Natural, PresetCategory.Reactor, PresetCategory.Accelerator];
</script>

<button class="text-sm font-normal" onclick={() => (open = !open)}>Preset</button>
{#if open}
    <div
        class="presets absolute top-16 right-4 z-10 flex flex-col rounded-lg border border-brand-primary bg-brand-secondary p-2"
    >
        <button
            class="w-full justify-start border-none text-sm"
            onclick={() => {
                applyPreset(experimentPresets[0]);
                open = false;
            }}
        >
            <span class="font-normal">{experimentPresets[0].name}</span>
        </button>
        {#each categories as category}
            {@const group = experimentPresets.filter((p) => p.category === category)}
            <div class="mx-1 my-0.5 flex items-center gap-2">
                <hr class="flex-1 border-t border-current opacity-20" />
                <span class="text-[10px] font-normal tracking-wider uppercase opacity-40"
                    >{category}</span
                >
            </div>
            {#each group as preset (preset.name)}
                <button
                    class="w-full justify-start border-none text-sm"
                    onclick={() => {
                        applyPreset(preset);
                        open = false;
                    }}
                >
                    <span class="font-normal">{preset.name}</span>
                    <span class="ml-2 text-xs font-normal opacity-60">{preset.description}</span>
                </button>
            {/each}
        {/each}
    </div>
{/if}
