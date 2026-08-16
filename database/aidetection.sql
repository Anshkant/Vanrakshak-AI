CREATE DATABASE factory_ai_detection;
USE factory_ai_detection;


CREATE TABLE cameras (
    camera_id INT AUTO_INCREMENT PRIMARY KEY,
    camera_name VARCHAR(50),
    status ENUM('start', 'pause') DEFAULT 'pause',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO cameras (camera_name, status) VALUES
('Camera 1', 'pause'),
('Camera 2', 'pause'),
('Camera 3', 'pause'),
('Camera 4', 'pause');


CREATE TABLE trucks (
    truck_id INT AUTO_INCREMENT PRIMARY KEY,
    truck_no VARCHAR(50),
    camera_id INT,
    in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    out_time DATETIME,
    FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
);
INSERT INTO trucks (truck_no, camera_id) VALUES ('MH12AB1234', 2);


CREATE TABLE detections (
    detection_id INT AUTO_INCREMENT PRIMARY KEY,
    truck_id INT,
    camera_id INT,
    bags_count INT DEFAULT 0,
    boxes_count INT DEFAULT 0,
    total_count INT GENERATED ALWAYS AS (bags_count + boxes_count) STORED,
    detection_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (truck_id) REFERENCES trucks(truck_id),
    FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
);
INSERT INTO detections (truck_id, camera_id, bags_count, boxes_count)
VALUES (1, 2, 5, 7);

-- 📊 DASHBOARD PAGE QUERIES

-- You said dashboard must show count for today only (one day).

-- 🔹 Total Bags, Boxes, Trucks for today
SELECT 
    SUM(bags_count) AS total_bags,
    SUM(boxes_count) AS total_boxes,
    COUNT(DISTINCT truck_id) AS total_trucks
FROM detections
WHERE DATE(detection_time) = CURDATE();

-- 📊 REPORT PAGE QUERY

-- You already have this query:

SELECT 
    t.truck_no,
    c.camera_name,
    t.in_time,
    t.out_time,
    SUM(d.bags_count) AS total_bags,
    SUM(d.boxes_count) AS total_boxes,
    SUM(d.bags_count + d.boxes_count) AS total_count,
    DATE(d.detection_time) AS date
FROM detections d
JOIN trucks t ON d.truck_id = t.truck_id
JOIN cameras c ON d.camera_id = c.camera_id
GROUP BY t.truck_id, c.camera_id, DATE(d.detection_time)
ORDER BY d.detection_time DESC;

-- 🔹 Edit truck number or detection data (from report page)
UPDATE trucks SET truck_no = 'MH12AB4321' WHERE truck_id = 1;

UPDATE detections 
SET bags_count = 12, boxes_count = 9 
WHERE detection_id = 1;

-- ✅ Optional — Auto Reset for New Day (Dashboard)

-- If you want to clear data daily (optional):
DELETE FROM detections WHERE DATE(detection_time) < CURDATE();