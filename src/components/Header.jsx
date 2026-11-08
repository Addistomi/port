import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { profile } from "../Data/profile.js";

export default function Header({ onProfile }) {
  const [open, setOpen] = useState(false);
  // The "Click me" bubble shows until the visitor opens the profile (once per visit)
  const [seen, setSeen] = useState(() => {
    try { return sessionStorage.getItem("profileSeen") === "2"; } catch { return false; }
  });
  const prog = useRef(null);

  // The page scroll position fills the thin bar under the header
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (prog.current) {
        prog.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const openProfile = () => {
    setSeen(true);
    try { sessionStorage.setItem("profileSeen", "1"); } catch { /* ignore */ }
    setOpen(false);
    onProfile();
  };

  return (
    <header className="site-header">
      <div className="wrap bar">
        <a className="brand" href="#top"><img src="/logo.svg" alt="My icon" width="42" height="42" />{profile.name}</a>

        <div className="bar-right">
          <nav id="nav" className={open ? "open" : ""} aria-label="Main" onClick={() => setOpen(false)}>
            <ul>
              <li><a href="#work">Work</a></li>
              <li>
                <a href="#profile" onClick={(e) => { e.preventDefault(); openProfile(); }}>About</a>
              </li>
              <li><a href="#grade">Grade</a></li>
              <li><a href="#process">Process</a></li>
              <li><a href="#services">Services</a></li>
              <li><a className="btn" href="#contact">Hire Me</a></li>
            </ul>
          </nav>

          <button
            className={"me" + (seen ? " seen" : "")}
            onClick={openProfile}
            aria-label={`Open ${profile.name}'s profile`}
            aria-haspopup="dialog"
          >
            <span className="ring" aria-hidden="true" />
            <span className="pulse" aria-hidden="true" />
            <span className="face"><Avatar /></span>
            {!seen && <span className="bubble" aria-hidden="true">Click me</span>}
          </button>

          <button
            className="menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="nav"
            onClick={() => setOpen((o) => !o)}
          >
            <span />
          </button>
        </div>
      </div>
      <div className="prog" aria-hidden="true"><i ref={prog} /></div>
    </header>
  );
}