<script lang="ts">
    import '../app.css';
    import {
        oscillationParameters,
        animatingParameter,
        recompute
    } from '$lib/webneut/state.svelte';

    let { children } = $props();

    recompute();

    $effect(() => {
        for (const p of Object.values(oscillationParameters)) {
            void p.values.length;
            void p.values[0];
            if (p.values.length > 1) void p.values[1];
        }
        recompute();
    });

    $effect(() => {
        const param = animatingParameter.current;
        if (!param) return;

        const startValue = param.values[0];
        const startTime = Date.now();
        const period = oscillationParameters.animation_period.values[0];

        const interval = setInterval(() => {
            const progress = ((Date.now() - startTime) / (period * 1000)) % 1;
            let newValue = startValue + progress * (param.limits[1] - param.limits[0]);
            while (newValue > param.limits[1]) {
                newValue -= param.limits[1] - param.limits[0];
            }
            param.values[0] = newValue;
        });

        return () => clearInterval(interval);
    });
</script>

<svelte:head>
    <title>Webneut</title>
</svelte:head>

{@render children()}
