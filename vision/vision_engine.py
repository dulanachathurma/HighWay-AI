"""
HighWay AI - Edge Vision Engine (Sri Lanka Southern Expressway Edition)
------------------------------------------------------------------------
Reads a camera / video, then for every vehicle:
  1. tracks it (YOLO + ByteTrack)          -> stable ID
  2. measures speed between two lines      -> km/h
  3. reads the Sri Lankan plate (EasyOCR)  -> "WP CAB-1234"
  4. checks seatbelt (YOLO seatbelt model) -> YES / NO
Draws highway enforcement boxes, streams frames to backend,
and reports violations (speed > limit OR seatbelt == NO).

Run:  python vision_engine.py --source highway.mp4 --demo --show
"""
import argparse
import base64
import os
import random
import re
import time
from collections import defaultdict

import cv2
import requests
import socketio
from ultralytics import YOLO

# BGR colours (Southern Expressway Theme)
CYAN = (255, 255, 0)
RED = (0, 0, 255)
YELLOW = (0, 255, 255)
GREEN = (0, 220, 100)

# COCO class ids: car, motorcycle, bus, truck
VEHICLE_CLASS_IDS = [2, 3, 5, 7]

SRI_LANKAN_PROVINCES = ["WP", "SP", "CP", "NW", "NC", "UP", "SG", "NP", "EP"]
SRI_LANKAN_SERIES = ["CAB", "CAA", "CAD", "CBA", "CBC", "CAR", "KU", "GA", "BZ", "KV", "PH"]


def parse_args():
    p = argparse.ArgumentParser(description="HighWay AI edge vision engine")
    p.add_argument("--source", default="0", help="video file, RTSP url or camera index")
    p.add_argument("--node-id", default="NODE-01", help="camera node name (see backend/config.js)")
    p.add_argument("--backend", default="http://localhost:4000")
    p.add_argument("--api-key", default="highway-secret-key")
    p.add_argument("--model", default="yolov8n.pt", help="vehicle detector")
    p.add_argument("--seatbelt-model", default="seatbelt.pt", help="custom seatbelt model (e.g. seatbelt.pt)")
    p.add_argument("--speed-limit", type=int, default=100)
    p.add_argument("--line-a", type=float, default=0.45, help="first speed line (fraction of frame height)")
    p.add_argument("--line-b", type=float, default=0.75, help="second speed line (fraction of frame height)")
    p.add_argument("--distance-m", type=float, default=20.0, help="REAL distance between the two lines in metres")
    p.add_argument("--demo", action="store_true", help="Sri Lankan plates + simulated/model seatbelt")
    p.add_argument("--gpu", action="store_true")
    p.add_argument("--show", action="store_true", help="open an OpenCV preview window")
    p.add_argument("--no-stream", action="store_true", help="do not send live frames to the dashboard")
    p.add_argument("--fast", action="store_true", help="process video as fast as possible")
    return p.parse_args()


class TrackState:
    """Everything we know about one tracked vehicle."""

    def __init__(self):
        self.prev_y = None
        self.cross_a = None
        self.cross_b = None
        self.speed = None        # km/h
        self.plate = None
        self.plate_tries = 0
        self.seatbelt = None     # True / False / None (unknown)
        self.belt_tries = 0
        self.sent_speed = False
        self.sent_belt = False
        self.sent_sighting = False
        self.frames = 0


def crossed(prev_y, cur_y, line_y):
    """True when vehicle crossed horizontal line between two frames."""
    return prev_y != cur_y and (prev_y - line_y) * (cur_y - line_y) <= 0


def update_speed(state, y, now, line_a, line_b, distance_m):
    """Speed = distance / time taken."""
    if state.prev_y is not None and state.speed is None:
        if state.cross_a is None and crossed(state.prev_y, y, line_a):
            state.cross_a = now
        if state.cross_b is None and crossed(state.prev_y, y, line_b):
            state.cross_b = now
        if state.cross_a is not None and state.cross_b is not None:
            seconds = abs(state.cross_b - state.cross_a)
            if seconds > 0.05:
                state.speed = round(distance_m / seconds * 3.6)
    state.prev_y = y


