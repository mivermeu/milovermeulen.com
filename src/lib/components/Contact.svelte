<script lang="ts">
    import Raised from '$lib/components/elements/Raised.svelte';
    import Icon from '$lib/components/elements/Icon.svelte';
    import { socials } from '$lib/data/socials';

    interface Props {
        rotation?: number;
    }

    let { rotation = 0 }: Props = $props();
</script>

<div
    class="flex h-fit w-fit flex-row gap-1 rounded-full p-1 shadow-indent lg:gap-2 lg:p-2"
    style="transform: rotate({rotation}deg);"
>
    {#each socials as social (social.name)}
        <a
            href={social.link}
            rel="external"
            aria-label="Visit {social.name}"
            style="transform: rotate(-{rotation}deg);"
        >
            <Raised className="rounded-full p-1 lg:p-4">
                <Icon
                    icon_name={social.icon}
                    class="aspect-square h-5 fill-brand-text stroke-brand-text lg:h-7"
                />
            </Raised>
        </a>
    {/each}
</div>
