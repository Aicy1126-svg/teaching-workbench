import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"C:\Users\Administrator\WorkBuddy\2026-07-27-10-03-57\teaching-workbench\按键方案"
os.makedirs(OUT, exist_ok=True)

# 字体
FONT_DIR = r"C:\Windows\Fonts"
REG = os.path.join(FONT_DIR, "msyh.ttc")
BOLD = os.path.join(FONT_DIR, "msyhbd.ttc")
f_title = ImageFont.truetype(BOLD, 20)
f_label = ImageFont.truetype(REG, 14)
f_btn = ImageFont.truetype(REG, 16)
f_small = ImageFont.truetype(REG, 12)
f_date = ImageFont.truetype(BOLD, 18)

# 颜色
WHITE = (255, 255, 255)
BG = (245, 243, 240)
CARD = (255, 255, 255)
PRIMARY = (139, 154, 139)
PRIMARY_D = (107, 122, 107)
BORDER = (208, 204, 200)
TEXT = (74, 74, 74)
LIGHT = (150, 150, 150)
GRAY_BTN = (255, 255, 255)
DANGER = (196, 128, 128)
SUCCESS = (139, 170, 139)

PHONE_W, PHONE_H = 390, 720
INNER_PAD = 24

def new_canvas():
    img = Image.new("RGB", (PHONE_W, PHONE_H), BG)
    d = ImageDraw.Draw(img)
    return img, d

