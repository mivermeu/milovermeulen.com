<script lang="ts">
    import Raised from '$lib/components/elements/Raised.svelte';
    import { playThock } from '$lib/audio/uiSound';

    interface Props {
        title: string;
        href: string;
    }

    let { title, href }: Props = $props();
</script>

<a {href} rel="external" onclick={() => playThock()}>
    <Raised className="px-2 py-0.5 rounded-lg relative text-nowrap">
        {title}
    </Raised>
</a>
