# historicPalette

Apply historical art color palettes based on luminance

Maps the luminance of the input image to 5-color palettes inspired by various art history movements and cultural traditions from around the world.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| paletteIndex | int | bauhaus | dropdown | Select from 21 historical art palettes |
| smoothness | float | 0 | 0-1 | Controls blending between palette colors (0 = hard edges, 1 = smooth gradients) |
| rotation | float | none | none/fwd/back | Animate palette cycling using time |
| offset | float | 0 | 0-100 | Static offset into the palette |
| repeat | float | 1 | 0.1-10 | Multiplier for luminance mapping |
| alpha | float | 1 | 0-1 | Blend between original and palette color |

## Available Palettes

| Index | Name | Period/Origin | Character |
|-------|------|---------------|-----------|
| 0 | Aboriginal Dot | Australian | Earthy ochres with spiritual depth |
| 1 | Abstract Expressionism | 1940s-1950s | Bold primaries with earthy drama |
| 2 | Art Deco | 1920s-1930s | Glamorous metallics and bold contrasts |
| 3 | Art Nouveau | 1890-1910 | Organic, flowing pastels with jewel accents |
| 4 | Bauhaus | 1919-1933 | Primary colors and geometric simplicity |
| 5 | Cave Art | Prehistoric | Earth pigments and ochres |
| 6 | Chinese Ink | Song Dynasty+ | Monochromatic ink washes |
| 7 | Dutch Golden Age | 17th Century | Rich, somber earth tones |
| 8 | Fauvism | 1905-1910 | Wild, unnatural, vibrant colors |
| 9 | Impressionism | 1860s-1880s | Soft, light-filled naturalistic tones |
| 10 | Indian Miniature | Mughal/Rajput | Jewel-bright, ornate colors |
| 11 | Islamic Geometric | Traditional | Harmonious, mathematical precision |
| 12 | Kente Cloth | West African | Vibrant, symbolic woven colors |
| 13 | Māori Carving | New Zealand | Natural pigments and wood tones |
| 14 | Mexican Muralism | 1920s-1970s | Bold, political, vibrant |
| 15 | Minimalism | 1960s-1970s | Reduced, neutral palette |
| 16 | Persian Miniature | 13th-17th Century | Luminous, intricate jewel tones |
| 17 | Pop Art | 1950s-1960s | Bold, commercial, high-contrast |
| 18 | Renaissance | 15th-16th Century | Rich jewel tones and earth pigments |
| 19 | Surrealism | 1920s-1940s | Dreamlike, atmospheric tones |
| 20 | Ukiyo-e | 17th-19th Century | Japanese woodblock print colors |
