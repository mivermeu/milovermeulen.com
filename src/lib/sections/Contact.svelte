<script>
    import Raised from '$lib/components/Raised.svelte';
    import Icon from '$lib/components/Icon.svelte';
    import { socials } from '$lib/data/socials';
</script>

<section id="contact">
    <div class="w-fit rounded-full p-2 shadow-indent">
        <ul class="flex justify-start gap-2">
            {#each socials as social (social.name)}
                <li>
                    <a href={social.link} rel="external" aria-label="Visit {social.name}">
                        <Raised className="rounded-full p-4">
                            <Icon icon_name={social.icon} class="h-5 w-5 fill-white stroke-white" />
                        </Raised>
                    </a>
                </li>
            {/each}
        </ul>
    </div>
</section>
