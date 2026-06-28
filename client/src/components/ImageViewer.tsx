import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { ArrowLeft, Minus, Plus, RotateCcw } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

interface ImageViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

export default function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    setDragStart(null);
    setImageFailed(false);
    closeRef.current?.focus();
  }, [src]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const updateScale = (nextScale: number): void => {
    const clamped = clampScale(nextScale);
    setScale(clamped);
    if (clamped === MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
    }
  };

  const reset = (): void => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    setDragStart(null);
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    updateScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (scale <= MIN_SCALE) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragStart) {
      return;
    }
    setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
  };

  const stopDrag = (): void => {
    setDragStart(null);
  };

  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <button ref={closeRef} className="image-viewer-back" type="button" onClick={onClose}>
        <ArrowLeft aria-hidden="true" size={18} />
        返回
      </button>
      <div
        className={dragStart ? "image-viewer-stage dragging" : "image-viewer-stage"}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {imageFailed ? (
          <div className="image-viewer-error" role="status">图片暂时无法查看</div>
        ) : (
          <img
            className="image-viewer-image"
            src={src}
            alt={alt}
            onError={() => setImageFailed(true)}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
            }}
          />
        )}
      </div>
      <div className="image-viewer-controls" aria-label="图片缩放控制">
        <button
          type="button"
          aria-label="缩小"
          onClick={() => updateScale(scale - SCALE_STEP)}
          disabled={scale <= MIN_SCALE}
        >
          <Minus aria-hidden="true" size={18} />
        </button>
        <button type="button" aria-label="重置" onClick={reset}>
          <RotateCcw aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          aria-label="放大"
          onClick={() => updateScale(scale + SCALE_STEP)}
          disabled={scale >= MAX_SCALE}
        >
          <Plus aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}
