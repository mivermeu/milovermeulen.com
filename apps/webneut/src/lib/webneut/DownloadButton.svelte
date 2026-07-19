<script lang='ts'>
    import { oscillation_parameters, x_values, y_values } from '$lib/webneut/stores';
    import type { Parameter } from '$lib/webneut/types';
    import JSZip from 'jszip';

    function oscillation_result_as_csv(): string {
        const range_parameter = Object.values($oscillation_parameters).find(par => par.values.length > 1) satisfies Parameter | undefined;
        if (!range_parameter) {
            return '';
        }

        let data: string[][] = [$x_values.map(String), ...$y_values.map((row) => row.map(String))];
        data = data[0].map((_, colIndex) => data.map(row => row[colIndex]));
        data.unshift([range_parameter.label, 'nu_e', 'nu_mu', 'nu_tau'])

        return data.map((row) => row.join(',')).join('\n');
    }

    function oscillation_parameters_as_csv(): string {
        let data = [['Parameter', 'value']];
        for (const [key, parameter] of Object.entries($oscillation_parameters)) {
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

    function save_data(): void {
        let zip: JSZip = new JSZip();
        zip.file('oscillation_values.csv', oscillation_result_as_csv());
        zip.file('oscillation_parameters.csv', oscillation_parameters_as_csv());
        zip.generateAsync({ type: 'blob' }).then(function (blob) {
            let a: HTMLAnchorElement = document.createElement('a');
            document.body.append(a);
            a.download = 'nu_oscillation.zip';
            a.href = URL.createObjectURL(blob);
            a.click();
            a.remove();
        });
    }
</script>

<button on:click={save_data}>
    <slot>Download CSV</slot>
</button>