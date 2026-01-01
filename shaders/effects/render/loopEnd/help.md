## Parameters

This effect has no user-configurable parameters.

## Description

End an accumulator feedback loop started by `loopBegin()`. Writes the chain result back to the shared accumulator buffer, completing the feedback loop.

## Usage

```
loopBegin(alpha: 50).blur().loopEnd()
```

The processed result is written back to the same accumulator texture that `loopBegin()` reads from, creating a temporal feedback loop.
