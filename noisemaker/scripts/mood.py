import os
import random
import textwrap

import click
from PIL import Image, ImageDraw, ImageFont


def mood_text(input_filename, text, font="LiberationSans-Bold", font_size=42, fill=None, rect=True, wrap_width=42, bottom=False, right=False, invert=False):
    if fill is None:
        if invert:
            fill = (0, 0, 0, 0)
        else:
            fill = (255, 255, 255, 255)

    image = Image.open(input_filename).convert("RGB")

    input_width, input_height = image.size

    font_path = os.path.join(os.path.expanduser("~"), ".noisemaker", "fonts", f"{font}.ttf")

    # Supersample: render text at 4x size, then downscale for proper kerning
    scale = 4
    font = ImageFont.truetype(font_path, font_size * scale)

    overlay = Image.new("RGBA", (input_width * scale, input_height * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    padding = 6 * scale

    lines = textwrap.wrap(text, width=wrap_width)

    line_metrics = []
    text_height: int | float = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        line_w = bbox[2] - bbox[0]
        line_h = bbox[3] - bbox[1]
        line_metrics.append((line, line_w, line_h))
        text_height += line_h + padding

    text_y: int | float = input_height * scale - text_height

    if bottom:
        text_y -= int(padding * 0.5)

    else:
        text_y /= 2

    if invert:
        shadow_color = (255, 255, 255, 128)
    else:
        shadow_color = (0, 0, 0, 128)

    if rect:
        draw.rectangle(((0, text_y - padding), (input_width * scale, text_y + text_height + padding)), fill=shadow_color)

    for line, line_w, line_h in line_metrics:
        text_x: int | float = input_width * scale - line_w
        if right:
            text_x -= padding + 4 * scale
        else:
            text_x /= 2

        draw.text((text_x + scale, text_y + scale), line, font=font, fill=shadow_color)
        draw.text((text_x, text_y), line, font=font, fill=fill)

        text_y += line_h + padding

    overlay = overlay.resize((input_width, input_height), Image.Resampling.LANCZOS)
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    image.save(input_filename)


@click.command()
@click.option("--filename", type=click.Path(dir_okay=False), required=True)
@click.option("--text", type=str, required=True)
@click.option("--font", type=str, default="LiberationSans-Bold")
@click.option("--font-size", type=int, default=42)
@click.option("--color", is_flag=True)
@click.option("--no-rect", is_flag=True)
@click.option("--wrap-width", type=int, default=42)
@click.option("--bottom", is_flag=True)
@click.option("--right", is_flag=True)
@click.option("--invert", is_flag=True)
def main(filename, text, font, font_size, color, no_rect, wrap_width, bottom, right, invert):
    if color:
        if invert:
            fill = (random.randint(0, 128), random.randint(0, 128), random.randint(0, 128), 255)
        else:
            fill = (random.randint(128, 255), random.randint(128, 255), random.randint(128, 255), 255)

    else:
        if invert:
            fill = (0, 0, 0, 0)
        else:
            fill = (255, 255, 255, 255)

    mood_text(filename, text, font, font_size, fill, not no_rect, wrap_width, bottom, right, invert)
