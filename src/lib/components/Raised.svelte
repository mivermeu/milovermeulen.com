<script lang="ts">
    interface Props {
        children: import('svelte').Snippet;
        className?: string; // For adding custom bg, text colors, or padding

        // // Lighting Customization
        // shadowX?: number;
        // shadowY?: number;
        // shadowBlur?: number;
        // shadowColor?: string;
    }

    let {
        children,
        className = ''
        // shadowX = 0,
        // shadowY = 0,
        // shadowBlur = 0,
        // shadowColor = 'white'
    }: Props = $props();
</script>

<div
    class="border-2 border-black shadow-[inset_-1px_0.5px_2px_rgba(255,255,255,0.8),-1px_0.5px_2px_rgba(0,0,0,0.8)] {className}"
>
    {@render children?.()}
</div>
