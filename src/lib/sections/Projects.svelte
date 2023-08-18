<script lang='ts'>
    import { projects } from '$lib/data/projects';
</script>

<h2>Projects</h2>

<div class='projects-container'>
    {#each projects as project}
        <div class='project-card'>
            <div class='project-image-container'>
                <img src={project.image} alt={project.name} class='project-image' />
            </div>
            <div class='project-body'>
                <h3>{project.name}</h3>
                <p>{project.description}</p>
            </div>
            <a href={project.link}><span class='card-link'></span></a>
        </div>
    {/each}
</div>

<style lang="scss">
    .projects-container {
        display: grid;
        grid-template-columns: 1fr;
        justify-items: center stretch;
        gap: 30px;
    }

    .project-card {
        background-color: var(--color-card);
        box-shadow: var(--shadow-card);
        border-radius: var(--border-radius-card);

        transition: 0.3s;

        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        overflow: hidden;

        position: relative;

        &:hover {
            box-shadow: 0 0 15px var(--color-highlight);
            transform: translate(0, -3px);
        }

        --max-text-fraction: 70%;

        .project-body {
            flex: 1 0 var(--max-text-fraction);
            padding: var(--text-padding-card);
            max-width: 25em;
            margin: auto;
        }

        .project-image-container {
            position: relative;
            flex: 1 0 calc(100% - var(--max-text-fraction));
            min-height: 250px;
            max-height: 350px;

            .project-image {
                position: absolute;
                width: 100%;
                height: 100%;
                object-fit: cover;
                object-position: 50% 100%;
            }
        }
    }

    .card-link {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        z-index: 1;
    }
</style>