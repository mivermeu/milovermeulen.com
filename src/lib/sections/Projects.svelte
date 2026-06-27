<script>
    import { projects } from '$lib/data/projects';
</script>

<section id="projects">
    <div class="space-y-6">
        {#each projects as project, index (index)}
            <div class="rounded-lg border border-white/10 p-6">
                <h3 class="mb-2 text-lg font-medium text-brand-text-highlight">
                    {project.name.toLowerCase()}
                </h3>
                <p class="text-brand-text text-sm">
                    {project.description}
                </p>
            </div>
        {/each}
    </div>
</section>
