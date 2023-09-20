<script lang='ts'>
    import { onDestroy, onMount } from 'svelte';

    export let strings: [string, ...string[]];
    export let animation_speed: number = 2000;

    // Not necessarily the widest string, but it will do for now.
    $: longest_string = strings.reduce((a, b) => a.length > b.length? a: b) satisfies string;

    let index = 0;

    let interval: NodeJS.Timer;

    onMount(() => {
        interval = setInterval(() => {
            index = (index + 1) % strings.length;
        }, animation_speed);
    });

    onDestroy(() => {
        clearInterval(interval);
    });
</script>

<span class='change-container'>
    {longest_string}
    {#each strings as text, ti}
        <span class='text-container' style={`top: calc(100% * (${ti} - ${index}));`}>
            {text}
        </span>
    {/each}
</span>
<!-- A little insurance in case JavaScript is disabled for whatever reason. -->
<noscript>
    and more!
</noscript>

<style lang='scss'>
    .change-container {
        position: relative;
        display: inline-flex;
        flex-direction: column;
        color: rgba(0,0,0,0);
        overflow: hidden;
    }

    .text-container {
        transition: 0.2s;
        position: absolute;
        color: var(--color-text)
    }
</style>