<script lang="ts">
    interface Section {
        id: string;
        label: string;
    }

    let sections = $state<Section[]>([]);

    $effect(() => {
        const elements = document.querySelectorAll('section[id]');
        sections = Array.from(elements).map(el => {
            const h2 = el.querySelector('h2');
            return {
                id: el.id,
                label: h2 ? h2.textContent?.trim().toLowerCase() : el.id
            };
        });
    });
</script>

<aside class="h-full flex flex-col justify-between">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-white">milo vermeulen</h1>
        <p class="text-sm text-orange-500">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <nav class="mt-8">
        <ul class="space-y-6">
            {#each sections as section (section.id)}
                <li>
                    <div class="flex items-center align-middle gap-4">
                        <div class="h-2 w-2 bg-black rounded-full"></div>
                        <a href="#{section.id}" class="transition-colors text-white/80 hover:text-white">{section.label}</a>
                    </div>
                </li>
            {/each}
        </ul>
    </nav>

    <div class="text-xs text-white/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
