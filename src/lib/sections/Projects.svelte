<script>
	import { projects } from "$lib/data/projects";

</script>
<section id="projects" class="mb-16">
    <h2 class="mb-4 text-2xl font-medium text-white">projects</h2>
    <div class="space-y-6">
        {#each projects as project, index (index)}
        <div class="rounded-lg border border-white/10 p-6">
            <h3 class="mb-2 text-lg font-medium text-white">{project.name.toLowerCase()}</h3>
            <p class="text-sm text-white/60">
                {project.description}
            </p>
        </div>
        {/each}
    </div>
</section>
