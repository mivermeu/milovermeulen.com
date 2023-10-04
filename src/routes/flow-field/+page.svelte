<script lang='ts'>
    import { createNoise3D } from 'simplex-noise';
    import { onMount } from 'svelte';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    // let flow_field: number[] = [];
    const resolution: number = 10;
    const smoothness: number = 400;
    const slowness: number = 1000;
    const total_range: number = 3;

    let seed: number = 0;
    const make_noise: (x: number, y: number, z:number) => number = createNoise3D();

    let flow_field: number[] = [];


    onMount(() => {
        // Create a canvas element
        // @ts-ignore: We always need the context to be available.
        ctx = canvas.getContext('2d');
        
        // Set the canvas size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Start the animation
        animate();
    })

    function recalculate_flow_field(seed: number): void {
        flow_field = Array(Math.ceil(canvas.height * canvas.width / (resolution * resolution)));
        for (let y = 0; y < canvas.height; y += resolution) {
            for (let x = 0; x < canvas.width; x += resolution) {
                // Get the vector for the current pixel
                const random_value: number = make_noise(x / smoothness, y / smoothness, seed / slowness / total_range) * 0.5 + 0.5;
                const angle: number = random_value * total_range % 2 * Math.PI;
                flow_field[y * canvas.width / (resolution * resolution) + x / resolution] = angle;
            }
        }
    }

    // Draw the flow field
    function drawFlowField() {

        for (let y = 0; y < canvas.height; y += resolution) {
            for (let x = 0; x < canvas.width; x += resolution) {
                // Get the vector for the current pixel
                let angle: number = flow_field[y * canvas.width / (resolution * resolution) + x / resolution];

                // Draw a line from the current pixel in the direction of the vector
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.beginPath();
                ctx.moveTo(x, y);
                // ctx.lineTo(x, y + angle * 2);
                ctx.lineTo(x + resolution * Math.cos(angle), y + resolution * Math.sin(angle));
                ctx.stroke();
            }
        }
    }

    // Animate the flow field
    function animate() {
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the flow field
        seed++;
        recalculate_flow_field(seed);
        drawFlowField();

        // Request the next animation frame
        requestAnimationFrame(animate);
    }
</script>

<canvas bind:this={canvas} />

<style lang='scss'>
    canvas {
        display: block;
        width: 100%;
        height: 100%;
    }
</style>
