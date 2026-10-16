# -*- coding: utf-8 -*-
"""把真实官方产品图注入 index.html 的 DATA.menu 数据，并把 emoji 渲染改为 <img>。
幂等：重复执行不会重复注入。
"""
import re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, "index.html")

IMG = {
    "巨无霸": "assets/menu/巨无霸.png",
    "麦辣鸡腿堡": "assets/menu/麦辣鸡腿汉堡.png",
    "板烧鸡腿堡": "assets/menu/板烧鸡腿堡.png",
    "双层吉士汉堡": "assets/menu/双层吉士汉堡.png",
    "麦香鱼": "assets/menu/麦香鱼.png",
    "麦香鸡": "assets/menu/麦香鸡.png",
    "不素之霸双层牛堡": "assets/menu/不素之霸双层牛堡.png",
    "麦乐鸡(5块)": "assets/menu/麦乐鸡(5块).png",
    "小薯条": "assets/menu/薯条.png",
    "中薯条": "assets/menu/薯条.png",
    "大薯条": "assets/menu/薯条.png",
    "脆薯饼": "assets/menu/脆薯饼.png",
    "玉米杯": "assets/menu/玉米杯.png",
    "麦旋风": "assets/menu/奥利奥麦旋风.png",
    "香芋派": "assets/menu/香芋派.png",
    "菠萝派": "assets/menu/菠萝派.png",
    "中杯可乐": "assets/menu/可口可乐.png",
    "大杯可乐": "assets/menu/可口可乐.png",
    "中杯鲜煮咖啡": "assets/menu/鲜萃咖啡.png",
    "中杯冰炫风": "assets/menu/阳光橙麦炫酷.png",
    "猪柳蛋麦满分": "assets/menu/猪柳蛋麦满分.png",
    "火腿扒麦满分": "assets/menu/火腿扒麦满分.png",
    "大脆鸡扒麦满分": "assets/menu/大脆鸡扒麦满分.png",
    "脆薯饼(早餐)": "assets/menu/脆薯饼.png",
    "巨无霸套餐": "assets/menu/巨无霸.png",
    "麦辣鸡腿堡套餐": "assets/menu/麦辣鸡腿汉堡.png",
    "板烧鸡腿堡套餐": "assets/menu/板烧鸡腿堡.png",
    "双层吉士汉堡套餐": "assets/menu/双层吉士汉堡.png",
    "麦香鱼套餐": "assets/menu/麦香鱼.png",
    "麦乐鸡(5块)套餐": "assets/menu/麦乐鸡(5块).png",
    "开心乐园餐": "assets/menu/汉堡包.png",
}

html = open(HTML, encoding="utf-8").read()
orig_len = len(html)

# ---- 1) 注入 img 字段（限定在 menu: [ ... ], 区间内）----
m_start = html.index("  menu: [")
m_end = html.index("  itemCoupons: [")
block = html[m_start:m_end]

injected = 0
def repl(m):
    global injected
    name = m.group(1)
    if "img:" in block[m.end():m.end()+60]:
        return m.group(0)
    if name in IMG:
        injected += 1
        return f"{{name:'{name}', img:'{IMG[name]}',"
    return m.group(0)

block2 = re.sub(r"\{name:'([^']+)',", repl, block)
html = html[:m_start] + block2 + html[m_end:]
print(f"[1] injected img field: {injected}")

# ---- 2) renderMenu: emoji -> <img> ----
OLD = """    div.innerHTML = `<div class="mi-img">${m.emoji}</div><div class="mi-qty">${cart[m.name]||0}</div>"""
NEW = """    const imgTag = m.img
      ? `<img src="${m.img}" alt="${m.name}" loading="lazy" decoding="async" onerror="this.remove()">`
      : '';
    div.innerHTML = `<div class="mi-img">${imgTag}<span class="mi-emoji">${m.emoji}</span></div><div class="mi-qty">${cart[m.name]||0}</div>"""
if OLD in html:
    html = html.replace(OLD, NEW, 1)
    print("[2] renderMenu patched")
elif "mi-emoji" in html:
    print("[2] renderMenu already patched, skip")
else:
    print("[2] !! renderMenu pattern NOT FOUND", file=sys.stderr)

# ---- 3) CSS: .mi-img img 覆盖层 + 尺寸放大 ----
OLD_CSS = """.menu-item .mi-img{height:86px;display:flex;align-items:center;justify-content:center;font-size:52px;position:relative;
  background:radial-gradient(circle at 50% 65%,rgba(255,199,44,.16),rgba(193,39,45,.08) 60%,transparent);}"""
NEW_CSS = """.menu-item .mi-img{height:106px;display:flex;align-items:center;justify-content:center;position:relative;
  background:radial-gradient(circle at 50% 62%,rgba(255,199,44,.20),rgba(193,39,45,.10) 62%,transparent);}
.menu-item .mi-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:5px;z-index:2;
  filter:drop-shadow(0 6px 12px rgba(0,0,0,.45));transition:transform .35s cubic-bezier(.22,1,.36,1);}
.menu-item:hover .mi-img img{transform:scale(1.08) translateY(-2px);}
.menu-item .mi-emoji{font-size:46px;line-height:1;opacity:.95;}"""
if OLD_CSS in html:
    html = html.replace(OLD_CSS, NEW_CSS, 1)
    print("[3] CSS patched")
elif ".mi-img img" in html:
    print("[3] CSS already patched, skip")
else:
    print("[3] !! CSS pattern NOT FOUND", file=sys.stderr)

open(HTML, "w", encoding="utf-8").write(html)
print(f"done. {orig_len} -> {len(html)} bytes")
