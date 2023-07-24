<script>
    import './styles.scss';
</script>

<div class="app">
    <main>
        <slot />
    </main>
</div>

<style>
    .app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }

    main {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 0;
        margin: 0;
        width: 100%;
        box-sizing: border-box;
    }
</style>
