#!/usr/bin/env python3
"""
生成符合 Apple HIG 规范的 macOS 纯白微质感底板应用图标
- 采用 1024x1024 画布，824x824 标准 Squircle 纯净瓷白微渐变底板
- 将 Codex 双云朵原图主体放大（宽度从原先的 579px 放大至约 712px，饱满自信）
- 添加物理级柔和下沉投影，消除塑料廉价感
- 导出全套 iconset 并调用 iconutil 生成 AppIcon.icns
"""

import os
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MASTER_SOURCE = Path("/Users/liuweijia/Desktop/Media/team-codex-icon-package/output/png/team-codex-master-1024.png")
OUTPUT_DIR = Path("/Users/liuweijia/Desktop/Media/team-context/macos")
ICONSET_DIR = OUTPUT_DIR / "TeamCodex.iconset"

MAC_SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}

def create_squircle_mask(size=(1024, 1024), rect=(72, 72, 952, 952), radius=205):
    """创建超采样的平滑 Squircle 遮罩"""
    scale = 4
    w, h = size[0] * scale, size[1] * scale
    x0, y0, x1, y1 = [v * scale for v in rect]
    r = radius * scale

    mask_large = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask_large)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=255)
    
    return mask_large.resize(size, Image.Resampling.LANCZOS)

def create_mac_background(size=(1024, 1024)):
    """创建苹果官方级纯净瓷白渐变底板并带有细微描边与悬浮双层阴影"""
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    
    shadow_mask = create_squircle_mask(size, rect=(72, 72, 952, 952), radius=205)
    
    # 底层远距离柔和扩散阴影 (dy=22, blur=30, opacity=11%)
    s2 = Image.new("RGBA", size, (15, 23, 42, 18))
    s2.putalpha(shadow_mask)
    s2 = s2.filter(ImageFilter.GaussianBlur(radius=24))
    canvas.paste(s2, (0, 20), s2)

    # 顶层近距离接触阴影 (dy=7, blur=12, opacity=8%)
    s1 = Image.new("RGBA", size, (15, 23, 42, 14))
    s1.putalpha(shadow_mask)
    s1 = s1.filter(ImageFilter.GaussianBlur(radius=9))
    canvas.paste(s1, (0, 7), s1)

    # 瓷白底板微渐变：顶部 #FFFFFF (255, 255, 255)，底部 #F5F7FA (245, 247, 250)
    plate = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_plate = ImageDraw.Draw(plate)
    for y in range(size[1]):
        t = y / float(size[1])
        r = int(255 - t * 8)
        g = int(255 - t * 6)
        b = int(255 - t * 4)
        draw_plate.line([(0, y), (size[0], y)], fill=(r, g, b, 255))
    
    # 遮罩裁切
    stroke_mask = create_squircle_mask(size, rect=(72, 72, 952, 952), radius=205)
    plate.putalpha(stroke_mask)
    
    # 浅灰物理微描边 (#E2E8F0, 0.7 opacity)
    stroke_overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_stroke = ImageDraw.Draw(stroke_overlay)
    draw_stroke.rounded_rectangle((72, 72, 952, 952), radius=205, outline=(214, 222, 234, 190), width=2)
    plate.alpha_composite(stroke_overlay)

    canvas.alpha_composite(plate)
    return canvas

def extract_and_scale_cloud(target_width=760):
    """从原素材提取双云朵主体，并等比放大至饱满尺寸"""
    raw = Image.open(MASTER_SOURCE).convert("RGBA")
    bbox = raw.getchannel("A").getbbox()
    cropped = raw.crop(bbox)
    
    w, h = cropped.size
    scale = target_width / float(w)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    
    scaled = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    return scaled

