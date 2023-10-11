<script lang='ts'>
    import { onDestroy, onMount } from 'svelte';

    export let strings: [string, ...string[]];
    export let animation_period: number = 2000;

    // Not necessarily the widest string, but it will do for now.
    $: longest_string = strings.reduce((a, b) => a.length > b.length? a: b) satisfies string;

    let index = 0;

    // Used to reset the component after each full rotation, without a transition.
    let key = false;

    let interval: NodeJS.Timer;

    onMount(() => {
        interval = setInterval(() => {
            index += 1;

            // If we have reached the end, reset the component in between animations.
            // We only wrap around after `strings.length` is reached because the first string is duplicated at the end.
            if (index === strings.length) {
                setTimeout(() => {
                    key = !key;
                    index = 0;
                }, animation_period / 2);
            }
        }, animation_period);
    });

    onDestroy(() => {
        clearInterval(interval);
    });
</script>

{#key key}
    <span class='change-container'>
        {longest_string}
        {#each [...strings, strings[0]] as text, ti} <!-- Duplicate the first element at the end. -->
            <span class='text-container' style={`top: calc(100% * (${ti} - ${index}));`}>
                {text}
            </span>
        {/each}
    </span>
{/key}
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