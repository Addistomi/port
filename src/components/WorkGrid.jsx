import { useMemo, useState } from "react";
import Media from "./Media.jsx";

export default function WorkGrid({ projects, onOpen }) {
  const [filter, setFilter] = useState("All");
  const types = useMemo(() => ["All", ...new Set(projects.map((p) => p.type))], [projects]);
  const shown = filter === "All" ? projects : projects.filter((p) => p.type === filter);

  // Moving the mouse across a thumbnail pans it and moves a small playhead
  const scrub = (e) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    e.currentTarget.style.setProperty("--x", x);
  };
  const unscrub = (e) => e.currentTarget.style.removeProperty("--x");

  return (
    <section id="work">
      <div className="wrap">
        <div className="head">
          <div>
            <h2>Selected work</h2>
            <p className="sub">
              Recent projects from the last two years. Open any one for the brief and what I did on it.
            </p>
          </div>
          <div className="chips" role="group" aria-label="Filter projects">
            {types.map((t) => (
              <button key={t} className="chip" aria-pressed={t === filter} onClick={() => setFilter(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid">
          {shown.map((p) => (
            <button key={p.id} className="work" onClick={() => onOpen(p)}>
              <div className="thumb" onPointerMove={scrub} onPointerLeave={unscrub}>
                <div className="media"><Media p={p} /></div>
                <span className="len">{p.len}</span>
                <span className="scrub"><i /></span>
              </div>
              <h3>{p.title}</h3>
              <p>{p.type} · {p.role}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}