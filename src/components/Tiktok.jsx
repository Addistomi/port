import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db, configured } from "../firebase.js";

/* ==========================================================================
   Settings
   ========================================================================== */

const SLOW_AFTER_MS = 8000; // after this, the cover is replaced by a "Reload" pill
const FETCH_ATTEMPTS = 3;   // tries for the Firestore video list

const IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)$/i;

/* ==========================================================================
   Video links
   ========================================================================== */

/** Accepts a plain URL or a pasted <iframe> snippet and returns the URL. */
function extractSource(value = "") {
  const input = value.trim();
  const match = input.match(IFRAME_SRC);
  return (match ? match[1] : input).replace(/&amp;/g, "&").trim();
}

function parseUrl(value) {
  try {
    const url = new URL(extractSource(value));
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Hides the Vimeo title, author, avatar and badge on the player. */
function cleanVimeoUrl(href) {
  try {
    const url = new URL(href);
    if (url.hostname !== "player.vimeo.com") return href;
    ["title", "byline", "portrait", "badge"].forEach((key) => url.searchParams.set(key, "0"));
    return url.href;
  } catch {
    return href;
  }
}

/**
 * One entry per supported site. `embed` returns the player URL,
 * or a falsy value when the link does not point to a video.
 */
const PROVIDERS = [
  {
    name: "TikTok",
    match: (host) => host.endsWith("tiktok.com"),
    embed: ({ path }) => {
      const id = path.match(/\/video\/(\d+)/)?.[1];
      return id && `https://www.tiktok.com/embed/v2/${id}`;
    },
  },
  {
    name: "YouTube",
    match: (host) => host === "youtu.be" || host.endsWith("youtube.com"),
    embed: ({ url, host, path }) => {
      const id =
        host === "youtu.be" ? path.split("/")[1]
        : path === "/watch" ? url.searchParams.get("v")
        : path.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/)?.[1];
      return id && `https://www.youtube.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`;
    },
  },
  {
    name: "Instagram",
    match: (host) => host.endsWith("instagram.com"),
    embed: ({ path }) => {
      const match = path.match(/\/(reel|reels|p|tv)\/([\w-]+)/);
      if (!match) return null;
      const kind = match[1] === "reels" ? "reel" : match[1];
      return `https://www.instagram.com/${kind}/${match[2]}/embed`;
    },
  },
  {
    name: "Vimeo",
    match: (host) => host.endsWith("vimeo.com"),
    embed: ({ url, host, path }) => {
      const id = path.match(/\/(?:video\/)?(\d+)/)?.[1];
      if (!id) return null;
      const isPlayer = host === "player.vimeo.com" && path.startsWith("/video/");
      return cleanVimeoUrl(
        isPlayer ? url.href : `https://player.vimeo.com/video/${id}${url.search}${url.hash}`
      );
    },
  },
  {
    name: "Facebook",
    match: (host) => host.endsWith("facebook.com") || host === "fb.watch",
    embed: ({ url }) =>
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.href)}&show_text=false`,
  },
  {
    name: "Google Drive",
    match: (host) => host === "drive.google.com" || host === "docs.google.com",
    embed: ({ url, path }) => {
      const id = path.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
      return id && `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
    },
  },
];

/**
 * Works out how to show a link:
 *   { type: "embed", embedUrl }  -> <iframe>
 *   { type: "file",  fileUrl }   -> <video>
 *   { type: "link" }             -> plain link (not embeddable)
 *   null                         -> not a valid URL
 */
function getVideoInfo(value = "") {
  const url = parseUrl(value);
  if (!url) return null;

  // A pasted iframe snippet already holds the exact player URL.
  if (IFRAME_SRC.test(value)) {
    return { type: "embed", name: "Embedded video", embedUrl: cleanVimeoUrl(url.href) };
  }

  const host = url.hostname.replace(/^(www\.|m\.)/i, "").toLowerCase();
  const context = { url, host, path: url.pathname };

  for (const provider of PROVIDERS) {
    if (!provider.match(host)) continue;
    const embedUrl = provider.embed(context);
    if (embedUrl) return { type: "embed", name: provider.name, embedUrl };
  }

  if (VIDEO_FILE.test(url.pathname)) {
    return { type: "file", name: "Video file", fileUrl: url.href };
  }

  return { type: "link", name: host };
}

/* ==========================================================================
   Hooks
   ========================================================================== */

/** True while the browser reports a connection (only used for messages). */
function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

/**
 * True once the element is close to the screen. Used instead of
 * loading="lazy", which is unreliable in a sideways scrolling row.
 */
function useNearScreen(ref, margin = "300px 400px") {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || near) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near, margin]);

  return near;
}

/**
 * Tracks one player while it loads. If it has not reported "loaded" after a
 * while, `slow` turns on. The player itself is never hidden, because
 * embeds often work without ever firing a load event.
 */
