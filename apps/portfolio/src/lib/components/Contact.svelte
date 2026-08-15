<script lang="ts">
    import Raised from '$lib/components/elements/Raised.svelte';
    import Icon from '$lib/components/elements/Icon.svelte';
    import { socials } from '$lib/data/socials';
    import { playThock } from '$lib/audio/uiSound';

    interface Props {
        rotation?: number;
    }

    let { rotation = 0 }: Props = $props();
</script>

<div
    class="flex h-fit w-fit flex-row gap-2 rounded-full p-2 shadow-indent"
    style="transform: rotate({rotation}deg);"
>
    {#each socials as social (social.name)}
        <a
            href={social.link}
            rel="external"
            aria-label="Visit {social.name}"
            style="transform: rotate(-{rotation}deg);"
            onclick={() => playThock()}
        >
            <Raised className="rounded-full p-2 lg:p-4">
                <Icon
                    icon_name={social.icon}
                    class="aspect-square h-7 fill-brand-text stroke-brand-text"
                />
            </Raised>
        </a>
    {/each}
</div>
