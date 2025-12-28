import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';

const VIM_KEY_MAP = {
    104: Gtk.DirectionType.LEFT,
    106: Gtk.DirectionType.DOWN,
    107: Gtk.DirectionType.UP,
    108: Gtk.DirectionType.RIGHT,
};

/**
 * DialogManager - Manages all application dialogs
 * Provides consistent dialog styling with vim keybindings
 */
export class DialogManager {
    constructor(app) {
        this.app = app;
    }

    addVimKeybindings(dialog) {
        const keyController = new Gtk.EventControllerKey();
        dialog.add_controller(keyController);

        keyController.connect('key-pressed', (controller, keyval) => {
            return this._handleVimKey(dialog, keyval);
        });
    }

    _handleVimKey(dialog, keyval) {
        const direction = VIM_KEY_MAP[keyval];

        if (direction === undefined) return false;

        dialog.child_focus(direction);
        return true;
    }

    showHelpModal(parent) {
        const dialog = new Adw.MessageDialog({
            transient_for: parent,
            modal: true,
            heading: 'Keyboard Shortcuts',
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            margin_start: 16,
            margin_end: 16,
            margin_top: 8,
            margin_bottom: 8,
        });

        const navSection = this._createShortcutSection('Navigation', [
            ['Arrow Keys', 'Navigate wallpapers'],
            ['h j k l', 'Vim navigation'],
            ['Tab', 'Move focus'],
            ['Enter', 'Apply selected wallpaper'],
        ]);

        const actionSection = this._createShortcutSection('Actions', [
            ['e', 'Eject theme to folder'],
            ['?', 'Show help'],
            ['q / Esc', 'Quit application'],
        ]);

        content.append(navSection);
        content.append(actionSection);

        dialog.set_extra_child(content);
        dialog.add_response('ok', 'Got it');
        dialog.set_default_response('ok');
        dialog.set_close_response('ok');

        dialog.connect('response', () => dialog.destroy());
        dialog.present();
    }

    _createShortcutSection(title, shortcuts) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });

        const titleLabel = new Gtk.Label({
            label: title,
            xalign: 0,
            css_classes: ['heading'],
        });

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });

        for (const [key, description] of shortcuts) {
            const row = new Adw.ActionRow({
                title: description,
            });

            const keyLabel = new Gtk.Label({
                label: key,
                css_classes: ['dim-label', 'caption', 'monospace'],
                valign: Gtk.Align.CENTER,
            });

            row.add_prefix(keyLabel);
            listBox.append(row);
        }

        box.append(titleLabel);
        box.append(listBox);

        return box;
    }

    showModeDialog(parent, filePath, fileName, callback) {
        const dialog = new Adw.MessageDialog({
            transient_for: parent,
            modal: true,
            heading: 'Select Theme Mode',
            body: `Generate theme from: ${fileName}`,
        });

        dialog.add_response('dark', 'Dark');
        dialog.add_response('light', 'Light');
        dialog.add_response('cancel', 'Cancel');

        dialog.set_response_appearance('dark', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('dark');
        dialog.set_close_response('cancel');

        this.addVimKeybindings(dialog);

        dialog.connect('response', (d, response) => {
            if (response === 'dark' || response === 'light') {
                callback(filePath, fileName, response === 'light');
            }
            dialog.destroy();
        });

        dialog.present();
    }

    showError(message, parent = null) {
        print(`Error: ${message}`);
        this._showMessageDialog('Error', message, parent, 'dialog-error-symbolic');
    }

    showSuccess(message, parent = null) {
        print(`Success: ${message}`);
        this._showMessageDialog('Success', message, parent, 'emblem-ok-symbolic');
    }

    _showMessageDialog(heading, message, parent = null, iconName = null) {
        const window = parent || this.app.get_active_window();
        if (!window) return;

        const dialog = new Adw.MessageDialog({
            transient_for: window,
            modal: true,
            heading: heading,
            body: message,
        });

        dialog.add_response('ok', 'OK');
        dialog.set_default_response('ok');
        dialog.connect('response', () => dialog.destroy());
        dialog.present();
    }

    showThemeEjectionDialog(parent, filePath, fileName, callback) {
        const dialog = this._createThemeEjectionDialog(parent, fileName);

        dialog.connect('response', (d, response) => {
            this._handleThemeEjectionResponse(d, response, parent, filePath, fileName, callback);
        });

        dialog.present();
    }

    _createThemeEjectionDialog(parent, fileName) {
        const dialog = new Adw.MessageDialog({
            transient_for: parent,
            modal: true,
            heading: 'Eject Theme',
            body: `Create standalone theme from: ${fileName}`,
        });

        dialog.add_response('dark', 'Dark');
        dialog.add_response('light', 'Light');
        dialog.add_response('cancel', 'Cancel');

        dialog.set_response_appearance('dark', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('dark');
        dialog.set_close_response('cancel');

        this.addVimKeybindings(dialog);

        return dialog;
    }

    _handleThemeEjectionResponse(dialog, response, parent, filePath, fileName, callback) {
        if (response !== 'dark' && response !== 'light') {
            dialog.destroy();
            return;
        }

        const isLight = response === 'light';
        dialog.destroy();
        this._showPathSelectionDialog(parent, filePath, fileName, isLight, callback);
    }

    _showPathSelectionDialog(parent, filePath, fileName, isLight, callback) {
        const defaultPath = this._getDefaultThemePath(fileName);

        const dialog = new Adw.MessageDialog({
            transient_for: parent,
            modal: true,
            heading: 'Output Location',
            body: 'Choose where to save the theme:',
        });

        const entry = new Gtk.Entry({
            text: defaultPath,
            hexpand: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 16,
            margin_end: 16,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });

        const hint = new Gtk.Label({
            label: 'A folder will be created at this path',
            css_classes: ['dim-label', 'caption'],
            xalign: 0,
            margin_start: 16,
        });

        box.append(entry);
        box.append(hint);
        dialog.set_extra_child(box);

        dialog.add_response('create', 'Create Theme');
        dialog.add_response('cancel', 'Cancel');
        dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('create');
        dialog.set_close_response('cancel');

        dialog.connect('response', (d, response) => {
            if (response === 'create') {
                const outputPath = entry.get_text();
                callback(filePath, fileName, isLight, outputPath);
            }
            dialog.destroy();
        });

        dialog.present();
        entry.grab_focus();
    }

    _getDefaultThemePath(fileName) {
        const homeDir = GLib.get_home_dir();
        const themeName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase();
        return `${homeDir}/omarchy-${themeName}-theme`;
    }
}
