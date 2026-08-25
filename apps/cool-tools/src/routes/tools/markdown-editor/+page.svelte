<script lang="ts">
    let input = $state('# Hello\n\nType **bold** and ~~strikethrough~~ here.');
    let html = $state('');

    let debounce: ReturnType<typeof setTimeout>;

    async function render() {
        const { Marked } = await import('marked');
        html = await new Marked().parse(input);
    }

    $effect(() => {
        void input;
        clearTimeout(debounce);
        debounce = setTimeout(render, 50);
    });
</script>

<!-- eslint-disable svelte/no-at-html-tags -- markdown preview must render raw HTML of the user's own input -->
<div class="mx-auto h-full px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">Markdown Editor</h1>
    <p class="mb-6 text-sm text-brand-text">Write markdown with live preview.</p>

    <div class="flex h-[calc(100vh-200px)] gap-4">
        <textarea
            bind:value={input}
            class="h-full w-1/2 resize-none font-mono text-xs"
            placeholder="Type markdown here..."
        ></textarea>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- user renders their own markdown; local client-side tool -->
        <div class="w-1/2 overflow-y-auto rounded border border-brand-secondary bg-white/5 p-4 text-sm text-brand-text [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-brand-text-highlight [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-brand-text-highlight [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-brand-text-highlight [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-brand-text-highlight [&_h5]:text-xs [&_h5]:font-semibold [&_h5]:text-brand-text-highlight [&_h6]:text-xs [&_h6]:text-brand-text-highlight [&_strong]:font-bold [&_em]:italic [&_s]:line-through [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:font-mono [&_pre]:rounded [&_pre]:bg-white/10 [&_pre]:p-3 [&_pre]:font-mono [&_a]:text-brand-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-primary [&_blockquote]:pl-3 [&_blockquote]:italic">
            {@html html}
        </div>
    </div>
</div>