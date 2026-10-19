import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_cognidesk_icon():
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Base Rounded Square with deep background
    padding = 24
    corner_radius = 110
    
    # Outer ambient glow layer
    glow_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.rounded_rectangle(
        [(padding - 10, padding - 10), (size - padding + 10, size - padding + 10)],
        radius=corner_radius + 8,
        fill=(6, 182, 212, 60)
    )
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(16))
    img = Image.alpha_composite(img, glow_img)
    draw = ImageDraw.Draw(img)

    # Background gradient
    for y in range(padding, size - padding):
        factor = (y - padding) / (size - 2 * padding)
        r = int(11 * (1 - factor) + 15 * factor)
        g = int(15 * (1 - factor) + 23 * factor)
        b = int(23 * (1 - factor) + 42 * factor)
        draw.rounded_rectangle(
            [(padding, padding), (size - padding, size - padding)],
            radius=corner_radius,
            fill=(r, g, b, 255)
        )

    # 2. Cyan Tech Border
    draw.rounded_rectangle(
        [(padding, padding), (size - padding, size - padding)],
        radius=corner_radius,
        outline=(6, 182, 212, 180),
        width=4
    )

    # 3. Inner Holographic Neural Knowledge Nodes
    center = (size // 2, size // 2)
    radius = 140

    # Draw circuit connections
    nodes = []
    num_nodes = 8
    for i in range(num_nodes):
        angle = (2 * math.pi / num_nodes) * i - math.pi / 2
        nx = center[0] + int(radius * math.cos(angle))
        ny = center[1] + int(radius * math.sin(angle))
        nodes.append((nx, ny))

    # Connect nodes with cyan circuit lines
    for i in range(num_nodes):
        # Connect to center
        draw.line([center, nodes[i]], fill=(6, 182, 212, 120), width=3)
        # Connect to neighbor
        next_node = nodes[(i + 1) % num_nodes]
        draw.line([nodes[i], next_node], fill=(59, 130, 246, 140), width=3)
        # Inner bridge
        inner_angle = angle + math.pi / num_nodes
        ix = center[0] + int(radius * 0.55 * math.cos(inner_angle))
        iy = center[1] + int(radius * 0.55 * math.sin(inner_angle))
        draw.line([nodes[i], (ix, iy)], fill=(14, 165, 233, 100), width=2)
        draw.line([(ix, iy), center], fill=(6, 182, 212, 130), width=2)

    # Draw outer node orbs
    for nx, ny in nodes:
        draw.ellipse([(nx - 14, ny - 14), (nx + 14, ny + 14)], fill=(14, 165, 233, 230), outline=(255, 255, 255, 220), width=2)
        draw.ellipse([(nx - 6, ny - 6), (nx + 6, ny + 6)], fill=(255, 255, 255, 255))

    # 4. Central Glowing AI Core
    core_glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cg_draw = ImageDraw.Draw(core_glow)
    cg_draw.ellipse(
        [(center[0] - 65, center[1] - 65), (center[0] + 65, center[1] + 65)],
        fill=(6, 182, 212, 150)
    )
    core_glow = core_glow.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img, core_glow)
    draw = ImageDraw.Draw(img)

    # Center nucleus orb
    draw.ellipse([(center[0] - 38, center[1] - 38), (center[0] + 38, center[1] + 38)], fill=(6, 182, 212, 240), outline=(255, 255, 255, 240), width=3)
    draw.ellipse([(center[0] - 22, center[1] - 22), (center[0] + 22, center[1] + 22)], fill=(255, 255, 255, 255))

    # Save to frontend/electron/assets
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "electron", "assets")
    os.makedirs(assets_dir, exist_ok=True)

    png_path = os.path.join(assets_dir, "icon.png")
    ico_path = os.path.join(assets_dir, "icon.ico")

    img.save(png_path, format="PNG")
    print(f"Generated PNG icon: {png_path}")

    # Generate multi-size ICO
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, format="ICO", sizes=icon_sizes)
    print(f"Generated ICO icon: {ico_path}")

if __name__ == "__main__":
    create_cognidesk_icon()
