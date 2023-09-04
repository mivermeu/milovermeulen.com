<script lang='ts'>
    import { createEventDispatcher, type EventDispatcher } from 'svelte';
    import type { Parameter } from './types';

    let dispatch: EventDispatcher<{change: [Parameter, Parameter]}> = createEventDispatcher<{change: [Parameter, Parameter]}>();

    export let anti_parameter: Parameter;
    export let nu_parameter: Parameter;

    let anti_checked: boolean = false;
    let nu_selected: number = 1;

    $: nu_symbol = anti_checked? '&nu;&#773;': '&nu;' satisfies string;
    $: nu_options = [
        {label: nu_symbol + '<sub>e<sub/>', value: 0},
        {label: nu_symbol + '<sub>&mu;<sub/>', value: 1},
        {label: nu_symbol + '<sub>&tau;<sub/>', value: 2}
    ] satisfies {label: string, value: number}[];
    $: current_nu = nu_options[nu_selected] satisfies {label: string, value: number};

    function update_and_notify(): void {
        anti_parameter.values[0] = anti_checked? -1: 1;
        nu_parameter.values[0] = current_nu.value;
        dispatch('change', [anti_parameter, nu_parameter]);
    }
</script>

<div class='radio-input-container'>
    <div>
        Antineutrino
        <input type='checkbox' bind:checked={anti_checked} on:change={update_and_notify}/>
    </div>
    <div class='radio-container'>
        {#each nu_options as nu_option, i}
            <input type='radio' bind:group={nu_selected} name='nu_value' value={i} on:change={update_and_notify}/>
            <label for='nu_options_{i}'>{@html nu_option.label}</label>
        {/each}
    </div>
</div>

<style lang='scss'>
    .radio-container label {
        font-family: serif;
    }
</style>