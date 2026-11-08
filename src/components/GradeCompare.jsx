import { useEffect, useRef, useState } from "react";
import Media from "./Media.jsx";

export default function GradeCompare({ projects }) {
  // Projects that have a gradeNote appear in this slider
  const items = projects.filter((p) => p.gradeNote).slice(0, 4);
  const [k, setK] = useState(0);
  const [pos, setPos] = useState(50);
  const box = useRef(null);
  const dragging = useRef(false);

  // One gentle sweep when the section scrolls into view
  useEffect(() => {
    if (!box.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const step = (now) => {
          if (dragging.current) return;
          const q = Math.min(1, (now - start) / 1400);
          setPos(88 - 38 * (1 - Math.pow(1 - q, 3)));
          if (q < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    io.observe(box.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [items.length]);

  if (!items.length) return null;
  const item = items[Math.min(k, items.length - 1)];

  const seek = (e) => {
    const r = box.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <section id="grade" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <h2>From flat footage to final grade</h2>
        <p className="sub">
          Camera footage starts out flat and grey on purpose. Drag the divider to see what the grade adds.
        </p>

        <div
          className="cmp"
          ref={box}
          style={{ "--p": `${pos}%` }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seek(e);
          }}
          onPointerMove={(e) => dragging.current && seek(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="l2"><Media p={item} /></div>
          <div className="l2 raw"><Media p={item} /></div>
          <span className="tag" style={{ left: ".75rem" }}>Raw</span>
          <span className="tag" style={{ right: ".75rem" }}>Graded</span>
          <div className="div">
            <button
              role="slider"
              aria-label="Compare raw and graded"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pos)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setPos((v) => Math.max(0, v - 5));
                else if (e.key === "ArrowRight") setPos((v) => Math.min(100, v + 5));
                else return;
                e.preventDefault();
              }}
            />
          </div>
        </div>

        <div className="cmp-foot">
          <div className="chips" role="group" aria-label="Choose a project">
            {items.map((p, i) => (
              <button key={p.id} className="chip" aria-pressed={p.id === item.id} onClick={() => setK(i)}>
                {p.title}
              </button>
            ))}
          </div>
          <p>{item.gradeNote}</p>
        </div>
      </div>
    </section>
  );
}