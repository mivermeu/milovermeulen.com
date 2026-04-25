<script lang="ts">
  import Bracket from './elements/Bracket.svelte';

  interface Props {
    children: import('svelte').Snippet;
    className?: string; // For adding custom bg, text colors, or padding

    // Bracket Customization
    bracketThickness?: number; // In pixels (e.g., 2 or 4)
    bracketSize?: number;      // How long the L arms are (e.g., 20 or 40)
    bracketColor?: string;     // A Tailwind text color class (e.g., 'text-indigo-500')
    bracketRounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
    bracketOffset?: number;    // Optional space between content boundary and bracket
  }

  let {
    children,
    className = "",
    bracketThickness = 2,
    bracketSize = 32,
    bracketColor = "white",
    bracketRounded = "sm",
    bracketOffset = 20
  }: Props = $props();

  // Map the 'rounded' prop to real Tailwind rounded-corner classes
  const roundingMap: Record<NonNullable<Props['bracketRounded']>, string> = {
    'none': 'rounded-none',
    'sm': 'rounded-br-sm',
    'md': 'rounded-br-md',
    'lg': 'rounded-br-lg',
    'full': 'rounded-br-full'
  };

  const roundedClass = $derived(roundingMap[bracketRounded]);

  // Handle the bracket dimensions/positioning
  const sharedProps = $derived({
    thickness: `${bracketThickness}px`,
    length: `${bracketSize}px`,
    offset: `${bracketOffset}px`
  });
</script>

<section class="relative overflow-hidden w-full {className}">

  <div class="absolute inset-0 pointer-events-none z-0 {bracketColor}">

    <Bracket
      {...sharedProps}
      rounding={roundedClass}
      position="top: var(--bracket-offset); left: var(--bracket-offset);"
      rotate="180deg"
    />

    <Bracket
      {...sharedProps}
      rounding={roundedClass}
      position="top: var(--bracket-offset); right: var(--bracket-offset);"
      rotate="270deg"
    />

    <Bracket
      {...sharedProps}
      rounding={roundedClass}
      position="bottom: var(--bracket-offset); right: var(--bracket-offset);"
      rotate="0deg"
    />

    <Bracket
      {...sharedProps}
      rounding={roundedClass}
      position="bottom: var(--bracket-offset); left: var(--bracket-offset);"
      rotate="90deg"
    />

  </div>

  <div class="relative z-10 mx-auto max-w-7xl px-6 py-12">
    {@render children()}
  </div>
</section>
