<script lang="ts">
	interface Props {
		opacity?: number;
		grainSize?: number;
		tileSize?: string;
		colorMatrix?: string;
		isFixed?: boolean;
		className?: string;
	}

	let {
		opacity = 0.1,
		grainSize = 0.65,
		tileSize = '400px',
		colorMatrix = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0',
		isFixed = false,
		className = ''
	}: Props = $props();

	const generateNoiseSvg = (freq: number, matrix: string): string => {
		const xml = `
      <svg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'>
        <filter id='n'>
          <feTurbulence
            type='fractalNoise'
            baseFrequency='${freq}'
            numOctaves='3'
            stitchTiles='stitch'
          />
          <feColorMatrix
            type='matrix'
            values='${matrix}'
          />
        </filter>
        <rect width='100%' height='100%' filter='url(#n)' />
      </svg>
    `
			.trim()
			.replace(/\s+/g, ' '); // Remove extra whitespace for valid URI

		return `url("data:image/svg+xml,${encodeURIComponent(xml)}")`;
	};

	const svgNoise = $derived(generateNoiseSvg(grainSize, colorMatrix));
</script>

<div
	class="pointer-events-none inset-0 z-1 transform-gpu bg-repeat mix-blend-screen select-none {isFixed
		? 'fixed'
		: 'absolute'} {className}"
	style:opacity
	style:background-size={tileSize}
	style:background-image={svgNoise}
></div>
