import type { LibraryRecord } from "../api";

interface LibraryProps {
  records: LibraryRecord[];
  emptyLabel: string;
  labels: {
    artwork: string;
    fusion: string;
    failed: string;
  };
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

export default function Library({ records, emptyLabel, labels }: LibraryProps) {
  if (records.length === 0) {
    return <section className="empty-state">{emptyLabel}</section>;
  }

  return (
    <section className="library-grid">
      {records.map((record) => (
        <article className="library-item" key={record.id}>
          <div className="library-thumb">
            {imageSrc(record) ? (
              <img src={imageSrc(record)} alt={record.title || record.id} />
            ) : (
              <span>{placeholder(record)}</span>
            )}
          </div>
          <div>
            <h3>{record.title || record.id}</h3>
            <p>{record.status === "failed" ? labels.failed : record.has_fusion ? labels.fusion : labels.artwork}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
