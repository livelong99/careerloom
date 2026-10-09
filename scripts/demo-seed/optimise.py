#!/usr/bin/env python3
"""Recompress raw screenshots losslessly (RGB, max zlib), downscaled to at most 2560 px wide; --palette also reduces to an adaptive 256-colour palette.
usage: python3 scripts/demo-seed/optimise.py <raw-dir> <out-dir> [--only name,name] [--palette]"""
import sys, os
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or (only and f[:-4] not in only):
        continue
    im = Image.open(os.path.join(src, f)).convert('RGB')
    if im.width > 2560:
        im = im.resize((2560, round(im.height * 2560 / im.width)), Image.Resampling.LANCZOS)
    if '--palette' in sys.argv:
        im = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = os.path.join(dst, f)
    im.save(out, optimize=True, compress_level=9)
    print(f'{f}: {os.path.getsize(os.path.join(src, f)) // 1024} KB -> {os.path.getsize(out) // 1024} KB')
