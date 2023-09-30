<script lang='ts'>
    import { socials } from '$lib/data/socials';
</script>

<div class='socials'>
    {#each socials as social}
        <a href={social.link} title={social.name}>
            <div class='social-entry'>
                <div class='social-icon' style='--url: url({social.icon})' />
            </div>
        </a>
    {/each}
</div>

<style lang='scss'>
    .socials {
        display: flex;
        flex-direction: row;
        gap: 20px;
    }

    .social-entry {
        transition: 0.2s;
        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        &:hover {
            translate: var(--shadow-opposite-translation);
            filter: var(--shadow);
        }
    }

    .social-icon {
        width: 30px;
        height: 30px;
        pointer-events: all;

        background-color: var(--color-icon);
        -webkit-mask-image: var(--url);
        mask-image: var(--url);
        -webkit-mask-size: 100%;
        mask-size: 100%;
    }
</style>