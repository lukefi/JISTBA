"""Drawing mask / ID / behaviour overlays on frames."""
import base64
import io
from pathlib import Path
from typing import Optional, Tuple, List
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException


_UNICODE_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def _load_unicode_font(size_px: int) -> ImageFont.ImageFont:
    for path in _UNICODE_FONT_PATHS:
        p = Path(path)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size_px)
            except OSError:
                continue
    return ImageFont.load_default()


def _draw_unicode_text_on_bgr(
    frame_bgr: np.ndarray,
    text: str,
    center_x: int,
    top_y: int,
    font_px: int = 15,
    fill_rgb: Tuple[int, int, int] = (0, 0, 0),
    outline_rgb: Optional[Tuple[int, int, int]] = (255, 255, 255),
    outline_width: int = 1,
) -> np.ndarray:
    if not text:
        return frame_bgr
    pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil)
    font = _load_unicode_font(font_px)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    x = int(center_x - text_w / 2)
    y = int(top_y)
    if outline_rgb and outline_width > 0:
        for ox in range(-outline_width, outline_width + 1):
            for oy in range(-outline_width, outline_width + 1):
                if ox == 0 and oy == 0:
                    continue
                draw.text((x + ox, y + oy), text, font=font, fill=outline_rgb)
    draw.text((x, y), text, font=font, fill=fill_rgb)
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


def draw_cow_overlay_with_behavior(
    frame: np.ndarray,
    mask: np.ndarray,
    cow_id: int,
    color: Tuple[int, int, int],
    behavior_lines: Optional[List[str]] = None,
    overlay_alpha: float = 0.4,
    id_font_scale: float = 0.8,
) -> np.ndarray:
    """Draw mask tint, cow ID, and behaviour labels (stacked) below the ID."""
    if not mask.any():
        return frame

    overlay = frame.copy()
    overlay[mask] = color
    frame = cv2.addWeighted(frame, 1.0 - overlay_alpha, overlay, overlay_alpha, 0)

    ys, xs = np.where(mask)
    cx, cy = int(xs.mean()), int(ys.mean())

    id_text = str(cow_id)
    thickness = 2
    (id_w, id_h), baseline = cv2.getTextSize(
        id_text, cv2.FONT_HERSHEY_SIMPLEX, id_font_scale, thickness
    )
    label_font_px = 14
    label_line_gap = 3
    lines = [ln for ln in (behavior_lines or []) if ln]
    labels_block_h = len(lines) * (label_font_px + label_line_gap) if lines else 0
    stack_gap = 4
    stack_h = id_h + (stack_gap + labels_block_h if lines else 0)
    id_y = cy + id_h // 2 - stack_h // 2 + id_h
    id_x = cx - id_w // 2

    cv2.putText(
        frame,
        id_text,
        (id_x, id_y),
        cv2.FONT_HERSHEY_SIMPLEX,
        id_font_scale,
        (0, 0, 0),
        thickness + 1,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        id_text,
        (id_x, id_y),
        cv2.FONT_HERSHEY_SIMPLEX,
        id_font_scale,
        (255, 255, 255),
        thickness,
        cv2.LINE_AA,
    )

    y = id_y + stack_gap
    for line in lines:
        frame = _draw_unicode_text_on_bgr(
            frame,
            line,
            cx,
            y,
            font_px=label_font_px,
            fill_rgb=(0, 0, 0),
            outline_rgb=(255, 255, 255),
            outline_width=1,
        )
        y += label_font_px + label_line_gap

    return frame


def masks_to_label_map(masks_bool):
    H, W = masks_bool[0].shape
    label = np.zeros((H, W), dtype=np.uint8)
    for i, m in enumerate(masks_bool, start=1):
        label[m] = i
    return label


def random_color(seed: int):
    rng = np.random.RandomState(seed)
    return tuple(int(x) for x in rng.randint(50, 255, size=3))


# -------------------------
# Helper functions for common operations
# -------------------------

def get_color_for_id(id: int, min_val: int = 50) -> Tuple[int, int, int]:
    """
    Get a consistent color for a given ID.
    Uses RandomState to ensure same ID always gets same color.
    
    Args:
        id: The ID to get a color for
        min_val: Minimum RGB value (default 50 for better visibility)
    
    Returns:
        Tuple of (R, G, B) values
    """
    rng = np.random.RandomState(id)
    return tuple(int(x) for x in rng.randint(min_val, 255, size=3))


def id_palette() -> List[int]:
    """Flat 256-entry RGB palette: 0 = black background, ID n = get_color_for_id(n).

    get_color_for_id colors are drawn onto BGR frames, so they are reversed here
    to match the golden preview video.
    """
    palette = [0, 0, 0]
    for i in range(1, 256):
        b, g, r = get_color_for_id(i)
        palette.extend((r, g, b))
    return palette


def label_png_to_palette_bytes(png_path: Path) -> Optional[bytes]:
    """Re-encode a single-channel ID label PNG as a palette PNG (pixel values unchanged).

    Returns None if the image is not an 8-bit label map.
    """
    with Image.open(png_path) as img:
        if img.mode not in ("L", "P"):
            return None
        indexed = Image.frombytes("P", img.size, img.tobytes())
    indexed.putpalette(id_palette())
    buf = io.BytesIO()
    indexed.save(buf, format="PNG")
    return buf.getvalue()


def encode_frame_to_base64(frame: np.ndarray, quality: int = 90) -> str:
    """
    Encode a frame (numpy array) to base64 JPEG string.
    
    Args:
        frame: Frame as numpy array (BGR format from cv2)
        quality: JPEG quality (0-100)
    
    Returns:
        Base64-encoded JPEG string
    
    Raises:
        HTTPException: If encoding fails
    """
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise HTTPException(status_code=500, detail="failed to encode frame")
    return base64.b64encode(buf.tobytes()).decode('utf-8')


def render_mask_overlay(frame: np.ndarray, mask: np.ndarray, mask_id: int, color: Tuple[int, int, int], 
                        alpha: float = 0.4, font_scale: float = 0.8) -> np.ndarray:
    """
    Render a mask overlay on a frame with ID label.
    
    Args:
        frame: Frame as numpy array (BGR format)
        mask: Boolean mask array
        mask_id: ID to display on mask
        color: RGB color tuple for overlay
        alpha: Overlay transparency (0.0-1.0)
        font_scale: Font scale for ID text
    
    Returns:
        Frame with mask overlay and ID label
    """
    if not mask.any():
        return frame
    
    overlay = frame.copy()
    overlay[mask] = color
    frame = cv2.addWeighted(frame, 1.0 - alpha, overlay, alpha, 0)
    
    # Add ID label at centroid
    ys, xs = np.where(mask)
    if len(ys) > 0:
        cx, cy = int(xs.mean()), int(ys.mean())
        text = str(mask_id)
        thickness = 2
        (text_width, text_height), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
        text_x = cx - text_width // 2
        text_y = cy + text_height // 2
        
        cv2.putText(
            frame,
            text,
            (text_x, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (255, 255, 255),
            thickness,
            cv2.LINE_AA,
        )
    
    return frame
