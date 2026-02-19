#!/usr/bin/env python3
"""Generate CodeRelay PNG icons.

Uses Pillow (PIL) only.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "icons"

BG = (10, 13, 16, 255)  # #0a0d10
NEON = (32, 244, 165, 255)  # #20f4a5
BORDER = (35, 40, 48, 255)
FILL = (14, 18, 24, 255)


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Menlo.ttc",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)

    pad = max(10, size // 18)
    r = max(18, size // 6)

    d.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=r,
        outline=BORDER,
        width=max(2, size // 128),
        fill=FILL,
    )

    pocket_pad = pad + max(10, size // 16)
    pocket_r = max(20, size // 8)
    d.rounded_rectangle(
        (pocket_pad, pocket_pad, size - pocket_pad, size - pocket_pad),
        radius=pocket_r,
        outline=NEON,
        width=max(6, size // 40),
        fill=None,
    )

    font = _load_font(size // 3)
    text = "CP"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(
        ((size - tw) / 2, (size - th) / 2 - size * 0.05),
        text,
        font=font,
        fill=NEON,
    )

    font2 = _load_font(size // 10)
    prompt = ">_"
    bbox2 = d.textbbox((0, 0), prompt, font=font2)
    pw, ph = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    d.text(
        ((size - pw) / 2, (size * 0.67) - ph / 2),
        prompt,
        font=font2,
        fill=NEON,
    )

    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    icon_192 = _render(192)
    icon_512 = _render(512)

    icon_192.save(OUT_DIR / "icon.png", format="PNG")
    icon_512.save(OUT_DIR / "icon-512.png", format="PNG")


if __name__ == "__main__":
    main()
