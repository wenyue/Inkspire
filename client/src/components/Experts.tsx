import type { Expert } from "../api";

interface ExpertsProps {
  experts: Expert[];
  title: string;
  contactPendingLabel: string;
}

export default function Experts({ experts, title, contactPendingLabel }: ExpertsProps) {
  return (
    <section className="experts-panel">
      <h2>{title}</h2>
      {experts.map((expert) => (
        <article className="expert-card" key={expert.id}>
          <div>
            <h3>{expert.name}</h3>
            <p>{expert.region}</p>
          </div>
          <p>{expert.bio}</p>
          <span>{expert.phone || expert.wechat || contactPendingLabel}</span>
        </article>
      ))}
    </section>
  );
}
