# loopBegin

Start accumulator loop, read from feedback buffer

## Description

Reads from a shared accumulator buffer and blends with the incoming texture using lighten (max) mode. Use `loopEnd()` to complete the feedback loop.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| alpha | float | 50 | 0-100 | Alpha |
| intensity | float | 100 | 0-100 | Intensity |
