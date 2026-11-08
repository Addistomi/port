import { useEffect, useRef, useState } from "react";
import Media from "./Media.jsx";
import { parseVideo } from "../lib/video.js";

export default function ProjectDialog({ project, onClose }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Open or close the native <dialog> when a project is picked
  useEffect(() => {
    const d = ref.current;
    if (project && !d.open) d.showModal();
    if (!project && d.open) d.close();
    setPlaying(false);
  }, [project]);

  const video = parseVideo(project?.videoUrl);
  const externalLink = !video && project?.videoUrl && /^https:\/\//.test(project.videoUrl);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dTitle"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <button className="x" onClick={onClose} aria-label="Close project">×</button>
      {project && (
        <>
          <div className="dlg-art">
            {playing && video ? (
              <iframe
                src={video.embed}
                title={`${project.title} film`}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <Media p={project} />
            )}
          </div>
          <div className="dlg-body">
            <h3 id="dTitle">{project.title}</h3>
            <p>{project.blurb}</p>
            <dl>
              <div><dt>Type</dt><dd>{project.type}</dd></div>
              <div><dt>Length</dt><dd>{project.len}</dd></div>
              <div><dt>My role</dt><dd>{project.role}</dd></div>
              <div><dt>Tools</dt><dd>{project.tools}</dd></div>
            </dl>
            {video && !playing && (
              <p className="dlg-link">
                <button className="btn" onClick={() => setPlaying(true)}>Play the film</button>
              </p>
            )}
            {externalLink && (
              <p className="dlg-link">
                <a className="btn" href={project.videoUrl} target="_blank" rel="noreferrer noopener">
                  Watch the film
                </a>
              </p>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}