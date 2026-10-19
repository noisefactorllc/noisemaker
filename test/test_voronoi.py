"""Python voronoi checks that do not call the JavaScript port."""

import pytest

from noisemaker import generators, rng, value
from noisemaker.constants import ColorSpace, DistanceMetric, VoronoiDiagramType

SEEDS = [3626764237, 1654615998]


@pytest.mark.parametrize("channels", [1, 3])
@pytest.mark.parametrize("dist_metric", DistanceMetric.all())
def test_color_flow_returns_input_shape(dist_metric, channels):
    rng.set_seed(SEEDS[0])
    value.set_seed(SEEDS[0])
    shape = [128, 128, channels]
    tensor = generators.basic(2, shape, color_space=ColorSpace.grayscale if channels == 1 else ColorSpace.hsv)

    out = value.voronoi(tensor, shape, diagram_type=VoronoiDiagramType.color_flow, dist_metric=dist_metric)

    assert tuple(out.shape) == tuple(shape)
