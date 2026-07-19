<script lang="ts">
    interface Props {
        children: import('svelte').Snippet;
        className?: string; // For adding custom bg, text colors, or padding
    }

    let { children, className = '' }: Props = $props();
</script>

<span
    class="inline-flex items-center justify-center border-2 border-black shadow-raised transition-shadow duration-200 hover:shadow-hover active:shadow-active {className}"
>
    {@render children?.()}
</span>
