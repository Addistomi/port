import { useEffect, useMemo, useRef, useState } from "react";
import Media from "./Media.jsx";
import { parseReel } from "../lib/video.js";

const FPS = 24;
const SPEED = 2; // the project preview plays at 2x
const SEG = 9; // seconds each featured project gets on the reel

const pad = (n) => String(n).padStart(2, "0");
const timecode = (x) => {
  const s = Math.floor(x);
  const f = Math.floor((x - s) * FPS);
  return `00:${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f)}`;
};

function Wave({ seed }) {
  const d = useMemo(() => {
    let path = "";
    let s = seed;
    for (let i = 0; i < 120; i++) {
      s = (s * 9301 + 49297) % 233280;
      const h = 2 + (s / 233280) * (5 + 6 * Math.abs(Math.sin(i / 9 + seed)));
      path += `M${i * 0.84} ${10 - h}V${10 + h}`;
    }
    return path;
  }, [seed]);
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" opacity=".9" />
    </svg>
  );
}

export default function Timeline({ projects, onOpen, reelUrl }) {
  // Featured projects make up the project reel, each gets an equal slice
  const clips = useMemo(() => {
    const featured = projects.filter((p) => p.featured);
    return (featured.length ? featured : projects).slice(0, 5).map((p, i) => ({
      ...p,
      seg: [i * SEG, (i + 1) * SEG],
    }));
  }, [projects]);
  const DUR = Math.max(clips.length, 1) * SEG;

  // The hero shows your showreel video by default (if a link is set in Firebase).
  // "Projects" switches the screen to the scrubbable project preview.
  const reelV = parseReel(reelUrl);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [mode, setMode] = useState(reduced ? "projects" : "video");
  const showVideo = Boolean(reelV) && mode === "video";

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const layerRef = useRef(null);
  const drag = useRef({ on: false, was: false });

  // Project preview loop (paused while the video is showing)
  const running = playing && !showVideo;
  useEffect(() => {
    if (!running) return;
    let raf;
    let last = performance.now();
    const tick = (ts) => {
      const dt = (ts - last) / 1000;
      last = ts;
      setT((p) => (p + dt * SPEED) % DUR);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, DUR]);

  if (!clips.length) return null;

  const pc = (x) => `${(x / DUR) * 100}%`;
  const time = Math.max(0, Math.min(DUR - 0.001, t));
  const idx = Math.max(0, clips.findIndex((p) => time >= p.seg[0] && time < p.seg[1]));
  const cur = clips[idx];
  const showTitle = time >= cur.seg[0] + 1 && time < cur.seg[0] + 6;
  const code = timecode(time);
  const starts = clips.map((p) => p.seg[0]);

  // Using the timeline controls switches the screen to the project preview
  const toProjects = () => setMode("projects");

  const seek = (e) => {
    const r = layerRef.current.getBoundingClientRect();
    const k = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width));
    setT(k * DUR);
  };
  const down = (e) => {
    toProjects();
    drag.current = { on: true, was: playing };
    setPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(e);
  };
  const move = (e) => drag.current.on && seek(e);
  const up = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    if (drag.current.was) setPlaying(true);
  };

  const key = (e) => {
    const step = e.shiftKey ? 5 : 1;
    toProjects();
    if (e.key === "ArrowRight" || e.key === "ArrowUp") setT((v) => Math.min(DUR - 0.001, v + step));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setT((v) => Math.max(0, v - step));
    else if (e.key === "Home") setT(0);
    else if (e.key === "End") setT(DUR - 0.001);
    else if (e.key === " " || e.key === "Enter") setPlaying((p) => !p);
    else return;
    e.preventDefault();
  };

  const next = () => { toProjects(); setT(starts.find((s) => s > time + 0.05) ?? starts[0]); };
  const prev = () => {
    toProjects();
    const before = starts.filter((s) => s < time - 0.7);
    setT(before.length ? before[before.length - 1] : starts[starts.length - 1]);
  };
  const togglePlay = () => {
    if (showVideo) { setMode("projects"); setPlaying(true); }
    else setPlaying((p) => !p);
  };

  const ticks = [];
  for (let s = 0; s <= DUR; s += 2) {
    const big = s % 6 === 0;
    ticks.push(
      <div key={s} className={"tick" + (big ? " big" : "")} style={{ left: pc(s) }}>
        {big && <span>{Math.floor(s / 60)}:{pad(s % 60)}</span>}
      </div>
    );
  }

  return (
    <div className="bay" aria-label="Interactive showreel timeline">
      <div className={"monitor" + (showVideo ? " vid" : "")}>
        {showVideo ? (
          reelV.provider === "file" ? (
            <video className="reel-frame" src={reelV.src} autoPlay muted loop playsInline controls />
          ) : (
            <iframe
              className="reel-frame"
              src={reelV.embed}
              title="Showreel"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          )
        ) : (
          <>
            <div>
              {clips.map((p, i) => (
                <div key={p.id} className={"scene" + (i === idx ? " on" : "")}>
                  <Media p={p} />
                </div>
              ))}
            </div>
            <div className="mon-top"><span className="rec">Reel preview</span><span>{code}</span></div>
            <div className={"lower" + (showTitle ? " show" : "")}>
              <strong>{cur.title}</strong>
              <span>{cur.type} · {cur.len}</span>
            </div>
            {onOpen && (
              <div className="mon-actions">
                <button className="open-btn" onClick={() => onOpen(cur)}>Open this project</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="transport">
        <button className="tbtn" onClick={prev} aria-label="Previous cut">
          <svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
        </button>
        <button className="tbtn play" onClick={togglePlay} aria-label={running ? "Pause" : "Play"}>
          <svg viewBox="0 0 24 24">
            {running ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
        </button>
        <button className="tbtn" onClick={next} aria-label="Next cut">
          <svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z" /></svg>
        </button>

        {reelV && (
          <div className="seg" role="group" aria-label="What the screen shows">
            <button aria-pressed={showVideo} onClick={() => setMode("video")}>Showreel</button>
            <button aria-pressed={!showVideo} onClick={() => { setMode("projects"); setPlaying(true); }}>Projects</button>
          </div>
        )}

        <div className="tc">{code}<small>24 fps</small></div>
      </div>

      <div className={"tl" + (showVideo ? " idle" : "")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="row"><span /><div className="ruler">{ticks}</div></div>

        <div className="row">
          <span className="lbl">V2</span>
          <div className="lane thin">
            {clips.map((p) => (
              <div key={p.id} className="clip" style={{
                left: pc(p.seg[0] + 1), width: pc(5),
                background: `color-mix(in srgb, ${p.clr} 35%, var(--bay-2))`, color: "var(--bay-ink)",
              }}>Title</div>
            ))}
          </div>
        </div>

        <div className="row">
          <span className="lbl">V1</span>
          <div className="lane">
            {clips.map((p) => (
              <div key={p.id} className="clip" style={{
                left: pc(p.seg[0]), width: pc(SEG), background: p.clr, color: p.on,
              }}>{p.title}</div>
            ))}
          </div>
        </div>

        <div className="row">
          <span className="lbl">A1</span>
          <div className="lane aud">
            <div className="clip" style={{ left: 0, width: pc(DUR * 0.62) }}><Wave seed={3} /><em>Score</em></div>
            <div className="clip" style={{ left: pc(DUR * 0.62), width: pc(DUR * 0.38) }}><Wave seed={7} /><em>Voice and room tone</em></div>
          </div>
        </div>

        <div className="layer" ref={layerRef}>
          <div className="ph" style={{ left: pc(time) }}>
            <button
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Math.round(DUR)}
              aria-valuenow={Math.round(time)}
              aria-valuetext={`${code}, ${cur.title}`}
              onKeyDown={key}
            />
          </div>
        </div>
      </div>
      <p className="hint">
        {showVideo
          ? "My showreel is playing. Drag the timeline below to browse individual projects."
          : "Drag the playhead to scrub through my recent work."}
      </p>
    </div>
  );
}