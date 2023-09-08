<script lang='ts'>
    import { PlotType } from "./types";
    import { oscillation_parameters } from "./stores";

    $: plot_types = Object.entries(PlotType).filter((entry) => isNaN(Number(entry[0]))) satisfies [string, string | PlotType][];

    let plot_selected: PlotType = PlotType.Linear;

    function update(): void {
        $oscillation_parameters.plot_type.values[0] = plot_selected;
    }
</script>

<h4>Plot type</h4>
{#each plot_types as [plot_type_name, plot_type_value], i}
    <input id='plot_selector_{i}' type='radio' bind:group={plot_selected} value={plot_type_value} name='plot_type' on:change={update}/>
    <label for='plot_selector_{i}'>{plot_type_name}</label>
{/each}
