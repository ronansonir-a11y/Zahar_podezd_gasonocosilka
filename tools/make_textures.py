#!/usr/bin/env python3
"""Build all PNG textures and launcher icons for the game.

The four ``source_art/*_ai.png`` files are stylized cutouts made from the two
photos supplied by the user.  They contain a baked gray/white checkerboard
instead of a real alpha channel; this script keys that pattern out and then
produces the game-ready transparent sprites.  All other textures are generated
procedurally (deterministically) with Pillow/NumPy.

Run with the project's virtualenv:

    .buildvenv/bin/python tools/make_textures.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ART = ROOT / "source_art"
TEX = ROOT / "app" / "textures"
RES = ROOT / "android" / "res"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
RNG = random.Random(20261107)
NP_RNG = np.random.default_rng(20261107)


def ensure_dirs() -> None:
    TEX.mkdir(parents=True, exist_ok=True)
    for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
        (RES / f"mipmap-{density}").mkdir(parents=True, exist_ok=True)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def centered_text(draw: ImageDraw.ImageDraw, box, text: str, fnt, fill, spacing=4):
    """Draw possibly multiline text centered in box=(x0,y0,x1,y1)."""
    x0, y0, x1, y1 = box
    lines = text.split("\n")
    sizes = [draw.textbbox((0, 0), line, font=fnt) for line in lines]
    heights = [b[3] - b[1] for b in sizes]
    total = sum(heights) + spacing * (len(lines) - 1)
    y = y0 + ((y1 - y0) - total) / 2
    for line, b, h in zip(lines, sizes, heights):
        w = b[2] - b[0]
        draw.text((x0 + ((x1 - x0) - w) / 2, y - b[1]), line, font=fnt, fill=fill)
        y += h + spacing


def key_checkerboard(path: Path) -> Image.Image:
    """Turn the baked checkerboard of an AI cutout into a real alpha channel."""
    rgb = np.array(Image.open(path).convert("RGB"))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat, val = hsv[:, :, 1], hsv[:, :, 2]
    bg = ((sat < 30) & (val > 145)).astype(np.uint8) * 255
    bg = cv2.morphologyEx(bg, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

    # Only remove checkerboard regions connected to an image border.  This
    # keeps light skin/eye highlights and the white shirt logo intact.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(bg, 8)
    keep = np.zeros_like(bg)
    h, w = bg.shape
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        if area > 20 and (x == 0 or y == 0 or x + bw == w or y + bh == h):
            keep[labels == i] = 255
    alpha = cv2.GaussianBlur(255 - keep, (3, 3), 0.6)
    return Image.fromarray(np.dstack([rgb, alpha]), "RGBA")


def trim_alpha(im: Image.Image, pad: int = 12) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit_transparent(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Fit an RGBA sprite into size while preserving aspect ratio."""
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    copy = im.copy()
    copy.thumbnail((size[0] - 8, size[1] - 8), Image.Resampling.LANCZOS)
    out.alpha_composite(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return out


def make_cutouts() -> dict[str, Image.Image]:
    names = {
        "face_zahar": "face_zahar_ai.png",
        "face_neighbor": "face_neighbor_ai.png",
        "body_neighbor": "body_neighbor_ai.png",
        "body_zahar": "body_zahar_ai.png",
    }
    out: dict[str, Image.Image] = {}
    for key, filename in names.items():
        src = SOURCE_ART / filename
        if not src.exists():
            raise FileNotFoundError(f"Missing source art: {src}")
        im = trim_alpha(key_checkerboard(src), pad=10)
        if key == "face_zahar":
            im = fit_transparent(im, (512, 512))
        elif key == "face_neighbor":
            im = fit_transparent(im, (512, 512))
        elif key == "body_neighbor":
            im = fit_transparent(im, (384, 896))
        else:
            im = fit_transparent(im, (512, 552))
        im.save(TEX / f"{key}.png", optimize=True)
        out[key] = im
    return out


def noise_rgb(size, base, sigma, seed):
    rng = np.random.default_rng(seed)
    h, w = size[1], size[0]
    arr = np.empty((h, w, 3), dtype=np.float32)
    for c in range(3):
        arr[:, :, c] = base[c] + rng.normal(0, sigma, (h, w))
    # broad grime blotches
    small = rng.normal(0, sigma * 2.4, (max(2, h // 32), max(2, w // 32))).astype(np.float32)
    blotch = np.array(Image.fromarray(np.clip(small + 128, 0, 255).astype(np.uint8)).resize((w, h), Image.Resampling.BICUBIC), dtype=np.float32) - 128
    arr += blotch[:, :, None] * 0.30
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def noise_overlay(size, sigma, seed, dark=(0, 0, 0), light=(255, 255, 255), amount=40):
    """Transparent speckle/grime layer to composite over an existing texture."""
    rng = np.random.default_rng(seed)
    h, w = size[1], size[0]
    n = rng.normal(0, sigma, (h, w)).astype(np.float32)
    alpha = np.clip(np.abs(n) * 2.4, 0, amount).astype(np.uint8)
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    dark_mask = n < 0
    arr[:, :, 0] = np.where(dark_mask, dark[0], light[0])
    arr[:, :, 1] = np.where(dark_mask, dark[1], light[1])
    arr[:, :, 2] = np.where(dark_mask, dark[2], light[2])
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


def add_scratches(im: Image.Image, count: int, color, seed):
    rng = random.Random(seed)
    d = ImageDraw.Draw(im, "RGBA")
    w, h = im.size
    for _ in range(count):
        x, y = rng.randrange(w), rng.randrange(h)
        length = rng.randrange(12, 110)
        x2 = x + rng.randint(-length, length)
        y2 = y + rng.randint(-int(length * 0.3), int(length * 0.3))
        d.line((x, y, x2, y2), fill=color, width=rng.choice([1, 1, 2]))
    return im


def make_floor() -> None:
    s = 512
    im = Image.new("RGBA", (s, s), (54, 58, 60, 255))
    d = ImageDraw.Draw(im)
    tiles = 4
    step = s // tiles
    colors = [(74, 78, 80), (88, 91, 92), (63, 67, 69), (96, 98, 96)]
    for j in range(tiles):
        for i in range(tiles):
            c = colors[(i + j * 3) % len(colors)]
            d.rectangle((i * step + 3, j * step + 3, (i + 1) * step - 3, (j + 1) * step - 3), fill=c + (255,))
    for k in range(0, s + 1, step):
        d.line((k, 0, k, s), fill=(30, 32, 34, 255), width=5)
        d.line((0, k, s, k), fill=(30, 32, 34, 255), width=5)
    im = Image.alpha_composite(im, noise_overlay((s, s), 9, 11, dark=(18, 20, 20), light=(190, 194, 190), amount=44))
    add_scratches(im, 90, (210, 214, 210, 34), 12)
    # worn dark spots
    rng = random.Random(13)
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(26):
        x, y = rng.randrange(s), rng.randrange(s)
        r = rng.randrange(6, 28)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(20, 24, 22, rng.randrange(12, 40)))
    im.save(TEX / "floor_tile.png", optimize=True)


def make_wall() -> None:
    s = 512
    im = noise_rgb((s, s), (151, 148, 136), 10, 21).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    # lower painted tile wainscot
    d.rectangle((0, 310, s, s), fill=(45, 82, 74, 255))
    for x in range(0, s + 1, 64):
        d.line((x, 310, x, s), fill=(25, 48, 44, 220), width=3)
    for y in range(310, s + 1, 50):
        d.line((0, y, s, y), fill=(25, 48, 44, 220), width=3)
    d.line((0, 306, s, 306), fill=(218, 205, 164, 255), width=9)
    d.line((0, 316, s, 316), fill=(30, 44, 40, 255), width=3)
    # stains and cracks on plaster
    rng = random.Random(31)
    for _ in range(34):
        x, y = rng.randrange(s), rng.randrange(40, 300)
        r = rng.randrange(8, 40)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(80, 76, 64, rng.randrange(8, 26)))
    for _ in range(8):
        x, y = rng.randrange(s), rng.randrange(30, 290)
        pts = [(x, y)]
        for _ in range(rng.randrange(3, 7)):
            x += rng.randint(-22, 22)
            y += rng.randint(4, 22)
            pts.append((x, y))
        d.line(pts, fill=(62, 58, 50, 100), width=2)
    add_scratches(im, 45, (235, 228, 205, 28), 32)
    im.save(TEX / "wall_panel.png", optimize=True)


def make_ceiling() -> None:
    s = 512
    im = noise_rgb((s, s), (176, 173, 162), 8, 41)
    im = add_scratches(im, 50, (90, 86, 78, 30), 42)
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, s, 128):
        d.line((0, y, s, y), fill=(110, 106, 98, 90), width=3)
    for _ in range(20):
        x = RNG.randrange(s)
        y = RNG.randrange(s)
        r = RNG.randrange(10, 45)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(72, 68, 60, RNG.randrange(8, 24)))
    im.save(TEX / "ceiling.png", optimize=True)


