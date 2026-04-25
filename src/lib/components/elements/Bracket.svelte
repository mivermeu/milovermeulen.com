<script lang="ts">
  interface Props {
    position: string;     // The 'style' string (e.g., "top:0; left:0")
    rotate: string;       // Rotation for this specific corner
    thickness: string;    // CSS value (e.g., '2px')
    length: string;       // CSS value (e.g., '40px')
    rounding: string;     // Tailwind rounding class (e.g., 'rounded-md')
    offset: string;       // How far to shift (e.g., '10px')
  }

  let { position, rotate, thickness, length, rounding, offset }: Props = $props();
</script>

<div
  class="absolute"
  style="{position}
         width: {length};
         height: {length};
         --bracket-offset: {offset};
         transform: rotate({rotate});"
>
  <div
    class="relative h-full w-full border-current {rounding}"
    style="
      border-top-width: 0;
      border-left-width: 0;
      border-bottom-width: {thickness};
      border-right-width: {thickness};
    "
  ></div>
</div>
