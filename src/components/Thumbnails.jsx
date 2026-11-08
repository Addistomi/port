import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db, configured } from "../firebase.js";

// ---------- link helpers (YouTube link OR normal image link) ----------

// Returns the YouTube video ID for watch, youtu.be, shorts, embed and live links.
function getYouTubeId(value = "") {
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  let id = null;

  if (host === "youtu.be") {
    id = parsed.pathname.split("/")[1];
  } else if (
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (parsed.pathname === "/watch") {
      id = parsed.searchParams.get("v");
    } else {
      const m = parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
      id = m ? m[1] : null;
    }
  }

  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

// Best quality first. If one does not exist, the next one is tried.
function youTubeThumbCandidates(id) {
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

// Works for new documents (videoId / sourceUrl saved by Admin)
// and for older documents that only have imageUrl.
function getThumbInfo(item) {
  const videoId =
    item.videoId ||
    getYouTubeId(item.sourceUrl) ||
    getYouTubeId(item.imageUrl);

  if (videoId) {
    return {
      isYouTube: true,
      videoId,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      sources: youTubeThumbCandidates(videoId),
    };
  }

  return {
    isYouTube: false,
    videoId: "",
    watchUrl: "",
    sources: item.imageUrl ? [item.imageUrl] : [],
  };
}

// Shows the first image that loads; falls back to the next one on error.
function ThumbImage({ sources, alt, ...rest }) {
  const [index, setIndex] = useState(0);
  const key = sources.join("|");

  useEffect(() => {
    setIndex(0);
  }, [key]);

  if (sources.length === 0 || index >= sources.length) {
    return <div className="th-msg">Thumbnail unavailable</div>;
  }

  return (
    <img
      src={sources[index]}
      alt={alt}
      onError={() => setIndex((i) => i + 1)}
      {...rest}
    />
  );
}

export default function Thumbnails() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("All");
  const [active, setActive] = useState(null);

  const dialogRef = useRef(null);

  // Fetch published thumbnails from the same collection used by Admin.jsx.
  useEffect(() => {
    if (!configured || !db) {
      setStatus("error");
      setErrorMessage(
        "Firebase is not configured. Check your Firebase settings."
      );
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    const thumbnailsQuery = query(
      collection(db, "thumbnails"),
      where("published", "==", true)
    );

    const unsubscribe = onSnapshot(
      thumbnailsQuery,
      (snapshot) => {
        const documents = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        // Show newest thumbnails first.
        documents.sort(
          (a, b) =>
            (b.createdAt?.seconds ?? 0) -
            (a.createdAt?.seconds ?? 0)
        );

        setItems(documents);
        setStatus("ready");
        setErrorMessage("");
      },
      (error) => {
        console.error("Thumbnails fetch failed:", error);

        setErrorMessage(
          error.code
            ? `${error.code}: ${error.message}`
            : error.message || "Unknown Firebase error."
        );

        setStatus("error");
      }
    );

    return () => unsubscribe();
  }, []);

  // Build the category filter buttons from published thumbnails.
  const types = useMemo(
    () => [
      "All",
      ...new Set(
        items
          .map((item) => item.type)
          .filter((type) => typeof type === "string" && type.trim())
      ),
    ],
    [items]
  );

  const visible =
    filter === "All"
      ? items
      : items.filter((item) => item.type === filter);

  // Open and close the project details dialog.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (active && !dialog.open) {
      dialog.showModal();
    } else if (!active && dialog.open) {
      dialog.close();
    }
  }, [active]);

  // Close the dialog if its project is removed from Firestore.
  useEffect(() => {
    if (
      active &&
      !items.some((item) => item.id === active.id)
    ) {
      setActive(null);
    }
  }, [items, active]);

  const activeInfo = active ? getThumbInfo(active) : null;

  return (
    <section className="th" id="work">
      <div className="th-wrap">
        <div className="th-head">
          <div>
            <h2>My thumbnail design </h2>
            <p className="th-sub">
              Open any project for the brief and what I did on it.
            </p>
          </div>

          {types.length > 2 && (
            <div
              className="th-chips"
              role="group"
              aria-label="Filter projects"
            >
              {types.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="th-chip"
                  aria-pressed={type === filter}
                  onClick={() => setFilter(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>

        {status === "loading" && (
          <div className="th-grid" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="th-skel" key={index}>
                <div className="th-skel-img" />
                <div className="th-skel-line" />
                <div className="th-skel-line short" />
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="th-msg" role="alert">
            <p>
              Couldn't load projects right now. Please refresh and try again.
            </p>

            <p>
              <small>{errorMessage}</small>
            </p>
          </div>
        )}

        {status === "ready" && visible.length === 0 && (
          <p className="th-msg">
            {items.length === 0
              ? "No projects published yet."
              : "No projects found in this category."}
          </p>
        )}

        {status === "ready" && visible.length > 0 && (
          <div className="th-grid">
            {visible.map((project) => {
              const info = getThumbInfo(project);

              return (
                <button
                  type="button"
                  className="th-card"
                  key={project.id}
                  onClick={() => setActive(project)}
                >
                  <div className="th-thumb">
                    <ThumbImage
                      sources={info.sources}
                      alt={project.title || "Project thumbnail"}
                      loading="lazy"
                      decoding="async"
                    />

                    {project.length && (
                      <span className="th-len">
                        {project.length}
                      </span>
                    )}
                  </div>

                  <h3>{project.title || "Untitled project"}</h3>

                  <p>
                    {project.type || "Project"}
                    {project.role ? ` · ${project.role}` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="th-dlg"
        aria-labelledby="th-dlg-title"
        onClose={() => setActive(null)}
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            setActive(null);
          }
        }}
      >
        {active && activeInfo && (
          <>
            <button
              type="button"
              className="th-x"
              aria-label="Close project"
              onClick={() => setActive(null)}
            >
              ×
            </button>

            <div className="th-dlg-art">
              <ThumbImage
                sources={activeInfo.sources}
                alt={active.title || "Project thumbnail"}
              />
            </div>

            <div className="th-dlg-body">
              <h3 id="th-dlg-title">
                {active.title || "Untitled project"}
              </h3>

              {active.blurb && <p>{active.blurb}</p>}

              <dl>
                {active.type && (
                  <div>
                    <dt>Type</dt>
                    <dd>{active.type}</dd>
                  </div>
                )}

                {active.length && (
                  <div>
                    <dt>Length</dt>
                    <dd>{active.length}</dd>
                  </div>
                )}

                {active.role && (
                  <div>
                    <dt>My role</dt>
                    <dd>{active.role}</dd>
                  </div>
                )}

                {active.tools && (
                  <div>
                    <dt>Tools</dt>
                    <dd>{active.tools}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
