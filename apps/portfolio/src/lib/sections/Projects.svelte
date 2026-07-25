<script lang="ts">
    import Raised from '$lib/components/elements/Raised.svelte';
    import Icon from '$lib/components/elements/Icon.svelte';
    import { projects } from '$lib/data/projects';
</script>

<section id="projects">
    <div class="space-y-4 md:hidden">
        {#each projects as project, index (index)}
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h3 class="text-lg font-medium text-brand-text-highlight">
                        {project.name.toLowerCase()}
                    </h3>
                    <p class="mt-1 text-sm text-brand-text">
                        {project.description}
                    </p>
                </div>
                <a
                    href={project.link}
                    rel="external"
                    aria-label="Visit {project.name}"
                    class="inline-block shrink-0"
                >
                    <Raised className="rounded-full p-1">
                        <Icon
                            icon_name="up_right_arrow"
                            class="aspect-square h-5 fill-brand-text stroke-brand-text"
                        />
                    </Raised>
                </a>
            </div>
        {/each}
    </div>
    <div class="hidden items-stretch gap-6 md:flex">
        <div
            class="flex shrink-0 flex-col justify-center gap-1 rounded-full p-1 shadow-indent lg:gap-2 lg:p-2"
        >
            {#each projects as project, index (index)}
                <a href={project.link} rel="external" aria-label="Visit {project.name}">
                    <Raised className="rounded-full p-1 lg:p-4">
                        <Icon
                            icon_name="up_right_arrow"
                            class="aspect-square h-5 fill-brand-text stroke-brand-text lg:h-7"
                        />
                    </Raised>
                </a>
            {/each}
        </div>
        <div class="flex-1 space-y-6">
            {#each projects as project, index (index)}
                <div>
                    <h3 class="text-lg font-medium text-brand-text-highlight">
                        {project.name.toLowerCase()}
                    </h3>
                    <p class="mt-1 text-sm text-brand-text">
                        {project.description}
                    </p>
                </div>
            {/each}
        </div>
    </div>
</section>
