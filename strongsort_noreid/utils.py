import numpy as np


def xywh_to_xyxy(x, y, w, h):
    """Convert [x, y, w, h] to [x1, y1, x2, y2]."""
    return [x, y, x + w, y + h]


def xyxy_to_tlwh(xyxy):
    """Convert [x1, y1, x2, y2] to [x, y, w, h]."""
    x1, y1, x2, y2 = xyxy
    return [x1, y1, x2 - x1, y2 - y1]


def iou(b1, b2):
    """
    Intersection over Union of two boxes [x1, y1, x2, y2].
    """
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])

    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter = inter_w * inter_h

    area1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    area2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])

    union = area1 + area2 - inter + 1e-6
    return inter / union
