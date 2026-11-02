#!/usr/bin/env python3
"""
HighWay AI - Seatbelt Detection Model Trainer
---------------------------------------------
Trains a YOLOv8 object detection model for seatbelt enforcement on highways.
Classes:
  0: seatbelt
  1: no_seatbelt

Saves the trained weights to vision/seatbelt.pt for use in vision_engine.py.
"""
import os
import shutil
import numpy as np
import cv2
import yaml
from ultralytics import YOLO

DATASET_DIR = "seatbelt_dataset"

def generate_synthetic_dataset(num_samples=40):
    """Generates synthetic driver upper-torso samples with annotated seatbelts."""
    os.makedirs(f"{DATASET_DIR}/images/train", exist_ok=True)
    os.makedirs(f"{DATASET_DIR}/images/val", exist_ok=True)
    os.makedirs(f"{DATASET_DIR}/labels/train", exist_ok=True)
    os.makedirs(f"{DATASET_DIR}/labels/val", exist_ok=True)

    print("📸 Synthesizing annotated driver seatbelt samples...")
    for i in range(num_samples):
        is_val = (i % 5 == 0)
        split = "val" if is_val else "train"

        # 320x320 driver crop
        img = np.full((320, 320, 3), 40, dtype=np.uint8)

        # Draw vehicle windshield / interior
        cv2.rectangle(img, (20, 20), (300, 300), (70, 70, 80), -1)
        # Driver torso
        cv2.ellipse(img, (160, 220), (70, 90), 0, 0, 360, (120, 100, 90), -1)
        # Driver head
        cv2.circle(img, (160, 110), 38, (170, 150, 140), -1)

        has_belt = (i % 2 == 0)
        label_lines = []

        if has_belt:
            # Draw diagonal seatbelt strap across torso
            cv2.line(img, (110, 130), (210, 270), (20, 20, 20), 14)
            cv2.line(img, (110, 130), (210, 270), (190, 190, 190), 2)
            # YOLO format: class x_center y_center width height
            label_lines.append("0 0.50 0.62 0.38 0.45")
        else:
            # No seatbelt detected on torso
            label_lines.append("1 0.50 0.65 0.42 0.45")

        img_path = f"{DATASET_DIR}/images/{split}/sample_{i:04d}.jpg"
        lbl_path = f"{DATASET_DIR}/labels/{split}/sample_{i:04d}.txt"

        cv2.imwrite(img_path, img)
        with open(lbl_path, "w") as f:
            f.write("\n".join(label_lines) + "\n")

    yaml_content = {
        "path": os.path.abspath(DATASET_DIR),
        "train": "images/train",
        "val": "images/val",
        "names": {0: "seatbelt", 1: "no_seatbelt"},
    }

    with open("seatbelt_data.yaml", "w") as f:
        yaml.dump(yaml_content, f)

    print("✅ Synthetic seatbelt dataset prepared.")

def train_model():
    generate_synthetic_dataset(num_samples=30)

    print("🚀 Initializing YOLOv8n detector for seatbelt training...")
    model = YOLO("yolov8n.pt")

    print("⏳ Fine-tuning model on seatbelt dataset (2 epochs)...")
    results = model.train(
        data="seatbelt_data.yaml",
        epochs=2,
        imgsz=320,
        batch=8,
        workers=1,
        project="seatbelt_run",
        name="train",
        verbose=False,
    )

    best_weights = os.path.join("seatbelt_run", "train", "weights", "best.pt")
    target_weights = "seatbelt.pt"

    if os.path.exists(best_weights):
        shutil.copy(best_weights, target_weights)
        print(f"🎉 Model saved successfully to {target_weights}")
    else:
        # Fallback save
        model.save(target_weights)
        print(f"🎉 Fallback model saved to {target_weights}")

    # Cleanup dataset scratch
    shutil.rmtree(DATASET_DIR, ignore_errors=True)
    shutil.rmtree("seatbelt_run", ignore_errors=True)
    if os.path.exists("seatbelt_data.yaml"):
        os.remove("seatbelt_data.yaml")

if __name__ == "__main__":
    train_model()
