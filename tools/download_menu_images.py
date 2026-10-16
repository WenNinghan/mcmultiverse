# -*- coding: utf-8 -*-
"""从 menu_images_raw.json 中按「审判庭菜单品名 -> 官网真实产品名」映射下载官方产品图。
图片来源: 麦当劳中国官网 https://www.mcdonalds.com.cn (版权归麦当劳所有, 仅用于本次比赛演示)
产物: assets/menu/*.png  +  tools/menu_image_map.json
"""
import json, os, urllib.request, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "menu_images_raw.json")
OUTDIR = os.path.join(ROOT, "assets", "menu")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# 审判庭菜单品名  ->  麦当劳官网真实产品名
MAPPING = {
    # burger
    "巨无霸":                  "巨无霸",
    "麦辣鸡腿堡":              "麦辣鸡腿汉堡",
    "板烧鸡腿堡":              "板烧鸡腿堡",
    "双层吉士汉堡":            "双层吉士汉堡",
    "麦香鱼":                  "麦香鱼",
    "麦香鸡":                  "麦香鸡",
    "不素之霸双层牛堡":        "不素之霸双层牛堡",
    # snack
    "麦乐鸡(5块)":            "麦乐鸡 (5块)",
    "小薯条":                  "薯条",
    "中薯条":                  "薯条",
    "大薯条":                  "薯条",
    "脆薯饼":                  "脆薯饼",
    "玉米杯":                  "玉米杯",
    # dessert
    "麦旋风":                  "奥利奥麦旋风",
    "香芋派":                  "香芋派",
    "菠萝派":                  "菠萝派",
    # drink
    "中杯可乐":                "可口可乐",
    "大杯可乐":                "可口可乐",
    "中杯鲜煮咖啡":            "鲜萃咖啡",
    "中杯冰炫风":              "阳光橙麦炫酷",
    # breakfast
    "猪柳蛋麦满分":            "猪柳蛋麦满分",
    "火腿扒麦满分":            "火腿扒麦满分",
    "大脆鸡扒麦满分":          "大脆鸡扒麦满分",
    "脆薯饼(早餐)":            "脆薯饼",
    # combo -> 用主餐真实图
    "巨无霸套餐":              "巨无霸",
    "麦辣鸡腿堡套餐":          "麦辣鸡腿汉堡",
    "板烧鸡腿堡套餐":          "板烧鸡腿堡",
    "双层吉士汉堡套餐":        "双层吉士汉堡",
    "麦香鱼套餐":              "麦香鱼",
    "麦乐鸡(5块)套餐":         "麦乐鸡 (5块)",
    "开心乐园餐":              "汉堡包",
}

def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    # 官网名 -> url（同名多图取第一个）
    by_name = {}
    for it in raw:
        by_name.setdefault(it["name"], it["img"])

    os.makedirs(OUTDIR, exist_ok=True)
    result, missing = {}, []
    for menu_name, official_name in MAPPING.items():
        url = by_name.get(official_name)
        if not url:
            missing.append((menu_name, official_name))
            print(f"[MISS] {menu_name} -> {official_name}")
            continue
        ext = os.path.splitext(url.split("?")[0])[1] or ".png"
        fn = official_name.replace("/", "_").replace(" ", "") + ext
        path = os.path.join(OUTDIR, fn)
        rel = f"assets/menu/{fn}"
        if not os.path.exists(path):
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Referer": "https://www.mcdonalds.com.cn/",
                "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
            })
            data = urllib.request.urlopen(req, timeout=30).read()
            open(path, "wb").write(data)
            print(f"[DL ] {menu_name:16s} <- {official_name:16s} {len(data)//1024:>4}KB {fn}")
        else:
            print(f"[SKIP] {menu_name:16s} <- {official_name:16s} {fn}")
        result[menu_name] = {"file": rel, "official": official_name, "src": url}

    out = os.path.join(ROOT, "tools", "menu_image_map.json")
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nsaved map -> {out}  ({len(result)} items)")
    if missing:
        print("MISSING:", missing)

if __name__ == "__main__":
    main()
