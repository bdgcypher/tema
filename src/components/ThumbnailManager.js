import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

const THUMBNAIL_SIZE = 88;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'];
const BATCH_SIZE = 4;

/**
 * ThumbnailManager - Handles thumbnail generation and caching
 * Uses ImageMagick for high-quality thumbnails with fallback to GdkPixbuf
 */
export class ThumbnailManager {
    constructor() {
        this.cacheDir = null;
        this._imageMagickAvailable = null;
    }

    ensureCacheDirectory() {
        if (this.cacheDir) return this.cacheDir;

        this.cacheDir = GLib.get_home_dir() + '/.cache/tema/thumbnails';
        this._createCacheDirectoryIfNeeded();
        return this.cacheDir;
    }

    _createCacheDirectoryIfNeeded() {
        const cacheDirFile = Gio.File.new_for_path(this.cacheDir);

        if (cacheDirFile.query_exists(null)) return;

        try {
            cacheDirFile.make_directory_with_parents(null);
            print('Created thumbnail cache directory:', this.cacheDir);
        } catch (error) {
            print('Error creating cache directory:', error.message);
            throw error;
        }
    }

    getThumbnailPath(filePath) {
        const cacheDir = this.ensureCacheDirectory();
        const hash = this._hashString(filePath);
        const fileExt = filePath.toLowerCase().split('.').pop();
        return `${cacheDir}/${hash}.${fileExt}`;
    }

    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    createPlaceholder(grid, filePath, fileName) {
        const placeholder = this._createPlaceholderWidget();
        const box = this._createThumbnailBox(placeholder, filePath, fileName);
        grid.append(box);
        return box;
    }

    _createPlaceholderWidget() {
        return new Gtk.Spinner({
            spinning: true,
            width_request: THUMBNAIL_SIZE,
            height_request: THUMBNAIL_SIZE,
        });
    }

