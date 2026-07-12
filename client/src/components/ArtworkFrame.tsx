import { useEffect, useState } from "react";

interface ArtworkFrameProps {
  src: string;
  imageAlt: string;
  openLabel: string;
  frameLabel: string;
  formatClassName: string;
  onOpen: () => void;
  onError: () => void;
}

export default function ArtworkFrame({
  src,
  imageAlt,
  openLabel,
  frameLabel,
  formatClassName,
  onOpen,
  onError
}: ArtworkFrameProps) {
  const [imageAspectRatio, setImageAspectRatio] = useState<string>();

  useEffect(() => {
    setImageAspectRatio(undefined);
  }, [src]);

  return (
    <div
      className={`adjust-base ${formatClassName}`.trim()}
      style={imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined}
    >
      <button
        className="adjust-base-open surface-clear-button"
        type="button"
        aria-label={openLabel}
        onClick={onOpen}
      >
        <img
          className="adjust-base-image"
          src={src}
          alt={imageAlt}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setImageAspectRatio(`${naturalWidth} / ${naturalHeight}`);
            }
          }}
          onError={onError}
        />
      </button>
      <span className="adjust-base-label">{frameLabel}</span>
    </div>
  );
}