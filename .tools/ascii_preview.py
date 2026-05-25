"""Render a low-res ASCII preview of a PNG so we can describe what it looks like."""
import sys
from PIL import Image

p = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 96
img = Image.open(p).convert("RGB")
ratio = img.height / img.width
H = max(1, int(W * ratio * 0.5))
img = img.resize((W, H), Image.LANCZOS)
ramp = " .:-=+*#%@"
for y in range(H):
    line = []
    for x in range(W):
        r, g, b = img.getpixel((x, y))
        # tag dominant hue
        m = max(r, g, b); n = min(r, g, b)
        if m - n < 18:
            tag = "."  # neutral
        elif r >= g and r >= b:
            tag = "R"
        elif g >= r and g >= b:
            tag = "G"
        else:
            tag = "B"
        # brightness
        lum = int(0.299*r + 0.587*g + 0.114*b)
        ch = ramp[min(len(ramp)-1, lum * len(ramp) // 256)]
        # combine: high brightness uses ramp; saturated uses tag
        if (m - n) > 60:
            line.append(tag)
        else:
            line.append(ch)
    print("".join(line))
