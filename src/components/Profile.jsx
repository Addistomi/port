import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { profile as p } from "../Data/profile.js";

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

export default function Profile({ open, onClose }) {
  const ref = useRef(null);
  const cvRef = useRef(null);
  const [cvOpen, setCvOpen] = useState(false);

  // Open or close the native <dialog> and stop the page scrolling behind it
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      d.showModal();
      document.body.style.overflow = "hidden";
    }
    if (!open && d.open) d.close();
    if (!open) document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Open or close the CV card
  useEffect(() => {
    const d = cvRef.current;
    if (!d) return;
    if (cvOpen && !d.open) d.showModal();
    if (!cvOpen && d.open) d.close();
  }, [cvOpen]);

  // Close the CV card when the profile closes
  useEffect(() => {
    if (!open) setCvOpen(false);
  }, [open]);

  const bookACut = () => {
    setCvOpen(false);
    onClose();
    setTimeout(() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }), 150);
  };

  return (
    <>
      <dialog
        ref={ref}
        className="profile"
        aria-labelledby="pfName"
        onClose={onClose}
        onClick={(e) => e.target === ref.current && onClose()}
      >
        <div className="pf-closebar">
          <button className="pf-x" onClick={onClose} aria-label="Close profile">×</button>
        </div>

        <div className="pf-cover" aria-hidden="true">
          <div className="pf-clips">
            <i style={{ width: "62%", background: "var(--c1)", "--s": "45%" }} />
            <i style={{ width: "38%", background: "var(--c2)", "--s": "120%", animationDelay: ".6s" }} />
            <i style={{ width: "50%", background: "var(--c3)", "--s": "70%", animationDelay: "1.2s" }} />
          </div>
        </div>

        <div className="pf-avatar">
          <div className="pf-face"><Avatar alt={`Portrait of ${p.name}`} /></div>
        </div>

        <div className="pf-head">
          <h2 id="pfName">{p.name}</h2>
          <p className="pf-role">{p.title}</p>
          <div className="pf-meta">
            <span className="pill"><b aria-hidden="true" />{p.availability}</span>
            <span className="pill">{p.location}</span>
          </div>
          <div className="pf-actions">
            <button className="btn" onClick={bookACut}>Book a cut</button>
            <a className="btn ghost" href={`mailto:${p.email}`}>Email me</a>
            {p.cvUrl && (
              <button className="btn ghost" onClick={() => setCvOpen(true)}>View CV</button>
            )}
          </div>
        </div>

        <div className="pf-body">
          <section className="pf-sec">
            <h3>About me</h3>
            {p.about.map((t) => <p key={t}>{t}</p>)}
          </section>

          <section className="pf-stats" aria-label="At a glance">
            {p.stats.map(([n, label], i) => (
              <div className="pf-stat" key={label} style={{ "--k": COLORS[i % COLORS.length] }}>
                <b>{n}</b><span>{label}</span>
              </div>
            ))}
          </section>

          <section className="pf-sec">
            <h3>Experience</h3>
            <ol className="xp">
              {p.experience.map((x, i) => (
                <li key={x.role + x.org} style={{ "--k": COLORS[i % COLORS.length] }}>
                  <h4>{x.role}</h4>
                  <span className="when">{x.org} · {x.when}</span>
                  <ul>{x.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
                </li>
              ))}
            </ol>
          </section>

          <section className="pf-sec">
            <h3>Skills and tools</h3>
            {p.skills.map((g) => (
              <div className="skillgroup" key={g.group}>
                <span>{g.group}</span>
                <div className="skills">
                  {g.items.map((s) => <em key={s}>{s}</em>)}
                </div>
              </div>
            ))}
          </section>

          <section className="pf-sec two-col">
            <div>
              <h3>Languages</h3>
              <div className="skills">{p.languages.map((l) => <em key={l}>{l}</em>)}</div>
            </div>
          </section>

          <section className="pf-cta">
            <h3>Let's talk about your project</h3>
            <p>Tell me what you are making and when it is due. I reply within one working day.</p>
            <button className="btn" onClick={bookACut}>Book a cut</button>
          </section>
        </div>
      </dialog>

      {/* CV pop-out card */}
      {p.cvUrl && (
        <dialog
          ref={cvRef}
          className="cv-card"
          aria-labelledby="cvTitle"
          onClose={() => setCvOpen(false)}
          onClick={(e) => e.target === cvRef.current && setCvOpen(false)}
        >
          <header className="cv-head">
            <h3 id="cvTitle">{p.name} · CV</h3>
            <button className="pf-x" onClick={() => setCvOpen(false)} aria-label="Close CV">×</button>
          </header>

          <object className="cv-frame" data={`${p.cvUrl}#view=FitH`} type="application/pdf">
            <p className="cv-fallback">
              Your browser can't preview PDFs here. Use the buttons below to open or download it.
            </p>
          </object>

          <footer className="cv-foot">
            <a className="btn ghost" href={p.cvUrl} target="_blank" rel="noreferrer">Open in new tab</a>
            <a className="btn" href={p.cvUrl} download>Download PDF</a>
          </footer>
        </dialog>
      )}
    </>
  );
}