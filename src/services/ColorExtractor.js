import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

// Constants
const ANSI_PALETTE_SIZE = 16;
const DOMINANT_COLORS_TO_EXTRACT = 32;
const CACHE_VERSION = 2;

// Color detection thresholds
const MONOCHROME_SATURATION_THRESHOLD = 15;
const MONOCHROME_IMAGE_THRESHOLD = 0.7;
const LOW_DIVERSITY_THRESHOLD = 0.9;
const SIMILAR_HUE_RANGE = 15;
const SIMILAR_LIGHTNESS_RANGE = 20;

// Color quality preferences
const MIN_CHROMATIC_SATURATION = 15;
const TOO_DARK_THRESHOLD = 15;
const TOO_BRIGHT_THRESHOLD = 98;

// Brightness normalization
const VERY_DARK_BACKGROUND_THRESHOLD = 20;
const MIN_LIGHTNESS_ON_DARK_BG = 50;
const BRIGHT_THEME_THRESHOLD = 50;

// Palette generation
const SUBTLE_PALETTE_SATURATION = 28;
const MONOCHROME_SATURATION = 5;
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
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : {r: 0, g: 0, b: 0};
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return {h: h * 360, s: s * 100, l: l * 100};
}

function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return {r: r * 255, g: g * 255, b: b * 255};
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
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

// ============================================================================
// CACHE & FILE SYSTEM
// ============================================================================

function getCacheDir() {
    const homeDir = GLib.get_home_dir();
    return GLib.build_filenamev([homeDir, '.cache', 'tema', 'color-cache']);
}

function ensureDirectoryExists(dirPath) {
    const dir = Gio.File.new_for_path(dirPath);
    if (!dir.query_exists(null)) dir.make_directory_with_parents(null);
}

function fileExists(filePath) {
    return Gio.File.new_for_path(filePath).query_exists(null);
}

