#!/usr/bin/env python3
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import scipy.ndimage as ndi

OUTPUT_DIR = Path("/Users/liuweijia/Desktop/Media/team-context/macos")
SCRATCH = Path("/Users/liuweijia/.gemini/antigravity/brain/d5c8cd30-4e41-4d08-a382-41a9fcafeb6f/scratch")
SCRATCH.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def draw_smooth_cloud(draw, circles, fill_val=255):
    for cx, cy, r in circles:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill_val)
    centers = [(cx, cy) for cx, cy, r in circles]
    if len(centers) >= 3:
        cx_mid = sum(c[0] for c in centers) / len(centers)
        cy_mid = sum(c[1] for c in centers) / len(centers)
        for i in range(len(centers)):
            c1 = centers[i]
            c2 = centers[(i + 1) % len(centers)]
            draw.polygon([c1, c2, (cx_mid, cy_mid)], fill=fill_val)

def generate_perfect_vector_clouds(scale=16):
    """
    scale=16 超采样 (576x576) 渲染
    基准网格: 36x36 pt (Retina @2x 物理像素)
    逻辑中心精准居中
    """
    w_logic, h_logic = 36, 36
    w_hi, h_hi = w_logic * scale, h_logic * scale
    
    def S(v):
        return v * scale
    
    # 精调后的后景伴随云（位于左上方，稍小一号，整体向右下稍微聚拢一点）
    # 中心约在 (13.5, 14.0)
    back_circles = [
        (S(9.2), S(15.2), S(4.4)),    # 左泡
        (S(12.5), S(10.5), S(5.2)),   # 顶中主泡
        (S(16.5), S(12.2), S(4.6)),   # 右顶泡
        (S(18.2), S(16.2), S(4.0)),   # 右泡
        (S(13.8), S(16.8), S(4.8)),   # 底泡
        (S(13.2), S(14.0), S(5.2)),   # 腹地
    ]
    
    # 精调后的前景主体云（位于右下方，饱满圆润）
    # 中心约在 (22.2, 21.8)
    front_circles = [
        (S(15.6), S(23.2), S(5.2)),   # 左泡
        (S(18.6), S(17.6), S(6.0)),   # 顶左泡
        (S(23.8), S(16.6), S(6.4)),   # 顶部主峰
        (S(28.6), S(19.8), S(5.5)),   # 右上侧泡
        (S(29.6), S(24.8), S(5.0)),   # 右下侧泡
        (S(25.4), S(28.2), S(5.5)),   # 底部右主泡
        (S(19.6), S(27.8), S(5.3)),   # 底部左主泡
        (S(22.2), S(22.6), S(7.6)),   # 核心腹地
    ]
    
    # 1. 绘制后景云
    img_back = Image.new("L", (w_hi, h_hi), 0)
    draw_back = ImageDraw.Draw(img_back)
    draw_smooth_cloud(draw_back, back_circles, 255)
    
    # 2. 绘制前景云
    img_front = Image.new("L", (w_hi, h_hi), 0)
    draw_front = ImageDraw.Draw(img_front)
    draw_smooth_cloud(draw_front, front_circles, 255)
    
    # 3. 前景云负空间切缝扩展 (1.7pt 黄金间隙)
    gap_pixels = int(1.7 * scale)
    arr_front = np.array(img_front) > 128
    front_dilated = ndi.binary_dilation(arr_front, iterations=gap_pixels)
    
    # 4. 后景云减去扩展后的前景云
    arr_back = np.array(img_back) > 128
    arr_back_cut = arr_back & (~front_dilated)
    
    # 5. 在前景主云雕刻镂空终端字符 >_
    # 线宽 1.6pt，带圆润端点
    stroke_w = int(1.6 * scale)
    
    img_chars = Image.new("L", (w_hi, h_hi), 0)
    draw_chars = ImageDraw.Draw(img_chars)
    
    p1 = (S(19.0), S(20.2))
    p2 = (S(22.6), S(23.0))
    p3 = (S(19.0), S(25.8))
    
    draw_chars.line([p1, p2, p3], fill=255, width=stroke_w, joint="round")
    r_cap = stroke_w / 2.0
    for pt in [p1, p2, p3]:
        draw_chars.ellipse((pt[0] - r_cap, pt[1] - r_cap, pt[0] + r_cap, pt[1] + r_cap), fill=255)
        
    u1 = (S(24.2), S(25.8))
    u2 = (S(27.6), S(25.8))
    draw_chars.line([u1, u2], fill=255, width=stroke_w)
    for pt in [u1, u2]:
        draw_chars.ellipse((pt[0] - r_cap, pt[1] - r_cap, pt[0] + r_cap, pt[1] + r_cap), fill=255)
        
    arr_chars = np.array(img_chars) > 128
    arr_front_clean = arr_front & (~arr_chars)
    
    # 6. 合并最终模板
    final_arr = np.zeros((w_hi, h_hi), dtype=np.uint8)
    final_arr[arr_back_cut] = 255
    final_arr[arr_front_clean] = 255
    
    # 平滑滤波
    final_img_hi = Image.fromarray(final_arr, "L")
    final_img_hi = final_img_hi.filter(ImageFilter.GaussianBlur(radius=scale * 0.22))
    
    # 导出 @2x (36x36)
    icon_2x_alpha = final_img_hi.resize((36, 36), Image.Resampling.LANCZOS)
    icon_2x = Image.new("RGBA", (36, 36), (255, 255, 255, 255))
    icon_2x.putalpha(icon_2x_alpha)
    
    # 导出 @1x (18x18)
    icon_1x_alpha = final_img_hi.resize((18, 18), Image.Resampling.LANCZOS)
    icon_1x = Image.new("RGBA", (18, 18), (255, 255, 255, 255))
    icon_1x.putalpha(icon_1x_alpha)
    
    return icon_1x, icon_2x

