<script>
    import { socials } from '$lib/data/socials';
</script>

<section id="contact">
    <ul class="flex gap-4 text-orange-600">
        {#each socials as social (social.name)}
            <li>
                <a href={social.link} rel="external" class="hover:underline">{social.name}</a>
            </li>
        {/each}
    </ul>
</section>