def clean_sri_lankan_plate(text):
    """Clean and standardize Sri Lankan plate string (e.g. 'WP CAB-1234' or 'CAB-1234')."""
    if not text:
        return None
    raw = re.sub(r"[^A-Z0-9]", "", text.upper())
    if len(raw) < 5:
        return None

    # Try matching province + series + number
    prov_pattern = f"^({'|'.join(SRI_LANKAN_PROVINCES)})([A-Z]{{2,3}}|\\d{{2,3}})(\\d{{4}})$"
    m = re.match(prov_pattern, raw)
    if m:
        return f"{m.group(1)} {m.group(2)}-{m.group(3)}"

    # Match series + number
    std_pattern = r"^([A-Z]{2,3}|\d{2,3})(\d{4})$"
    m2 = re.match(std_pattern, raw)
    if m2:
        return f"{m2.group(1)}-{m2.group(2)}"

    # Fallback to uppercase alphanumeric
    return raw


def read_plate(reader, frame, box):
    """OCR the lower part of the vehicle where Sri Lankan plates are located."""
    x1, y1, x2, y2 = box
    crop = frame[int(y1 + (y2 - y1) * 0.55):y2, x1:x2]
    if crop.size == 0:
        return None
    best = None
    for _, text, conf in reader.readtext(crop):
        cleaned = clean_sri_lankan_plate(text)
        if cleaned and conf > 0.35 and (best is None or conf > best[1]):
            best = (cleaned, conf)
    return best[0] if best else None


