<script lang='ts'>
    import { onMount } from 'svelte';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;

    let time: number = 0;

    const hex_height: number = 40;
    const horizontal_gap: number = hex_height / 5;
    const vertical_gap: number = horizontal_gap / Math.sqrt(3) / 2;

    const wave_frequency: number = 240;
    const wave_width: number = 50;
    const wave_speed: number = 1;
    const wave_height: number = 5;


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

    function draw_hex_grid(time: number) {
        const wave_position: number = wave_speed * time % canvas.height;

        const horizontal_distance: number = hex_height * Math.sqrt(3) + horizontal_gap;
        const vertical_distance: number = hex_height / 2 + vertical_gap;
        const num_horiztonal: number = Math.ceil(canvas.width / horizontal_distance) + 1;
        const num_vertical: number = Math.ceil(canvas.height / vertical_distance) + 1;
        for (let gy = 0; gy < num_vertical; gy++) {
            for (let gx = 0; gx < num_horiztonal; gx++) {
                const hex_center_x: number = gx * horizontal_distance;
                const hex_center_y: number = gy * vertical_distance;

                const size: number = hex_height;

                const dist_to_wave: number = Math.abs(hex_center_y - wave_position);
                const local_wave_height: number = Math.max(wave_height - dist_to_wave / wave_width * wave_height, 0);

                const display_x: number = hex_center_x + (gy % 2) * horizontal_distance / 2;
                const display_y: number = hex_center_y - local_wave_height;

                draw_hexagon(display_x, display_y, size);
            }
        }

        ctx.strokeStyle = '#fff';
        ctx.moveTo(0, wave_position);
        ctx.lineTo(canvas.width, wave_position);
        ctx.stroke();
    }

    function draw_hexagon(x: number, y: number, height: number): void {
        ctx.fillStyle = '#222';
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x - height / Math.sqrt(3) / 2, y + height / 2);
        ctx.lineTo(x + height / Math.sqrt(3) / 2, y + height / 2);
        ctx.lineTo(x + height / Math.sqrt(3), y);
        ctx.lineTo(x + height / Math.sqrt(3) / 2, y - height / 2);
        ctx.lineTo(x - height / Math.sqrt(3) / 2, y - height / 2);
        ctx.lineTo(x - height / Math.sqrt(3), y);
        ctx.closePath();
        ctx.fill();
        // ctx.stroke();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        time++;

        draw_hex_grid(time);

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
