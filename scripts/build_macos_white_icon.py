#!/usr/bin/env python3
"""
生成符合 Apple HIG 规范的 macOS 纯白立体双云应用图标
- 采用 1024x1024 画布，856x856 标准 Squircle 纯净瓷白微渐变底板
- 使用 AI 生成的饱满前置双云主体（消除边缘毛刺，高精度超采样抗锯齿）
- 添加物理级柔和下沉双层投影与冷灰微描边
- 导出全套 iconset 并调用 iconutil 生成 AppIcon.icns
"""

import os
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
RAW_SOURCE = PROJECT_DIR / "assets" / "team-codex-raw-v2.png"
FALLBACK_SOURCE = Path("/Users/liuweijia/.codex/generated_images/01a0b32d-4c36-7441-bd85-6d00fc0bba38/exec-d2244133-520b-485f-8a0a-6f1e7bf43ecc.png")

OUTPUT_DIR = PROJECT_DIR / "macos"
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


def create_squircle_mask(size=(1024, 1024), rect=(84, 84, 940, 940), radius=195):
    """创建 4x 超采样的平滑 Squircle 遮罩"""
    scale = 4
    w, h = size[0] * scale, size[1] * scale
    x0, y0, x1, y1 = [v * scale for v in rect]
    r = radius * scale

    mask_large = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask_large)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=255)

    return mask_large.resize(size, Image.Resampling.LANCZOS)


def build_full_icon():
    source_file = RAW_SOURCE if RAW_SOURCE.exists() else FALLBACK_SOURCE
    if not source_file.exists():
        raise FileNotFoundError(f"未找到图标原料图片: {source_file}")

    print(f"[build_icon] 读取高清底板原图: {source_file}")
    raw = Image.open(source_file).convert("RGBA")

    # 1. 准确定位原图有效区域，居中裁剪核心 980x980 区域
    cx, cy = 626.5, 627.5
    crop_size = 980
    crop_box = (
        int(round(cx - crop_size / 2)),
        int(round(cy - crop_size / 2)),
        int(round(cx + crop_size / 2)),
        int(round(cy + crop_size / 2)),
    )
    cropped = raw.crop(crop_box)

    # 2. 准备 1024x1024 画布与标准 Squircle 遮罩
    mask = create_squircle_mask(size=(1024, 1024), rect=(84, 84, 940, 940), radius=195)

    # 3. 将裁切后的原图缩放到底板标准尺寸 (856x856) 并定位到 (84, 84)
    target_plate_size = 856
    scaled_content = cropped.resize((target_plate_size, target_plate_size), Image.Resampling.LANCZOS)

    plate_content = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    plate_content.paste(scaled_content, (84, 84))

    # 4. 彻底切除所有毛边
    clean_plate = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    clean_plate.paste(plate_content, (0, 0), mask)

    # 5. 生成苹果官方标准双层物理下沉阴影
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))

    # 远层扩散阴影 (dy=18, blur=22, opacity=10%)
    s_far = Image.new("RGBA", (1024, 1024), (15, 23, 42, 26))
    s_far.putalpha(mask)
    s_far = s_far.filter(ImageFilter.GaussianBlur(radius=22))
    canvas.paste(s_far, (0, 18), s_far)

    # 近层接触阴影 (dy=6, blur=8, opacity=8%)
    s_near = Image.new("RGBA", (1024, 1024), (15, 23, 42, 20))
    s_near.putalpha(mask)
    s_near = s_near.filter(ImageFilter.GaussianBlur(radius=8))
    canvas.paste(s_near, (0, 6), s_near)

    # 6. 细微冷灰描边 (#CBD5E1, 0.55 opacity)
    stroke_img = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_stroke = ImageDraw.Draw(stroke_img)
    draw_stroke.rounded_rectangle((84, 84, 940, 940), radius=195, outline=(203, 213, 225, 140), width=2)
    clean_plate.alpha_composite(stroke_img)

    canvas.alpha_composite(clean_plate)
    return canvas


def make_preview_comparison(old_path, new_img, out_preview):
    """生成新老图标对比预览图"""
    canvas = Image.new("RGBA", (1240, 620), (241, 245, 249, 255))
    draw = ImageDraw.Draw(canvas)

    draw.rounded_rectangle((50, 40, 580, 570), radius=24, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
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
    print("[build_icon] 开始生成 macOS 瓷白立体双云正式应用图标...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    master = build_full_icon()

    master_png = OUTPUT_DIR / "TeamCodex-macOS-white-1024.png"
    old_preview = OUTPUT_DIR / "system-icon-preview.png"

    if master_png.exists():
        make_preview_comparison(master_png, master, OUTPUT_DIR / "system-icon-comparison.png")

    master.save(master_png, optimize=True)
    print(f"[build_icon] 已保存 master PNG: {master_png}")

    master.save(old_preview, optimize=True)

    # 导出到 assets 供 Web / Readme 展示
    assets_dir = PROJECT_DIR / "assets"
    if assets_dir.exists():
        master.save(assets_dir / "logo.png", optimize=True)
        master.resize((256, 256), Image.Resampling.LANCZOS).save(assets_dir / "icon.png", optimize=True)
        print(f"[build_icon] 已同步至 assets/logo.png 与 assets/icon.png")

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

