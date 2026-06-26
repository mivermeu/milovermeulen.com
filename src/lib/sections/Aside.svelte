<script lang="ts">
    import Indent from '$lib/components/Indent.svelte';
    import Raised from '$lib/components/Raised.svelte';
    import Contact from './Contact.svelte';

    let sections = ['about', 'experience', 'projects'];
</script>

<aside class="flex h-full flex-col justify-between">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-white">milo vermeulen</h1>
        <p class="text-sm text-orange-500">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <nav class="mt-8">
        <Indent className="p-2 rounded-3xl">
            <ul class="space-y-4">
                {#each sections as section (section)}
                    <li>
                        <Raised
                            className="flex items-center gap-4 rounded-2xl px-4 py-2 align-middle"
                        >
                            <div class="relative h-2 w-2 rounded-full bg-black"></div>
                            <a
                                href="#{section}"
                                class="relative text-white/80 transition-colors hover:text-white"
                                >{section}</a
                            >
                        </Raised>
                    </li>
                {/each}
            </ul>
        </Indent>
    </nav>

    <Contact />

    <div class="text-xs text-white/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
