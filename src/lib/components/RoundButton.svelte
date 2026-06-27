<script lang="ts">
    import Raised from './Raised.svelte';

    interface Props {
        href: string;
        icon?: string;
    }

    let { href, icon }: Props = $props();
</script>

<Raised className="rounded-full px-6 py-3.5">
    <a {href} rel="external" aria-label="Visit {href}">
        {#if icon}
            <span>{icon}</span>
        {/if}
    </a>
</Raised>
