from flask import Flask, request, jsonify
import mysql.connector

app = Flask(__name__)

# ---- MySQL Connection ----
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="Sagar@12345",
    database="factory_ai_detection"
)
cursor = db.cursor()

@app.route("/save_assignment", methods=["POST"])
def save_assignment():
    data = request.json
    
    vehicle = data["vehicle"]
    camera = data["camera"]
    in_time = data["in_time"]
    date = data["date"]

    query = "INSERT INTO camera_assignments (vehicle_no, camera_name, in_time, date) VALUES (%s, %s, %s, %s)"
    values = (vehicle, camera, in_time, date)

    cursor.execute(query, values)
    db.commit()

    return jsonify({"status": "success", "message": "Data saved to MySQL"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
