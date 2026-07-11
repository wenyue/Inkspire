import { BookOpen, BookmarkX } from "lucide-react";
import { useState } from "react";
import type { LibraryRecord } from "../api";
import type { Locale } from "../domain";
import { artworkFormatClass } from "../domain";

interface LibraryProps {
  records: LibraryRecord[];
  locale: Locale;
  emptyLabel: string;
  emptyHint?: string;
  emptyDetail?: string;
  emptyActionLabel?: string;
  actionError?: string;
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
    workTypePainting?: string;
    workTypeCalligraphy?: string;
    format?: string;
    density?: string;
    densitySmall?: string;
    densityMedium?: string;
    densityLarge?: string;
  };
  onOpen?: (record: LibraryRecord) => void;
  onEmptyAction?: () => void;
  onFavoriteToggle?: (record: LibraryRecord, favorite: boolean) => void;
}

function imageKind(record: LibraryRecord): "artwork" | null {
  if (record.status === "failed") {
    return null;
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

function dateLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : locale === "zh-Hant" ? "zh-TW" : "zh-CN";
}

function formattedCreatedAt(record: LibraryRecord, locale: Locale): string {
  if (!record.created_at) {
    return "";
  }
  const time = new Date(record.created_at);
  if (Number.isNaN(time.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(dateLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(time);
}

const formatTranslations = [
  ["横幅", "橫幅", "Horizontal"],
  ["立轴", "立軸", "Hanging Scroll"],
  ["斗方", "斗方", "Square"],
  ["手卷", "手卷", "Handscroll"],
  ["扇面", "扇面", "Fan"],
  ["册页", "冊頁", "Album"]
] as const;

function localizedFormat(value: string, locale: Locale): string {
  const match = formatTranslations.find((translations) => translations.some((translation) => translation === value));
  if (!match) return value;
  return match[locale === "zh-Hans" ? 0 : locale === "zh-Hant" ? 1 : 2];
}

function metadata(record: LibraryRecord, labels: LibraryProps["labels"], locale: Locale): string {
  const savedFormat = record.answers?.painting_format || record.answers?.calligraphy_layout;
  const format = savedFormat ? localizedFormat(savedFormat, locale) : "";
  const density = record.generation_complexity === "small"
    ? labels.densitySmall
    : record.generation_complexity === "medium"
      ? labels.densityMedium
      : record.generation_complexity === "large"
        ? labels.densityLarge
        : "";
  return [
    statusLabel(record, labels),
    record.type === "painting" ? labels.workTypePainting : labels.workTypeCalligraphy,
    format && labels.format ? `${labels.format}：${format}` : "",
    density && labels.density ? `${labels.density}：${density}` : "",
    formattedCreatedAt(record, locale)
  ].filter(Boolean).join(" · ");
}

function LibraryItem({
  record,
  locale,
  labels,
  onOpen,
  onFavoriteToggle
}: {
  record: LibraryRecord;
  locale: Locale;
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
        <span className={`${imageFailed ? "library-thumb library-thumb-unavailable" : "library-thumb"} ${artworkFormatClass(record.answers)}`}>
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
          <span className="library-meta">{metadata(record, labels, locale)}</span>
          <span className="library-open-action">
            <span>{openLabel}</span>
            <span aria-hidden="true">→</span>
          </span>
        </span>
      </button>
      <div className="library-actions">
        {onFavoriteToggle ? (
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
  locale,
  emptyLabel,
  emptyHint,
  emptyDetail,
  emptyActionLabel,
  actionError = "",
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
        {emptyDetail ? <p className="empty-state-detail">{emptyDetail}</p> : null}
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
      {actionError ? <p className="error-line library-error" role="status">{actionError}</p> : null}
      {records.map((record) => (
        <LibraryItem
          key={record.id}
          record={record}
          locale={locale}
          labels={labels}
          onOpen={onOpen}
          onFavoriteToggle={onFavoriteToggle}
        />
      ))}
    </section>
  );
}
