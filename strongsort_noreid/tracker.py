from .utils import iou


class Track:
    def __init__(self, track_id, tlbr, cls_name):
        self.track_id = track_id
        self.tlbr = tlbr  # [x1, y1, x2, y2]
        self.det_class = cls_name

        self.age = 0
        self.time_since_update = 0
        self.hits = 1  # number of detections associated to this track

    def update(self, tlbr, cls_name):
        self.tlbr = tlbr
        self.det_class = cls_name
        self.time_since_update = 0
        self.hits += 1

    def to_tlbr(self):
        return self.tlbr


class Tracker:
    """
    Very simple IOU-based tracker:
      - keeps a list of tracks
      - for each new frame, matches detections to existing tracks by IOU
      - creates new tracks for unmatched detections
      - deletes old tracks after max_age frames without updates
    """

    def __init__(self, max_age=30, iou_threshold=0.3):
        self.max_age = max_age
        self.iou_threshold = iou_threshold
        self.tracks = []
        self._next_id = 1

    def _create_track(self, tlbr, cls_name):
        t = Track(self._next_id, tlbr, cls_name)
        self._next_id += 1
        self.tracks.append(t)

    def update(self, detections):
        """
        detections: list of dicts with:
          {'bbox': [x1,y1,x2,y2], 'conf': float, 'cls': str}
        """
        # Increase age and time_since_update for all tracks
        for t in self.tracks:
            t.age += 1
            t.time_since_update += 1

        if len(detections) == 0:
            # Just prune old tracks
            self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
            return self.tracks

        det_bboxes = [d['bbox'] for d in detections]
        det_classes = [d['cls'] for d in detections]

        # If no existing tracks, create tracks for all detections
        if len(self.tracks) == 0:
            for bbox, cls_name in zip(det_bboxes, det_classes):
                self._create_track(bbox, cls_name)
            return self.tracks

        # Build IOU matrix: tracks x detections
        iou_matrix = []
        for t in self.tracks:
            row = []
            for bbox in det_bboxes:
                row.append(iou(t.tlbr, bbox))
            iou_matrix.append(row)

        # Greedy matching
        used_tracks = set()
        used_dets = set()

        # Flatten (track, det, iou) and sort by iou desc
        matches = []
        for ti, row in enumerate(iou_matrix):
            for di, val in enumerate(row):
                matches.append((val, ti, di))
        matches.sort(reverse=True, key=lambda x: x[0])

        for val, ti, di in matches:
            if val < self.iou_threshold:
                break
            if ti in used_tracks or di in used_dets:
                continue
            # associate this detection with this track
            used_tracks.add(ti)
            used_dets.add(di)
            self.tracks[ti].update(det_bboxes[di], det_classes[di])

        # Unmatched detections -> new tracks
        for di, bbox in enumerate(det_bboxes):
            if di not in used_dets:
                cls_name = det_classes[di]
                self._create_track(bbox, cls_name)

        # Remove old tracks
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]

        return self.tracks
