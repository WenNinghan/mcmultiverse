# -*- coding: utf-8 -*-
"""抓取麦当劳中国官网各分类菜单页，提取「产品名 -> 官方产品图 URL」映射。
产物: tools/menu_images_raw.json
"""
import re, json, os, urllib.request, sys, time

BASE = "https://www.mcdonalds.com.cn"
PAGES = {
    "burger":      "/index/Food/menu/burger",
    "snack":       "/index/Food/menu/snacks-3",
    "dessert":     "/index/Food/menu/Dessert-11",
    "drink":       "/index/Food/menu/beverage-2",
    "breakfast":   "/index/Food/menu/breakfast",
    "happy":       "/index/Food/menu/happy-meals",
    "mccafe":      "/index/Food/mccafe/mccafe-menu",
}
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

def fetch(url, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception as e:            # 官网偶尔超时，退避重试
            last = e
            time.sleep(1.5 * (i + 1))
    raise last

# <a href="/product/Big-Mac"> <div class="pic"><img src="...png" alt=""></div> <span class="name">巨无霸</span> </a>
PAT = re.compile(
    r'<div\s+class="pic">\s*<img\s+src="(?P<img>https?://[^"]+)"[^>]*>\s*</div>\s*<span\s+class="name">(?P<name>[^<]+)</span>',
    re.S)
# 备选：先找 <a href="/product/xxx"> 块再从块里抠图
PAT_BLOCK = re.compile(r'<a\s+href="(/product/[^"]+)"[^>]*>(.*?)</a>', re.S)

def parse(html, cat):
    out = []
    for m in PAT.finditer(html):
        out.append({"name": m.group("name").strip(), "img": m.group("img").strip(), "cat": cat, "href": ""})
    if not out:
        for b in PAT_BLOCK.finditer(html):
            href, inner = b.group(1), b.group(2)
            im = re.search(r'<img\s+src="(?P<img>https?://[^"]+)"', inner)
            nm = re.search(r'<span\s+class="name">([^<]+)</span>', inner)
            if im and nm:
                out.append({"name": nm.group(1).strip(), "img": im.group("img").strip(),
                            "cat": cat, "href": href})
    return out

def main():
    result = []
    seen = set()
    for cat, path in PAGES.items():
        url = BASE + path
        try:
            html = fetch(url)
        except Exception as e:
            print(f"[FAIL] {cat} {url}: {e}", file=sys.stderr)
            continue
        items = parse(html, cat)
        print(f"[OK] {cat:10s} {url} -> {len(items)} items")
        for it in items:
            key = (it["name"], it["img"])
            if key in seen:
                continue
            seen.add(key)
            result.append(it)
    print(f"\nTOTAL unique products: {len(result)}")
    outdir = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(outdir, "menu_images_raw.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("saved ->", out)
    for it in result:
        print(f"  {it['cat']:10s} {it['name']:24s} {it['img']}")

if __name__ == "__main__":
    main()
