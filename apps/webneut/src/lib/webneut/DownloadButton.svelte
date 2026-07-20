<script lang="ts">
    import { oscillationParameters, plotData } from '$lib/webneut/state.svelte';
    import type { Parameter } from '$lib/webneut/types';
    import JSZip from 'jszip';

    function oscillation_result_as_csv(): string {
        const rangeParameter = Object.values(oscillationParameters).find(
            (par) => par.values.length > 1
        ) as Parameter | undefined;
        if (!rangeParameter) return '';

        let data: string[][] = [
            plotData.x.map(String),
            ...plotData.y.map((row) => row.map(String))
        ];
        data = data[0].map((_, colIndex) => data.map((row) => row[colIndex]));
        data.unshift([rangeParameter.label, 'nu_e', 'nu_mu', 'nu_tau']);

        return data.map((row) => row.join(',')).join('\n');
    }

    function oscillation_parameters_as_csv(): string {
        const data = [['Parameter', 'value']];
        for (const [key, parameter] of Object.entries(oscillationParameters)) {
            let values: string = parameter.values.join('-');
            if (key === 'nu') {
                values = ['e', '\u03BC', '\u03C4'][parameter.values[0]];
            }
            const label: string = parameter.label
                .replace(/<sup>([\w-]+)<\/sup>/g, '^$1')
                .replace(/<sub>([\w-]+)<\/sub>/g, '_$1');
            data.push([label, values]);
        }
        return data.map((row) => row.join(',')).join('\n');
    }

    function save_data() {
        const zip = new JSZip();
        zip.file('oscillation_values.csv', oscillation_result_as_csv());
        zip.file('oscillation_parameters.csv', oscillation_parameters_as_csv());
        zip.generateAsync({ type: 'blob' }).then((blob) => {
            const a = document.createElement('a');
            document.body.append(a);
            a.download = 'nu_oscillation.zip';
            a.href = URL.createObjectURL(blob);
            a.click();
            a.remove();
        });
    }
</script>

<button onclick={save_data}>Download CSV</button>