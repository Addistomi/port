const STEPS = [
  { name: "Ingest", text: "Footage is backed up, synced and logged so nothing gets hunted for later.", share: 10, color: "var(--c1)" },
  { name: "Assembly", text: "A fast first pass that finds the spine of the story.", share: 20, color: "var(--c5)" },
  { name: "Fine cut", text: "Pacing, trims and transitions until every cut earns its place.", share: 35, color: "var(--c2)" },
  { name: "Colour and sound", text: "Grade and mix so picture and audio feel like one thing.", share: 25, color: "var(--c3)" },
  { name: "Delivery", text: "Masters, captions and social versions exported to spec.", share: 10, color: "var(--c4)" },
];

export default function Process() {
  return (
    <section id="process" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <h2>How a cut comes together</h2>
        <p className="sub">
          Most of the work happens in the fine cut. The bar shows where my time usually goes on a project.
        </p>
        <div className="share" aria-hidden="true">
          {STEPS.map((s) => (
            <i key={s.name} style={{ width: `${s.share}%`, background: s.color }} />
          ))}
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.name} style={{ "--k": s.color }}>
              <b>{i + 1}. {s.name}</b>
              <span>{s.text}</span>
              <em>About {s.share}% of the project</em>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}