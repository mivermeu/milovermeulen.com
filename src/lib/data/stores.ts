import { writable, type Writable } from 'svelte/store';
import type { Theme } from '$lib/utils/types'
import { themes } from './themes';
export let dev_hexagon_pressed: Writable<boolean> = writable<boolean>(false);

export let theme: Writable<Theme> = writable<Theme>(themes[0]);
