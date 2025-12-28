import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {hexToRgba} from '../utils/ColorUtils.js';

const TEMA_COLORS_PATH = GLib.get_home_dir() + '/.cache/tema/colors.json';
const DEFAULT_DARK_BG = 'rgba(24, 24, 32, 0.95)';
const DEFAULT_LIGHT_BG = 'rgba(248, 248, 252, 0.95)';
const DEFAULT_ACCENT = '#7aa2f7';

/**
 * TemaTheming - Handles dynamic CSS theming and color scheme detection
 * Works with tema's own color cache (no pywal dependency)
 */
export class TemaTheming {
    constructor() {
        this.dynamicCssProvider = new Gtk.CssProvider();
        this._setupColorSchemeMonitor();
    }

    _setupColorSchemeMonitor() {
        try {
            const settings = new Gio.Settings({
                schema: 'org.gnome.desktop.interface',
            });
            settings.connect('changed::color-scheme', () => {
                print('Color scheme changed, reapplying theming...');
                this.applyDynamicTheming();
            });
        } catch (error) {
            print('Could not setup color scheme monitor:', error.message);
        }
    }

    getSystemColorScheme() {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync(
                'gsettings get org.gnome.desktop.interface color-scheme'
            );
            if (!success) return true;

            const output = new TextDecoder().decode(stdout).trim().replace(/'/g, '');
            return output === 'prefer-dark';
        } catch (error) {
            print('Could not detect color scheme:', error.message);
            return true;
        }
    }

    _readCachedColors() {
        const file = Gio.File.new_for_path(TEMA_COLORS_PATH);
        if (!file.query_exists(null)) return null;

        try {
            const [success, contents] = file.load_contents(null);
            if (!success) return null;

            const json = new TextDecoder().decode(contents);
            return JSON.parse(json);
        } catch (error) {
            print('Could not read tema colors:', error.message);
            return null;
        }
    }

    getBackgroundColor() {
        const colors = this._readCachedColors();
        return colors?.background || null;
    }

    getAccentColor() {
        const colors = this._readCachedColors();
        return colors?.color2 || colors?.color1 || null;
    }

    generateDynamicCSS(isDark) {
        const bgColor = this.getBackgroundColor();
        const accentColor = this.getAccentColor();

        const backgroundColor = bgColor
            ? hexToRgba(bgColor, 0.95)
            : isDark
              ? DEFAULT_DARK_BG
              : DEFAULT_LIGHT_BG;

        const accent = accentColor || DEFAULT_ACCENT;
        const shadowColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)';

        return `
/* Dynamic theming */
window {
    background-color: ${backgroundColor};
    box-shadow: 0 4px 16px ${shadowColor};
}

@define-color accent_color ${accent};
@define-color accent_bg_color ${accent};
`;
    }

    applyDynamicTheming(forceDark = null) {
        const isDark = forceDark !== null ? forceDark : this.getSystemColorScheme();

        try {
            const css = this.generateDynamicCSS(isDark);
            this.dynamicCssProvider.load_from_string(css);
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                this.dynamicCssProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1
            );
            const mode = isDark ? 'dark' : 'light';
            print(`Dynamic theming applied (${mode} mode)`);
        } catch (error) {
            print('Error applying dynamic theming:', error.message);
        }
    }
}
