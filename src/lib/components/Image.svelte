<!-- General purpose image element that fills the enclosing div as desired. -->

<script lang='ts'>
    export let src: string;
    export let alt: string;
</script>

<img {src} {alt} class='image' />

<style lang='scss'>
    .image {
        position: absolute;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 50% 50%;
    }
</style>