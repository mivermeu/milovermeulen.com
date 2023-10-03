<script lang='ts'>
    import Card from '$lib/components/Card.svelte';
    import Image from '$lib/components/Image.svelte';
import { projects } from '$lib/data/projects';
</script>

<section>
    <h2>Projects</h2>
    <p class='description'>
        Sometimes I work on coding projects in my free time. Sometimes I even
        finish these projects. Here are the ones I am keenest to show off.
    </p>

    <div class='projects-container'>
        {#each projects as project, pi}
            <Card href={project.link} on:click image_on_right={pi % 2 === 0}>
                <div slot='image'>
                    <Image src={project.image} alt={project.name} />
                </div>
                <div class='content' slot='content'>
                    <div class='project-body'>
                        <h3>{project.name}</h3>
                        <p>{project.description}</p>
                    </div>
                </div>
            </Card>
        {/each}
    </div>
</section>

<style lang="scss">
    .projects-container {
        display: grid;
        grid-template-columns: 1fr;
        justify-items: center stretch;
        gap: 30px;
    }

    .description {
        max-width: 500px;
        margin: 0 auto;
        margin-bottom: 1em;
    }
</style>