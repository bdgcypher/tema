/**
 * ColorUtils - Comprehensive color manipulation and conversion utilities
 * Provides a complete toolkit for color operations in Tema
 */

/**
 * Removes # prefix from hex color
 * @param {string} hex - Hex color string
 * @returns {string} Color without # prefix
 */
export function stripHash(hex) {
    return hex.replace('#', '');
}

/**
 * Ensures hex color has # prefix
 * @param {string} color - Color string
 * @returns {string} Color with # prefix
 */
export function ensureHashPrefix(color) {
    return color.startsWith('#') ? color : '#' + color;
}

/**
 * Converts hex color to RGB object
 * @param {string} hex - Hex color string (with or without #)
 * @returns {Object} RGB object with r, g, b properties (0-255)
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : {r: 0, g: 0, b: 0};
}

/**
 * Converts hex color to space-separated RGB string (for templates)
 * @param {string} hex - Hex color string
 * @returns {string} RGB string in format "r g b"
 */
export function hexToRgbString(hex) {
    const rgb = hexToRgb(hex);
    return `${rgb.r} ${rgb.g} ${rgb.b}`;
}

/**
 * Converts hex color to comma-separated RGB string
 * @param {string} hex - Hex color string
 * @returns {string} RGB string in format "r,g,b"
 */
export function hexToRgbComma(hex) {
    const rgb = hexToRgb(hex);
    return `${rgb.r},${rgb.g},${rgb.b}`;
}

/**
 * Converts hex color to RGBA string
 * @param {string} hex - Hex color string
 * @param {number} alpha - Alpha value (0.0 to 1.0), default 0.95
 * @returns {string} RGBA string in format "rgba(r, g, b, a)"
 */
export function hexToRgba(hex, alpha = 0.95) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Converts RGB values to HSL
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {Object} HSL object with h (0-360), s (0-100), l (0-100)
 */
export function rgbToHsl(r, g, b) {
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

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

/**
 * Helper function for HSL to RGB conversion
 */
function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

/**
 * Converts HSL to RGB
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {Object} RGB object with r, g, b (0-255)
 */
export function hslToRgb(h, s, l) {
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

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
}

/**
 * Converts RGB values to hex
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Hex color with # prefix
 */
export function rgbToHex(r, g, b) {
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

/**
 * Converts HSL values to hex color
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color string with # prefix
 */
export function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Calculates luminance of a hex color (CCIR 601 formula)
 * @param {string} hex - Hex color string
 * @returns {number} Luminance value 0-1 (>0.5 indicates light color)
 */
export function calculateLuminance(hex) {
    const rgb = hexToRgb(hex);
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/**
 * Determines if a color is light based on luminance
 * @param {string} hex - Hex color string
 * @returns {boolean} True if light, false if dark
 */
export function isLightColor(hex) {
    return calculateLuminance(hex) > 0.5;
}

/**
 * Brightens a hex color by increasing its lightness
 * @param {string} hexColor - Hex color string
 * @param {number} amount - Amount to brighten (default: 20)
 * @returns {string} Brightened hex color
 */
export function brightenColor(hexColor, amount = 20) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const newLightness = Math.min(100, hsl.l + amount);
    return hslToHex(hsl.h, hsl.s, newLightness);
}

/**
 * Darkens a hex color by decreasing its lightness
 * @param {string} hexColor - Hex color string
 * @param {number} amount - Amount to darken (default: 20)
 * @returns {string} Darkened hex color
 */
export function darkenColor(hexColor, amount = 20) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const newLightness = Math.max(0, hsl.l - amount);
    return hslToHex(hsl.h, hsl.s, newLightness);
}

/**
 * Adjusts the saturation of a color
 * @param {string} hexColor - Hex color string
 * @param {number} amount - Amount to adjust (-100 to 100)
 * @returns {string} Adjusted hex color
 */
export function adjustSaturation(hexColor, amount) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const newSaturation = Math.max(0, Math.min(100, hsl.s + amount));
    return hslToHex(hsl.h, newSaturation, hsl.l);
}

/**
 * Gets contrasting text color (black or white) for a background
 * @param {string} backgroundColor - Background hex color
 * @returns {string} "#000000" or "#FFFFFF"
 */
export function getContrastingTextColor(backgroundColor) {
    return isLightColor(backgroundColor) ? '#000000' : '#FFFFFF';
}

/**
 * Mixes two colors together
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @param {number} weight - Weight of first color (0-1), default 0.5
 * @returns {string} Mixed hex color
 */
