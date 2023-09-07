<script lang='ts'>
    import { oscillation_parameters, x_values, y_values } from "./stores";
    import type { Parameter } from "./types";
    import JSZip from 'jszip';

    // Function to convert the nu arrays to a csv format.
    function oscillation_result_as_csv(): string {
        // Do nothing if no range was found.
        const range_parameter = Object.values($oscillation_parameters).find(par => par.values.length > 1) satisfies Parameter | undefined;
        if (!range_parameter) {
            return '';
        }

        // Concatenate arrays, tranpose and add headers.
        let data: string[][] = [$x_values.map(String), ...$y_values.map((row) => row.map(String))];
        data = data[0].map((_, colIndex) => data.map(row => row[colIndex]));
        data.unshift([range_parameter.label, 'nu_e', 'nu_mu', 'nu_tau'])

        // Cast into csv format.
        return data.map((row) => row.join(',')).join('\n');
    }

    function oscillation_parameters_as_csv(): string {
        // Header.
        let data = [['Parameter', 'value']];
        for (const [key, parameter] of Object.entries($oscillation_parameters)) {
            // Replace range variable with string.
            let values: string = parameter.values.join('-');
            // Replace neutrino type numbers with strings.
            if (key === 'nu') {
                values = ['e', '\u03BC', '\u03C4'][parameter.values[0]];
            }
            // Replace HTML tags sub and sup with _ and ^.
            const label: string = parameter.label
                .replace(/<sup>([\w-]+)<\/sup>/g, '^$1')
                .replace(/<sub>([\w-]+)<\/sub>/g, '_$1');
            data.push([label, values]);
        }

        return data.map((row) => row.join(',')).join('\n');
    }

    // Download button functionality.
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
    <slot>Download</slot>
</button>