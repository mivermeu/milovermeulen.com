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
        filter: drop-shadow(4px 6px 1px transparent);

        transition: 0.3s;
        &:hover {
            -webkit-filter: drop-shadow(4px 6px 1px var(--color-shadow));
            filter: drop-shadow(4px 6px 1px var(--color-shadow));
        }
    }
</style>