import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';

import {
    extractColorsWithImageMagick,
    checkImageMagickAvailable,
    paletteToColorsObject,
} from './ColorExtractor.js';

/**
 * WallpaperManager - Handles wallpaper selection and color extraction
 * Uses ImageMagick for color extraction (no pywal dependency)
 */
export class WallpaperManager {
    constructor(app) {
        this.app = app;
        this._imageMagickAvailable = null;
    }

    /**
     * Sets a wallpaper and extracts colors using ImageMagick
     * @param {string} imagePath - Path to the wallpaper image
     * @param {string} fileName - Name of the wallpaper file
     * @param {boolean} lightMode - Whether to generate light mode palette
     */
    async setWallpaper(imagePath, fileName, lightMode) {
        const spinnerDialog = this._createSpinnerDialog();

        try {
            const available = await this._checkImageMagick();
            if (!available) {
                spinnerDialog.destroy();
                this._showImageMagickNotFoundError();
                return;
            }

            print(`Extracting colors from ${fileName} (${lightMode ? 'light' : 'dark'} mode)...`);

            const palette = await extractColorsWithImageMagick(imagePath, lightMode);
            const colors = paletteToColorsObject(palette, imagePath);

            // Store colors in cache for other components
            this._cacheColors(colors);

            spinnerDialog.destroy();

            // Generate theme files
            this._onExtractionSuccess(fileName, lightMode, colors);
        } catch (error) {
            spinnerDialog.destroy();
            this.app.showError(`Error extracting colors: ${error.message}`);
            console.error('Color extraction error:', error);
        }
    }

    /**
     * Checks if ImageMagick is available (cached)
     */
    async _checkImageMagick() {
        if (this._imageMagickAvailable !== null) {
            return this._imageMagickAvailable;
        }

        this._imageMagickAvailable = await checkImageMagickAvailable();
        return this._imageMagickAvailable;
    }

    /**
     * Shows error when ImageMagick is not found
     */
    _showImageMagickNotFoundError() {
        const errorMessage = `ImageMagick not found. Please install ImageMagick:

Arch Linux: sudo pacman -S imagemagick
Ubuntu/Debian: sudo apt install imagemagick
Fedora: sudo dnf install ImageMagick`;

        this.app.showError(errorMessage);
    }

    /**
     * Called when color extraction succeeds
     */
    _onExtractionSuccess(fileName, lightMode, colors) {
        const mode = lightMode ? 'light' : 'dark';
        print(`Colors extracted successfully (${mode} mode): ${fileName}`);

        // Generate templates with the extracted colors
        this.app.themeGenerator.generateTemplatesWithColors(colors);
    }

    /**
     * Caches the extracted colors for other components
     */
    _cacheColors(colors) {
        const homeDir = GLib.get_home_dir();
        const cacheDir = homeDir + '/.cache/tema';
        const colorsFile = cacheDir + '/colors.json';

        try {
            const cacheDirFile = Gio.File.new_for_path(cacheDir);
            if (!cacheDirFile.query_exists(null)) {
                cacheDirFile.make_directory_with_parents(null);
            }

            const file = Gio.File.new_for_path(colorsFile);
            const jsonContent = JSON.stringify(colors, null, 2);
            const encoded = new TextEncoder().encode(jsonContent);

            file.replace_contents(
                encoded,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            print('Colors cached to:', colorsFile);
        } catch (error) {
            console.error('Error caching colors:', error.message);
        }
    }

    /**
     * Reads cached colors
     */
    getCachedColors() {
        const homeDir = GLib.get_home_dir();
        const colorsFile = homeDir + '/.cache/tema/colors.json';
        const file = Gio.File.new_for_path(colorsFile);

        if (!file.query_exists(null)) {
            return null;
        }

        try {
            const [success, contents] = file.load_contents(null);
            if (!success) return null;

            const jsonContent = new TextDecoder().decode(contents);
            return JSON.parse(jsonContent);
        } catch (error) {
            console.error('Error reading cached colors:', error.message);
            return null;
        }
    }

    /**
     * Creates a spinner dialog for processing feedback
     */
    _createSpinnerDialog() {
        const dialog = new Adw.MessageDialog({
            transient_for: this.app.get_active_window(),
            modal: true,
            heading: 'Extracting Colors',
            body: 'Analyzing wallpaper with ImageMagick...',
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32,
            margin_top: 12,
            margin_bottom: 12,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });
        box.append(spinner);
        dialog.set_extra_child(box);

        dialog.present();
        return dialog;
    }

    /**
     * Restarts swaybg with a new background
     */
    restartSwaybg(backgroundLink) {
        if (!this._isSwaybgRunning()) {
            return;
        }

        this._killSwaybg();
        this._startSwaybg(backgroundLink);
        print('Restarted swaybg with new background');
    }

    /**
     * Checks if swaybg is running
     */
    _isSwaybgRunning() {
        try {
            const checkProcess = new Gio.Subprocess({
                argv: ['pgrep', '-x', 'swaybg'],
                flags: Gio.SubprocessFlags.STDOUT_PIPE,
            });
            checkProcess.init(null);
            const [, stdout] = checkProcess.communicate_utf8(null, null);

            return checkProcess.get_successful() && stdout.trim();
        } catch (error) {
            print('Error checking swaybg status:', error.message);
            return false;
        }
    }

    /**
     * Kills running swaybg instances
     */
    _killSwaybg() {
        try {
            const killProcess = new Gio.Subprocess({
                argv: ['pkill', '-x', 'swaybg'],
                flags: Gio.SubprocessFlags.NONE,
            });
            killProcess.init(null);
            killProcess.wait(null);
        } catch (error) {
            print('Error killing swaybg:', error.message);
        }
    }

    /**
     * Starts swaybg with the specified background
     */
    _startSwaybg(backgroundLink) {
        try {
            const startArgs = this._buildSwaybgArgs(backgroundLink);
            const startProcess = new Gio.Subprocess({
                argv: startArgs,
                flags: Gio.SubprocessFlags.NONE,
            });
            startProcess.init(null);
        } catch (error) {
            print('Error starting swaybg:', error.message);
        }
    }

    /**
     * Builds swaybg command arguments
     */
    _buildSwaybgArgs(backgroundLink) {
        const baseArgs = ['swaybg', '-i', backgroundLink, '-m', 'fill'];

        if (this._isUwsmAvailable()) {
            return ['uwsm', 'app', '--', ...baseArgs];
        }

        return baseArgs;
    }

    /**
     * Checks if uwsm is available
     */
    _isUwsmAvailable() {
        try {
            const proc = Gio.Subprocess.new(
                ['which', 'uwsm'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            proc.communicate_utf8(null, null);
            return proc.get_exit_status() === 0;
        } catch (e) {
            return false;
        }
    }
}
