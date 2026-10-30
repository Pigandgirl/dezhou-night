"""Generate iOS/PWA artwork from the existing 512px brand icon.

Outputs:
  server/public/web/icons/icon-1024.png
  server/public/web/icons/icon-512-maskable.png
  server/public/web/icons/apple-touch-icon.png (180x180)
  server/public/web/icons/splash-<w>x<h>.png (portrait + landscape)
  ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
  ios/App/Assets.xcassets/LaunchLogo.imageset/launch-logo{,@2x,@3x}.png

Run: python scripts/make-ios-assets.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WEB_ICONS = ROOT / "server" / "public" / "web" / "icons"
IOS_ASSETS = ROOT / "ios" / "App" / "Assets.xcassets"
SOURCE = WEB_ICONS / "icon-512.png"

GOLD = (217, 185, 119)
GOLD_BRIGHT = (243, 221, 168)
CREAM = (244, 236, 221)
DIM = (150, 138, 116)
BG_TOP = (13, 17, 20)
BG_BOTTOM = (5, 6, 8)

# (css width, css height, device pixel ratio) — launch screens for iPhone/iPad.
DEVICES = [
    (430, 932, 3),
    (393, 852, 3),
    (390, 844, 3),
    (428, 926, 3),
    (414, 896, 2),
    (375, 812, 3),
    (375, 667, 2),
    (320, 568, 2),
    (1024, 1366, 2),
    (820, 1180, 2),
    (834, 1194, 2),
    (744, 1133, 2),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def cover_background(size: tuple[int, int]) -> Image.Image:
    """Vertical dark gradient, close to the in-game palette."""
    w, h = size
    img = Image.new("RGB", size, BG_BOTTOM)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        r = round(BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t)
        g = round(BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t)
        b = round(BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def add_glow(img: Image.Image, center: tuple[int, int], radius: int) -> None:
    """Soft warm halo behind the mark (drawn as concentric translucent ellipses)."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    steps = 16
    for i in range(steps, 0, -1):
        r = int(radius * i / steps)
        alpha = int(16 * (1 - i / (steps + 1)) ** 1.4)
        draw.ellipse(
            [center[0] - r, center[1] - r, center[0] + r, center[1] + r],
            fill=GOLD + (alpha,),
        )
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def draw_centered(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str,
                  fnt: ImageFont.FreeTypeFont, fill: tuple[int, int, int], spacing: int = 0) -> None:
    x0, y0, x1, y1 = box
    bbox = draw.multiline_textbbox((0, 0), text, font=fnt, spacing=spacing, align="center")
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.multiline_text(
        ((x0 + x1 - tw) / 2 - bbox[0], (y0 + y1 - th) / 2 - bbox[1]),
        text, font=fnt, fill=fill, spacing=spacing, align="center",
    )


def splash(width: int, height: int) -> Image.Image:
    img = cover_background((width, height))
    draw = ImageDraw.Draw(img)
    min_side = min(width, height)
    cx, cy = width // 2, int(height * 0.44)
    mark = int(min_side * 0.19)
    add_glow(img, (cx, cy), int(mark * 1.15))
    draw = ImageDraw.Draw(img)
    # gold ring
    inset = int(mark * 0.52)
    ring = int(max(2, min_side * 0.003))
    draw.ellipse(
        [cx - inset, cy - inset, cx + inset, cy + inset],
        outline=GOLD + (200,) if img.mode == "RGBA" else GOLD,
        width=ring,
    )
    # 德
    glyph_font = font(int(mark * 0.92), bold=False)
    draw_centered(draw, (cx - inset, cy - inset, cx + inset, cy + inset), "德",
                  glyph_font, GOLD_BRIGHT)
    # title + subtitle
    title_font = font(int(min_side * 0.078), bold=True)
    sub_font = font(int(min_side * 0.024), bold=False)
    cap_font = font(int(min_side * 0.019), bold=False)
    draw_centered(draw, (0, int(height * 0.56), width, int(height * 0.66)), "德扑之夜",
                  title_font, CREAM)
    draw_centered(draw, (0, int(height * 0.665), width, int(height * 0.70)),
                  "PRIVATE TABLE · 第一视角", sub_font, GOLD)
    # hairline + footer
    line_w = int(width * 0.16)
    y = int(height * 0.755)
    draw.line([(cx - line_w, y), (cx + line_w, y)], fill=GOLD + (120,), width=max(1, ring // 2))
    draw_centered(draw, (0, int(height * 0.78), width, int(height * 0.82)),
                  "FIRST-PERSON TEXAS HOLD'EM", cap_font, DIM)
    return img


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source icon: {SOURCE}")
    WEB_ICONS.mkdir(parents=True, exist_ok=True)

    base = Image.open(SOURCE).convert("RGB")
    icon = base.resize((1024, 1024), Image.LANCZOS)
    icon.save(WEB_ICONS / "icon-1024.png", optimize=True)

    apple = base.resize((180, 180), Image.LANCZOS)
    apple.save(WEB_ICONS / "apple-touch-icon.png", optimize=True)

    # Maskable icon: extra safe zone, no thin border near the mask edge.
    maskable = cover_background((512, 512)).convert("RGBA")
    mdraw = ImageDraw.Draw(maskable)
    mdraw.ellipse([38, 38, 474, 474], outline=GOLD + (170,), width=5)
    draw_centered(mdraw, (64, 64, 448, 448), "德", font(210), GOLD_BRIGHT)
    maskable.convert("RGB").save(WEB_ICONS / "icon-512-maskable.png", optimize=True)

    made = 0
    for css_w, css_h, scale in DEVICES:
        for w, h in ((css_w * scale, css_h * scale), (css_h * scale, css_w * scale)):
            out = WEB_ICONS / f"splash-{w}x{h}.png"
            splash(w, h).save(out, optimize=True)
            made += 1
    print(f"PWA icons + {made} splash screens -> {WEB_ICONS}")

    # Native app icon (opaque, 1024).
    app_icon_dir = IOS_ASSETS / "AppIcon.appiconset"
    app_icon_dir.mkdir(parents=True, exist_ok=True)
    icon.save(app_icon_dir / "AppIcon-1024.png", optimize=True)

    # Launch logo (transparent square, gold mark on nothing).
    logo_dir = IOS_ASSETS / "LaunchLogo.imageset"
    logo_dir.mkdir(parents=True, exist_ok=True)
    for scale, px in ((1, 256), (2, 512), (3, 768)):
        art = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        d = ImageDraw.Draw(art)
        inset = int(px * 0.08)
        d.ellipse([inset, inset, px - inset, px - inset], outline=GOLD + (190,), width=max(2, px // 128))
        draw_centered(d, (inset, inset, px - inset, px - inset), "德", font(int(px * 0.68)), GOLD_BRIGHT)
        suffix = "" if scale == 1 else f"@{scale}x"
        art.save(logo_dir / f"launch-logo{suffix}.png", optimize=True)
    print(f"iOS assets -> {IOS_ASSETS}")


if __name__ == "__main__":
    main()
