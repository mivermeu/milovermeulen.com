<script>
    import Raised from '$lib/components/Raised.svelte';
    import Icon from '$lib/components/Icon.svelte';
    import { socials } from '$lib/data/socials';
</script>

<section id="contact">
    <div class="flex w-fit gap-2 rounded-full p-2 shadow-indent">
        {#each socials as social (social.name)}
            <a href={social.link} rel="external" aria-label="Visit {social.name}">
                <Raised className="rounded-full p-4">
                    <Icon
                        icon_name={social.icon}
                        class="h-5 w-5 fill-brand-text stroke-brand-text"
                    />
                </Raised>
            </a>
        {/each}
    </div>
</section>