def make_brick() -> None:
    s = 512
    im = noise_rgb((s, s), (122, 58, 46), 8, 51)
    d = ImageDraw.Draw(im, "RGBA")
    bh, bw, mortar = 48, 104, 6
    for row, y in enumerate(range(-bh, s + bh, bh)):
        offset = 0 if row % 2 == 0 else bw // 2
        for x in range(-bw, s + bw, bw):
            px = x + offset
            shade = RNG.randint(-18, 18)
            d.rectangle((px + mortar // 2, y + mortar // 2, px + bw - mortar // 2, y + bh - mortar // 2),
                        fill=(max(0, 128 + shade), max(0, 60 + shade // 2), max(0, 45 + shade // 3), 255))
    d.rectangle((0, 0, s, s), outline=(150, 140, 125, 80), width=2)
    im.save(TEX / "brick.png", optimize=True)


def make_metal_dark() -> None:
    s = 256
    im = noise_rgb((s, s), (38, 42, 46), 7, 61)
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, s, 8):
        d.line((0, y, s, y), fill=(120, 128, 132, 18), width=1)
    add_scratches(im, 65, (190, 198, 202, 36), 62)
    im.save(TEX / "metal_dark.png", optimize=True)


def make_mower_red() -> None:
    s = 256
    im = noise_rgb((s, s), (176, 34, 28), 6, 71)
    d = ImageDraw.Draw(im, "RGBA")
    # warning stripe along lower edge
    for x in range(-40, s + 40, 32):
        d.polygon([(x, 214), (x + 16, 214), (x + 44, 256), (x + 28, 256)], fill=(238, 196, 42, 230))
    d.rectangle((10, 12, 246, 52), fill=(30, 30, 32, 190))
    centered_text(d, (10, 12, 246, 52), "ГАЗОНОКОСИЛКА", font(20), (255, 232, 180, 255))
    add_scratches(im, 55, (255, 220, 210, 45), 72)
    im.save(TEX / "mower_red.png", optimize=True)


def make_puffer(cutouts: dict[str, Image.Image]) -> None:
    # Sample the actual AI jacket cutout, then add quilted seams.
    body = cutouts["body_neighbor"].convert("RGBA")
    crop = body.crop((90, 150, 300, 430)).resize((256, 256), Image.Resampling.LANCZOS)
    im = Image.new("RGBA", (256, 256), (38, 34, 46, 255))
    im.alpha_composite(crop)
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, 256, 40):
        d.line((0, y, 256, y), fill=(12, 10, 16, 120), width=4)
        d.line((0, y + 4, 256, y + 4), fill=(96, 88, 108, 60), width=2)
    im = Image.blend(im.convert("RGB"), noise_rgb((256, 256), (0, 0, 0), 5, 81).convert("RGB"), 0.10).convert("RGBA")
    im.save(TEX / "puffer.png", optimize=True)


def make_cloth_from_photo(cutouts: dict[str, Image.Image]) -> None:
    body = cutouts["body_zahar"].convert("RGBA")
    # central black T-shirt / red shoulders
    shirt = body.crop((140, 70, 380, 430)).resize((256, 256), Image.Resampling.LANCZOS)
    shirt.save(TEX / "shirt_zahar.png", optimize=True)
    jacket = body.crop((10, 100, 150, 470)).resize((256, 256), Image.Resampling.LANCZOS)
    jacket.save(TEX / "jacket_zahar.png", optimize=True)


def make_door(number: int, tint, filename: str) -> None:
    w, h = 256, 512
    im = noise_rgb((w, h), tint, 6, 90 + number)
    d = ImageDraw.Draw(im, "RGBA")
    # pressed metal panels
    d.rectangle((14, 14, w - 14, h - 14), outline=(18, 20, 22, 190), width=6)
    d.rectangle((30, 40, w - 30, 235), outline=(20, 22, 24, 150), width=4)
    d.rectangle((30, 255, w - 30, h - 35), outline=(20, 22, 24, 150), width=4)
    # handle and keyhole
    d.ellipse((w - 58, 250, w - 38, 270), fill=(210, 198, 150, 255))
    d.rectangle((w - 50, 266, w - 44, 292), fill=(188, 176, 132, 255))
    d.rectangle((w - 54, 310, w - 42, 326), fill=(20, 20, 22, 220))
    # apartment plate
    d.rounded_rectangle((62, 20, 194, 74), radius=8, fill=(210, 202, 172, 255), outline=(40, 40, 38, 255), width=3)
    centered_text(d, (62, 20, 194, 74), f"КВ. {number}", font(26), (35, 34, 32, 255))
    add_scratches(im, 40, (230, 225, 210, 30), 100 + number)
    im.save(TEX / filename, optimize=True)


def make_mailbox() -> None:
    s = 256
    im = noise_rgb((s, s), (58, 64, 68), 7, 121)
    d = ImageDraw.Draw(im, "RGBA")
    cols, rows = 4, 5
    cw, ch = s // cols, s // rows
    for j in range(rows):
        for i in range(cols):
            x0, y0 = i * cw + 3, j * ch + 3
            x1, y1 = (i + 1) * cw - 3, (j + 1) * ch - 3
            d.rectangle((x0, y0, x1, y1), fill=(72, 78, 82, 255), outline=(20, 22, 24, 255), width=3)
            d.rectangle((x0 + 10, y0 + 8, x1 - 10, y0 + 14), fill=(18, 20, 22, 255))
            d.ellipse((x1 - 16, y0 + ch // 2 - 4, x1 - 8, y0 + ch // 2 + 4), fill=(190, 180, 140, 255))
            centered_text(d, (x0, y0 + 20, x1, y1), str(1 + j * cols + i), font(12, False), (205, 205, 195, 180))
    im.save(TEX / "mailbox.png", optimize=True)


def make_poster_no() -> None:
    w, h = 256, 384
    im = Image.new("RGBA", (w, h), (226, 216, 184, 255))
    im = Image.alpha_composite(im, noise_overlay((w, h), 7, 131, dark=(70, 58, 44), light=(255, 248, 220), amount=28))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((8, 8, w - 8, h - 8), outline=(150, 32, 28, 255), width=7)
    centered_text(d, (18, 22, w - 18, 100), "ВНИМАНИЕ!", font(28), (150, 32, 28, 255))
    # crossed mower pictogram
    d.rounded_rectangle((54, 140, 202, 214), radius=12, fill=(60, 64, 66, 255))
    d.ellipse((62, 196, 100, 234), fill=(24, 26, 28, 255))
    d.ellipse((158, 196, 196, 234), fill=(24, 26, 28, 255))
    d.line((42, 132, 214, 240), fill=(170, 30, 26, 255), width=12)
    d.line((214, 132, 42, 240), fill=(170, 30, 26, 255), width=12)
    centered_text(d, (18, 255, w - 18, 355), "КОСИТЬ В\nПОДЪЕЗДЕ\nЗАПРЕЩЕНО!", font(24), (40, 38, 34, 255), spacing=2)
    im.save(TEX / "poster_no.png", optimize=True)


def make_character_poster(cutouts: dict[str, Image.Image], key: str, title: str, subtitle: str, bg, filename: str) -> None:
    w, h = 256, 384
    im = Image.new("RGBA", (w, h), bg + (255,))
    im = Image.alpha_composite(im, noise_overlay((w, h), 5, 141, dark=(0, 0, 0), light=(255, 255, 255), amount=22))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((8, 8, w - 8, h - 8), outline=(255, 255, 255, 90), width=4)
    sprite = cutouts[key].copy()
    sprite.thumbnail((190, 270), Image.Resampling.LANCZOS)
    im.alpha_composite(sprite, ((w - sprite.width) // 2, 56))
    d.rectangle((0, 300, w, h), fill=(12, 14, 18, 190))
    centered_text(d, (12, 306, w - 12, 344), title, font(27), (255, 232, 120, 255))
    centered_text(d, (12, 344, w - 12, 374), subtitle, font(15, False), (235, 238, 240, 255))
    im.save(TEX / filename, optimize=True)


def make_grass() -> None:
    s = 512
    im = Image.new("RGBA", (s, s), (28, 74, 30, 255))
    im = Image.alpha_composite(im, noise_overlay((s, s), 18, 151, dark=(8, 42, 12), light=(140, 205, 80), amount=70))
    d = ImageDraw.Draw(im, "RGBA")
    rng = random.Random(152)
    for _ in range(1500):
        x = rng.randrange(s)
        y = rng.randrange(s)
        length = rng.randrange(10, 42)
        color = rng.choice([(92, 170, 58, 210), (126, 196, 70, 220), (58, 132, 44, 220), (170, 210, 86, 180)])
        d.line((x, y, x + rng.randint(-8, 8), y - length), fill=color, width=rng.choice([1, 2, 2, 3]))
    # transparent ragged edges so patches blend into the tile floor
    mask = Image.new("L", (s, s), 255)
    md = ImageDraw.Draw(mask)
    md.rectangle((0, 0, s, 26), fill=0)
    md.rectangle((0, s - 26, s, s), fill=0)
    md.rectangle((0, 0, 26, s), fill=0)
    md.rectangle((s - 26, 0, s, s), fill=0)
    for _ in range(180):
        x, y = rng.randrange(s), rng.randrange(s)
        r = rng.randrange(4, 22)
        md.ellipse((x - r, y - r, x + r, y + r), fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(10))
    im.putalpha(ImageChops_multiply(im.getchannel("A"), mask))
    im.save(TEX / "grass.png", optimize=True)


def ImageChops_multiply(a, b):
    return Image.fromarray((np.array(a, np.uint16) * np.array(b, np.uint16) // 255).astype(np.uint8), "L")


def make_small_props() -> None:
    # tire tread
    s = 128
    im = noise_rgb((s, s), (22, 24, 26), 5, 161)
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, s, 16):
        d.polygon([(0, y), (18, y + 8), (0, y + 16)], fill=(8, 8, 10, 180))
        d.polygon([(s, y), (s - 18, y + 8), (s, y + 16)], fill=(8, 8, 10, 180))
    im.save(TEX / "tire.png", optimize=True)

    # fuel canister label
    im = Image.new("RGBA", (s, s), (236, 182, 32, 255))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((8, 8, 120, 120), outline=(42, 36, 20, 255), width=5)
    d.rectangle((28, 4, 92, 22), fill=(42, 36, 20, 255))
    centered_text(d, (10, 28, 118, 92), "БЕНЗИН", font(22), (40, 34, 20, 255))
    d.rectangle((30, 96, 98, 108), fill=(42, 36, 20, 255))
    im.save(TEX / "fuel.png", optimize=True)

    # coin
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse((6, 6, 122, 122), fill=(240, 190, 48, 255), outline=(140, 96, 18, 255), width=6)
    d.ellipse((18, 18, 110, 110), outline=(255, 226, 120, 255), width=5)
    centered_text(d, (18, 18, 110, 110), "★", font(58), (150, 100, 20, 255))
    im.save(TEX / "coin.png", optimize=True)

    # cone stripes
    im = Image.new("RGBA", (s, s), (238, 92, 22, 255))
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, s, 32):
        d.polygon([(0, y), (s, y), (s, y + 14), (0, y + 14)], fill=(244, 240, 228, 255))
    im.save(TEX / "cone.png", optimize=True)

    # bucket
    im = noise_rgb((s, s), (164, 38, 34), 5, 171)
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((0, 24, s, 34), fill=(230, 220, 200, 220))
    d.rectangle((0, 92, s, 102), fill=(230, 220, 200, 220))
    im.save(TEX / "bucket.png", optimize=True)

    # glowing lamp
    im = Image.new("RGBA", (s, s), (18, 20, 22, 255))
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.ellipse((8, 8, 120, 120), fill=(255, 228, 150, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    im.alpha_composite(glow)
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle((28, 42, 100, 86), radius=16, fill=(255, 242, 190, 255))
    im.save(TEX / "lamp.png", optimize=True)


def make_portrait(cutouts: dict[str, Image.Image], key: str, filename: str, ring: tuple[int, int, int]) -> None:
    s = 256
    im = Image.new("RGBA", (s, s), (12, 16, 20, 255))
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse((4, 4, 252, 252), fill=(*ring, 255))
    d.ellipse((14, 14, 242, 242), fill=(18, 24, 30, 255))
    face = cutouts[key].copy()
    face.thumbnail((218, 218), Image.Resampling.LANCZOS)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((18, 18, 238, 238), fill=255)
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    layer.alpha_composite(face, ((s - face.width) // 2, (s - face.height) // 2))
    layer.putalpha(ImageChops_multiply(layer.getchannel("A"), mask))
    im.alpha_composite(layer)
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse((4, 4, 252, 252), outline=(*ring, 255), width=8)
    d.ellipse((14, 14, 242, 242), outline=(255, 255, 255, 90), width=3)
    im.save(TEX / filename, optimize=True)


def make_icon(cutouts: dict[str, Image.Image]) -> Image.Image:
    s = 512
    im = Image.new("RGBA", (s, s), (12, 18, 22, 255))
    d = ImageDraw.Draw(im, "RGBA")
    # background glow + grass
    for r in range(220, 40, -12):
        d.ellipse((256 - r, 230 - r, 256 + r, 230 + r), fill=(30, 90 + (220 - r) // 5, 44, 8))
    d.rectangle((0, 410, s, s), fill=(42, 116, 50, 255))
    for x in range(0, s, 18):
        d.line((x, 410, x + RNG.randint(-8, 8), 380 - RNG.randint(0, 30)), fill=(110, 190, 70, 255), width=4)
    # mower silhouette
    d.rounded_rectangle((96, 320, 416, 410), radius=22, fill=(190, 38, 30, 255))
    d.rounded_rectangle((140, 278, 330, 350), radius=18, fill=(38, 42, 46, 255))
    d.ellipse((112, 370, 188, 446), fill=(22, 24, 26, 255))
    d.ellipse((324, 370, 400, 446), fill=(22, 24, 26, 255))
    d.ellipse((134, 392, 166, 424), fill=(170, 174, 176, 255))
    d.ellipse((346, 392, 378, 424), fill=(170, 174, 176, 255))
    d.line((330, 300, 420, 250), fill=(200, 204, 206, 255), width=12)
    d.ellipse((404, 238, 432, 266), fill=(200, 204, 206, 255))
    # portrait medallion
    face = cutouts["face_zahar"].copy()
    face.thumbnail((230, 230), Image.Resampling.LANCZOS)
    med = Image.new("RGBA", (270, 270), (0, 0, 0, 0))
    md = ImageDraw.Draw(med, "RGBA")
    md.ellipse((5, 5, 265, 265), fill=(240, 196, 42, 255))
    md.ellipse((15, 15, 255, 255), fill=(18, 24, 30, 255))
    mask = Image.new("L", (270, 270), 0)
    ImageDraw.Draw(mask).ellipse((18, 18, 252, 252), fill=255)
    layer = Image.new("RGBA", (270, 270), (0, 0, 0, 0))
    layer.alpha_composite(face, ((270 - face.width) // 2, (270 - face.height) // 2))
    layer.putalpha(ImageChops_multiply(layer.getchannel("A"), mask))
    med.alpha_composite(layer)
    im.alpha_composite(med, (121, 18))
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle((48, 452, 464, 498), radius=18, fill=(12, 16, 20, 220))
    centered_text(d, (48, 452, 464, 498), "ЗАХАР • КОСИЛКА", font(28), (255, 224, 90, 255))
    im.save(TEX / "icon_master.png", optimize=True)
    return im


def make_launcher_icons(master: Image.Image) -> None:
    sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for density, size in sizes.items():
        icon = master.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(RES / f"mipmap-{density}" / "ic_launcher.png", optimize=True)


def make_contact_sheet() -> None:
    files = sorted(TEX.glob("*.png"))
    thumbs = []
    for p in files:
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", im.size, (40, 44, 48, 255))
        bg.alpha_composite(im)
        bg.thumbnail((150, 150), Image.Resampling.LANCZOS)
        thumbs.append((p.name, bg.convert("RGB")))
    cols = 5
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * 170, rows * 190), (22, 26, 30))
    d = ImageDraw.Draw(sheet)
    for i, (name, thumb) in enumerate(thumbs):
        x = (i % cols) * 170 + 10
        y = (i // cols) * 190 + 8
        sheet.paste(thumb, (x, y))
        d.text((x, y + 154), name[:22], font=font(12, False), fill=(230, 230, 230))
    sheet.save("/tmp/zahar_textures_contact.jpg", quality=88)


def main() -> None:
    ensure_dirs()
    cutouts = make_cutouts()
    make_floor()
    make_wall()
    make_ceiling()
    make_brick()
    make_metal_dark()
    make_mower_red()
    make_puffer(cutouts)
    make_cloth_from_photo(cutouts)
    make_door(12, (72, 76, 78), "door_1.png")
    make_door(13, (82, 68, 60), "door_2.png")
    make_door(14, (58, 70, 76), "door_3.png")
    make_mailbox()
    make_poster_no()
    make_character_poster(cutouts, "body_neighbor", "СОСЕД", "НЕ ПРОЕДЕШЬ!", (44, 34, 58), "poster_neighbor.png")
    make_character_poster(cutouts, "body_zahar", "ЗАХАР", "ГАЗ В ПОЛ!", (70, 26, 28), "poster_zahar.png")
    make_grass()
    make_small_props()
    make_portrait(cutouts, "face_zahar", "portrait_zahar.png", (236, 72, 52))
    make_portrait(cutouts, "face_neighbor", "portrait_neighbor.png", (132, 92, 196))
    master = make_icon(cutouts)
    make_launcher_icons(master)
    make_contact_sheet()
    print(f"Wrote {len(list(TEX.glob('*.png')))} textures to {TEX}")
    print(f"Wrote launcher icons to {RES}/mipmap-*")


if __name__ == "__main__":
    main()
