const SERVICES = [
  ["Story and pacing edits", "Docs, brand films"],
  ["Colour grading", "DaVinci Resolve"],
  ["Sound mix and cleanup", "Dialogue, music, ambience"],
  ["Titles and captions", "Motion and burned-in"],
  ["Social cutdowns", "9:16, 1:1, 16:9"],
  ["Footage wrangling", "Proxies, logging, archive"],
];

const QUOTES = [
  {
    text: "He always shows up early and ready to work. He films well, writes strong content, and delivered our project fast and right on time.",
    by: "Manyzewal Eshetu",
  },
  {
    text: "From filming to editing, everything was handled with care. He kept the whole project organized and finished on schedule, and the final video was exactly what we needed.",
    by: "Melhik Marriage Counseling",
  },
];

export default function Services() {
  return (
    <section id="services" style={{ paddingTop: 0 }}>
      <div className="wrap two">
        <div>
          <h2>What I take off your plate</h2>
          <p className="sub">Hand over the footage and a brief. I handle the rest, or just the part you need.</p>
          <ul className="list">
            {SERVICES.map(([name, note]) => (
              <li key={name}><b>{name}</b><span>{note}</span></li>
            ))}
          </ul>
        </div>
        <div className="quotes">
          {QUOTES.map((q) => (
            <blockquote key={q.by}>
              <p>{q.text}</p>
              <cite>{q.by}</cite>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}