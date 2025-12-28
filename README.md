# Tema

Wallpaper-based theme generator for Hyprland/Omarchy. Extracts colors from wallpapers using ImageMagick and applies them system-wide.

## Install

```bash
yay -S tema-git
```

**Dependencies:** `gjs gtk4 libadwaita imagemagick`

## Usage

1. Add wallpapers to `~/Wallpapers/`
2. Launch Tema
3. Select a wallpaper → choose Dark/Light
4. Done. Theme applied.

## Shortcuts

| Key | Action |
|-----|--------|
| `hjkl` / Arrows | Navigate |
| `Enter` | Apply wallpaper |
| `e` | Eject as standalone theme |
| `?` | Settings |
| `q` | Quit |

## Hyprland Keybind

```bash
# ~/.config/hypr/bindings.conf
bindd = SUPER SHIFT, T, Tema, exec, uwsm app -- tema
```

## Supported Apps

Generates configs for: Alacritty, Kitty, Ghostty, Waybar, Hyprland, Hyprlock, Mako, Wofi, Walker, btop, SwayOSD, GTK, Neovim (aether.nvim), Warp, Chromium

## Theme Ejection

Press `e` to export any wallpaper as a complete standalone Omarchy theme package.

## Troubleshooting

```bash
# ImageMagick not found
sudo pacman -S imagemagick

# Clear thumbnail cache
rm -rf ~/.cache/tema
```

## License

MIT
