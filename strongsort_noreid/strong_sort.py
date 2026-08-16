import numpy as np
from .tracker import Tracker
from .utils import xywh_to_xyxy


class StrongSORT:
    """
    Simplified StrongSORT-like tracker without TorchReID.

    - No deep re-identification
    - Just IOU-based association frame-to-frame
    - Still gives stable track IDs across frames (as long as IOU matches)
    """

    def __init__(
        self,
        model_weights=None,   # kept for API compatibility
        device="cpu",
        max_age=30,
        max_iou_dist=0.7,
        nn_budget=100,
        **kwargs
    ):
        # We ignore model_weights, device, nn_budget in this simplified version
        self.tracker = Tracker(max_age=max_age, iou_threshold=max_iou_dist)

    def update(self, detections, frame):
        """
        detections = [ ([x,y,w,h], confidence, class_name), ... ]
        frame is unused here but kept for API compatibility.

        Returns a list of track-like objects with:
          - track_id
          - tlbr  (x1,y1,x2,y2)
          - det_class
          - to_ltrb() method
        """
        det_list = []
        for det in detections:
            (x, y, w, h), conf, cls_name = det
            xyxy = xywh_to_xyxy(x, y, w, h)
            det_list.append({
                'bbox': xyxy,
                'conf': conf,
                'cls': cls_name
            })

        tracks = self.tracker.update(det_list)

        # Tracker.Track already has track_id, tlbr, det_class and to_tlbr()
        # draw_and_encode in your main code uses:
        #   track.track_id
        #   track.tlbr or track.to_ltrb()
        #   getattr(track, "det_class", "obj")
        return tracks
