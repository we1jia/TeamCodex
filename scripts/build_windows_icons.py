#!/usr/bin/env python3
"""
生成严格符合微软 Win32 标准 ICO 规范的 Windows 图标文件。
彻底解决 Windows 10/11 在 PowerShell / .NET Framework 4.8 GDI+ 环境下
因为 ICO 内部全为 PNG 导致 Shell_NotifyIcon 托盘图标隐形透明的缺陷。
"""
import os
import struct
from PIL import Image

CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
TC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
SRC_PNG = os.path.join(TC_DIR, 'assets', 'icon.png')
OUT_ASSETS_DIR = os.path.join(TC_DIR, 'windows', 'assets')

def create_win32_standard_ico(source_img_path, output_ico_path, sizes=[16, 20, 24, 32, 40, 48, 64, 128, 256]):
    base_img = Image.open(source_img_path).convert('RGBA')
    entries = []
    images_data = []

    for sz in sizes:
        im = base_img.resize((sz, sz), Image.Resampling.LANCZOS)
        w, h = sz, sz

        # 严格按照微软 Win32 ICO 规范生成 32-bit DIB 格式：
        # 1. BITMAPINFOHEADER (40 字节, biHeight = 2 * h)
        # 2. XOR 位图: 32-bit BGRA (自底向上 bottom-up)
        # 3. AND 掩码: 1-bit 位图 (自底向上 bottom-up, 每行对齐到 4 字节 DWORD)
        row_stride_and = ((w + 31) // 32) * 4
        and_mask_bytes = bytearray(row_stride_and * h)
        xor_bytes = bytearray(w * h * 4)

        pixels = im.load()
        for y in range(h):
            src_y = h - 1 - y  # 自底向上
            for x in range(w):
                r, g, b, a = pixels[x, src_y]
                # BGRA
                idx = (y * w + x) * 4
                xor_bytes[idx] = b
                xor_bytes[idx + 1] = g
                xor_bytes[idx + 2] = r
                xor_bytes[idx + 3] = a

                # AND mask: 1 表示透明 (保留系统背景), 0 表示不透明 (显示前景图标)
                if a < 128:
                    byte_pos = y * row_stride_and + (x // 8)
                    bit_pos = 7 - (x % 8)
                    and_mask_bytes[byte_pos] |= (1 << bit_pos)

        biSize = 40
        biWidth = w
        biHeight = h * 2  # 规范要求：高度必须包含 XOR 和 AND 掩码的总高度
        biPlanes = 1
        biBitCount = 32
        biCompression = 0
        biSizeImage = len(xor_bytes) + len(and_mask_bytes)
        biXPelsPerMeter = 0
        biYPelsPerMeter = 0
        biClrUsed = 0
        biClrImportant = 0

        header = struct.pack('<IIIHHIIIIII',
            biSize, biWidth, biHeight, biPlanes, biBitCount,
            biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter,
            biClrUsed, biClrImportant)

        img_payload = header + bytes(xor_bytes) + bytes(and_mask_bytes)
        images_data.append(img_payload)
        entries.append({
            'width': 0 if w >= 256 else w,
            'height': 0 if h >= 256 else h,
            'colors': 0,
            'reserved': 0,
            'planes': 1,
            'bit_count': 32,
            'bytes_in_res': len(img_payload)
        })

    # 组装 ICO 文件
    num_images = len(entries)
    header_data = struct.pack('<HHH', 0, 1, num_images)
    offset = 6 + 16 * num_images
    entries_data = bytearray()

    for e in entries:
        e_bytes = struct.pack('<BBBBHHII',
            e['width'], e['height'], e['colors'], e['reserved'],
            e['planes'], e['bit_count'], e['bytes_in_res'], offset)
        entries_data.extend(e_bytes)
        offset += e['bytes_in_res']

    os.makedirs(os.path.dirname(output_ico_path), exist_ok=True)
    with open(output_ico_path, 'wb') as f:
        f.write(header_data)
        f.write(entries_data)
        for d in images_data:
            f.write(d)
    print(f'[build_icons] 生成标准规范 ICO 成功: {output_ico_path} ({os.path.getsize(output_ico_path)} 字节)')

def export_png_assets(source_img_path, target_dir):
    base_img = Image.open(source_img_path).convert('RGBA')
    os.makedirs(target_dir, exist_ok=True)

    # 1. 256x256 高清原版 PNG
    p256 = os.path.join(target_dir, 'TeamCodex.png')
    base_img.resize((256, 256), Image.Resampling.LANCZOS).save(p256, 'PNG')
    print(f'[build_icons] 导出高清 PNG: {p256}')

    # 2. 32x32 托盘原生高密 PNG
    p32 = os.path.join(target_dir, 'TeamCodex-32.png')
    base_img.resize((32, 32), Image.Resampling.LANCZOS).save(p32, 'PNG')
    print(f'[build_icons] 导出托盘 PNG: {p32}')

if __name__ == '__main__':
    ico_dest = os.path.join(OUT_ASSETS_DIR, 'TeamCodex.ico')
    ico_dest2 = os.path.join(OUT_ASSETS_DIR, 'TeamContext.ico')
    create_win32_standard_ico(SRC_PNG, ico_dest)
    create_win32_standard_ico(SRC_PNG, ico_dest2)
    export_png_assets(SRC_PNG, OUT_ASSETS_DIR)
