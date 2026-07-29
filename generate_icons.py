"""Generate app icons (192x192 and 512x512) using pure Python (no deps)."""
import struct
import zlib
import os

def make_png_chunk(chunk_type, data):
    chunk = chunk_type + data
    crc = struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)
    return struct.pack('>I', len(data)) + chunk + crc

def create_png(width, height, pixels):
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = make_png_chunk(b'IHDR', ihdr_data)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw_data += struct.pack('BBBB', r, g, b, a)
    idat = make_png_chunk(b'IDAT', zlib.compress(raw_data))
    iend = make_png_chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def draw_rounded_rect(pixels, w, h, rx, ry, rw, rh, r, color):
    """Draw a filled rounded rectangle."""
    r = min(r, rw // 2, rh // 2)
    for y in range(max(0, int(ry)), min(h, int(ry + rh))):
        for x in range(max(0, int(rx)), min(w, int(rx + rw))):
            inside = True
            if x < rx + r and y < ry + r:
                dx, dy = rx + r - x, ry + r - y
                inside = dx * dx + dy * dy <= r * r
            elif x >= rx + rw - r and y < ry + r:
                dx, dy = x - (rx + rw - r), ry + r - y
                inside = dx * dx + dy * dy <= r * r
            elif x < rx + r and y >= ry + rh - r:
                dx, dy = rx + r - x, y - (ry + rh - r)
                inside = dx * dx + dy * dy <= r * r
            elif x >= rx + rw - r and y >= ry + rh - r:
                dx, dy = x - (rx + rw - r), y - (ry + rh - r)
                inside = dx * dx + dy * dy <= r * r
            if inside:
                pixels[y * w + x] = color

def draw_circle(pixels, w, h, cx, cy, r, color):
    """Draw a filled circle."""
    for y in range(max(0, int(cy - r)), min(h, int(cy + r + 1))):
        for x in range(max(0, int(cx - r)), min(w, int(cx + r + 1))):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                pixels[y * w + x] = color

def create_icon(size):
    """Create a modern education icon: book + checkmark."""
    w = h = size
    bg = (0x8B, 0x9A, 0x8B, 255)      # #8B9A8B brand green-gray
    white = (255, 255, 255, 255)
    accent = (0xE8, 0xBA, 0x82, 255)    # warm accent
    white_trans = (255, 255, 255, 230)
    pixels = [bg] * (w * h)

    margin = size * 0.22
    page_w = (size - margin * 2) * 0.42
    page_h = size * 0.48
    page_top = size * 0.22
    radius = size * 0.06

    # Left page of open book
    draw_rounded_rect(pixels, w, h,
                      margin, page_top,
                      page_w, page_h,
                      radius, white)
    # Right page of open book
    draw_rounded_rect(pixels, w, h,
                      size - margin - page_w, page_top,
                      page_w, page_h,
                      radius, white_trans)

    # Bottom bar (spine/platform)
    bar_w = page_w * 1.3
    bar_h = size * 0.04
    bar_x = (size - bar_w) / 2
    bar_y = page_top + page_h + size * 0.03
    draw_rounded_rect(pixels, w, h,
                      bar_x, bar_y,
                      bar_w, bar_h,
                      bar_h / 2, accent)

    # Checkmark circle
    circle_cx = size // 2
    circle_cy = size * 0.78
    circle_r = size * 0.1
    draw_circle(pixels, w, h, circle_cx, circle_cy, circle_r, accent)

    # Checkmark (✓) as simple shapes
    # Horizontal line of checkmark
    for dy in range(int(size * 0.03)):
        for dx in range(int(size * 0.1)):
            x = int(circle_cx + dx - size * 0.05)
            y = int(circle_cy - size * 0.015 + dy)
            if 0 <= y < h and 0 <= x < w:
                pixels[y * w + x] = white

    return pixels

if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(out_dir, exist_ok=True)
    for size_name, size in [('192', 192), ('512', 512)]:
        pixels = create_icon(size)
        data = create_png(size, size, pixels)
        path = os.path.join(out_dir, f'icon-{size_name}.png')
        with open(path, 'wb') as f:
            f.write(data)
        print(f'Created: {path}')
    print('All icons generated successfully!')
