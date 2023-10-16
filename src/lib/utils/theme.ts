import { browser } from "$app/environment";
import type { Theme } from "./types";

export function set_theme_in_css(theme: Theme): void {
    if(browser) {
        const root: HTMLElement = document.documentElement;
        if(root) {
            root.style.setProperty('--font-size-title', theme.font_size_title);
            root.style.setProperty('--font-size-subtitle', theme.font_size_subtitle);
            root.style.setProperty('--font-size-topic', theme.font_size_topic);
            root.style.setProperty('--font-size-body', theme.font_size_body);
            root.style.setProperty('--font-weight-title', theme.font_weight_title);
            root.style.setProperty('--font-weight-body', theme.font_weight_body);
            root.style.setProperty('--color-bg', theme.color_bg);
            root.style.setProperty('--color-text', theme.color_text);
            root.style.setProperty('--color-icon', theme.color_icon);
            root.style.setProperty('--color-button', theme.color_button);
            root.style.setProperty('--color-shadow', theme.color_shadow);
            root.style.setProperty('--color-card', theme.color_card);
        }
    }
}