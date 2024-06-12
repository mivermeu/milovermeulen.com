<script lang='ts'>
    import { socials } from '$lib/data/socials';
    import Icon from './Icon.svelte';
</script>

<div class='socials'>
    {#each socials as social}
        <a href={social.link} title={social.name}>
            <div class='social-icon'>
                <Icon icon_name={social.icon} />
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

    .social-icon {
        width: 30px;
        height: 30px;
        transition: 0.2s;
        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        &:hover {
            translate: var(--shadow-opposite-translation);
            filter: var(--shadow);
        }
    }
</style>