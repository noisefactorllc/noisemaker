"""Python voronoi checks that do not call the JavaScript port."""

import numpy as np
import pytest
import tensorflow as tf

from noisemaker import generators, rng, value
from noisemaker.constants import ColorSpace, DistanceMetric, VoronoiDiagramType

SEEDS = [3626764237, 1654615998]


@pytest.mark.parametrize("channels", [1, 3])
def test_regions_returns_input_shape(channels):
    rng.set_seed(SEEDS[0])
    value.set_seed(SEEDS[0])
    shape = [128, 128, channels]
    tensor = generators.basic(2, shape, color_space=ColorSpace.grayscale if channels == 1 else ColorSpace.hsv)

    out = value.voronoi(tensor, shape, diagram_type=VoronoiDiagramType.regions)

    assert tuple(out.shape) == tuple(shape)


@pytest.mark.parametrize("channels", [1, 3])
@pytest.mark.parametrize("dist_metric", DistanceMetric.all())
def test_color_flow_returns_input_shape(dist_metric, channels):
    rng.set_seed(SEEDS[0])
    value.set_seed(SEEDS[0])
    shape = [128, 128, channels]
    tensor = generators.basic(2, shape, color_space=ColorSpace.grayscale if channels == 1 else ColorSpace.hsv)

    out = value.voronoi(tensor, shape, diagram_type=VoronoiDiagramType.color_flow, dist_metric=dist_metric)

    assert tuple(out.shape) == tuple(shape)


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("dist_metric", DistanceMetric.all())
def test_color_regions_take_the_color_under_their_point(dist_metric, seed):
    # Encode each pixel's own row and column in its color, so a region color tells where it was sampled.
    # A voronoi point is inside its own region, so the region color must also appear at that position.
    height = width = 128
    rows, columns = np.meshgrid(np.arange(height), np.arange(width), indexing="ij")
    coords = np.stack([rows / (height - 1), columns / (width - 1), np.zeros((height, width))], 2).astype(np.float32)

    rng.set_seed(seed)
    value.set_seed(seed)
    out = value.voronoi(tf.constant(coords), [height, width, 3], diagram_type=VoronoiDiagramType.color_regions, dist_metric=dist_metric).numpy()

    for color in np.unique(out.reshape(-1, 3), axis=0):
        row = int(round(color[0] * (height - 1)))
        column = int(round(color[1] * (width - 1)))
        assert np.allclose(out[row, column], color, atol=1e-6)
