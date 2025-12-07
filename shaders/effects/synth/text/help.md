# Text

Text renderer. Displays text as a texture. Text is rendered to a 2D canvas on the CPU side and uploaded as a texture to the shader.

## Parameters

Text parameters are controlled via the UI module and applied during CPU-side text rendering. The shader displays the pre-rendered texture.

## Usage

```dsl
text().write(o0)
```

## Notes

This effect requires external text input configured through the UI. The shader itself has no configurable parameters.
