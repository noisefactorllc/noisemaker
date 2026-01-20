# 2D Oscillator

Generates animated 2D waveform patterns.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| oscType | int | sine | sine/linear/sawtooth/sawtoothInv/square/noise | Waveform shape |
| frequency | int | 1 | 1–32 | Number of complete oscillation cycles |
| speed | float | 4.0 | 0–10 | Animation speed along orthogonal axis |
| rotation | float | 0 | 0–360 | Rotation angle in degrees |
| seed | float | 0 | 0–1000 | Random seed for noise oscillator type |
