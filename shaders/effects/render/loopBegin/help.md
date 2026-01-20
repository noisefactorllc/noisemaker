# Loop Begin

Start an accumulator feedback loop.

## Description

Reads from a shared accumulator buffer and blends with the incoming texture using lighten (max) mode. Use `loopEnd()` to complete the feedback loop.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| alpha | float | 50 | 0–100 | Blend alpha for accumulation |
| intensity | float | 100 | 0–100 | Intensity of accumulated feedback |

## Usage

```
loopBegin(alpha: 50).blur().loopEnd()
```

This is equivalent to manually setting up:
```
noise().write(o0)
read(o1).lighten(tex: read(o0)).blur().write(o1)
```
