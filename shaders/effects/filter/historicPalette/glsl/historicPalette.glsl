/*
 * Historic Palette effect - apply historical art color palettes
 * Maps luminance to 5-color palettes inspired by art history movements
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int paletteIndex;
uniform float smoothness;
uniform int paletteRotation;   // -1 = backward, 0 = none, 1 = forward
uniform float paletteOffset;   // 0-100 static offset
uniform float paletteRepeat;   // multiplier for luminance
uniform float alpha;
uniform float time;

out vec4 fragColor;

// Palette entry: 5 colors representing dark to light
struct HistoricPalette {
    vec3 color1;  // darkest
    vec3 color2;
    vec3 color3;
    vec3 color4;
    vec3 color5;  // lightest
};

const int PALETTE_COUNT = 21;
const HistoricPalette PALETTES[PALETTE_COUNT] = HistoricPalette[PALETTE_COUNT](
    // 0: Aboriginal Australian Dot Painting - Earthy ochres with spiritual depth
    HistoricPalette(
        vec3(0.165, 0.102, 0.039),  // #2A1A0A - Charcoal
        vec3(0.914, 0.769, 0.416),  // #E9C46A - Yellow Ochre
        vec3(0.627, 0.322, 0.176),  // #A0522D - Brown Earth
        vec3(0.957, 0.894, 0.843),  // #F4E4D7 - White Clay
        vec3(0.545, 0.271, 0.075)   // #8B4513 - Red Ochre
    ),
    // 1: Abstract Expressionism (1940s-1950s) - Bold primaries with earthy drama
    HistoricPalette(
        vec3(0.306, 0.204, 0.180),  // #4E342E - Raw Umber
        vec3(0.827, 0.184, 0.184),  // #D32F2F - Rothko Red
        vec3(0.980, 0.980, 0.980),  // #FAFAFA - Canvas White
        vec3(0.098, 0.463, 0.824),  // #1976D2 - Klein Blue
        vec3(0.976, 0.659, 0.145)   // #F9A825 - Cadmium Yellow
    ),
    // 2: Art Deco (1920s-1930s) - Glamorous metallics and bold contrasts
    HistoricPalette(
        vec3(0.039, 0.039, 0.039),  // #0A0A0A - Jet Black
        vec3(0.831, 0.686, 0.216),  // #D4AF37 - Gold
        vec3(0.173, 0.373, 0.435),  // #2C5F6F - Teal
        vec3(0.961, 0.961, 0.863),  // #F5F5DC - Cream
        vec3(0.769, 0.118, 0.227)   // #C41E3A - Cardinal Red 
    ),
    // 3: Art Nouveau (1890-1910) - Organic, flowing pastels with jewel accents
    HistoricPalette(
        vec3(0.361, 0.514, 0.455),  // #5C8374 - Verdigris
        vec3(0.659, 0.776, 0.525),  // #A8C686 - Sage Green
        vec3(0.957, 0.894, 0.757),  // #F4E4C1 - Ivory
        vec3(0.910, 0.706, 0.627),  // #E8B4A0 - Rose Gold
        vec3(0.608, 0.494, 0.741)   // #9B7EBD - Wisteria Purple
    ),
    // 4: Bauhaus (1919-1933) - Primary colors and geometric simplicity
    HistoricPalette(
        vec3(0.102, 0.102, 0.102),  // #1A1A1A - Black
        vec3(0.969, 0.925, 0.075),  // #F7EC13 - Primary Yellow
        vec3(0.059, 0.278, 0.686),  // #0F47AF - Primary Blue
        vec3(1.000, 1.000, 1.000),  // #FFFFFF - White
        vec3(0.890, 0.118, 0.141)   // #E31E24 - Primary Red
    ),
    // 5: Prehistoric Cave Art - Earth pigments and ochres
    HistoricPalette(
        vec3(0.173, 0.094, 0.063),  // #2C1810 - Charcoal Black
        vec3(0.871, 0.722, 0.529),  // #DEB887 - Yellow Ochre
        vec3(0.545, 0.271, 0.075),  // #8B4513 - Burnt Sienna
        vec3(0.961, 0.902, 0.827),  // #F5E6D3 - Bone White
        vec3(0.824, 0.412, 0.118)   // #D2691E - Red Ochre  
    ),
    // 6: Chinese Ink Painting (Song Dynasty onward) - Monochromatic ink washes
    HistoricPalette(
        vec3(0.102, 0.102, 0.102),  // #1A1A1A - Ink Black
        vec3(0.290, 0.290, 0.290),  // #4A4A4A - Dark Wash
        vec3(0.502, 0.502, 0.502),  // #808080 - Medium Ink
        vec3(0.749, 0.749, 0.749),  // #BFBFBF - Light Wash
        vec3(0.961, 0.961, 0.941)   // #F5F5F0 - Rice Paper
    ),
    // 7: Dutch Golden Age (17th Century) - Rich, somber earth tones
    HistoricPalette(
        vec3(0.290, 0.055, 0.055),  // #4A0E0E - Crimson Shadow
        vec3(0.553, 0.431, 0.388),  // #8D6E63 - Warm Umber
        vec3(0.243, 0.149, 0.137),  // #3E2723 - Dark Brown
        vec3(0.831, 0.647, 0.455),  // #D4A574 - Golden Tan
        vec3(0.106, 0.369, 0.125)   // #1B5E20 - Deep Green
    ),
    // 8: Fauvism (1905-1910) - Wild, unnatural, vibrant colors
    HistoricPalette(
        vec3(0.482, 0.176, 0.149),  // #7B2D26 - Deep Red
        vec3(0.361, 0.294, 0.600),  // #5C4B99 - Purple
        vec3(0.290, 0.486, 0.349),  // #4A7C59 - Bold Green
        vec3(0.957, 0.635, 0.380),  // #F4A261 - Bright Ochre
        vec3(1.000, 0.420, 0.208)   // #FF6B35 - Vivid Orange
    ),
    // 9: Impressionism (1860s-1880s) - Soft, light-filled naturalistic tones
    HistoricPalette(
        vec3(0.722, 0.651, 0.851),  // #B8A6D9 - Lavender Haze
        vec3(0.769, 0.910, 0.761),  // #C4E8C2 - Soft Green
        vec3(0.910, 0.769, 0.627),  // #E8C4A0 - Warm Peach
        vec3(0.902, 0.835, 0.722),  // #E6D5B8 - Wheat
        vec3(0.659, 0.847, 0.918)   // #A8D8EA - Sky Blue
    ),
    // 10: Indian Miniature Painting (Mughal/Rajput) - Jewel-bright, ornate colors
    HistoricPalette(
        vec3(0.082, 0.263, 0.376),  // #154360 - Lapis Blue
        vec3(0.118, 0.518, 0.286),  // #1E8449 - Emerald Green
        vec3(0.769, 0.118, 0.227),  // #C41E3A - Ruby Red
        vec3(0.953, 0.612, 0.071),  // #F39C12 - Saffron Gold
        vec3(0.988, 0.953, 0.812)   // #FCF3CF - Sandalwood Cream
    ),
    // 11: Islamic Geometric Art - Harmonious, mathematical precision
    HistoricPalette(
        vec3(0.000, 0.306, 0.537),  // #004E89 - Deep Cobalt
        vec3(0.000, 0.549, 0.549),  // #008C8C - Teal
        vec3(0.831, 0.686, 0.216),  // #D4AF37 - Gilded Gold
        vec3(0.545, 0.000, 0.000),  // #8B0000 - Garnet Red
        vec3(0.973, 0.973, 0.941)   // #F8F8F0 - Marble White
    ),
    // 12: West African Kente Cloth - Vibrant, symbolic woven colors
    HistoricPalette(
        vec3(0.000, 0.000, 0.000),  // #000000 - Black (maturity)
        vec3(0.000, 0.322, 0.647),  // #0052A5 - Blue (harmony)
        vec3(0.808, 0.067, 0.149),  // #CE1126 - Red (bloodshed/struggle)
        vec3(0.000, 0.620, 0.286),  // #009E49 - Green (growth)
        vec3(0.992, 0.725, 0.075)   // #FDB913 - Gold (royalty)
    ),
    // 13: Māori Tā Moko & Carving - Natural pigments and wood tones
    HistoricPalette(
        vec3(0.173, 0.094, 0.063),  // #2C1810 - Carbon Black (whai)
        vec3(0.824, 0.706, 0.549),  // #D2B48C - Natural Tan
        vec3(0.396, 0.263, 0.129),  // #654321 - Dark Wood (kauri)
        vec3(0.961, 0.961, 0.863),  // #F5F5DC - Shell White (pūtea)
        vec3(0.545, 0.271, 0.075)   // #8B4513 - Red Ochre (kōkōwai)
    ),
    // 14: Mexican Muralism (1920s-1970s) - Bold, political, vibrant
    HistoricPalette(
        vec3(0.004, 0.341, 0.608),  // #01579B - Sky Blue
        vec3(0.847, 0.263, 0.082),  // #D84315 - Terracotta Red
        vec3(0.337, 0.545, 0.184),  // #558B2F - Cactus Green
        vec3(0.365, 0.251, 0.216),  // #5D4037 - Adobe Brown
        vec3(0.976, 0.659, 0.145)   // #F9A825 - Marigold Yellow
    ),
    // 15: Minimalism (1960s-1970s) - Reduced, neutral palette
    HistoricPalette(
        vec3(0.259, 0.259, 0.259),  // #424242 - Charcoal
        vec3(0.620, 0.620, 0.620),  // #9E9E9E - Medium Gray
        vec3(0.110, 0.110, 0.110),  // #1C1C1C - Near Black
        vec3(0.878, 0.878, 0.878),  // #E0E0E0 - Light Gray
        vec3(0.961, 0.961, 0.961)   // #F5F5F5 - Off White
    ),
    // 16: Persian Miniature (13th-17th Century) - Luminous, intricate jewel tones
    HistoricPalette(
        vec3(0.608, 0.349, 0.714),  // #9B59B6 - Royal Purple
        vec3(0.086, 0.627, 0.522),  // #16A085 - Turquoise
        vec3(0.906, 0.298, 0.235),  // #E74C3C - Vermilion
        vec3(0.953, 0.612, 0.071),  // #F39C12 - Saffron
        vec3(0.925, 0.941, 0.945)   // #ECF0F1 - Pearl White
    ),
    // 17: Pop Art (1950s-1960s) - Bold, commercial, high-contrast
    HistoricPalette(
        vec3(0.914, 0.118, 0.388),  // #E91E63 - Hot Pink
        vec3(1.000, 0.922, 0.231),  // #FFEB3B - Bright Yellow
        vec3(0.161, 0.475, 1.000),  // #2979FF - Cyan Blue
        vec3(0.000, 0.902, 0.463),  // #00E676 - Neon Green
        vec3(1.000, 0.090, 0.267)   // #FF1744 - Electric Red
    ),
    // 18: Renaissance (15th-16th Century) - Rich jewel tones and earth pigments
    HistoricPalette(
        vec3(0.184, 0.310, 0.184),  // #2F4F2F - Deep Forest
        vec3(0.545, 0.455, 0.333),  // #8B7355 - Burnt Sienna
        vec3(0.545, 0.000, 0.000),  // #8B0000 - Venetian Red
        vec3(0.855, 0.647, 0.125),  // #DAA520 - Gold Leaf
        vec3(0.098, 0.098, 0.439)   // #191970 - Ultramarine
    ),
    // 19: Surrealism (1920s-1940s) - Dreamlike, atmospheric tones
    HistoricPalette(
        vec3(0.216, 0.278, 0.310),  // #37474F - Shadow Blue-Gray
        vec3(0.961, 0.486, 0.000),  // #F57C00 - Sunset Orange
        vec3(0.290, 0.078, 0.549),  // #4A148C - Deep Purple
        vec3(1.000, 0.878, 0.510),  // #FFE082 - Dream Yellow
        vec3(0.000, 0.412, 0.361)   // #00695C - Mysterious Teal
    ),
    // 20: Japanese Ukiyo-e (17th-19th Century) - Woodblock print colors
    HistoricPalette(
        vec3(0.118, 0.302, 0.545),  // #1E4D8B - Prussian Blue
        vec3(0.910, 0.698, 0.596),  // #E8B298 - Skin Tone
        vec3(0.176, 0.314, 0.086),  // #2D5016 - Pine Green
        vec3(0.957, 0.910, 0.757),  // #F4E8C1 - Warm Ivory
        vec3(0.769, 0.118, 0.227)   // #C41E3A - Vermilion Red 
    )
);

// Get color from palette based on luminance and smoothness
vec3 sampleHistoricPalette(HistoricPalette pal, float lum, float smoothAmount) {
    // Define the 5 luminance thresholds (equal subdivisions)
    float t1 = 0.2;
    float t2 = 0.4;
    float t3 = 0.6;
    float t4 = 0.8;
    
    // Calculate blend width based on smoothness (0 = hard edge, 1 = full blend)
    // Maximum blend width is 0.1 (half the distance between thresholds)
    float blendWidth = smoothAmount * 0.1;
    
    // Calculate blend factors at each threshold using smoothstep
    // Each factor represents the transition from one color to the next
    float b1 = smoothstep(t1 - blendWidth, t1 + blendWidth, lum);
    float b2 = smoothstep(t2 - blendWidth, t2 + blendWidth, lum);
    float b3 = smoothstep(t3 - blendWidth, t3 + blendWidth, lum);
    float b4 = smoothstep(t4 - blendWidth, t4 + blendWidth, lum);
    
    // Cascade the blends: start with color1, blend toward each successive color
    // At low lum (all factors ~0): result = color1
    // At high lum (all factors ~1): result = color5
    vec3 result = mix(pal.color1, pal.color2, b1);
    result = mix(result, pal.color3, b2);
    result = mix(result, pal.color4, b3);
    result = mix(result, pal.color5, b4);
    
    return result;
}

void main() {
    // Calculate UV from gl_FragCoord
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 uv = gl_FragCoord.xy / texSize;

    // Get input color
    vec4 inputColor = texture(inputTex, uv);

    // Clamp palette index to valid range
    int idx = clamp(paletteIndex, 0, PALETTE_COUNT - 1);

    // Calculate luminance
    float lum = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));

    // Apply palette modifiers: repeat, offset, and rotation (animation)
    float t = lum * paletteRepeat + paletteOffset * 0.01;
    if (paletteRotation == -1) {
        t += time;
    } else if (paletteRotation == 1) {
        t -= time;
    }
    t = fract(t);

    // Get palette entry and sample color
    HistoricPalette pal = PALETTES[idx];
    vec3 paletteColor = sampleHistoricPalette(pal, t, smoothness);

    // Blend between original and palette color based on alpha
    vec3 blendedColor = mix(inputColor.rgb, paletteColor, alpha);

    fragColor = vec4(blendedColor, inputColor.a);
}
