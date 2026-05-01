<script lang="ts">
    interface Props {
        children: import('svelte').Snippet;
        className?: string; // For adding custom bg, text colors, or padding
    }

    let { children, className = '' }: Props = $props();
</script>

<span class="border-2 border-black shadow-raised {className}">
    {@render children?.()}
</span>
