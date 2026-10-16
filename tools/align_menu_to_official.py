# -*- coding: utf-8 -*-
"""对齐官网产品线：下载 3 个替代产品的官方图（备份 raw + trim 成品），
并删除不再被引用的 3 张图。"""
import json, os, urllib.request, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "menu_images_raw.json")
MENU = os.path.join(ROOT, "assets", "menu")
MENURAW = os.path.join(ROOT, "assets", "menu_raw")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

NEW = ["不素之霸双层牛堡", "火腿扒麦满分", "大脆鸡扒麦满分"]
DROP = ["吉士汉堡包", "火腿扒早安营养卷", "图林根香肠早安营养卷"]

def trim(src, dst):
    from PIL import Image
    SIZE, PAD = 512, 0.06
    img = Image.open(src).convert("RGBA")
    alpha = img.getchannel("A")
    amin, _ = alpha.getextrema()
    bbox = img.getbbox() if amin < 250 else (0, 0, img.width, img.height)
    crop = img.crop(bbox)
    inner = int(SIZE * (1 - 2 * PAD))
    w, h = crop.size
    s = min(inner / w, inner / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    crop = crop.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(crop, ((SIZE - nw) // 2, (SIZE - nh) // 2), crop)
    canvas.save(dst, "PNG", optimize=True)

def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    by_name = {it["name"]: it["img"] for it in raw}
    for name in NEW:
        url = by_name.get(name)
        if not url:
            print(f"[MISS] {name} 不在快照里"); continue
        rawp = os.path.join(MENURAW, name + ".png")
        if not os.path.exists(rawp):
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Referer": "https://www.mcdonalds.com.cn/"})
            open(rawp, "wb").write(urllib.request.urlopen(req, timeout=45).read())
        trim(rawp, os.path.join(MENU, name + ".png"))
        print(f"[NEW] {name} -> assets/menu/{name}.png "
              f"({os.path.getsize(os.path.join(MENU, name+'.png'))//1024}KB)")
    for name in DROP:
        p = os.path.join(MENU, name + ".png")
        if os.path.exists(p):
            os.remove(p); print(f"[DEL] {name}.png（menu_raw 保留备份）")

if __name__ == "__main__":
    main()
