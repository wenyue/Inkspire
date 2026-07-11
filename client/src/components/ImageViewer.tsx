import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;
const VIEWER_HISTORY_KEY = "__inkspireImageViewer";
const VIEWER_POP_EVENT = "inkspire:image-viewer-pop";

interface ImageViewerProps {
  src: string;
  alt: string;
  t: (key: string) => string;
  onClose: () => void;
}

function imageViewerHistoryState(current: unknown): Record<string, unknown> {
  return current && typeof current === "object"
    ? { ...(current as Record<string, unknown>), [VIEWER_HISTORY_KEY]: true }
    : { [VIEWER_HISTORY_KEY]: true };
}

function isImageViewerHistoryState(current: unknown): boolean {
  return Boolean(
    current
      && typeof current === "object"
      && (current as Record<string, unknown>)[VIEWER_HISTORY_KEY] === true
  );
}

export default function ImageViewer({ src, alt, t, onClose }: ImageViewerProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  const closeWithHistory = useCallback((): void => {
    if (isImageViewerHistoryState(window.history.state)) {
      window.history.back();
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    openRef.current = true;
    document.body.classList.add("image-viewer-open");
    window.history.pushState(imageViewerHistoryState(window.history.state), "", window.location.href);
    closeRef.current?.focus();
    return () => {
      openRef.current = false;
      document.body.classList.remove("image-viewer-open");
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!openRef.current) {
        return;
      }
      window.dispatchEvent(new CustomEvent(VIEWER_POP_EVENT));
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, [onClose]);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeWithHistory();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const candidates = Array.from(viewerRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])"
      ) ?? []);
      const visibleCandidates = candidates.filter((element) => element.getClientRects().length > 0);
      const focusable = visibleCandidates.length > 0 ? visibleCandidates : candidates;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWithHistory]);

  return (
    <div ref={viewerRef} className="image-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <button ref={closeRef} className="image-viewer-back" type="button" onClick={closeWithHistory}>
        <ArrowLeft aria-hidden="true" size={16} />
        {t("imageViewer.back")}
      </button>
      <TransformWrapper
        key={src}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        initialScale={MIN_SCALE}
        centerOnInit
        centerZoomedOut
        limitToBounds
        doubleClick={{ mode: "toggle", step: 1.5, animationTime: 160 }}
        pinch={{ step: 7, allowPanning: true }}
        panning={{ velocityDisabled: false }}
        wheel={{ step: SCALE_STEP }}
      >
        {({ zoomIn, zoomOut, resetTransform }: ReactZoomPanPinchContentRef) => (
          <>
            <div className="image-viewer-stage">
              {imageFailed ? (
                <div className="image-viewer-error" role="status">{t("imageViewer.error")}</div>
              ) : (
                <TransformComponent
                  wrapperClass="image-viewer-transform-wrapper"
                  contentClass="image-viewer-transform-content"
                >
                  <img
                    className="image-viewer-image"
                    src={src}
                    alt={alt}
                    onError={() => setImageFailed(true)}
                  />
                </TransformComponent>
              )}
            </div>
            <div className="image-viewer-mobile-hint" aria-hidden="true">{t("imageViewer.gestureHint")}</div>
            <button
              type="button"
              className="image-viewer-mobile-reset"
              aria-label={t("imageViewer.resetZoom")}
              onClick={() => resetTransform(160)}
            >
              <RotateCcw aria-hidden="true" size={18} />
            </button>
            <div className="image-viewer-controls" aria-label={t("imageViewer.controls")}>
              <button
                type="button"
                aria-label={t("imageViewer.zoomOut")}
                onClick={() => zoomOut(SCALE_STEP, 120)}
              >
                <Minus aria-hidden="true" size={18} />
              </button>
              <button type="button" aria-label={t("imageViewer.reset")} onClick={() => resetTransform(160)}>
                <RotateCcw aria-hidden="true" size={18} />
              </button>
              <button
                type="button"
                aria-label={t("imageViewer.zoomIn")}
                onClick={() => zoomIn(SCALE_STEP, 120)}
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
