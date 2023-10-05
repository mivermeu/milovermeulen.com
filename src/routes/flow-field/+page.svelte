<script lang="ts">
    import { createNoise3D } from 'simplex-noise';
    import { onMount } from 'svelte';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let flow_field: number[] = [];
    const resolution: number = 10;
    const smoothness: number = 500;
    const slowness: number = 1000;
    const total_range: number = 3;

    let time: number = 0;
    const num_frames: number = 100;
    const make_noise: (x: number, y: number, z: number) => number = createNoise3D();

    let particle_positions: [number, number][] = [];
    let particle_velocities: [number, number][] = [];
    const num_particles: number = 10000;
    const particle_speed: number = 20;
    const flow_strength: number = particle_speed * particle_speed / smoothness * 7;
    const particle_opacity: number = 0.02;

    onMount(() => {
        // Create a canvas element
        // @ts-ignore: We always need the context to be available.
        ctx = canvas.getContext('2d');

        // Set the canvas size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Set initial conditions.
        recalculate_flow_field(time);
        reset_particle_positions();

        // Start the animation
        animate();
    });

    function recalculate_flow_field(seed: number): void {
        flow_field = Array(Math.ceil((canvas.height * canvas.width) / (resolution * resolution)));
        for (let y = 0; y < canvas.height; y += resolution) {
            for (let x = 0; x < canvas.width; x += resolution) {
                // Get the vector for the current pixel
                const random_value: number =
                    make_noise(x / smoothness, y / smoothness, seed / slowness / total_range) *
                        0.5 +
                    0.5;
                const angle: number = ((random_value * total_range) % 2) * Math.PI;
                flow_field[
                    Math.round((y * canvas.width) / (resolution * resolution) + x / resolution)
                ] = angle;
            }
        }
    }

    function reset_particle_positions(): void {
        particle_positions = [];
        particle_velocities = [];
        const particles_per_dimension: number = Math.sqrt(num_particles);
        const start_x: number = canvas.width / particles_per_dimension / 2;
        const start_y: number = canvas.height / particles_per_dimension / 2;

        for (let px = 0; px < canvas.width; px += canvas.width / particles_per_dimension) {
            for (let py = 0; py < canvas.height; py += canvas.height / particles_per_dimension) {
                particle_positions.push([start_x + px, start_y + py]);
                particle_velocities.push(get_local_flow(start_x + px, start_y + py));
            }
        }
    }

    function move_particles(): void {
        particle_positions.forEach((particle_position, pi) => {
            const px: number = particle_position[0];
            const py: number = particle_position[1];
            const local_flow: [number, number] = get_local_flow(px, py);

            for (let dim = 0; dim < 2; dim++) {
                particle_velocities[pi][dim] += flow_strength * local_flow[dim];
            }

            // Normalise velocity.
            let current_speed = root_of_squares(particle_velocities[pi]);
            if (current_speed === 0) {
                current_speed = 1;
            }
            particle_velocities[pi][0] *= particle_speed / current_speed;
            particle_velocities[pi][1] *= particle_speed / current_speed;

            const new_position: [number, number] = [
                particle_positions[pi][0] + particle_velocities[pi][0],
                particle_positions[pi][1] + particle_velocities[pi][1]
            ];

            ctx.strokeStyle = 'rgba(255, 255, 255, ' + particle_opacity + ')';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(new_position[0], new_position[1]);
            ctx.stroke();

            particle_positions[pi][0] += particle_velocities[pi][0];
            particle_positions[pi][1] += particle_velocities[pi][1];
        });
    }

    function root_of_squares(values: number[]): number {
        const squares: number = values.map((x) => x * x).reduce((a, b) => a + b, 0);
        return Math.sqrt(squares);
    }

    function get_local_flow(x: number, y: number): [number, number] {
        // Get closest flow indicator to position.
        const flow_index =
            Math.round(y / resolution) * Math.round(canvas.width / resolution) +
            Math.round(x / resolution);
        const angle: number = flow_field[flow_index];
        return [Math.cos(angle), Math.sin(angle)];
    }

    function draw_flow_field() {
        for (let y = 0; y < canvas.height; y += resolution) {
            for (let x = 0; x < canvas.width; x += resolution) {
                // Get the vector for the current pixel
                let local_flow: [number, number] = get_local_flow(x, y);

                // Draw a line from the current pixel in the direction of the vector
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, 2 * Math.PI);
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x + (resolution * local_flow[0]) / 2,
                    y + (resolution * local_flow[1]) / 2
                );
                ctx.stroke();
            }
        }
    }

    function draw_particles() {
        particle_positions.forEach((particle_position) => {
            const px = particle_position[0];
            const py = particle_position[1];

            ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    // Animate the flow field
    function animate() {
        // Clear the canvas
        // ctx.clearRect(0, 0, canvas.width, canvas.height);

        time++;
        // recalculate_flow_field(seed);
        move_particles();
        // draw_flow_field();
        // draw_particles();

        // Request the next animation frame
        if(time < num_frames) {
            requestAnimationFrame(animate);
        }
    }
</script>

<canvas bind:this={canvas} height=100% width=100% />

<style lang="scss">
    canvas {
        display: block;
    }
</style>
