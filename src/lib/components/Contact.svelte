<script lang="ts">
    import Raised from '$lib/components/elements/Raised.svelte';
    import Icon from '$lib/components/elements/Icon.svelte';
    import { socials } from '$lib/data/socials';
</script>

<div class="flex w-fit flex-row gap-2 rounded-full p-2 shadow-indent">
    {#each socials as social (social.name)}
        <a href={social.link} rel="external" aria-label="Visit {social.name}">
            <Raised className="rounded-full p-3 xl:p-4">
                <Icon
                    icon_name={social.icon}
                    class="h-4 w-4 fill-brand-text stroke-brand-text xl:h-5 xl:w-5"
                />
            </Raised>
        </a>
    {/each}
</div>
