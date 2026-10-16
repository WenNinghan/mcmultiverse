# -*- coding: utf-8 -*-
"""处理麦当劳官网原始产品图：
1. 备份原图到 assets/menu_raw/
2. 裁掉四周透明留白（含白底图的兜底处理）
3. 统一留 6% 边距、居中放进正方形画布，缩放到 512x512
4. PNG 优化压缩

输出覆盖 assets/menu/*.png
"""
import os, shutil, glob, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "menu")
BAK = os.path.join(ROOT, "assets", "menu_raw")
SIZE = 512
PAD_RATIO = 0.06

def content_bbox(img):
    """返回内容包围盒。优先用 alpha；若无透明区则按与角落底色差异判定。"""
    rgba = img.convert("RGBA")
    alpha = rgba.getchannel("A")
    amin, amax = alpha.getextrema()
    if amin < 250:                      # 有透明区域
        return rgba.getbbox() or (0, 0, img.width, img.height), True
    # 不透明图：用角落颜色当底色
    bg = rgba.getpixel((0, 0))[:3]
    px = rgba.load()
    w, h = rgba.size
    minx, miny, maxx, maxy = w, h, 0, 0
    step = 2
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 28:
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    if maxx <= minx:
        return (0, 0, w, h), False
    return (minx, miny, maxx + 1, maxy + 1), False

def main():
    os.makedirs(BAK, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC, "*.png")))
    print(f"processing {len(files)} images\n")
    for p in files:
        fn = os.path.basename(p)
        bak = os.path.join(BAK, fn)
        if not os.path.exists(bak):
            shutil.copy2(p, bak)
        img = Image.open(bak).convert("RGBA")
        bbox, has_alpha = content_bbox(img)
        crop = img.crop(bbox)
        # 等比缩放进 SIZE*(1-2*pad) 的框
        inner = int(SIZE * (1 - 2 * PAD_RATIO))
        cw, ch = crop.size
        scale = min(inner / cw, inner / ch)
        nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
        crop = crop.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(crop, ((SIZE - nw) // 2, (SIZE - nh) // 2), crop)
        canvas.save(p, "PNG", optimize=True)
        print(f"  {fn:26s} {img.size} -> bbox{bbox} -> {canvas.size}  "
              f"{os.path.getsize(bak)//1024}KB -> {os.path.getsize(p)//1024}KB")

if __name__ == "__main__":
    main()
