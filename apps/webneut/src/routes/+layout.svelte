<script lang="ts">
    import '../app.css';

    let { children } = $props();
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-brand-bg text-brand-text-highlight">
    {@render children()}
</div>