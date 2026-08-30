<script lang="ts">
    let { onfile, label = 'Load File' }: { onfile: (f: File) => void; label?: string } = $props();

    function handle(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) onfile(file);
    }
</script>

<label>
    <button class="relative cursor-pointer" type="button">
        {label}
        <input type="file" onchange={handle} class="absolute inset-0 cursor-pointer opacity-0" />
    </button>
</label>
