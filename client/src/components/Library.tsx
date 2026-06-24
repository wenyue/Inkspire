import { BookOpen, BookmarkX } from "lucide-react";
import { useState } from "react";
import type { LibraryRecord } from "../api";

interface LibraryProps {
  records: LibraryRecord[];
  emptyLabel: string;
  emptyHint?: string;
  emptyActionLabel?: string;
  labels: {
    artwork: string;
    fusion: string;
    failed: string;
    openRecord?: string;
    removeFavorite?: string;
    removeFavoriteShort?: string;
    removeConfirmTitle?: string;
    removeConfirmHint?: string;
    removeConfirmCancel?: string;
    removeConfirmAction?: string;
  };
  onOpen?: (record: LibraryRecord) => void;
  onEmptyAction?: () => void;
  onFavoriteToggle?: (record: LibraryRecord, favorite: boolean) => void;
}

function imageKind(record: LibraryRecord): "artwork" | "fusion" | null {
  if (record.status === "failed") {
    return null;
  }
  if (record.fusion_path || record.has_fusion || record.thumbnail_path?.endsWith("/fusion.webp")) {
    return "fusion";
  }
  if (record.artwork_path || record.thumbnail_path) {
    return "artwork";
  }
  return null;
}

function imageSrc(record: LibraryRecord): string {
  const kind = imageKind(record);
  return kind ? `/api/records/${record.id}/images/${kind}` : "";
}

function placeholder(record: LibraryRecord): string {
  return record.type === "painting" ? "画" : "书";
}

function statusLabel(record: LibraryRecord, labels: LibraryProps["labels"]): string {
  if (record.status === "failed") {
    return labels.failed;
  }
  return record.has_fusion ? labels.fusion : labels.artwork;
}

function formattedCreatedAt(record: LibraryRecord): string {
  if (!record.created_at) {
    return "";
  }
  const time = new Date(record.created_at);
  if (Number.isNaN(time.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(time);
}

function metadata(record: LibraryRecord, labels: LibraryProps["labels"]): string {
  return [statusLabel(record, labels), formattedCreatedAt(record)].filter(Boolean).join(" · ");
}

function LibraryItem({
  record,
  labels,
  onOpen,
  onFavoriteToggle
}: {
  record: LibraryRecord;
  labels: LibraryProps["labels"];
  onOpen?: (record: LibraryRecord) => void;
  onFavoriteToggle?: (record: LibraryRecord, favorite: boolean) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const src = imageSrc(record);
  const openLabel = labels.openRecord ?? "查看作品";
  const removeLabel = labels.removeFavorite ?? "移出藏卷";
  const removeShortLabel = labels.removeFavoriteShort ?? "移出";
  const removeConfirmTitle = labels.removeConfirmTitle ?? "从藏卷移出？";
  const removeConfirmHint = labels.removeConfirmHint ?? "作品记录不会删除。";
  const removeConfirmCancel = labels.removeConfirmCancel ?? "取消";
  const removeConfirmAction = labels.removeConfirmAction ?? removeShortLabel;

  return (
    <article className="library-item">
      <button
        className="library-open surface-clear-button"
        type="button"
        aria-label={`${openLabel} ${record.title || record.id}`}
        onClick={() => onOpen?.(record)}
      >
        <span className={imageFailed ? "library-thumb library-thumb-unavailable" : "library-thumb"}>
          {src && !imageFailed ? (
            <img src={src} alt={record.title || record.id} onError={() => setImageFailed(true)} />
          ) : imageFailed ? (
            <span>图像暂不可用</span>
          ) : (
            <span>{placeholder(record)}</span>
          )}
        </span>
        <span className="library-copy">
          <strong>{record.title || record.id}</strong>
          <span className="library-meta">{metadata(record, labels)}</span>
          <span className="library-open-action">
            <span>{openLabel}</span>
            <span aria-hidden="true">→</span>
          </span>
        </span>
      </button>
      <div className="library-actions">
        {onFavoriteToggle && record.status !== "failed" ? (
          <>
            <button
              className="library-remove-action"
              type="button"
              aria-label={removeLabel}
              title={removeLabel}
              onClick={() => setConfirmingRemove(true)}
            >
              <BookmarkX aria-hidden="true" size={16} />
              <span>{removeShortLabel}</span>
            </button>
          </>
        ) : null}
      </div>
      {confirmingRemove ? (
        <div className="library-remove-confirm" role="group" aria-label={removeConfirmTitle}>
          <strong>{removeConfirmTitle}</strong>
          <span>{removeConfirmHint}</span>
          <div>
            <button type="button" className="secondary-action compact-action" onClick={() => setConfirmingRemove(false)}>
              {removeConfirmCancel}
            </button>
            <button
              type="button"
              className="primary-action compact-action"
              disabled={!onFavoriteToggle}
              onClick={() => onFavoriteToggle?.(record, false)}
            >
              {removeConfirmAction}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function Library({
  records,
  emptyLabel,
  emptyHint,
  emptyActionLabel,
  labels,
  onOpen,
  onEmptyAction,
  onFavoriteToggle
}: LibraryProps) {
  if (records.length === 0) {
    return (
      <section className="empty-state">
        <div className="empty-scroll-mark" aria-hidden="true">
          <BookOpen size={28} />
        </div>
        <h2>{emptyLabel}</h2>
        {emptyHint ? <p>{emptyHint}</p> : null}
        {emptyActionLabel && onEmptyAction ? (
          <button type="button" onClick={onEmptyAction}>
            {emptyActionLabel}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="library-grid">
      {records.map((record) => (
        <LibraryItem
          key={record.id}
          record={record}
          labels={labels}
          onOpen={onOpen}
          onFavoriteToggle={onFavoriteToggle}
        />
      ))}
    </section>
  );
}
