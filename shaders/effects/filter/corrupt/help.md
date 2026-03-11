# corrupt

Scanline-based data corruption with pixel sorting, byte shifting, and bit manipulation

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| intensity | float | 50 | 0-100 | Corruption probability per scanline |
| bandHeight | float | 10 | 1-100 | Scanline grouping height |
| sort | float | 50 | 0-100 | Pixel sorting amount |
| shift | float | 50 | 0-100 | Horizontal byte shifting |
| channelShift | float | 0 | 0-100 | RGB channel separation |
| melt | float | 0 | 0-100 | Vertical drip displacement |
| scatter | float | 0 | 0-100 | Per-pixel random displacement |
| bits | float | 0 | 0-100 | Bit manipulation and quantization |
| speed | int | 1 | 0-5 | Animation speed |
| seed | int | 1 | 1-100 | Random seed |
