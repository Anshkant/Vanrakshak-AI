# 🌳 Vanrakshak AI

### AI Powered Forest Monitoring and Surveillance System

Vanrakshak AI is an AI based forest monitoring and surveillance system designed to assist in detecting and monitoring activities in forest environments using **Computer Vision, YOLO object detection, and real time camera streams**.

The system uses trained deep learning models to analyze camera feeds and detect relevant objects automatically. It also provides a **FastAPI based backend** for handling and serving the detection system.

---

## 🚀 Key Features

* 🔍 **AI based object detection**
* 🎥 **Multi camera monitoring**
* ⚡ **Real time video stream processing**
* 🧠 **YOLO based deep learning detection**
* 🌲 Designed for forest surveillance applications
* 🚨 Automated detection from camera feeds
* 🔌 FastAPI based backend
* ⚙️ Optimized multi camera processing
* 📊 Easy to extend with additional detection classes
* 💻 Local deployment support

---

## 🧠 Technology Stack

| Technology | Purpose                   |
| ---------- | ------------------------- |
| Python     | Core programming language |
| YOLOv8     | Object detection          |
| PyTorch    | Deep learning framework   |
| OpenCV     | Video processing          |
| FastAPI    | Backend/API               |
| Uvicorn    | FastAPI server            |
| NumPy      | Numerical processing      |

---

## 📂 Project Structure

```text
vanrakshak/
│
├── backend/
│   └── API and backend related files
│
├── database/
│   └── Database related components
│
├── strongsort_noreid/
│   └── Object tracking components
│
├── best.pt
│   └── Custom trained YOLO model
│
├── yolov8n.pt
│   └── YOLOv8 Nano pretrained model
│
├── det1.py
│   └── Detection implementation
│
├── det2.py
│   └── Detection implementation
│
├── det3.py
│   └── Detection implementation
│
└── multicam_fastapi_optimized.py
    └── Optimized multi camera detection with FastAPI
```

---

## 🔬 How It Works

The overall system follows the following pipeline:

```text
Camera / Video Stream
        │
        ▼
   Video Capture
        │
        ▼
   Frame Processing
        │
        ▼
   YOLO Object Detection
        │
        ▼
 Object Tracking / Analysis
        │
        ▼
 Detection Results
        │
        ▼
 FastAPI Backend
        │
        ▼
 Monitoring / Application
```

The camera stream is continuously processed frame by frame. The YOLO model identifies objects present in the scene, while the tracking component can maintain object identities across multiple frames.

---

## 🎯 AI Model

The project uses **YOLOv8** for real time object detection.

### Models

* `yolov8n.pt` — YOLOv8 Nano pretrained model
* `best.pt` — Custom trained model used for the project's specific detection requirements

The custom model can be replaced or retrained depending on the required forest monitoring use case.

---

## 🎥 Multi Camera Monitoring

Vanrakshak AI supports processing multiple camera streams.

The optimized implementation:

```text
Camera 1 ──┐
Camera 2 ──┤
Camera 3 ──┼──► AI Detection Pipeline ──► Results
Camera N ──┘
```

The multi camera architecture makes the system suitable for monitoring multiple locations simultaneously.

---

## ⚡ FastAPI Backend

The project includes a FastAPI based backend for serving the AI detection system.

The optimized implementation is available in:

```text
multicam_fastapi_optimized.py
```

FastAPI provides a lightweight interface that can be extended to integrate the AI detection engine with:

* Web dashboards
* Monitoring applications
* Mobile applications
* External APIs
* Alert systems

---

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Anshkant/Vanrakshak-AI.git
cd Vanrakshak-AI
```

### 2. Create a Virtual Environment

```bash
python -m venv venv
```

### 3. Activate the Environment

#### Windows

```bash
venv\Scripts\activate
```

#### Linux / macOS

```bash
source venv/bin/activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## ▶️ Running the Project

For individual detection scripts:

```bash
python det1.py
```

or

```bash
python det2.py
```

or

```bash
python det3.py
```

For the optimized multi camera FastAPI implementation:

```bash
python multicam_fastapi_optimized.py
```

If using Uvicorn directly:

```bash
uvicorn multicam_fastapi_optimized:app --reload
```

---

## 📡 API

Once the FastAPI server is running, the API can be accessed locally through:

```text
http://127.0.0.1:8000
```

FastAPI also provides interactive API documentation:

```text
http://127.0.0.1:8000/docs
```

---

## 🌲 Potential Applications

Vanrakshak AI can be extended for several forest and environmental monitoring applications:

* Forest surveillance
* Wildlife monitoring
* Illegal activity detection
* Human presence detection
* Restricted area monitoring
* Remote camera surveillance
* Smart forest management
* Real time security monitoring

---

## 🔮 Future Improvements

The project can be further enhanced with:

* 🚨 Real time alert notifications
* 📱 Mobile application integration
* 🗺️ GPS based camera location tracking
* 📊 Monitoring dashboard
* ☁️ Cloud deployment
* 📹 RTSP/IP camera integration
* 🔔 Email/SMS/WhatsApp alerts
* 🧠 Improved custom YOLO models
* 👥 Advanced multi object tracking
* 💾 Detection history and analytics
* 🌐 Remote monitoring from anywhere

---

## 📈 Project Highlights

**Vanrakshak AI demonstrates the integration of:**

```text
Computer Vision
       +
Deep Learning
       +
Object Detection
       +
Object Tracking
       +
Multi Camera Processing
       +
FastAPI
       =
AI Based Forest Monitoring System
```

---

## 👨‍💻 Author

**Anshkant Malviya**

Computer Science Engineering

GitHub:
https://github.com/Anshkant

---

## ⭐ Support

If you find this project useful or interesting, consider giving the repository a ⭐ on GitHub.