    _createThumbnailBox(placeholder, filePath, fileName) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            margin_top: 2,
            margin_bottom: 2,
            margin_start: 2,
            margin_end: 2,
            css_classes: ['thumbnail-box'],
        });

        const frame = new Gtk.Frame({
            css_classes: ['thumbnail-frame'],
        });

        const pictureBox = new Gtk.Box({
            width_request: THUMBNAIL_SIZE,
            height_request: THUMBNAIL_SIZE,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['thumbnail-picture'],
        });

        pictureBox.append(placeholder);
        frame.set_child(pictureBox);

        box.append(frame);
        box._filePath = filePath;
        box._fileName = fileName;
        box._pictureBox = pictureBox;
        box._placeholder = placeholder;

        return box;
    }

    loadThumbnailForPlaceholder(box, filePath) {
        const thumbnailPath = this.getThumbnailPath(filePath);
        const thumbnailFile = Gio.File.new_for_path(thumbnailPath);

        if (thumbnailFile.query_exists(null)) {
            this._loadCachedThumbnail(box, thumbnailPath);
            return;
        }

        this._generateThumbnail(box, filePath, thumbnailPath);
    }

    _checkImageMagick(callback) {
        if (this._imageMagickAvailable !== null) {
            callback(this._imageMagickAvailable);
            return;
        }

        try {
            const proc = Gio.Subprocess.new(
                ['which', 'magick'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (source, result) => {
                try {
                    source.communicate_utf8_finish(result);
                    this._imageMagickAvailable = source.get_exit_status() === 0;
                    callback(this._imageMagickAvailable);
                } catch (e) {
                    this._imageMagickAvailable = false;
                    callback(false);
                }
            });
        } catch (e) {
            this._imageMagickAvailable = false;
            callback(false);
        }
    }

    _generateThumbnail(box, filePath, thumbnailPath) {
        this.ensureCacheDirectory();

        this._checkImageMagick(available => {
            if (available) {
                this._generateWithImageMagick(box, filePath, thumbnailPath);
            } else {
                this._generateWithPixbuf(box, filePath);
            }
        });
    }

    _generateWithImageMagick(box, filePath, thumbnailPath) {
        try {
            const subprocess = new Gio.Subprocess({
                argv: [
                    'magick',
                    filePath,
                    '-resize',
                    `${THUMBNAIL_SIZE}x${THUMBNAIL_SIZE}^`,
                    '-gravity',
                    'center',
                    '-extent',
                    `${THUMBNAIL_SIZE}x${THUMBNAIL_SIZE}`,
                    '-quality',
                    '90',
                    thumbnailPath,
                ],
                flags: Gio.SubprocessFlags.STDERR_PIPE,
            });
            subprocess.init(null);

            subprocess.communicate_utf8_async(null, null, (source, result) => {
                try {
                    const [, , stderr] = source.communicate_utf8_finish(result);

                    if (source.get_successful()) {
                        this._loadCachedThumbnail(box, thumbnailPath);
                    } else {
                        print('ImageMagick error:', stderr);
                        this._generateWithPixbuf(box, filePath);
                    }
                } catch (error) {
                    print('Error with ImageMagick:', error.message);
                    this._generateWithPixbuf(box, filePath);
                }
            });
        } catch (error) {
            print('Error starting ImageMagick:', error.message);
            this._generateWithPixbuf(box, filePath);
        }
    }

    _generateWithPixbuf(box, filePath) {
        try {
            const originalPixbuf = GdkPixbuf.Pixbuf.new_from_file(filePath);
            const scaledPixbuf = this._scalePixbufToFill(originalPixbuf);
            const croppedPixbuf = this._cropPixbufToCenter(scaledPixbuf);

            this._replacePlaceholder(box, croppedPixbuf);
        } catch (error) {
            print(`Error generating thumbnail for ${box._fileName}:`, error.message);
            this._showError(box);
        }
    }

    _scalePixbufToFill(pixbuf) {
        const origWidth = pixbuf.get_width();
        const origHeight = pixbuf.get_height();

        const scaleX = THUMBNAIL_SIZE / origWidth;
        const scaleY = THUMBNAIL_SIZE / origHeight;
        const scale = Math.max(scaleX, scaleY);

        const scaledWidth = Math.round(origWidth * scale);
        const scaledHeight = Math.round(origHeight * scale);

        return pixbuf.scale_simple(scaledWidth, scaledHeight, GdkPixbuf.InterpType.BILINEAR);
    }

    _cropPixbufToCenter(pixbuf) {
        const width = pixbuf.get_width();
        const height = pixbuf.get_height();

        const cropX = Math.max(0, Math.round((width - THUMBNAIL_SIZE) / 2));
        const cropY = Math.max(0, Math.round((height - THUMBNAIL_SIZE) / 2));

        return pixbuf.new_subpixbuf(cropX, cropY, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    }

    _replacePlaceholder(box, pixbuf) {
        const picture = new Gtk.Picture();
        picture.set_pixbuf(pixbuf);
        picture.set_can_shrink(false);
        picture.set_size_request(THUMBNAIL_SIZE, THUMBNAIL_SIZE);

        const pictureBox = box._pictureBox;
        const placeholder = box._placeholder;

        if (pictureBox && placeholder) {
            pictureBox.remove(placeholder);
            pictureBox.append(picture);
        }
    }

    _loadCachedThumbnail(box, thumbnailPath) {
        try {
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file(thumbnailPath);
            this._replacePlaceholder(box, pixbuf);
        } catch (error) {
            print('Error loading cached thumbnail:', error.message);
            this._showError(box);
        }
    }

    _showError(box) {
        const pictureBox = box._pictureBox;
        const placeholder = box._placeholder;

        if (pictureBox && placeholder) {
            pictureBox.remove(placeholder);

            const errorIcon = new Gtk.Image({
                icon_name: 'image-missing-symbolic',
                pixel_size: 48,
                css_classes: ['dim-label'],
            });

            pictureBox.append(errorIcon);
        }
    }

    loadThumbnailsAsync(grid, imageFiles, index) {
        if (index >= imageFiles.length) return;

        const batch = imageFiles.slice(index, index + BATCH_SIZE);

        for (const {filePath, fileName} of batch) {
            const box = this.createPlaceholder(grid, filePath, fileName);

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                try {
                    this.loadThumbnailForPlaceholder(box, filePath);
                } catch (error) {
                    print(`Error loading thumbnail for ${fileName}:`, error.message);
                }
                return GLib.SOURCE_REMOVE;
            });
        }

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this.loadThumbnailsAsync(grid, imageFiles, index + BATCH_SIZE);
            return GLib.SOURCE_REMOVE;
        });
    }

    isImageFile(fileName) {
        const lowerFileName = fileName.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => lowerFileName.endsWith(ext));
    }
}