def add_cloud_shadow(cloud_img, size=(1024, 1024), pos=(156, 184)):
    """在底板上为主体生成高质感的接触阴影与空间下沉微投影"""
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    
    cw, ch = cloud_img.size
    cloud_alpha = cloud_img.getchannel("A")
    
    # 1. 深度柔和投影 (dy=18, blur=22, 颜色带有一点深靛蓝冷色调)
    sh_deep = Image.new("RGBA", (cw, ch), (30, 41, 59, 52))
    sh_deep.putalpha(cloud_alpha)
    temp_deep = Image.new("RGBA", size, (0, 0, 0, 0))
    temp_deep.paste(sh_deep, (pos[0], pos[1] + 18), sh_deep)
    temp_deep = temp_deep.filter(ImageFilter.GaussianBlur(radius=18))
    canvas.alpha_composite(temp_deep)
    
    # 2. 近距离接触投影 (dy=6, blur=8)
    sh_near = Image.new("RGBA", (cw, ch), (15, 23, 42, 28))
    sh_near.putalpha(cloud_alpha)
    temp_near = Image.new("RGBA", size, (0, 0, 0, 0))
    temp_near.paste(sh_near, (pos[0], pos[1] + 6), sh_near)
    temp_near = temp_near.filter(ImageFilter.GaussianBlur(radius=7))
    canvas.alpha_composite(temp_near)

    # 3. 粘贴云朵本体
    canvas.paste(cloud_img, pos, cloud_img)
    return canvas

def build_full_icon():
    bg = create_mac_background()
    cloud = extract_and_scale_cloud(target_width=760)
    cw, ch = cloud.size
    
    x = (1024 - cw) // 2
    y = (1024 - ch) // 2 - 4
    print(f"[build_icon] 新云朵尺寸: {cw}x{ch}, 放置坐标: ({x}, {y})")
    
    final_icon = Image.alpha_composite(bg, add_cloud_shadow(cloud, pos=(x, y)))
    return final_icon

def make_preview_comparison(old_path, new_img, out_preview):
    """生成新老图标对比预览图"""
    canvas = Image.new("RGBA", (1240, 620), (241, 245, 249, 255))
    draw = ImageDraw.Draw(canvas)
    
    # 左边卡片 (原灰底小图标)
    draw.rounded_rectangle((50, 40, 580, 570), radius=24, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    # 右边卡片 (新白瓷放大图标)
    draw.rounded_rectangle((660, 40, 1190, 570), radius=24, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    
    try:
        old_im = Image.open(old_path).resize((400, 400), Image.Resampling.LANCZOS)
        canvas.paste(old_im, (115, 80), old_im)
    except Exception as e:
        print(f"无法读取老图标: {e}")
        
    new_resized = new_img.resize((400, 400), Image.Resampling.LANCZOS)
    canvas.paste(new_resized, (725, 80), new_resized)
    
    canvas.save(out_preview, optimize=True)
    print(f"[build_icon] 已保存对比预览图: {out_preview}")

def main():
    print("[build_icon] 开始生成 macOS 瓷白姿态放大图标...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    master = build_full_icon()
    
    master_png = OUTPUT_DIR / "TeamCodex-macOS-white-1024.png"
    master.save(master_png, optimize=True)
    print(f"[build_icon] 已保存 master PNG: {master_png}")
    
    old_preview = OUTPUT_DIR / "system-icon-preview.png"
    make_preview_comparison(old_preview, master, OUTPUT_DIR / "system-icon-comparison.png")
    
    # 覆盖原 system-icon-preview.png
    master.save(old_preview, optimize=True)
    
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)
    for filename, size in MAC_SIZES.items():
        res = master.resize((size, size), Image.Resampling.LANCZOS)
        if size <= 32:
            res = res.filter(ImageFilter.UnsharpMask(radius=0.5, percent=30, threshold=1))
        res.save(ICONSET_DIR / filename, optimize=True)
        
    icns_path = OUTPUT_DIR / "TeamCodex.app/Contents/Resources/AppIcon.icns"
    cmd = ["iconutil", "-c", "icns", str(ICONSET_DIR), "-o", str(icns_path)]
    subprocess.run(cmd, check=True)
    print(f"[build_icon] 成功生成并替换: {icns_path}")
    
    pkg_icns = Path("/Users/liuweijia/Desktop/Media/team-codex-icon-package/output/macos/TeamCodex.icns")
    if pkg_icns.parent.exists():
        subprocess.run(["cp", str(icns_path), str(pkg_icns)], check=True)
        print(f"[build_icon] 已同步至资源包: {pkg_icns}")

if __name__ == "__main__":
    main()
