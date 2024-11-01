import { get, writable, type Writable } from 'svelte/store';
import type { Theme } from '$lib/utils/types'
import { themes } from './themes';
import { browser } from '$app/environment';

export let dev_menu_open: Writable<boolean> = writable<boolean>(false);

// Theme settings load from localStorage.
export let theme_light: Writable<Theme> = writable<Theme>(
    browser && localStorage.theme_light?
        themes.find(theme => theme.name === localStorage.theme_light):
        themes.find(theme => theme.name === 'Light ☀️')
);
export let theme_dark: Writable<Theme> = writable<Theme>(
    browser && localStorage.theme_dark?
        themes.find(theme => theme.name === localStorage.theme_dark):
        themes.find(theme => theme.name === 'Dark slate grey 🪨')
);
export let theme_preference: Writable<'light' | 'dark' | 'auto'> = writable<'light' | 'dark' | 'auto'>(
    browser && localStorage.theme_preference?
        localStorage.theme_preference:
        'auto'
);
export let theme: Writable<Theme> = writable<Theme>(
    browser && localStorage.theme?
        themes.find(theme => theme.name === localStorage.theme):
        themes[0]
);
// Theme settings save to localStorage.
theme_light.subscribe((new_theme: Theme) => {
    if(browser) localStorage.theme_light = new_theme.name;
});
theme_dark.subscribe((new_theme: Theme) => {
    if(browser) localStorage.theme_dark = new_theme.name;
    theme.set(new_theme);
});
theme_preference.subscribe((value: string) => {
    if(browser) {
        localStorage.theme_preference = value;
        const prefers_dark_mode: boolean = value === 'dark' || (value === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        theme.set(prefers_dark_mode? get(theme_dark): get(theme_light));
    }
});
theme.subscribe((new_theme: Theme) => {
    if(browser) localStorage.theme = new_theme.name;
});