function usePlayerLoad(enabled) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!enabled || ready) return undefined;
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [enabled, ready, attempt]);

  const markReady = useCallback(() => {
    setReady(true);
    setSlow(false);
  }, []);

  const markStuck = useCallback(() => setSlow(true), []);

  const retry = useCallback(() => {
    setReady(false);
    setSlow(false);
    setAttempt((value) => value + 1);
  }, []);

  return { attempt, ready, slow, markReady, markStuck, retry };
}

/* ==========================================================================
   Components
   ========================================================================== */

/** Cover shown over a player until it has loaded (or has taken too long). */
function Loader({ slow, onRetry }) {
  return (
    <div className={`reel-loader${slow ? " is-slow" : ""}`} role="status" aria-live="polite">
      {slow ? (
        <>
          <p className="reel-loader-text">Taking longer than usual…</p>
          <button type="button" onClick={onRetry}>Reload video</button>
        </>
      ) : (
        <>
          <span className="reel-spinner" aria-hidden="true" />
          <p className="reel-loader-text">Loading video…</p>
        </>
      )}
    </div>
  );
}

function ReelMedia({ video }) {
  const source = video.embedCode || video.url || "";
  const info = useMemo(() => getVideoInfo(source), [source]);
  const linkUrl = useMemo(() => extractSource(video.url || source), [video.url, source]);

  const frameRef = useRef(null);
  const near = useNearScreen(frameRef);

  const isPlayable = info?.type === "embed" || info?.type === "file";
  const load = usePlayerLoad(isPlayable && near);

  // Not embeddable: show a message or a plain link instead of a player.
  if (!isPlayable) {
    return (
      <div className="reel-frame" ref={frameRef}>
        {info ? (
          <div className="reel-link">
            <span>{info.name || "External link"}</span>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer">Open video link ↗</a>
          </div>
        ) : (
          <div className="reel-unavailable">Video link is invalid.</div>
        )}
      </div>
    );
  }

  const title = video.title || (info.type === "embed" ? `${info.name} video` : "Video");

  return (
    <div className={`reel-frame${load.ready ? " is-ready" : ""}`} ref={frameRef}>
      {near && info.type === "file" && (
        <video
          key={load.attempt}
          src={info.fileUrl}
          title={title}
          controls
          playsInline
          preload="metadata"
          onLoadedData={load.markReady}
          onError={load.markStuck}
        />
      )}

      {near && info.type === "embed" && (
        <iframe
          key={load.attempt}
          src={info.embedUrl}
          title={title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={load.markReady}
        />
      )}

      {!load.ready && <Loader slow={load.slow} onRetry={load.retry} />}
    </div>
  );
}

function ReelCard({ video }) {
  return (
    <article className="reel">
      <ReelMedia video={video} />
      {(video.title || video.description) && (
        <div className="reel-info">
          {video.title && <h3>{video.title}</h3>}
          {video.description && <p>{video.description}</p>}
        </div>
      )}
    </article>
  );
}

/* ==========================================================================
   Data
   ========================================================================== */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Loads published videos from Firestore, retrying with a growing pause. */
async function fetchVideos() {
  let lastError;

  for (let index = 0; index < FETCH_ATTEMPTS; index += 1) {
    try {
      const snapshot = await getDocs(query(collection(db, "tiktoks"), orderBy("order")));

      return snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .filter((video) => video.published === true && (video.url || video.embedCode));
    } catch (error) {
      lastError = error;
      if (index < FETCH_ATTEMPTS - 1) await wait(700 * 2 ** index); // 0.7s, 1.4s
    }
  }

  throw lastError;
}

/* ==========================================================================
   Section
   ========================================================================== */

export default function TikTokReels() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(configured && db ? "loading" : "off");
  const [reloadKey, setReloadKey] = useState(0);
  const online = useOnline();
  const wasOffline = useRef(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  // Load the list (again whenever `reload` is called).
  useEffect(() => {
    if (!configured || !db) return undefined;
    let alive = true;
    setStatus("loading");

    fetchVideos()
      .then((videos) => {
        if (!alive) return;
        setItems(videos);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("Video loading failed:", error);
        if (alive) setStatus("error");
      });

    return () => { alive = false; };
  }, [reloadKey]);

  // When the connection comes back, load the list again.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      reload();
    }
  }, [online, reload]);

  if (status === "off" || (status === "ready" && items.length === 0)) return null;

  return (
    <section
      className="reels"
      id="reels"
      aria-labelledby="reelsTitle"
      aria-busy={status === "loading"}
    >
      <div className="reels-head">
        <h2 id="reelsTitle">Short cuts</h2>
        <p>Quick edits from my videos. Swipe to see more.</p>
      </div>

      {status === "error" ? (
        <div className="reels-error" role="alert">
          <p>{online ? "The videos couldn't be loaded." : "No internet connection."}</p>
          <button type="button" onClick={reload}>Try again</button>
        </div>
      ) : (
        <div className="reels-row">
          {status === "loading" &&
            [0, 1, 2].map((index) => (
              <div className="reel skeleton" key={index} aria-hidden="true">
                <span className="reel-spinner" />
              </div>
            ))}

          {items.map((video) => (
            <ReelCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </section>
  );
}