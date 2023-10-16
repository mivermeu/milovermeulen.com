<script lang='ts'>
    import { theme } from '$lib/data/stores';
    import { themes } from '$lib/data/themes';
    import { set_theme_in_css } from '$lib/utils/theme';
    import type { Theme } from '$lib/utils/types';
    import { onDestroy, onMount } from 'svelte';
    import type { Unsubscriber } from 'svelte/store';

    let current_theme: Theme;
    const theme_unsubscribe: Unsubscriber = theme.subscribe(new_theme => set_theme_in_css(new_theme));

    onDestroy(theme_unsubscribe);

    function change_theme(): void {
        theme.set(current_theme);
    }
</script>

<div class='theme-picker'>
    <select bind:value={current_theme} on:change={change_theme}>
        {#each themes as theme_option}
            <option value={theme_option}>{theme_option.name}</option>
        {/each}
    </select>
</div>

<style lang='scss'>
    .theme-picker {
        position: absolute;
        top: 1em;
        right: 1em;
        z-index: 10;
    }
</style>