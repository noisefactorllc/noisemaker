# bitwise

Bitwise operation patterns (XOR squares, AND, OR, etc.)

## Description

Generates patterns by applying bitwise and arithmetic operations to pixel coordinates. The classic "XOR squares" pattern emerges from `x XOR y & 0xFF` — other operations produce dramatically different results with the same inputs.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| operation | int | 0 | 0-7 | Bitwise op (0=XOR, 1=AND, 2=OR, 3=NAND, 4=XNOR, 5=MUL, 6=ADD, 7=SUB) |
| scale | float | 50 | 1-100 | Cell size (higher = bigger cells) |
| offsetX | int | 0 | -256-256 | Horizontal coordinate offset |
| offsetY | int | 0 | -256-256 | Vertical coordinate offset |
| mask | int | 255 | - | Bit depth mask (8-bit through 1-bit) |
| seed | int | 0 | 0-255 | XORs into coordinates for pattern variation |
| colorMode | int | 0 | 0-1 | Output mode (0=Mono, 1=RGB with channel shifts) |
| speed | int | 0 | -5-5 | Animation speed (integer pixel shifts, loops seamlessly) |

## Operations

- **XOR (0)**: Classic recursive Sierpinski-like squares
- **AND (1)**: Chaotic diagonal emphasis
- **OR (2)**: Dense coverage with triangular gaps
- **NAND (3)**: Inverted AND
- **XNOR (4)**: Inverted XOR
- **MUL (5)**: Multiplication table (hyperbolic curves)
- **ADD (6)**: Diagonal stripes
- **SUB (7)**: Directional stripes

## Bit Depth

Lower bit depth (smaller mask) quantizes the output into fewer steps, producing chunkier, more graphic results. 1-bit mask gives pure black/white patterns.
