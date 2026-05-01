<script lang="ts">
    import Raised from './Raised.svelte';

    interface Props {
        title: string;
        href: string;
    }

    let { title, href }: Props = $props();
</script>

<a {href} rel="external">
    <Raised className="px-2 py-0.5 rounded-lg relative text-nowrap">
        {title}
    </Raised>
</a>
