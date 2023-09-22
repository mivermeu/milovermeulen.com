<script lang='ts'>
    import { Socials } from '$lib/data/socials';
</script>

<div class='socials'>
    {#each Socials as social}
        <a class='social-entry' href={social.link} title={social.name}>
            <img class='social-icon' src={social.icon} alt={social.name} />
        </a>
    {/each}
</div>

<style lang='scss'>
    .socials {
        margin: auto;
        display: flex;
        flex-direction: row;
        gap: 20px;
    }
    .social-icon {
        width: 30px;

        transition: 0.5s;
        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        &:hover {
            translate: var(--shadow-opposite-translation);
            filter: var(--shadow);
        }
    }
</style>