def run():
    icon_1x, icon_2x = generate_perfect_vector_clouds()
    
    # 保存至 macos 资源目录
    icon_1x.save(OUTPUT_DIR / "TeamCodex-Status.png", optimize=True)
    icon_2x.save(OUTPUT_DIR / "TeamCodex-Status@2x.png", optimize=True)
    print("Saved status icons to:", OUTPUT_DIR / "TeamCodex-Status.png", "and @2x")

    # 生成真实双主题（深色/浅色模式）状态栏模拟验收大图
    # 1. 深色菜单栏 (用户真实截图)
    menu_crop = Image.open(SCRATCH / "user_menu_crop.png").convert("RGBA")
    
    card_w = menu_crop.width
    card_h = 240
    card = Image.new("RGBA", (card_w, card_h), (20, 22, 26, 255))
    draw = ImageDraw.Draw(card)
    
    # 顶部：原图现场
    card.paste(menu_crop.crop((0, 0, card_w, 60)), (0, 0))
    draw.text((16, 62), "【原版状态栏】使用 SF Symbol (person.2.fill) 两个小人剪影 — 简陋粗糙，与TeamCodex脱节", fill=(255, 120, 120, 255))
    
    # 中部：深色模式新双云图标实机替换效果
    sim_dark = menu_crop.crop((0, 0, card_w, 60)).copy()
    patch = sim_dark.crop((280, 0, 316, 60))
    sim_dark.paste(patch, (324, 0))
    sim_dark.paste(icon_2x, (332, 10), icon_2x)
    card.paste(sim_dark, (0, 80))
    draw.text((16, 142), "【新版深色状态栏】纯白微矢量双云协同 (前后云立体切缝 + 终端 >_ 镂空) — 极简纯白、通透高级", fill=(120, 255, 180, 255))
    
    # 底部：浅色模式下 macOS Template 自动反色效果模拟 (呈现优雅深黑铅灰 #1d1d1f)
    sim_light = Image.new("RGBA", (card_w, 60), (242, 243, 245, 255))
    # 浅色图标：黑色像素
    icon_light = Image.new("RGBA", (36, 36), (29, 29, 31, 255))
    icon_light.putalpha(icon_2x.getchannel("A"))
    sim_light.paste(icon_light, (332, 10), icon_light)
    card.paste(sim_light, (0, 160))
    draw.text((16, 222), "【新版浅色状态栏】macOS Template 自动反色机制 (深灰黑 #1d1d1f) — 完美自适应浅色/深色主题", fill=(200, 220, 255, 255))
    
    final_preview = Path("/Users/liuweijia/.gemini/antigravity/brain/d5c8cd30-4e41-4d08-a382-41a9fcafeb6f/macos_status_bar_icon_verified.png")
    card.save(final_preview)
    print("Saved final preview card to:", final_preview)

if __name__ == "__main__":
    run()
