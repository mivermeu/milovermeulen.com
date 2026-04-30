<script lang="ts">
    interface Props {
        children: import('svelte').Snippet;
        className?: string; // For adding custom bg, text colors, or padding
    }

    let { children, className = '' }: Props = $props();
</script>

<div class="shadow-indent {className}">
    {@render children?.()}
</div>