def round_rect(d, box, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def center_text(d, text, box, font, color):
    l, t, r, b = box
    w = d.textlength(text, font=font)
    h = font.size
    x = l + (r - l - w) / 2
    y = t + (b - t - h) / 2
    d.text((x, y), text, font=font, fill=color)

def draw_btn(d, box, text, fill=GRAY_BTN, outline=BORDER, color=TEXT, font=f_btn, radius=10):
    round_rect(d, box, radius, fill=fill, outline=outline, width=1)
    center_text(d, text, box, font, color)

def phone_frame(img, d, title):
    # 状态栏
    d.text((INNER_PAD, 12), "9:41", font=f_small, fill=LIGHT)
    d.text((PHONE_W - INNER_PAD - 40, 12), "📶 🔋", font=f_small, fill=LIGHT)
    # 标题
    d.text((INNER_PAD, 36), title, font=f_title, fill=TEXT)
    # 卡片
    card = (16, 76, PHONE_W - 16, PHONE_H - 40)
    round_rect(d, card, 16, fill=CARD, outline=BORDER, width=1)
    return card

def weekbar_card_top(card, date_text="2026/07/27 — 08/02"):
    # 卡片内部区域
    x0, y0, x1, y1 = card
    px = x0 + 16
    py = y0 + 16
    pw = (x1 - x0) - 32
    return px, py, pw, x1

# ===== 方案 A =====
def scheme_A():
    img, d = new_canvas()
    c = phone_frame(img, d, "方案 A · 全按钮平铺")
    px, py, pw, x1 = weekbar_card_top(c)
    # 日期标题
    center_text(d, "2026年07月27日 — 08月02日", (px, py, x1 - 16, py + 34), f_label, TEXT)
    y = py + 46
    bw = (pw - 3 * 8) / 4
    btns = ["◀ 上周", "下周 ▶", "本周", "复制"]
    for i, t in enumerate(btns):
        bx = px + i * (bw + 8)
        draw_btn(d, (bx, y, bx + bw, y + 40), t, radius=20)
    y2 = y + 52
    draw_btn(d, (px, y2, x1 - 16, y2 + 46), "+ 添加排课", fill=PRIMARY, outline=PRIMARY, color=WHITE, radius=10)
    d.text((px, y2 + 58), "问题：按钮多、主次不清，易误触", font=f_small, fill=LIGHT)
    p = os.path.join(OUT, "方案A_全按钮平铺.png")
    img.save(p)
    return p

# ===== 方案 B =====
def scheme_B():
    img, d = new_canvas()
    c = phone_frame(img, d, "方案 B · 紧凑图标化")
    px, py, pw, x1 = weekbar_card_top(c)
    # 左右箭头 + 日期
    ay = py + 4
    draw_btn(d, (px, ay, px + 38, ay + 38), "◀", radius=19)
    center_text(d, "07/27 — 08/02", (px + 46, ay, x1 - 16 - 46, ay + 38), f_date, TEXT)
    draw_btn(d, (x1 - 16 - 38, ay, x1 - 16, ay + 38), "▶", radius=19)
    y = ay + 50
    bw = (pw - 2 * 8) / 3
    btns = [("本周", GRAY_BTN, BORDER, TEXT), ("复制上周", GRAY_BTN, BORDER, TEXT), ("+ 排课", PRIMARY, PRIMARY, WHITE)]
    for i, (t, f, o, col) in enumerate(btns):
        bx = px + i * (bw + 8)
        draw_btn(d, (bx, y, bx + bw, y + 42), t, fill=f, outline=o, color=col, radius=20)
    d.text((px, y + 54), "最主要操作(+排课)用主色突出，更干净", font=f_small, fill=LIGHT)
    p = os.path.join(OUT, "方案B_紧凑图标化.png")
    img.save(p)
    return p

# ===== 方案 C =====
def scheme_C():
    img, d = new_canvas()
    c = phone_frame(img, d, "方案 C · 日期胶囊+操作栏")
    px, py, pw, x1 = weekbar_card_top(c)
    ay = py + 4
    draw_btn(d, (px, ay, px + 34, ay + 34), "◀", radius=8)
    # 日期胶囊
    round_rect(d, (px + 42, ay, x1 - 16 - 42, ay + 34), 17, fill=(245, 243, 240), outline=BORDER, width=1)
    center_text(d, "2026/07/27 — 08/02", (px + 42, ay, x1 - 16 - 42, ay + 34), f_label, TEXT)
    draw_btn(d, (x1 - 16 - 34, ay, x1 - 16, ay + 34), "▶", radius=8)
    y = ay + 48
    bw = (pw - 2 * 10) / 3
    btns = [("本周", GRAY_BTN, BORDER, TEXT), ("从上周复制", GRAY_BTN, BORDER, TEXT), ("+ 添加排课", PRIMARY, PRIMARY, WHITE)]
    for i, (t, f, o, col) in enumerate(btns):
        bx = px + i * (bw + 10)
        draw_btn(d, (bx, y, bx + bw, y + 44), t, fill=f, outline=o, color=col, radius=8)
    d.text((px, y + 56), "日期范围做成胶囊，周切换用方框箭头", font=f_small, fill=LIGHT)
    p = os.path.join(OUT, "方案C_日期胶囊.png")
    img.save(p)
    return p

# ===== 方案 D =====
def scheme_D():
    img, d = new_canvas()
    c = phone_frame(img, d, "方案 D · 卡片分区")
    px, py, pw, x1 = weekbar_card_top(c)
    # 导航区卡片
    nav = (px, py, x1 - 16, py + 96)
    round_rect(d, nav, 10, fill=(248, 246, 244), outline=BORDER, width=1)
    center_text(d, "周导航", (px, py + 8, x1 - 16, py + 28), f_small, LIGHT)
    y = py + 40
    bw = (nav[2] - nav[0] - 2 * 8) / 3
    for i, t in enumerate(["◀ 上周", "本周", "下周 ▶"]):
        bx = px + 8 + i * (bw + 8)
        draw_btn(d, (bx, y, bx + bw, y + 38), t, radius=8)
    # 操作区
    oy = nav[3] + 12
    bw2 = (pw - 10) / 2
    draw_btn(d, (px, oy, px + bw2, oy + 46), "从上周复制", radius=10)
    draw_btn(d, (px + bw2 + 10, oy, x1 - 16, oy + 46), "+ 添加排课", fill=PRIMARY, outline=PRIMARY, color=WHITE, radius=10)
    d.text((px, oy + 58), "导航区/操作区分组，层级最清晰", font=f_small, fill=LIGHT)
    p = os.path.join(OUT, "方案D_卡片分区.png")
    img.save(p)
    return p

# ===== 方案 E =====
def scheme_E():
    img, d = new_canvas()
    c = phone_frame(img, d, "方案 E · 底部常驻 Dock")
    px, py, pw, x1 = weekbar_card_top(c)
    center_text(d, "2026/07/27 — 08/02", (px, py, x1 - 16, py + 30), f_date, TEXT)
    y = py + 42
    draw_btn(d, (px, y, px + (pw - 16) / 2 - 8, y + 38), "◀ 上周", radius=20)
    draw_btn(d, (px + (pw - 16) / 2 + 8, y, x1 - 16, y + 38), "下周 ▶", radius=20)
    # 底部 dock
    dy = PHONE_H - 96
    round_rect(d, (16, dy, PHONE_W - 16, PHONE_H - 24), 16, fill=CARD, outline=BORDER, width=1)
    dxb = 28
    dbw = (PHONE_W - 56 - 2 * 10) / 4
    # 本周 / 复制 各占1，排课占2
    draw_btn(d, (dxb, dy + 14, dxb + dbw, dy + 14 + 44), "本周", radius=10)
    draw_btn(d, (dxb + dbw + 10, dy + 14, dxb + 2 * dbw + 10, dy + 14 + 44), "复制", radius=10)
    draw_btn(d, (dxb + 2 * dbw + 20, dy + 14, PHONE_W - 28, dy + 14 + 44), "+ 添加排课", fill=PRIMARY, outline=PRIMARY, color=WHITE, radius=10)
    d.text((px, y + 50), "模拟底部固定 Dock，高频操作触手可及", font=f_small, fill=LIGHT)
    p = os.path.join(OUT, "方案E_底部Dock.png")
    img.save(p)
    return p

paths = [scheme_A(), scheme_B(), scheme_C(), scheme_D(), scheme_E()]
print("\n".join(paths))
