<script lang='ts'>
    import { theme } from '$lib/data/stores';
    import { themes } from '$lib/data/themes';
    import { set_theme_in_css } from '$lib/utils/theme';
    import { onDestroy } from 'svelte';
    import type { Unsubscriber } from 'svelte/store';
    import { slide } from 'svelte/transition';

    export let theme_menu_open: boolean = false;

    const theme_unsubscribe: Unsubscriber = theme.subscribe(new_theme => set_theme_in_css(new_theme));
    onDestroy(theme_unsubscribe);
</script>

<div class='theme-picker'>
    <button class='theme-picker-button' on:click={() => theme_menu_open = !theme_menu_open }>
        Theme
    </button>

    {#if theme_menu_open}
        <div class='theme-picker-menu' transition:slide={{duration: 200}}>
            <div class='theme-brightness-picker'>
                <div>Light</div>
                <div>Auto</div>
                <div>Dark</div>
            </div>
            <div class='theme-lists'>
                <div class='theme-list'>
                    {#each themes.filter(theme => theme.brightness === 'light') as theme_option}
                        <button
                            class='theme-picker-button'
                            disabled={$theme.name === theme_option.name}
                            on:click={() => theme.set(theme_option)}
                        >
                            {theme_option.name}
                        </button>
                    {/each}
                </div>
                <div class='theme-list'>
                    {#each themes.filter(theme => theme.brightness === 'dark') as theme_option}
                        <button
                            class='theme-picker-button'
                            disabled={$theme.name === theme_option.name}
                            on:click={() => theme.set(theme_option)}
                        >
                            {theme_option.name}
                        </button>
                    {/each}
                </div>
            </div>
            <div class='theme-acknoledgement'>
                Theme contributed by {$theme.author}.
            </div>
        </div>
    {/if}
</div>

<style lang='scss'>
    .theme-picker {
        position: absolute;
        top: 1em;
        right: 1em;
        z-index: 5;

        display: flex;
        flex-direction: column;
        align-items: end;
        gap: 1em;
    }

    .theme-picker-menu {
        background-color: var(--color-card);
        outline: 2px solid var(--color-icon);
        padding: 0.5em;
        border-radius: var(--border-radius-card);
            filter: var(--shadow);
    }

    .theme-brightness-picker {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5em;
    }

    .theme-lists {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1em;

        .theme-list {
            display: flex;
            flex-direction: column;
            gap: 0.5em;
        }
    }

    .theme-picker-button {
        background-color: var(--color-button);
        border-radius: var(--border-radius-card);
        border: none;
        padding: 0.3em;
        font: var(--font-body);
        color: var(--font-color);
        outline: 2px solid var(--color-text);

        transition: 0.2s;
        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);

        &:hover:enabled {
            translate: var(--shadow-opposite-translation);
            filter: var(--shadow);
            cursor: pointer;
        }

        &:disabled {
            opacity: 0.5;
        }
    }

    .theme-acknoledgement {
        font-size: calc(var(--font-size-body) / 1.5);
        padding-top: 1em;
    }
</style>