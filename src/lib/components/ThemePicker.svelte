<script lang='ts'>
    import { dev_menu_open, theme, theme_dark, theme_light, theme_preference } from '$lib/data/stores';
    import { themes } from '$lib/data/themes';
    import { set_theme_in_css } from '$lib/utils/theme';
    import type { Theme } from '$lib/utils/types';
    import { onDestroy } from 'svelte';
    import type { Unsubscriber } from 'svelte/store';
    import { slide } from 'svelte/transition';
    import { browser } from '$app/environment';

    export let theme_menu_open: boolean = false;

    const theme_unsubscribe: Unsubscriber = theme.subscribe((new_theme) =>
        set_theme_in_css(new_theme)
    );
    onDestroy(theme_unsubscribe);

    function set_theme(new_theme: Theme): void {
        theme.set(new_theme);
        if (new_theme.brightness === 'light') {
            theme_light.set(new_theme);
            if (
                $theme_preference === 'dark' ||
                ($theme_preference === 'auto' &&
                    browser &&
                    window.matchMedia('(prefers-color-scheme: dark)').matches)
            ) {
                theme_preference.set('light');
            }
        } else if (new_theme.brightness === 'dark') {
            theme_dark.set(new_theme);
            if (
                $theme_preference === 'light' ||
                ($theme_preference === 'auto' &&
                    browser &&
                    !window.matchMedia('(prefers-color-scheme: dark)').matches)
            ) {
                theme_preference.set('dark');
            }
        }
    }

    function set_brightness(brightness: 'light' | 'dark' | 'auto'): void {
        theme_preference.set(brightness);
        if(brightness === 'light' || (brightness === 'auto' && browser && !window.matchMedia('(prefers-color-scheme: dark').matches)) {
            theme.set($theme_light);
        } else if(brightness === 'dark' || (brightness === 'auto' && browser && window.matchMedia('(prefers-color-scheme: dark').matches)) {
            theme.set($theme_dark);
        }
    }

    function contribute_theme(): void {
        theme_menu_open = false;
        dev_menu_open.set(true);
    }
</script>

<div class='theme-picker'>
    <button class='theme-picker-button' on:click={() => (theme_menu_open = !theme_menu_open)}>
        Theme
    </button>

    {#if theme_menu_open}
        <div class='theme-picker-menu' transition:slide={{ duration: 200 }}>
            <div class='theme-menu-title'>Theme brightness preference</div>
            <div class='theme-brightness-picker'>
                <button
                    class='theme-picker-button'
                    on:click={() => set_brightness('light')}
                    disabled={$theme_preference === 'light'}>Light</button
                >
                <button
                    class='theme-picker-button'
                    on:click={() => set_brightness('auto')}
                    disabled={$theme_preference === 'auto'}>Auto</button
                >
                <button
                    class='theme-picker-button'
                    on:click={() => set_brightness('dark')}
                    disabled={$theme_preference === 'dark'}>Dark</button
                >
            </div>
            <div class='theme-menu-title'>Preferred light / dark mode theme</div>
            <div class='theme-lists'>
                <div class='theme-list'>
                    {#each themes.filter((theme) => theme.brightness === 'light') as theme_option}
                        <button
                            class='theme-picker-button'
                            disabled={$theme_light.name === theme_option.name}
                            on:click={() => set_theme(theme_option)}
                        >
                            {theme_option.name}
                        </button>
                    {/each}
                </div>
                <div class='theme-list'>
                    {#each themes.filter((theme) => theme.brightness === 'dark') as theme_option}
                        <button
                            class='theme-picker-button'
                            disabled={$theme_dark.name === theme_option.name}
                            on:click={() => set_theme(theme_option)}
                        >
                            {theme_option.name}
                        </button>
                    {/each}
                </div>
            </div>
            <div class='theme-acknowledgement'>
                Theme contributed by {$theme.author}.<br>
                <button on:click={contribute_theme}>Contribute your own</button>
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
        padding: 1em;
        border-radius: var(--border-radius-card);
        filter: var(--shadow);
    }

    .theme-menu-title {
        padding: 0.5em 0;
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

    .theme-acknowledgement {
        font-size: calc(var(--font-size-body) / 1.5);
        padding-top: 1em;

        button {
            background: none!important;
            border: none;
            padding: 0!important;
            font: var(--font-body);
            color: var(--font-color);
            text-decoration: underline;
            cursor: pointer;
        }
    }
</style>
