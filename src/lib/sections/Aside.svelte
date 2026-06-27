<script lang="ts">
    import Raised from '$lib/components/Raised.svelte';
    import Contact from './Contact.svelte';

    let sections = ['about', 'experience', 'projects'];
</script>

<aside class="flex h-full flex-col justify-between">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
        <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <nav class="mt-8">
        <div class="rounded-3xl p-2 shadow-indent">
            <ul class="space-y-4">
                {#each sections as section (section)}
                    <li>
                        <a
                            href="#{section}"
                            class="text-brand-text relative transition-colors hover:text-brand-text-highlight"
                        >
                            <Raised
                                className="flex items-center gap-4 rounded-2xl px-4 py-2 align-middle w-full justify-start"
                            >
                                <div class="relative h-2 w-2 rounded-full bg-black"></div>
                                {section}
                            </Raised>
                        </a>
                    </li>
                {/each}
            </ul>
        </div>
    </nav>

    <Contact />

    <div class="text-xs text-brand-text-highlight/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
