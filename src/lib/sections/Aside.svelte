<script lang="ts">
    import Raised from '$lib/components/Raised.svelte';

    interface Section {
        id: string;
        label: string;
    }

    let sections = $state<Section[]>([]);

    $effect(() => {
        const elements = document.querySelectorAll('section[id]');
        sections = Array.from(elements).map((el) => {
            const h2 = el.querySelector('h2');
            return {
                id: el.id,
                label: h2 ? h2.textContent?.trim().toLowerCase() : el.id
            };
        });
    });
</script>

<aside class="flex h-full flex-col justify-between">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-white">milo vermeulen</h1>
        <p class="text-sm text-orange-500">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <nav class="mt-8">
        <ul class="space-y-4">
            {#each sections as section (section.id)}
                <li>
                    <Raised className="flex items-center gap-4 rounded-2xl px-4 py-2 align-middle">
                        <div class="relative h-2 w-2 rounded-full bg-black"></div>
                        <a
                            href="#{section.id}"
                            class="relative text-white/80 transition-colors hover:text-white"
                            >{section.label}</a
                        >
                    </Raised>
                </li>
            {/each}
        </ul>
    </nav>

    <div class="text-xs text-white/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
