<script lang="ts">
    import '../app.css';

    let { children } = $props();
</script>

<svelte:head>
    <title>Webneut</title>
</svelte:head>

{@render children()}