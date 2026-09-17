#!/usr/bin/env python3
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import scipy.ndimage as ndi

ROOT = Path("/Users/liuweijia/Desktop/Media")
MASTER_PATH = ROOT / "team-codex-icon-package/output/png/team-codex-master-1024.png"
SCRATCH = Path("/Users/liuweijia/.gemini/antigravity/brain/d5c8cd30-4e41-4d08-a382-41a9fcafeb6f/scratch")
SCRATCH.mkdir(parents=True, exist_ok=True)

def load_master():
    img = Image.open(MASTER_PATH).convert("RGBA")
    arr = np.array(img)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    return arr, rgb, alpha

def generate_base_masks():
    arr, rgb, alpha = load_master()
    
    # 提取白色字符 >_
    is_white = (rgb[:, :, 0] > 220) & (rgb[:, :, 1] > 220) & (rgb[:, :, 2] > 220) & (alpha > 180)
    lbl, n = ndi.label(is_white)
    sizes = np.bincount(lbl.ravel())
    sizes[0] = 0
    valid_labels = np.where(sizes > 800)[0]
    
    term_top = np.zeros_like(is_white)
    term_bot = np.zeros_like(is_white)
    
    for l in valid_labels:
        ys, xs = np.where(lbl == l)
        if ys.mean() < 500:
            term_top |= (lbl == l)
        else:
            term_bot |= (lbl == l)
            
    # 平滑字符边缘
    term_top = ndi.binary_dilation(term_top, iterations=2)
    term_top = ndi.binary_erosion(term_top, iterations=2)
    term_bot = ndi.binary_dilation(term_bot, iterations=2)
    term_bot = ndi.binary_erosion(term_bot, iterations=2)

    # 提取前后云朵
    g_val = rgb[:, :, 1].astype(float)
    b_val = rgb[:, :, 2].astype(float)
    ratio = g_val / (b_val + 1e-5)
    
    front_seed = (alpha > 100) & (ratio < 0.65)
    front_cloud = ndi.binary_closing(front_seed, iterations=12)
    front_cloud = ndi.binary_fill_holes(front_cloud)
    
    total_cloud = (alpha > 80)
    total_cloud = ndi.binary_closing(total_cloud, iterations=8)
    total_cloud = ndi.binary_fill_holes(total_cloud)
    
    back_cloud = total_cloud & (~front_cloud)
    back_cloud = ndi.binary_opening(back_cloud, iterations=4)
    back_cloud = ndi.binary_fill_holes(back_cloud)
    
    return total_cloud, front_cloud, back_cloud, term_top, term_bot

def render_options():
    total_cloud, front_cloud, back_cloud, term_top, term_bot = generate_base_masks()
    
    gap = 24
    front_dilated = ndi.binary_dilation(front_cloud, iterations=gap)
    back_cut = back_cloud & (~front_dilated)
    back_cut = ndi.binary_opening(back_cut, iterations=3)

    ys, xs = np.where(total_cloud)
    pad = 20
    y0, y1 = max(0, ys.min() - pad), min(1024, ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(1024, xs.max() + pad)
    
    mask_a = np.zeros((1024, 1024), dtype=np.uint8)
    mask_a[front_cloud & (~term_bot)] = 255
    mask_a[back_cut] = 255
    
    mask_b = np.zeros((1024, 1024), dtype=np.uint8)
    mask_b[front_cloud & (~term_bot)] = 255
    mask_b[back_cut & (~term_top)] = 255

    master_img = Image.open(MASTER_PATH).convert("RGBA")
    
    def crop_and_scale(mask_arr, scale=2):
        size = 18 * scale
        sub = mask_arr[y0:y1, x0:x1]
        pil_sub = Image.fromarray(sub, "L")
        pil_sub = pil_sub.filter(ImageFilter.GaussianBlur(radius=1.2))
        
        target_content_h = int(14.5 * scale)
        w_curr, h_curr = pil_sub.size
        target_content_w = int(round(w_curr * (target_content_h / h_curr)))
        
        scaled = pil_sub.resize((target_content_w, target_content_h), Image.Resampling.LANCZOS)
        
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        white_img = Image.new("RGBA", (target_content_w, target_content_h), (255, 255, 255, 255))
        white_img.putalpha(scaled)
        
        px = (size - target_content_w) // 2
        py = (size - target_content_h) // 2
        canvas.paste(white_img, (px, py), white_img)
        return canvas

    icon_a_2x = crop_and_scale(mask_a, 2)
    icon_a_1x = crop_and_scale(mask_a, 1)
    
    icon_b_2x = crop_and_scale(mask_b, 2)
    icon_b_1x = crop_and_scale(mask_b, 1)
    
    sub_color = master_img.crop((x0, y0, x1, y1))
    target_content_h = 29
    target_content_w = int(round(sub_color.width * (target_content_h / sub_color.height)))
    scaled_c = sub_color.resize((target_content_w, target_content_h), Image.Resampling.LANCZOS)
    icon_c_2x = Image.new("RGBA", (36, 36), (0, 0, 0, 0))
    icon_c_2x.paste(scaled_c, ((36 - target_content_w) // 2, (36 - target_content_h) // 2), scaled_c)

    return (icon_a_1x, icon_a_2x), (icon_b_1x, icon_b_2x), icon_c_2x

def run():
    (icon_a_1x, icon_a_2x), (icon_b_1x, icon_b_2x), icon_c_2x = render_options()
    
    icon_a_1x.save(SCRATCH / "TeamCodex-Status-A.png")
    icon_a_2x.save(SCRATCH / "TeamCodex-Status-A@2x.png")
    icon_b_1x.save(SCRATCH / "TeamCodex-Status-B.png")
    icon_b_2x.save(SCRATCH / "TeamCodex-Status-B@2x.png")
    icon_c_2x.save(SCRATCH / "TeamCodex-Status-C@2x.png")
    
    menu_crop = Image.open(SCRATCH / "user_menu_crop.png").convert("RGBA")
    
    # 制作对比图
    row_h = 80
    card = Image.new("RGBA", (menu_crop.width, row_h * 4 + 40), (22, 24, 28, 255))
    draw = ImageDraw.Draw(card)
    
    # 原图
    card.paste(menu_crop.crop((0, 0, menu_crop.width, 60)), (0, 0))
    draw.text((16, 64), "【原图现场】人型剪影 (person.2.fill) — 简陋突兀", fill=(255, 120, 120, 255))
    
    def add_row(icon, label, idx):
        y_top = 80 + idx * 80
        sim = menu_crop.crop((0, 0, menu_crop.width, 60)).copy()
        # 覆盖原来小人的位置
        patch = sim.crop((280, 0, 316, 60))
        sim.paste(patch, (324, 0))
        # 居中粘贴 36x36 图标
        sim.paste(icon, (332, 10), icon)
        card.paste(sim, (0, y_top))
        draw.text((16, y_top + 64), label, fill=(180, 220, 255, 255))
        
    add_row(icon_a_2x, "【方案 A · 极力推荐】纯白微矢量双云 (主云镂空 >_ + 层次切缝) — 极简通透，纯粹原生", 0)
    add_row(icon_b_2x, "【方案 B】纯白双云双符号 (双云均带 >_ 镂空) — 终端代码感更强", 1)
    add_row(icon_c_2x, "【方案 C】Windows 同款微彩色 (原版蓝绿渐变微缩) — 色彩鲜活", 2)
    
    out_path = SCRATCH / "menubar_icon_comparison.png"
    card.save(out_path)
    print("Generated comparison to:", out_path)

if __name__ == "__main__":
    run()
