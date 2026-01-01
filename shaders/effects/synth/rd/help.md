# Reaction-Diffusion

Gray-Scott reaction-diffusion simulation.

## Description

Implements the Gray-Scott model of reaction-diffusion, producing organic, self-organizing patterns. The simulation models two virtual chemicals that diffuse and react, creating spots, stripes, and complex patterns depending on the feed and kill rates.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Texture input for modulation |
| resetState | boolean | false | — | Reset the simulation state |
| seed | int | 1 | 1–100 | Random seed for initial state |
| iterations | int | 8 | 1–32 | Simulation steps per frame |
| sourceF | int | slider | slider, sliderInput, brightness, darkness, red, green, blue | Feed value source |
| feed | float | 18 | 10–110 | Feed rate value |
| sourceK | int | slider | slider, sliderInput, brightness, darkness, red, green, blue | Kill value source |
| kill | float | 51 | 45–70 | Kill rate value |
| sourceR1 | int | slider | slider, sliderInput, brightness, darkness, red, green, blue | Diffusion rate 1 source |
| rate1 | float | 111 | 50–120 | Diffusion rate 1 value |
| sourceR2 | int | slider | slider, sliderInput, brightness, darkness, red, green, blue | Diffusion rate 2 source |
| rate2 | float | 24 | 20–50 | Diffusion rate 2 value |
| weight | float | 50 | 0–100 | Input texture weight |
| speed | float | 100 | 10–145 | Simulation speed |
| zoom | int | 8 | x1, x2, x4, x8, x16, x32, x64 | Simulation zoom level |
| smoothing | int | linear | constant, linear, hermite, catmullRom3x3, catmullRom4x4, bSpline3x3, bSpline4x4 | Output interpolation mode |