def check_seatbelt(belt_model, frame, box, track_id, demo):
    """Check driver seatbelt status using trained model or fallback simulation."""
    if belt_model is not None:
        try:
            x1, y1, x2, y2 = box
            # Driver upper torso is located in upper-middle half
            crop = frame[y1:y1 + (y2 - y1) // 2, x1:x2]
            if crop.size > 0:
                result = belt_model(crop, verbose=False, conf=0.25)[0]
                if result.boxes and len(result.boxes.cls) > 0:
                    names = [result.names[int(c)] for c in result.boxes.cls]
                    if "no_seatbelt" in names:
                        return False
                    if "seatbelt" in names:
                        return True
        except Exception:
            pass

    if demo:
        # Deterministic per vehicle for demo: ~18% vehicles without seatbelt
        return random.Random(track_id * 13).random() > 0.18

    return None


def to_base64_jpg(img, quality=60):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode() if ok else ""


def post(args, path, payload):
    """HTTP call to backend API."""
    try:
        requests.post(f"{args.backend}{path}", json=payload,
                      headers={"x-api-key": args.api_key}, timeout=3)
    except requests.RequestException as err:
        print(f"[warn] backend unreachable: {err}")


def connect_stream(args):
    if args.no_stream:
        return None
    sio = socketio.Client(reconnection=True)
    try:
        sio.connect(args.backend)
        return sio
    except Exception as err:
        print(f"[warn] live stream disabled: {err}")
        return None


def draw_vehicle(frame, box, track_id, state, speed_limit):
    """Draws box and labels. Turns red if speeding or no seatbelt."""
    x1, y1, x2, y2 = box
    speeding = state.speed is not None and state.speed > speed_limit
    no_belt = state.seatbelt is False
    colour = RED if (speeding or no_belt) else CYAN

    speed_txt = f"{state.speed}" if state.speed is not None else "--"
    belt_txt = "--" if state.seatbelt is None else ("YES" if state.seatbelt else "NO")
    label = f"ID: {track_id} | Speed: {speed_txt}km/h | Seatbelt: {belt_txt}"

    cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
    cv2.rectangle(frame, (x1, y1 - 44), (x1 + 8 * len(label) + 8, y1), colour, -1)
    cv2.putText(frame, label, (x1 + 4, y1 - 26), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.putText(frame, f"LK Plate: {state.plate or '--'}", (x1 + 4, y1 - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 1, cv2.LINE_AA)


def main():
    args = parse_args()

    detector = YOLO(args.model)
    belt_model = None
    if os.path.exists(args.seatbelt_model):
        try:
            belt_model = YOLO(args.seatbelt_model)
            print(f"✅ Loaded trained seatbelt model: {args.seatbelt_model}")
        except Exception as e:
            print(f"[warn] Could not load seatbelt model: {e}")

    reader = None
    if not args.demo:
        import easyocr
        reader = easyocr.Reader(["en"], gpu=args.gpu)

    sio = connect_stream(args)

    source = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(source)
    is_file = os.path.isfile(str(args.source))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25

    states = defaultdict(TrackState)
    frame_no = 0
    run_salt = random.randint(100, 999)
    print(f"[{args.node_id}] Southern Expressway engine running... Press Q in preview to exit")

    while True:
        loop_start = time.time()
        ok, frame = cap.read()
        if not ok:
            break
        frame_no += 1
        now = frame_no / fps if is_file else time.time()
        height = frame.shape[0]
        line_a, line_b = int(height * args.line_a), int(height * args.line_b)

        result = detector.track(frame, persist=True, tracker="bytetrack.yaml",
                                classes=VEHICLE_CLASS_IDS, conf=0.4, verbose=False)[0]

        if result.boxes.id is not None:
            boxes = result.boxes.xyxy.int().tolist()
            ids = result.boxes.id.int().tolist()
            for box, track_id in zip(boxes, ids):
                box = [max(0, v) for v in box]
                state = states[track_id]
                state.frames += 1

                # 1) Speed
                update_speed(state, box[3], now, line_a, line_b, args.distance_m)

                # 2) Sri Lankan Plate (realistic demo or OCR)
                if state.plate is None and state.plate_tries < 6 and state.frames % 8 == 0:
                    state.plate_tries += 1
                    if args.demo:
                        prov = SRI_LANKAN_PROVINCES[(track_id + run_salt) % len(SRI_LANKAN_PROVINCES)]
                        series = SRI_LANKAN_SERIES[(track_id * 3 + run_salt) % len(SRI_LANKAN_SERIES)]
                        num = 1000 + (track_id * 73 + run_salt * 17) % 9000
                        state.plate = f"{prov} {series}-{num}"
                    else:
                        state.plate = read_plate(reader, frame, box)

                # 3) Seatbelt (using trained model or fallback)
                if state.seatbelt is None and state.belt_tries < 5 \
                        and (box[2] - box[0]) > 100 and state.frames % 6 == 0:
                    state.belt_tries += 1
                    state.seatbelt = check_seatbelt(belt_model, frame, box, track_id + run_salt, args.demo)

                # 4) Send sightings and violations to backend
                if state.plate:
                    if not state.sent_sighting:
                        state.sent_sighting = True
                        post(args, "/api/sightings", {
                            "plate": state.plate,
                            "nodeId": args.node_id,
                            "timestamp": int(time.time() * 1000)
                        })

                    evidence = to_base64_jpg(frame[box[1]:box[3], box[0]:box[2]], 50)
                    if state.speed and state.speed > args.speed_limit and not state.sent_speed:
                        state.sent_speed = True
                        post(args, "/api/violations", {
                            "plate": state.plate,
                            "type": "SPEED",
                            "speed_kmh": state.speed,
                            "nodeId": args.node_id,
                            "evidence": evidence
                        })
                    if state.seatbelt is False and not state.sent_belt:
                        state.sent_belt = True
                        post(args, "/api/violations", {
                            "plate": state.plate,
                            "type": "SEATBELT",
                            "speed_kmh": state.speed,
                            "nodeId": args.node_id,
                            "evidence": evidence
                        })

                draw_vehicle(frame, box, track_id, state, args.speed_limit)

        # Draw expressway speed calibration lines
        cv2.line(frame, (0, line_a), (frame.shape[1], line_a), YELLOW, 2)
        cv2.line(frame, (0, line_b), (frame.shape[1], line_b), YELLOW, 2)
        cv2.putText(frame, f"E01 Southern Expressway | {args.node_id} | Speed Limit {args.speed_limit} km/h",
                    (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, GREEN, 2, cv2.LINE_AA)

        # Live feed stream to dashboard
        if sio and sio.connected and frame_no % 2 == 0:
            small = cv2.resize(frame, (960, int(960 * frame.shape[0] / frame.shape[1])))
            sio.emit("frame", {"nodeId": args.node_id, "image": to_base64_jpg(small)})

        if is_file and sio and not args.fast:
            time.sleep(max(0, 1 / fps - (time.time() - loop_start)))

        if args.show:
            cv2.imshow("HighWay AI - Sri Lanka", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()
    if sio:
        sio.disconnect()


if __name__ == "__main__":
    main()
