import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

/**
 * ImageMagick-based color extraction utility
 * Extracts dominant colors and generates ANSI palette with proper color mapping
 * Ported from Aether's imagemagick-color-extraction.js
 */

// Constants
const ANSI_PALETTE_SIZE = 16;
const DOMINANT_COLORS_TO_EXTRACT = 32;
const CACHE_VERSION = 1;

// Color detection thresholds
const MONOCHROME_SATURATION_THRESHOLD = 15;
const MONOCHROME_IMAGE_THRESHOLD = 0.7;
const LOW_DIVERSITY_THRESHOLD = 0.6;
const SIMILAR_HUE_RANGE = 30;
const SIMILAR_LIGHTNESS_RANGE = 20;

// Color quality preferences
const MIN_CHROMATIC_SATURATION = 15;
const TOO_DARK_THRESHOLD = 20;
const TOO_BRIGHT_THRESHOLD = 95;

// Brightness normalization
const VERY_DARK_BACKGROUND_THRESHOLD = 20;
const VERY_LIGHT_BACKGROUND_THRESHOLD = 80;
const MIN_LIGHTNESS_ON_DARK_BG = 55;
const MAX_LIGHTNESS_ON_LIGHT_BG = 45;
const ABSOLUTE_MIN_LIGHTNESS = 25;
const OUTLIER_LIGHTNESS_THRESHOLD = 25;
const BRIGHT_THEME_THRESHOLD = 50;
const DARK_COLOR_THRESHOLD = 50;

// Palette generation
const SUBTLE_PALETTE_SATURATION = 28;
const MONOCHROME_SATURATION = 5;
const MONOCHROME_COLOR8_SATURATION_FACTOR = 0.5;
const BRIGHT_COLOR_LIGHTNESS_BOOST = 18;
const BRIGHT_COLOR_SATURATION_BOOST = 1.1;

// Standard ANSI color hues
const ANSI_HUE_ARRAY = [0, 120, 60, 240, 300, 180]; // red, green, yellow, blue, magenta, cyan

// ImageMagick settings
const IMAGE_SCALE_SIZE = '800x600>';
const IMAGE_PROCESSING_QUALITY = 85;
const IMAGE_BIT_DEPTH = 8;

// ============================================================================
// COLOR CONVERSION UTILITIES
// ============================================================================

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : {r: 0, g: 0, b: 0};
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
        s,
        l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return {h: h * 360, s: s * 100, l: l * 100};
}

function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return {r: r * 255, g: g * 255, b: b * 255};
}

