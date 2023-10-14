<!-- A bar with options to change the appearance of the website. -->

<script lang='ts'>
    import { onMount } from "svelte";
    import { writable, type Writable } from "svelte/store";
    import { dev_hexagon_pressed } from "../../routes/stores";

    let root: HTMLElement;

    type CSSProperty = { name: string, css_name: string, type: string, value: string | undefined };

    let css_props: CSSProperty[] = [
        {name: 'Background', css_name: '--color-bg', type: 'color'},
        {name: 'Text', css_name: '--color-text', type: 'color'},
        {name: 'Icon', css_name: '--color-icon', type: 'color'},
        {name: 'Card', css_name: '--color-card', type: 'color'},
        {name: 'Badge', css_name: '--color-button', type: 'color'},
        {name: 'Shadow', css_name: '--color-shadow', type: 'color'},
        {name: 'Title size', css_name: '--font-size-title', type: 'text'},
        {name: 'Section title size', css_name: '--font-size-subtitle', type: 'text'},
        {name: 'Topic title size', css_name: '--font-size-topic', type: 'text'},
        {name: 'Body text size', css_name: '--font-size-body', type: 'text'},
        {name: 'Title weight', css_name: '--font-weight-title', type: 'text'},
        {name: 'Body font weight', css_name: '--font-weight-body', type: 'text'},
    ]

    onMount(() => {
        // @ts-ignore: There will be a root element until CSS-in-JS is implemented.
        root = document.documentElement;
        const root_style = getComputedStyle(root);

        // Prepopulate inputs.
        css_props = css_props.map(css_prop => ({ ...css_prop, value: root_style.getPropertyValue(css_prop.css_name) }));
    })

    function send_email(): void {
        // Send an email message with all the values included.
        const mailto_link: string = 'mailto:info@milovermeulen.com';
        const subject: string = 'Website feedback'
        let body: string = 'Thanks for previewing my website! Feel free to provide any additional feedback here or send the message as-is.\n\n'

        let messages: string[] = css_props.map(css_prop =>  css_prop.css_name + ': ' + css_prop.value + ';');
        const max_message_length: number = messages.reduce((a, b) => a.length > b.length? a: b).length;
        body += '='.repeat(max_message_length) + '\n';
        messages.forEach(message => body += message + '\n')
        body += '='.repeat(max_message_length);

        window.location.href = mailto_link + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
</script>

<div class='bar' style={$dev_hexagon_pressed? '': 'display: none;'}>
    <div class='pickers'>
        <div class='color-pickers'>
            {#each css_props.filter(css_prop => css_prop.type === 'color') as css_prop}
                <div>
                    {css_prop.name}:
                    <input
                        type='color'
                        class='color-picker'
                        bind:value={css_prop.value}
                        on:change={() => root.style.setProperty(css_prop.css_name, css_prop.value)}
                    />
                </div>
            {/each}
        </div>
        <div class='text-pickers'>
            {#each css_props.filter(css_prop => css_prop.type === 'text') as css_prop}
                <div>
                    {css_prop.name}:
                    <input
                        type='text'
                        bind:value={css_prop.value}
                        on:change={() => root.style.setProperty(css_prop.css_name, css_prop.value)}
                    />
                </div>
            {/each}
        </div>
    </div>
    <div class='controls'>
        <button on:click={() => dev_hexagon_pressed.set(false)}>Hide dev bar</button>
        <button on:click={send_email}>Send current values</button>
    </div>
</div>

<style lang='scss'>
    .bar {
        opacity: 1;
        width: 100%;
        position: fixed;
        top: 0;
        background: black;
        z-index: 10;
        display: flex;
        justify-content: space-between;

        // Hard-code font settings so users cannot change them.
        color: white;
        font-size: 14px;
        font-weight: 400;
    }

    .pickers {
        width: 100%;
        display: flex;
        gap: 1em;
    }

    .controls {
        flex-grow: 0;
    }

    .color-picker {
        outline: solid white 1px;
    }

    .color-pickers, .text-pickers, .controls {
        display: flex;
        flex-direction: column;
        align-items: end;
    }
</style>