function writeTextToFile(filePath, content) {
    const file = Gio.File.new_for_path(filePath);
    file.replace_contents(new TextEncoder().encode(content), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

function getCacheKey(imagePath, lightMode) {
    try {
        const file = Gio.File.new_for_path(imagePath);
        const info = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const mtime = info.get_modification_date_time().to_unix();
        const dataString = `${imagePath}-${mtime}-${lightMode ? 'light' : 'dark'}`;
        return GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, dataString, -1);
    } catch (e) { return null; }
}

// ============================================================================
// EXTRACTION & LOGIC
// ============================================================================

function findBackgroundColor(colors, lightMode) {
    const mutedPool = colors.filter(c => {
        const hsl = getColorHSL(c);
        return lightMode ? (hsl.l > 75) : (hsl.l < 15 && hsl.s < 20);
    });
    const sourcePool = mutedPool.length > 0 ? mutedPool : colors;
    let bgIndex = 0;
    let bgLightness = lightMode ? -1 : 101;
    for (let i = 0; i < sourcePool.length; i++) {
        const hsl = getColorHSL(sourcePool[i]);
        if (lightMode ? hsl.l > bgLightness : hsl.l < bgLightness) {
            bgLightness = hsl.l;
            bgIndex = colors.indexOf(sourcePool[i]);
        }
    }
    return {color: colors[bgIndex], index: bgIndex};
}

function calculateColorScore(hsl, targetHue, isAccent = true) {
    const hueDiff = calculateHueDistance(hsl.h, targetHue) * 2.5;
    const saturationBonus = isAccent ? (hsl.s * 2.5) : 0; // Prioritize the sun/river
    let lightnessPenalty = 0;
    if (isAccent) {
        if (hsl.l < 25) lightnessPenalty = 60;
        if (hsl.l > 98) lightnessPenalty = 40;
    }
    return hueDiff + lightnessPenalty - saturationBonus;
}

function findBestColorMatch(targetHue, colorPool, usedIndices) {
    let bestIndex = -1;
    let bestScore = Infinity;
    for (let i = 0; i < colorPool.length; i++) {
        if (usedIndices.has(i)) continue;
        const hsl = getColorHSL(colorPool[i]);
        const score = calculateColorScore(hsl, targetHue, true);
        if (score < bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    return bestIndex !== -1 ? bestIndex : 0;
}

function hasLowColorDiversity(colors) {
    const hslColors = colors.map(color => getColorHSL(color));
    const hasVibrantAccent = hslColors.some(c => c.s > 50 && c.l > 25);
    if (hasVibrantAccent) return false;
    let similarCount = 0;
    let totalComparisons = 0;
    for (let i = 0; i < hslColors.length; i++) {
        for (let j = i + 1; j < hslColors.length; j++) {
            if (hslColors[i].s < MONOCHROME_SATURATION_THRESHOLD) continue;
            totalComparisons++;
            if (calculateHueDistance(hslColors[i].h, hslColors[j].h) < SIMILAR_HUE_RANGE) similarCount++;
        }
    }
    return totalComparisons === 0 ? true : (similarCount / totalComparisons > LOW_DIVERSITY_THRESHOLD);
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function extractDominantColors(imagePath, numColors) {
    return new Promise((resolve, reject) => {
        const argv = ['magick', imagePath, '-scale', IMAGE_SCALE_SIZE, '-colors', numColors.toString(), '-depth', IMAGE_BIT_DEPTH.toString(), '-format', '%c', 'histogram:info:-'];
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        proc.communicate_utf8_async(null, null, (source, result) => {
            const [, stdout, stderr] = source.communicate_utf8_finish(result);
            if (source.get_exit_status() !== 0) return reject(new Error(stderr));
            const lines = stdout.split('\n');
            const colorData = [];
            for (const line of lines) {
                const match = line.match(/^\s*(\d+):\s*\([^)]+\)\s*(#[0-9A-Fa-f]{6})/);
                if (match) colorData.push({hex: match[2].toUpperCase(), count: parseInt(match[1])});
            }
            resolve(colorData.sort((a, b) => b.count - a.count).map(c => c.hex));
        });
    });
}

function generateBrightVersion(hexColor) {
    const hsl = getColorHSL(hexColor);
    const boostL = hsl.s > 70 ? 10 : BRIGHT_COLOR_LIGHTNESS_BOOST;
    return hslToHex(hsl.h, Math.min(100, hsl.s * BRIGHT_COLOR_SATURATION_BOOST), Math.min(100, hsl.l + boostL));
}

function generateChromaticPalette(dominantColors, lightMode) {
    const background = findBackgroundColor(dominantColors, lightMode);
    const usedIndices = new Set([background.index]);

    let fgIndex = 0; let fgL = lightMode ? 101 : -1;
    for (let i = 0; i < dominantColors.length; i++) {
        if (usedIndices.has(i)) continue;
        const hsl = getColorHSL(dominantColors[i]);
        if (lightMode ? hsl.l < fgL : hsl.l > fgL) { fgL = hsl.l; fgIndex = i; }
    }
    usedIndices.add(fgIndex);

    const palette = new Array(ANSI_PALETTE_SIZE);
    palette[0] = background.color;
    palette[7] = dominantColors[fgIndex];

    for (let i = 0; i < ANSI_HUE_ARRAY.length; i++) {
        const matchIndex = findBestColorMatch(ANSI_HUE_ARRAY[i], dominantColors, usedIndices);
        palette[i + 1] = dominantColors[matchIndex];
        usedIndices.add(matchIndex);
    }

    const bgHsl = getColorHSL(background.color);
    palette[8] = hslToHex(bgHsl.h, bgHsl.s * 0.5, lightMode ? Math.max(0, bgHsl.l - 40) : Math.min(100, bgHsl.l + 45));
    for (let i = 1; i <= 6; i++) palette[i + 8] = generateBrightVersion(palette[i]);
    palette[15] = generateBrightVersion(palette[7]);
    return palette;
}

export async function extractColorsWithImageMagick(imagePath, lightMode = false) {
    const cacheKey = getCacheKey(imagePath, lightMode);
    const dominantColors = await extractDominantColors(imagePath, DOMINANT_COLORS_TO_EXTRACT);

    let palette = hasLowColorDiversity(dominantColors)
        ? generateChromaticPalette(dominantColors, lightMode) // Fallback logic here if needed
        : generateChromaticPalette(dominantColors, lightMode);

    // Normalize brightness while protecting high-saturation focal points
    const isDark = getColorHSL(palette[0]).l < 50;
    for (let i = 1; i <= 7; i++) {
        const hsl = getColorHSL(palette[i]);
        if (hsl.s > 70) continue;
        if (isDark && hsl.l < MIN_LIGHTNESS_ON_DARK_BG) {
            palette[i] = hslToHex(hsl.h, hsl.s, MIN_LIGHTNESS_ON_DARK_BG + (i * 2));
            if (i < 7) palette[i+8] = generateBrightVersion(palette[i]);
        }
    }

    if (cacheKey) {
        ensureDirectoryExists(getCacheDir());
        writeTextToFile(GLib.build_filenamev([getCacheDir(), `${cacheKey}.json`]), JSON.stringify({palette, version: CACHE_VERSION}));
    }

    return palette;
}

export function paletteToColorsObject(palette, wallpaperPath) {
    const colors = {
        background: palette[0], foreground: palette[7], cursor: palette[7], wallpaper: wallpaperPath,
        black: palette[0], red: palette[1], green: palette[2], yellow: palette[3],
        blue: palette[4], magenta: palette[5], cyan: palette[6], white: palette[7],
        bright_black: palette[8], bright_red: palette[9], bright_green: palette[10], bright_yellow: palette[11],
        bright_blue: palette[12], bright_magenta: palette[13], bright_cyan: palette[14], bright_white: palette[15]
    };
    for (let i = 0; i < 16; i++) colors[`color${i}`] = palette[i];
    return colors;
}

// Export additional utilities for use in other modules
export {hexToRgb, rgbToHsl, hslToHex, rgbToHex, getColorHSL};