function rgbToHex(r, g, b) {
    return (
        '#' +
        [r, g, b]
            .map(x => {
                const hex = Math.round(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            })
            .join('')
    );
}

function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

function getCacheDir() {
    const homeDir = GLib.get_home_dir();
    return GLib.build_filenamev([homeDir, '.cache', 'tema', 'color-cache']);
}

function ensureDirectoryExists(dirPath) {
    const dir = Gio.File.new_for_path(dirPath);
    if (!dir.query_exists(null)) {
        dir.make_directory_with_parents(null);
    }
}

function fileExists(filePath) {
    const file = Gio.File.new_for_path(filePath);
    return file.query_exists(null);
}

function readFileAsText(filePath) {
    const file = Gio.File.new_for_path(filePath);
    const [success, contents] = file.load_contents(null);
    if (!success) return null;
    return new TextDecoder().decode(contents);
}

function writeTextToFile(filePath, content) {
    const file = Gio.File.new_for_path(filePath);
    const encoded = new TextEncoder().encode(content);
    file.replace_contents(
        encoded,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
    );
}

function getCacheKey(imagePath, lightMode) {
    try {
        const file = Gio.File.new_for_path(imagePath);
        const info = file.query_info(
            'time::modified',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        const mtime = info.get_modification_date_time();
        const mtimeSeconds = mtime.to_unix();

        const dataString = `${imagePath}-${mtimeSeconds}-${lightMode ? 'light' : 'dark'}`;
        const checksum = GLib.compute_checksum_for_string(
            GLib.ChecksumType.MD5,
            dataString,
            -1
        );

        return checksum;
    } catch (e) {
        console.error('Error generating cache key:', e.message);
        return null;
    }
}

function loadCachedPalette(cacheKey) {
    try {
        const cacheDir = getCacheDir();
        const cachePath = GLib.build_filenamev([cacheDir, `${cacheKey}.json`]);

        if (!fileExists(cachePath)) {
            return null;
        }

        const content = readFileAsText(cachePath);
        const data = JSON.parse(content);

        if (
            Array.isArray(data.palette) &&
            data.palette.length === ANSI_PALETTE_SIZE
        ) {
            print('Using cached color extraction result');
            return data.palette;
        }

        return null;
    } catch (e) {
        console.error('Error loading cache:', e.message);
        return null;
    }
}

function savePaletteToCache(cacheKey, palette) {
    try {
        const cacheDir = getCacheDir();
        ensureDirectoryExists(cacheDir);

        const cachePath = GLib.build_filenamev([cacheDir, `${cacheKey}.json`]);
        const data = {
            palette: palette,
            timestamp: Date.now(),
            version: CACHE_VERSION,
        };

        writeTextToFile(cachePath, JSON.stringify(data, null, 2));
        print('Saved color extraction to cache');
    } catch (e) {
        console.error('Error saving to cache:', e.message);
    }
}

// ============================================================================
// IMAGE MAGICK COLOR EXTRACTION
// ============================================================================

function extractDominantColors(imagePath, numColors) {
    return new Promise((resolve, reject) => {
        try {
            const argv = [
                'magick',
                imagePath,
                '-scale',
                IMAGE_SCALE_SIZE,
                '-colors',
                numColors.toString(),
                '-depth',
                IMAGE_BIT_DEPTH.toString(),
                '-quality',
                IMAGE_PROCESSING_QUALITY.toString(),
                '-format',
                '%c',
                'histogram:info:-',
            ];

            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (source, result) => {
                try {
                    const [, stdout, stderr] = source.communicate_utf8_finish(result);
                    const exitCode = source.get_exit_status();

                    if (exitCode !== 0) {
                        reject(new Error(`ImageMagick error: ${stderr}`));
                        return;
                    }

                    const colors = parseHistogramOutput(stdout);
                    if (colors.length === 0) {
                        reject(new Error('No colors extracted from image'));
                        return;
                    }

                    resolve(colors);
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

function parseHistogramOutput(output) {
    const lines = output.split('\n');
    const colorData = [];

    for (const line of lines) {
        const match = line.match(/^\s*(\d+):\s*\([^)]+\)\s*(#[0-9A-Fa-f]{6})/);
        if (match) {
            const count = parseInt(match[1], 10);
            const hex = match[2].toUpperCase();
            colorData.push({hex, count});
        }
    }

    colorData.sort((a, b) => b.count - a.count);
    return colorData.map(c => c.hex);
}

// ============================================================================
// COLOR ANALYSIS UTILITIES
// ============================================================================

function isDarkColor(hexColor) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return hsl.l < DARK_COLOR_THRESHOLD;
}

function getColorHSL(hexColor) {
    const rgb = hexToRgb(hexColor);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function calculateHueDistance(hue1, hue2) {
    let diff = Math.abs(hue1 - hue2);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

function isMonochromeImage(colors) {
    let lowSaturationCount = 0;

    for (const color of colors) {
        const hsl = getColorHSL(color);
        if (hsl.s < MONOCHROME_SATURATION_THRESHOLD) {
            lowSaturationCount++;
        }
    }

    return lowSaturationCount / colors.length > MONOCHROME_IMAGE_THRESHOLD;
}

function hasLowColorDiversity(colors) {
    const hslColors = colors.map(color => {
        const hsl = getColorHSL(color);
        return {hue: hsl.h, saturation: hsl.s, lightness: hsl.l};
    });

    let similarCount = 0;
    let totalComparisons = 0;

    for (let i = 0; i < hslColors.length; i++) {
        for (let j = i + 1; j < hslColors.length; j++) {
            const color1 = hslColors[i];
            const color2 = hslColors[j];

            if (
                color1.saturation < MONOCHROME_SATURATION_THRESHOLD ||
                color2.saturation < MONOCHROME_SATURATION_THRESHOLD
            ) {
                continue;
            }

            totalComparisons++;

            const hueDiff = calculateHueDistance(color1.hue, color2.hue);
            const lightnessDiff = Math.abs(color1.lightness - color2.lightness);

            if (hueDiff < SIMILAR_HUE_RANGE && lightnessDiff < SIMILAR_LIGHTNESS_RANGE) {
                similarCount++;
            }
        }
    }

    if (totalComparisons === 0) return false;

    return similarCount / totalComparisons > LOW_DIVERSITY_THRESHOLD;
}

// ============================================================================
// COLOR SELECTION AND MATCHING
// ============================================================================

function findBackgroundColor(colors, lightMode) {
    let bgIndex = 0;
    let bgLightness = lightMode ? -1 : 101;

    for (let i = 0; i < colors.length; i++) {
        const hsl = getColorHSL(colors[i]);

        if (lightMode) {
            if (hsl.l > bgLightness) {
                bgLightness = hsl.l;
                bgIndex = i;
            }
        } else {
            if (hsl.l < bgLightness) {
                bgLightness = hsl.l;
                bgIndex = i;
            }
        }
    }

    return {color: colors[bgIndex], index: bgIndex};
}

function findForegroundColor(colors, lightMode, usedIndices) {
    let fgIndex = 0;
    let fgLightness = lightMode ? 101 : -1;

    for (let i = 0; i < colors.length; i++) {
        if (usedIndices.has(i)) continue;

        const hsl = getColorHSL(colors[i]);

        if (lightMode) {
            if (hsl.l < fgLightness) {
                fgLightness = hsl.l;
                fgIndex = i;
            }
        } else {
            if (hsl.l > fgLightness) {
                fgLightness = hsl.l;
                fgIndex = i;
            }
        }
    }

    return {color: colors[fgIndex], index: fgIndex};
}

function calculateColorScore(hsl, targetHue) {
    const hueDiff = calculateHueDistance(hsl.h, targetHue) * 3;
    const saturationPenalty = hsl.s < MIN_CHROMATIC_SATURATION ? 50 : 0;
    const saturationReward = (100 - hsl.s) / 2;

    let lightnessPenalty = 0;
    if (hsl.l < TOO_DARK_THRESHOLD) {
        lightnessPenalty = 10;
    } else if (hsl.l > TOO_BRIGHT_THRESHOLD) {
        lightnessPenalty = 10;
    }

    return hueDiff + saturationPenalty + saturationReward + lightnessPenalty;
}

function findBestColorMatch(targetHue, colorPool, usedIndices) {
    let bestIndex = -1;
    let bestScore = Infinity;

    for (let i = 0; i < colorPool.length; i++) {
        if (usedIndices.has(i)) continue;

        const hsl = getColorHSL(colorPool[i]);
        const score = calculateColorScore(hsl, targetHue);

        if (score < bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    return bestIndex !== -1 ? bestIndex : 0;
}

// ============================================================================
// COLOR GENERATION UTILITIES
// ============================================================================

function generateBrightVersion(hexColor) {
    const hsl = getColorHSL(hexColor);
    const newLightness = Math.min(100, hsl.l + BRIGHT_COLOR_LIGHTNESS_BOOST);
    const newSaturation = Math.min(100, hsl.s * BRIGHT_COLOR_SATURATION_BOOST);
    return hslToHex(hsl.h, newSaturation, newLightness);
}

function adjustColorLightness(hexColor, targetLightness) {
    const hsl = getColorHSL(hexColor);
    return hslToHex(hsl.h, hsl.s, targetLightness);
}

function sortColorsByLightness(colors) {
    return colors
        .map(color => {
            const hsl = getColorHSL(color);
            return {color, lightness: hsl.l, hue: hsl.h};
        })
        .sort((a, b) => a.lightness - b.lightness);
}

// ============================================================================
// PALETTE GENERATORS
// ============================================================================

function generateSubtleBalancedPalette(dominantColors, lightMode) {
    const sortedByLightness = sortColorsByLightness(dominantColors);
    const darkest = sortedByLightness[0];
    const lightest = sortedByLightness[sortedByLightness.length - 1];

    const chromaticColors = dominantColors.filter(
        c => getColorHSL(c).s > MONOCHROME_SATURATION_THRESHOLD
    );
    const avgHue =
        chromaticColors.length > 0
            ? chromaticColors.reduce((sum, c) => sum + getColorHSL(c).h, 0) /
              chromaticColors.length
            : darkest.hue;

    const palette = new Array(ANSI_PALETTE_SIZE);

    palette[0] = lightMode ? lightest.color : darkest.color;
    palette[7] = lightMode ? darkest.color : lightest.color;

    for (let i = 0; i < ANSI_HUE_ARRAY.length; i++) {
        const lightness = 50 + (i - 2.5) * 4;
        palette[i + 1] = hslToHex(ANSI_HUE_ARRAY[i], SUBTLE_PALETTE_SATURATION, lightness);
    }

    const color8Lightness = lightMode
        ? Math.max(0, lightest.lightness - 40)
        : Math.min(100, darkest.lightness + 45);
    palette[8] = hslToHex(avgHue, SUBTLE_PALETTE_SATURATION * 0.5, color8Lightness);

    const brightSaturation = SUBTLE_PALETTE_SATURATION + 8;
    for (let i = 0; i < ANSI_HUE_ARRAY.length; i++) {
        const baseLightness = 50 + (i - 2.5) * 4;
        const adjustment = lightMode ? -8 : 8;
        const lightness = Math.max(0, Math.min(100, baseLightness + adjustment));
        palette[i + 9] = hslToHex(ANSI_HUE_ARRAY[i], brightSaturation, lightness);
    }

    palette[15] = lightMode
        ? hslToHex(avgHue, SUBTLE_PALETTE_SATURATION * 0.3, Math.max(0, darkest.lightness - 5))
        : hslToHex(avgHue, SUBTLE_PALETTE_SATURATION * 0.3, Math.min(100, lightest.lightness + 5));

    return palette;
}

function generateMonochromePalette(grayColors, lightMode) {
    const sortedByLightness = sortColorsByLightness(grayColors);
    const darkest = sortedByLightness[0];
    const lightest = sortedByLightness[sortedByLightness.length - 1];
    const baseHue = darkest.hue;

    const palette = new Array(ANSI_PALETTE_SIZE);

    palette[0] = lightMode ? lightest.color : darkest.color;
    palette[7] = lightMode ? darkest.color : lightest.color;

    if (lightMode) {
        const startL = darkest.lightness + 10;
        const endL = Math.min(darkest.lightness + 40, lightest.lightness - 10);
        const step = (endL - startL) / 5;

        for (let i = 1; i <= 6; i++) {
            const lightness = startL + (i - 1) * step;
            palette[i] = hslToHex(baseHue, MONOCHROME_SATURATION, lightness);
        }
    } else {
        const startL = Math.max(darkest.lightness + 30, lightest.lightness - 40);
        const endL = lightest.lightness - 10;
        const step = (endL - startL) / 5;

        for (let i = 1; i <= 6; i++) {
            const lightness = startL + (i - 1) * step;
            palette[i] = hslToHex(baseHue, MONOCHROME_SATURATION, lightness);
        }
    }

    const color8Lightness = lightMode
        ? Math.max(0, darkest.lightness + 5)
        : Math.min(100, lightest.lightness - 10);
    palette[8] = hslToHex(
        baseHue,
        MONOCHROME_SATURATION * MONOCHROME_COLOR8_SATURATION_FACTOR,
        color8Lightness
    );

    for (let i = 1; i <= 6; i++) {
        const hsl = getColorHSL(palette[i]);
        const adjustment = lightMode ? -10 : 10;
        const newL = Math.max(0, Math.min(100, hsl.l + adjustment));
        palette[i + 8] = hslToHex(baseHue, MONOCHROME_SATURATION, newL);
    }

    palette[15] = lightMode
        ? hslToHex(baseHue, 2, Math.max(0, darkest.lightness - 5))
        : hslToHex(baseHue, 2, Math.min(100, lightest.lightness + 5));

    return palette;
}

function generateChromaticPalette(dominantColors, lightMode) {
    const background = findBackgroundColor(dominantColors, lightMode);
    const usedIndices = new Set([background.index]);

    const foreground = findForegroundColor(dominantColors, lightMode, usedIndices);
    usedIndices.add(foreground.index);

    const palette = new Array(ANSI_PALETTE_SIZE);
    palette[0] = background.color;
    palette[7] = foreground.color;

    for (let i = 0; i < ANSI_HUE_ARRAY.length; i++) {
        const matchIndex = findBestColorMatch(ANSI_HUE_ARRAY[i], dominantColors, usedIndices);
        palette[i + 1] = dominantColors[matchIndex];
        usedIndices.add(matchIndex);
    }

    const bgHsl = getColorHSL(background.color);
    const color8Lightness = isDarkColor(background.color)
        ? Math.min(100, bgHsl.l + 45)
        : Math.max(0, bgHsl.l - 40);
    palette[8] = hslToHex(bgHsl.h, bgHsl.s * 0.5, color8Lightness);

    for (let i = 1; i <= 6; i++) {
        palette[i + 8] = generateBrightVersion(palette[i]);
    }

    palette[15] = generateBrightVersion(foreground.color);

    return palette;
}

// ============================================================================
// BRIGHTNESS NORMALIZATION
// ============================================================================

function adjustColorForDarkBackground(palette, colorInfo) {
    if (colorInfo.lightness >= MIN_LIGHTNESS_ON_DARK_BG) {
        return;
    }

    const adjustedLightness = MIN_LIGHTNESS_ON_DARK_BG + colorInfo.index * 3;
    palette[colorInfo.index] = adjustColorLightness(palette[colorInfo.index], adjustedLightness);

    if (colorInfo.index >= 1 && colorInfo.index <= 6) {
        palette[colorInfo.index + 8] = generateBrightVersion(palette[colorInfo.index]);
    }
}

function adjustColorForLightBackground(palette, colorInfo) {
    if (colorInfo.lightness <= MAX_LIGHTNESS_ON_LIGHT_BG) {
        return;
    }

    const adjustedLightness = Math.max(
        ABSOLUTE_MIN_LIGHTNESS,
        MAX_LIGHTNESS_ON_LIGHT_BG - colorInfo.index * 2
    );
    palette[colorInfo.index] = adjustColorLightness(palette[colorInfo.index], adjustedLightness);

    if (colorInfo.index >= 1 && colorInfo.index <= 6) {
        palette[colorInfo.index + 8] = generateBrightVersion(palette[colorInfo.index]);
    }
}

function adjustOutlierColor(palette, outlier, avgLightness, isBrightTheme) {
    const isDarkOutlierInBrightTheme =
        isBrightTheme && outlier.lightness < avgLightness - OUTLIER_LIGHTNESS_THRESHOLD;

    const isBrightOutlierInDarkTheme =
        !isBrightTheme && outlier.lightness > avgLightness + OUTLIER_LIGHTNESS_THRESHOLD;

    if (!isDarkOutlierInBrightTheme && !isBrightOutlierInDarkTheme) {
        return;
    }

    const adjustedLightness = isDarkOutlierInBrightTheme
        ? avgLightness - 10
        : avgLightness + 10;

    palette[outlier.index] = adjustColorLightness(palette[outlier.index], adjustedLightness);

    if (outlier.index >= 1 && outlier.index <= 6) {
        palette[outlier.index + 8] = generateBrightVersion(palette[outlier.index]);
    }
}

function normalizeBrightness(palette) {
    const bgHsl = getColorHSL(palette[0]);
    const bgLightness = bgHsl.l;

    const isVeryDarkBg = bgLightness < VERY_DARK_BACKGROUND_THRESHOLD;
    const isVeryLightBg = bgLightness > VERY_LIGHT_BACKGROUND_THRESHOLD;

    const colorIndices = [1, 2, 3, 4, 5, 6, 7];
    const ansiColors = colorIndices.map(i => {
        const hsl = getColorHSL(palette[i]);
        return {index: i, lightness: hsl.l, hue: hsl.h, saturation: hsl.s};
    });

    const avgLightness = ansiColors.reduce((sum, c) => sum + c.lightness, 0) / ansiColors.length;
    const isBrightTheme = avgLightness > BRIGHT_THEME_THRESHOLD;

    if (isVeryDarkBg) {
        ansiColors.forEach(colorInfo => adjustColorForDarkBackground(palette, colorInfo));
        return palette;
    }

    if (isVeryLightBg) {
        ansiColors.forEach(colorInfo => adjustColorForLightBackground(palette, colorInfo));
        return palette;
    }

    const outliers = ansiColors.filter(
        c => Math.abs(c.lightness - avgLightness) > OUTLIER_LIGHTNESS_THRESHOLD
    );

    outliers.forEach(outlier => adjustOutlierColor(palette, outlier, avgLightness, isBrightTheme));

    return palette;
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extracts colors from wallpaper using ImageMagick and generates ANSI palette
 * @param {string} imagePath - Path to wallpaper image
 * @param {boolean} lightMode - Whether to generate light mode palette
 * @returns {Promise<string[]>} Array of 16 ANSI colors
 */
export async function extractColorsWithImageMagick(imagePath, lightMode = false) {
    try {
        const cacheKey = getCacheKey(imagePath, lightMode);
        if (cacheKey) {
            const cachedPalette = loadCachedPalette(cacheKey);
            if (cachedPalette) {
                return cachedPalette;
            }
        }

        const dominantColors = await extractDominantColors(imagePath, DOMINANT_COLORS_TO_EXTRACT);

        if (dominantColors.length < 8) {
            throw new Error('Not enough colors extracted from image');
        }

        let palette;

        if (isMonochromeImage(dominantColors)) {
            print('Detected monochrome/grayscale image - generating grayscale palette');
            palette = generateMonochromePalette(dominantColors, lightMode);
        } else if (hasLowColorDiversity(dominantColors)) {
            print('Detected low color diversity - generating subtle balanced palette');
            palette = generateSubtleBalancedPalette(dominantColors, lightMode);
        } else {
            print('Detected diverse chromatic image - generating vibrant colorful palette');
            palette = generateChromaticPalette(dominantColors, lightMode);
        }

        palette = normalizeBrightness(palette);

        if (cacheKey) {
            savePaletteToCache(cacheKey, palette);
        }

        if (typeof System !== 'undefined' && System.gc) {
            System.gc();
        }

        return palette;
    } catch (e) {
        throw new Error(`ImageMagick color extraction failed: ${e.message}`);
    }
}

/**
 * Checks if ImageMagick is available
 * @returns {Promise<boolean>}
 */
export function checkImageMagickAvailable() {
    return new Promise(resolve => {
        try {
            const proc = Gio.Subprocess.new(
                ['which', 'magick'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (source, result) => {
                try {
                    source.communicate_utf8_finish(result);
                    resolve(source.get_exit_status() === 0);
                } catch (e) {
                    resolve(false);
                }
            });
        } catch (e) {
            resolve(false);
        }
    });
}

/**
 * Converts extracted palette to Aether-compatible colors object
 * @param {string[]} palette - 16-color palette array
 * @param {string} wallpaperPath - Path to the wallpaper
 * @returns {Object} Colors object compatible with ThemeGenerator
 */
export function paletteToColorsObject(palette, wallpaperPath) {
    const colors = {
        // Special colors
        background: palette[0],
        foreground: palette[7],
        cursor: palette[7],
        wallpaper: wallpaperPath,

        // Normal ANSI colors (color0-7)
        black: palette[0],
        red: palette[1],
        green: palette[2],
        yellow: palette[3],
        blue: palette[4],
        magenta: palette[5],
        cyan: palette[6],
        white: palette[7],

        // Bright ANSI colors (color8-15)
        bright_black: palette[8],
        bright_red: palette[9],
        bright_green: palette[10],
        bright_yellow: palette[11],
        bright_blue: palette[12],
        bright_magenta: palette[13],
        bright_cyan: palette[14],
        bright_white: palette[15],
    };

    // Also include color0-15 for backwards compatibility
    for (let i = 0; i < 16; i++) {
        colors[`color${i}`] = palette[i];
    }

    return colors;
}

// Export additional utilities for use in other modules
export {hexToRgb, rgbToHsl, hslToHex, rgbToHex, getColorHSL};
