#!/usr/bin/env gjs

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';

import {ThumbnailManager} from './components/ThumbnailManager.js';
import {DialogManager} from './utils/DialogManager.js';
import {ThemeGenerator} from './services/ThemeGenerator.js';
import {WallpaperManager} from './services/WallpaperManager.js';
import {TemaTheming} from './services/TemaTheming.js';

Adw.init();

const APP_ID = 'li.oever.tema';
const APP_VERSION = '2.0.0';

// Key codes
const KEY_ESCAPE = 65307;
const KEY_Q = 113;
const KEY_E = 101;
const KEY_QUESTION = 63;
const KEY_ENTER = 65293;

/**
 * TemaApp - Modern wallpaper and theme manager
 * Uses ImageMagick for color extraction
 */
const TemaApp = GObject.registerClass(
    class TemaApp extends Adw.Application {
        constructor() {
            super({application_id: APP_ID});
            GLib.set_prgname(APP_ID);

            this._initManagers();
            this._loadSettings();
        }

        _initManagers() {
            this.thumbnailManager = new ThumbnailManager();
            this.dialogManager = new DialogManager(this);
            this.themeGenerator = new ThemeGenerator(this);
            this.wallpaperManager = new WallpaperManager(this);
            this.temaTheming = new TemaTheming();
        }

        _loadSettings() {
            const configPath = GLib.get_home_dir() + '/.config/tema/settings.json';
            const configFile = Gio.File.new_for_path(configPath);

            this.settings = {defaultMode: 'ask'};

            if (!configFile.query_exists(null)) return;

            try {
                const [success, contents] = configFile.load_contents(null);
                if (success) {
                    const json = new TextDecoder().decode(contents);
                    this.settings = JSON.parse(json);
                }
            } catch (e) {
                print('Error loading settings:', e.message);
            }
        }

        _saveSettings() {
            const configDir = GLib.get_home_dir() + '/.config/tema';
            const configPath = configDir + '/settings.json';

            try {
                const dir = Gio.File.new_for_path(configDir);
                if (!dir.query_exists(null)) {
                    dir.make_directory_with_parents(null);
                }

                const file = Gio.File.new_for_path(configPath);
                const encoded = new TextEncoder().encode(JSON.stringify(this.settings, null, 2));
                file.replace_contents(encoded, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } catch (e) {
                print('Error saving settings:', e.message);
            }
        }

        vfunc_activate() {
            this._ensureWallpapersDirectory();
            this._loadCSS();
            this.temaTheming.applyDynamicTheming();

            const window = this._createWindow();
            window.present();

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                const grid = this._grid;
                const first = grid?.get_first_child();
                if (first) {
                    grid.select_child(first);
                    grid.grab_focus();
                }
                return GLib.SOURCE_REMOVE;
            });
        }

        _createWindow() {
            const window = new Adw.ApplicationWindow({
                application: this,
                default_width: 820,
                default_height: 580,
                title: 'Tema',
            });

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
            });

            const header = this._createHeader();
            const content = this._createContent();

            mainBox.append(header);
            mainBox.append(content);

            this._setupKeyboard(window);
            window.set_content(mainBox);

            return window;
        }

        _createHeader() {
            const header = new Adw.HeaderBar({
                show_end_title_buttons: true,
                show_start_title_buttons: true,
                decoration_layout: ':close',
            });

            const titleLabel = new Gtk.Label({
                label: 'Tema',
                css_classes: ['title'],
            });

            header.set_title_widget(titleLabel);

            // Settings button
            const settingsBtn = new Gtk.Button({
                icon_name: 'emblem-system-symbolic',
                tooltip_text: 'Settings (?)',
                css_classes: ['flat'],
            });
            settingsBtn.connect('clicked', () => this._showSettings());

            header.pack_end(settingsBtn);

            return header;
        }

        _createContent() {
            const scrolled = new Gtk.ScrolledWindow({
                hexpand: true,
                vexpand: true,
                margin_top: 4,
                margin_bottom: 4,
                margin_start: 6,
                margin_end: 6,
            });

            this._grid = new Gtk.FlowBox({
                valign: Gtk.Align.START,
                halign: Gtk.Align.FILL,
                max_children_per_line: 10,
                min_children_per_line: 4,
                selection_mode: Gtk.SelectionMode.SINGLE,
                column_spacing: 4,
                row_spacing: 4,
                homogeneous: true,
                activate_on_single_click: false,
            });

            this._grid.connect('child-activated', (_, child) => {
                const box = child.get_child();
                if (box?._filePath) {
                    this._handleSelection(box._filePath, box._fileName);
                }
            });

            this._loadWallpapers();
            scrolled.set_child(this._grid);

            return scrolled;
        }

        _loadWallpapers() {
            const wallpapersPath = GLib.get_home_dir() + '/Wallpapers';
            const dir = Gio.File.new_for_path(wallpapersPath);

            if (!dir.query_exists(null)) {
                this._showEmptyState('No wallpapers found', 'Add images to ~/Wallpapers');
                return;
            }

            try {
                const enumerator = dir.enumerate_children(
                    'standard::name,standard::type',
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );

                const imageFiles = [];
                let info;

                while ((info = enumerator.next_file(null)) !== null) {
                    const name = info.get_name();
                    if (this.thumbnailManager.isImageFile(name)) {
                        imageFiles.push({
                            filePath: wallpapersPath + '/' + name,
                            fileName: name,
                        });
                    }
                }

                enumerator.close(null);

                if (imageFiles.length === 0) {
                    this._showEmptyState('No images found', 'Add wallpapers to ~/Wallpapers');
                    return;
                }

                // Sort by name
                imageFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
                this.thumbnailManager.loadThumbnailsAsync(this._grid, imageFiles, 0);
            } catch (e) {
                print('Error loading wallpapers:', e.message);
                this._showEmptyState('Error loading wallpapers', e.message);
            }
        }

        _showEmptyState(title, subtitle) {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
                margin_top: 48,
            });

            const icon = new Gtk.Image({
                icon_name: 'folder-pictures-symbolic',
                pixel_size: 64,
                css_classes: ['dim-label'],
            });

            const titleLabel = new Gtk.Label({
                label: title,
                css_classes: ['title-2'],
            });

            const subtitleLabel = new Gtk.Label({
                label: subtitle,
                css_classes: ['dim-label'],
            });

            box.append(icon);
            box.append(titleLabel);
            box.append(subtitleLabel);
            this._grid.append(box);
        }

        _setupKeyboard(window) {
            const controller = new Gtk.EventControllerKey();
            window.add_controller(controller);

            controller.connect('key-pressed', (_, keyval) => {
                return this._handleKey(keyval, window);
            });
        }

        _handleKey(keyval, window) {
            // Vim navigation
            const vimNav = {
                104: Gtk.DirectionType.LEFT,  // h
                106: Gtk.DirectionType.DOWN,  // j
                107: Gtk.DirectionType.UP,    // k
                108: Gtk.DirectionType.RIGHT, // l
            };

            if (vimNav[keyval] !== undefined) {
                this._grid.child_focus(vimNav[keyval]);
                return true;
            }

            switch (keyval) {
                case KEY_ENTER:
                    return this._activateSelected();
                case KEY_E:
                    return this._ejectSelected();
                case KEY_QUESTION:
                    this._showSettings();
                    return true;
                case KEY_Q:
                case KEY_ESCAPE:
                    window.close();
                    return true;
            }

            return false;
        }

        _activateSelected() {
            const selected = this._grid.get_selected_children();
            if (selected.length === 0) return true;

            const box = selected[0].get_child();
            if (box?._filePath) {
                this._handleSelection(box._filePath, box._fileName);
            }
            return true;
        }

        _ejectSelected() {
            const selected = this._grid.get_selected_children();
            if (selected.length === 0) return true;

            const box = selected[0].get_child();
            if (box?._filePath) {
                this._handleEject(box._filePath, box._fileName);
            }
            return true;
        }

        _handleSelection(filePath, fileName) {
            const window = this.get_active_window();

            if (this.settings.defaultMode === 'dark') {
                this.setWallpaper(filePath, fileName, false);
                return;
            }

            if (this.settings.defaultMode === 'light') {
                this.setWallpaper(filePath, fileName, true);
                return;
            }

            this.dialogManager.showModeDialog(window, filePath, fileName, (path, name, isLight) => {
                this.setWallpaper(path, name, isLight);
            });
        }

        _handleEject(filePath, fileName) {
            const window = this.get_active_window();
            this.dialogManager.showThemeEjectionDialog(window, filePath, fileName, (path, name, isLight, outputPath) => {
                this.themeGenerator.ejectTheme(path, name, isLight, outputPath);
            });
        }

        setWallpaper(imagePath, fileName, lightMode) {
            this.wallpaperManager.setWallpaper(imagePath, fileName, lightMode);
            this.temaTheming.applyDynamicTheming(!lightMode);
        }

        _showSettings() {
            const window = this.get_active_window();
            const dialog = new Adw.PreferencesWindow({
                transient_for: window,
                modal: true,
                title: 'Settings',
                default_width: 360,
                default_height: 280,
            });

            const page = new Adw.PreferencesPage();

            // Mode selection
            const group = new Adw.PreferencesGroup({
                title: 'Theme Mode',
            });

            const modeRow = new Adw.ComboRow({
                title: 'Default',
            });

            const modes = ['Ask', 'Dark', 'Light'];
            const modeModel = Gtk.StringList.new(modes);
            modeRow.set_model(modeModel);

            const modeMap = {ask: 0, dark: 1, light: 2};
            const reverseMap = ['ask', 'dark', 'light'];

            modeRow.set_selected(modeMap[this.settings.defaultMode] || 0);
            modeRow.connect('notify::selected', () => {
                this.settings.defaultMode = reverseMap[modeRow.get_selected()];
                this._saveSettings();
            });

            group.add(modeRow);
            page.add(group);

            // Shortcuts
            const shortcutsGroup = new Adw.PreferencesGroup({
                title: 'Shortcuts',
            });

            const shortcuts = [
                ['hjkl / Arrows', 'Navigate'],
                ['Enter', 'Apply'],
                ['e', 'Eject theme'],
                ['q / Esc', 'Quit'],
            ];

            for (const [key, action] of shortcuts) {
                const row = new Adw.ActionRow({
                    title: action,
                });
                const keyLabel = new Gtk.Label({
                    label: key,
                    css_classes: ['dim-label', 'monospace'],
                });
                row.add_suffix(keyLabel);
                shortcutsGroup.add(row);
            }

            page.add(shortcutsGroup);
            dialog.add(page);
            dialog.present();
        }

        _ensureWallpapersDirectory() {
            const homeDir = GLib.get_home_dir();
            const wallpapersDir = Gio.File.new_for_path(homeDir + '/Wallpapers');

            if (!wallpapersDir.query_exists(null)) {
                try {
                    wallpapersDir.make_directory_with_parents(null);
                    print('Created ~/Wallpapers directory');
                } catch (e) {
                    print('Error creating Wallpapers directory:', e.message);
                }
            }

            // Copy backgrounds from omarchy themes
            this._copyOmarchyBackgrounds(homeDir, wallpapersDir);
        }

        _copyOmarchyBackgrounds(homeDir, wallpapersDir) {
            const themesPath = homeDir + '/.config/omarchy/themes';
            const themesDir = Gio.File.new_for_path(themesPath);

            if (!themesDir.query_exists(null)) return;

            try {
                const enumerator = themesDir.enumerate_children(
                    'standard::name,standard::type',
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );

                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;

                    const bgPath = `${themesPath}/${info.get_name()}/backgrounds`;
                    const bgDir = Gio.File.new_for_path(bgPath);

                    if (!bgDir.query_exists(null)) continue;

                    this._copyBackgroundFiles(bgDir, wallpapersDir);
                }

                enumerator.close(null);
            } catch (e) {
                print('Error copying omarchy backgrounds:', e.message);
            }
        }

        _copyBackgroundFiles(sourceDir, destDir) {
            try {
                const enumerator = sourceDir.enumerate_children(
                    'standard::name,standard::type',
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );

                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    if (info.get_file_type() !== Gio.FileType.REGULAR) continue;

                    const name = info.get_name();
                    const source = Gio.File.new_for_path(`${sourceDir.get_path()}/${name}`);
                    const dest = Gio.File.new_for_path(`${destDir.get_path()}/${name}`);

                    if (!dest.query_exists(null)) {
                        try {
                            source.copy(dest, Gio.FileCopyFlags.NONE, null, null);
                            print('Copied background:', name);
                        } catch (e) {
                            print('Error copying', name, ':', e.message);
                        }
                    }
                }

                enumerator.close(null);
            } catch (e) {
                print('Error reading backgrounds:', e.message);
            }
        }

        _loadCSS() {
            const provider = new Gtk.CssProvider();

            // Try loading from file first (development)
            const cssPath = GLib.get_current_dir() + '/src/style.css';
            const cssFile = Gio.File.new_for_path(cssPath);

            if (cssFile.query_exists(null)) {
                try {
                    provider.load_from_file(cssFile);
                    Gtk.StyleContext.add_provider_for_display(
                        Gdk.Display.get_default(),
                        provider,
                        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
                    );
                    return;
                } catch (e) {
                    print('Error loading CSS:', e.message);
                }
            }

            // Try loading from gresource
            try {
                provider.load_from_resource('/li/oever/tema/js/style.css');
                Gtk.StyleContext.add_provider_for_display(
                    Gdk.Display.get_default(),
                    provider,
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
                );
            } catch (e) {
                print('Note: CSS not loaded from gresource');
            }
        }

        showError(message) {
            this.dialogManager.showError(message);
        }

        showSuccess(message) {
            this.dialogManager.showSuccess(message);
        }
    }
);

const app = new TemaApp();
app.run([]);