export function mixColors(color1, color2, weight = 0.5) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    const r = Math.round(rgb1.r * weight + rgb2.r * (1 - weight));
    const g = Math.round(rgb1.g * weight + rgb2.g * (1 - weight));
    const b = Math.round(rgb1.b * weight + rgb2.b * (1 - weight));

    return rgbToHex(r, g, b);
}

/**
 * Maps a hex color to a Yaru icon theme variant based on hue
 * @param {string} hexColor - Hex color string
 * @returns {string} Yaru theme name (e.g., "Yaru-blue")
 */
export function hexToYaruTheme(hexColor) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hue = hsl.h;

    // Map hue ranges to Yaru icon theme variants
    if (hue >= 345 || hue < 15) {
        return 'Yaru-red';
    } else if (hue >= 15 && hue < 30) {
        return 'Yaru-wartybrown';
    } else if (hue >= 30 && hue < 60) {
        return 'Yaru-yellow';
    } else if (hue >= 60 && hue < 90) {
        return 'Yaru-olive';
    } else if (hue >= 90 && hue < 165) {
        return 'Yaru-sage';
    } else if (hue >= 165 && hue < 195) {
        return 'Yaru-prussiangreen';
    } else if (hue >= 195 && hue < 255) {
        return 'Yaru-blue';
    } else if (hue >= 255 && hue < 285) {
        return 'Yaru-purple';
    } else {
        return 'Yaru-magenta';
    }
}

/**
 * Generates a smooth gradient between two colors
 * @param {string} startColor - Starting hex color
 * @param {string} endColor - Ending hex color
 * @param {number} steps - Number of color steps (default: 16)
 * @returns {string[]} Array of hex colors
 */
export function generateGradient(startColor, endColor, steps = 16) {
    const start = hexToRgb(startColor);
    const end = hexToRgb(endColor);
    const colors = [];

    for (let i = 0; i < steps; i++) {
        const ratio = i / (steps - 1);
        const r = Math.round(start.r + (end.r - start.r) * ratio);
        const g = Math.round(start.g + (end.g - start.g) * ratio);
        const b = Math.round(start.b + (end.b - start.b) * ratio);
        colors.push(rgbToHex(r, g, b));
    }

    return colors;
}

/**
 * Calculates circular hue distance between two hues
 * @param {number} hue1 - First hue (0-360)
 * @param {number} hue2 - Second hue (0-360)
 * @returns {number} Minimum distance between hues (0-180)
 */
export function calculateHueDistance(hue1, hue2) {
    let diff = Math.abs(hue1 - hue2);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

/**
 * Finds the closest shade from an array of shades
 * @param {string} currentColor - Current hex color
 * @param {string[]} shades - Array of hex colors
 * @returns {number} Index of closest shade
 */
export function findClosestShade(currentColor, shades) {
    const currentRgb = hexToRgb(currentColor);
    let closestIndex = 0;
    let minDistance = Infinity;

    shades.forEach((shade, index) => {
        const shadeRgb = hexToRgb(shade);

        const distance = Math.sqrt(
            Math.pow(currentRgb.r - shadeRgb.r, 2) +
                Math.pow(currentRgb.g - shadeRgb.g, 2) +
                Math.pow(currentRgb.b - shadeRgb.b, 2)
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = index;
        }
    });

    return closestIndex;
}

/**
 * Generates complementary color (opposite on color wheel)
 * @param {string} hexColor - Hex color string
 * @returns {string} Complementary hex color
 */
export function getComplementaryColor(hexColor) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const newHue = (hsl.h + 180) % 360;
    return hslToHex(newHue, hsl.s, hsl.l);
}

/**
 * Generates analogous colors (adjacent on color wheel)
 * @param {string} hexColor - Hex color string
 * @param {number} angle - Angle offset (default: 30)
 * @returns {string[]} Array of 3 colors [left, center, right]
 */
export function getAnalogousColors(hexColor, angle = 30) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    return [
        hslToHex((hsl.h - angle + 360) % 360, hsl.s, hsl.l),
        hexColor,
        hslToHex((hsl.h + angle) % 360, hsl.s, hsl.l),
    ];
}

/**
 * Generates triadic colors (equally spaced on color wheel)
 * @param {string} hexColor - Hex color string
 * @returns {string[]} Array of 3 colors
 */
export function getTriadicColors(hexColor) {
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    return [
        hexColor,
        hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l),
        hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l),
    ];
}

