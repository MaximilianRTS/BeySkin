"""Trace the grey sticker area of a template PNG into a polygon (mm).

Usage: python scripts/trace-outline.py path/to/template.png [width_mm height_mm]
Prints an SVG-style path. Needs opencv-python, numpy and pillow.
"""
import sys

import cv2
import numpy as np
from PIL import Image

KEY_COLOR = np.array([131, 146, 153])
SUPERSAMPLE = 8

img = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(float)
width_mm = float(sys.argv[2]) if len(sys.argv) > 2 else 111.55
height_mm = float(sys.argv[3]) if len(sys.argv) > 3 else 25.64

mask = (np.sqrt(((img - KEY_COLOR) ** 2).sum(-1)) < 60).astype(np.float32)
big = cv2.resize(cv2.GaussianBlur(mask, (5, 5), 1.3), None, fx=SUPERSAMPLE, fy=SUPERSAMPLE,
                 interpolation=cv2.INTER_LINEAR)
contours, _ = cv2.findContours((big > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
contour = max(contours, key=cv2.contourArea)
pts = cv2.approxPolyDP(contour, 0.75 * SUPERSAMPLE, True)[:, 0, :].astype(float) / SUPERSAMPLE

x0, y0 = pts.min(axis=0)
x1, y1 = pts.max(axis=0)
sx, sy = width_mm / (x1 - x0), height_mm / (y1 - y0)
print('M' + ' L'.join(f'{(x - x0) * sx:.2f} {(y - y0) * sy:.2f}' for x, y in pts) + ' Z')
