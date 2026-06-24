import type { LibraryRecord } from "../api";

interface LibraryProps {
  records: LibraryRecord[];
  emptyLabel: string;
}

export default function Library({ records, emptyLabel }: LibraryProps) {
  if (records.length === 0) {
    return <section className="empty-state">{emptyLabel}</section>;
  }

  return (
    <section className="library-grid">
      {records.map((record) => (
        <article className="library-item" key={record.id}>
          <div className="library-thumb">{record.type === "painting" ? "画" : "书"}</div>
          <div>
            <h3>{record.title || record.id}</h3>
            <p>{record.has_fusion ? "Artwork + fusion" : "Artwork"}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
