<script lang='ts'>
    import Card from '$lib/components/Card.svelte';
</script>

<div class='about-card'>
    <Card>
        <div slot='content'>
            Thanks for visiting V2 of my website! I built this version to learn
            Svelte and brush up on my Typescript. If you have any questions about me
            or if you see something break on this website, feel free to contact me!
        </div>
    </Card>
</div>

<style lang='scss'>
    .about-card {
        max-width: 30em;
        margin: auto;
        margin-top: 10rem;
    }
</style>