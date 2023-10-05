<script lang="ts">
    import { createNoise3D } from 'simplex-noise';
    import { onMount } from 'svelte';

    type Particle = {
        position: [number, number];
        velocity: [number, number];
        flow_strength: number; // The degree to which nudges affect the particle (mass?)
        max_speed: number;
        color: string;
    }

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

    let particles: Particle[] = [];
    const particle_speed: number = 20;
    const num_particles: number = 10000;
    const base_flow_strength: number = particle_speed * particle_speed / smoothness * 7;
    const particle_opacity: number = 0.006;
    const base_particle_color: string = 'rgba(255, 255, 255, ' + particle_opacity + ')';

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
                        0.5 + 0.5;
                const angle: number = ((random_value * total_range) % 2) * Math.PI;
                flow_field[
                    Math.round((y * canvas.width) / (resolution * resolution) + x / resolution)
                ] = angle;
            }
        }
    }

    function reset_particle_positions(): void {
        particles = [];
        const particles_per_dimension: number = Math.sqrt(num_particles);
        const start_x: number = canvas.width / particles_per_dimension / 2;
        const start_y: number = canvas.height / particles_per_dimension / 2;

        for (let px = 0; px < canvas.width; px += canvas.width / particles_per_dimension) {
            for (let py = 0; py < canvas.height; py += canvas.height / particles_per_dimension) {
                particles.push({
                    position: [start_x + px, start_y + py],
                    velocity: [0, 0],
                    flow_strength: base_flow_strength,
                    max_speed: particle_speed,
                    color: base_particle_color}
                );
            }
        }
    }

    function move_particles(): void {
        particles.forEach((particle, pi, particles) => {
            const px: number = particle.position[0];
            const py: number = particle.position[1];
            const local_flow: [number, number] = get_local_flow(px, py);

            for (let dim = 0; dim < 2; dim++) {
                particles[pi].velocity[dim] += base_flow_strength * local_flow[dim];
            }

            // Normalise velocity.
            const vx: number = particle.velocity[0];
            const vy: number = particle.velocity[1];
            let current_speed = Math.sqrt(vx * vx + vy * vy);
            if (current_speed === 0) {
                current_speed = 1;
            }
            particles[pi].velocity[0] *= particle_speed / current_speed;
            particles[pi].velocity[1] *= particle_speed / current_speed;

            particles[pi].position[0] += particles[pi].velocity[0];
            particles[pi].position[1] += particles[pi].velocity[1];
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
        particles.forEach(particle => {
            const px = particle.position[0];
            const py = particle.position[1];
            const vx = particle.velocity[0];
            const vy = particle.velocity[1];

            ctx.strokeStyle = 'rgba(255, 255, 255, ' + particle_opacity + ')';
            ctx.beginPath();
            ctx.moveTo(px - vx, py - vy);
            ctx.lineTo(px, py);
            ctx.stroke();
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
        draw_particles();

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
