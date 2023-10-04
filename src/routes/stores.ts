import { writable, type Writable } from "svelte/store";

export let dev_hexagon_pressed: Writable<boolean> = writable<boolean>(false);