import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db, configured } from "../firebase.js";

/**
 * Wedding videos from two Firestore collections:
 *   wedding  -> landscape videos
 *   pwedding -> portrait videos
 *
 * Current document fields:
 *   title, sortOrder, description, embedUrl, published
 *
 * The legacy url/embedCode/order field names are also read temporarily so
 * older documents can still display while they are migrated.
 */

const LANDSCAPE_COLLECTION = "wedding";
const PORTRAIT_COLLECTION = "pwedding";
const SLOW_AFTER_MS = 8000;

const IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)$/i;

// Accept a plain URL or a full iframe snippet and return its src URL.
function extractSource(value = "") {
  const input = String(value ?? "").trim();
  const match = input.match(IFRAME_SRC);
  return (match ? match[1] : input).replace(/&amp;/g, "&").trim();
}

function parseUrl(value = "") {
  try {
    const url = new URL(extractSource(value));
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function vimeoEmbed({ url, path }) {
  const match = path.match(/\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
  if (!match) return null;

  const params = new URLSearchParams(url.search);
  const hash = match[2] || params.get("h");
  if (hash) params.set("h", hash);

  ["title", "byline", "portrait", "badge"].forEach((key) =>
    params.set(key, "0")
  );
  params.set("dnt", "1");
  params.set("playsinline", "1");

  return `https://player.vimeo.com/video/${match[1]}?${params.toString()}`;
}

const PROVIDERS = [
  {
    name: "Vimeo",
    match: (host) => host === "vimeo.com" || host.endsWith(".vimeo.com"),
    embed: vimeoEmbed,
  },
  {
    name: "YouTube",
    match: (host) =>
      host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com"),
    embed: ({ url, host, path }) => {
      const id =
        host === "youtu.be"
          ? path.split("/")[1]
          : path === "/watch"
            ? url.searchParams.get("v")
            : path.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/)?.[1];

      return id
        ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`
        : null;
    },
  },
  {
    name: "TikTok",
    match: (host) => host === "tiktok.com" || host.endsWith(".tiktok.com"),
    embed: ({ path }) => {
      const id =
        path.match(/\/video\/(\d+)/)?.[1] ||
        path.match(/\/embed\/v2\/(\d+)/)?.[1];
      return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
    },
  },
  {
    name: "Instagram",
    match: (host) => host === "instagram.com" || host.endsWith(".instagram.com"),
    embed: ({ path }) => {
      const match = path.match(/\/(reel|reels|p|tv)\/([\w-]+)/);
      if (!match) return null;
      const kind = match[1] === "reels" ? "reel" : match[1];
      return `https://www.instagram.com/${kind}/${match[2]}/embed`;
    },
  },
  {
    name: "Facebook",
    match: (host) =>
      host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch",
    embed: ({ url, path }) => {
      if (path.startsWith("/plugins/video.php")) return url.href;
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.href)}&show_text=false`;
    },
  },
  {
    name: "Google Drive",
    match: (host) => host === "drive.google.com" || host.endsWith(".drive.google.com") || host === "docs.google.com",
    embed: ({ url, path }) => {
      const id = path.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
      return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : null;
    },
  },
];

/** Convert a saved embed URL into an iframe or direct-video source. */
function getVideoInfo(value = "") {
  const url = parseUrl(value);
  if (!url) return null;

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

  // The admin stores iframe src values in embedUrl. Support custom embed
  // providers too, not only the providers listed above.
  return { type: "embed", name: "Embedded video", embedUrl: url.href };
}

/** Live list of published documents from one collection. */
function useVideoCollection(name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!configured || !db) {
      setLoading(false);
      setError("Firebase is not configured.");
      return undefined;
    }

    setLoading(true);
    setError("");

    // Firestore security rules are not filters. This query explicitly limits
    // public reads to documents whose published field is boolean true.
    const publishedQuery = query(
      collection(db, name),
      where("published", "==", true)
    );

    const unsubscribe = onSnapshot(
      publishedQuery,
      (snapshot) => {
        const nextItems = snapshot.docs
          .map((document) => {
            const data = document.data();
            return {
              id: document.id,
              ...data,
              // Current schema first; legacy fields are fallback only.
              embedUrl: data.embedUrl || data.embedCode || data.url || "",
              sortOrder: Number(data.sortOrder ?? data.order ?? 0),
            };
          })
          .filter((video) => video.embedUrl)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        setItems(nextItems);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error(`Firestore read failed for "${name}":`, err);
        setItems([]);
        setLoading(false);
        setError(err?.message || err?.code || "Could not load videos.");
      }
    );

    return unsubscribe;
  }, [name]);

  return { items, loading, error };
}

/** True when the player is close to the viewport. */
function useNearScreen(ref, margin = "300px 0px") {
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

/** Tracks player load and exposes a retry action. */
function usePlayerLoad(enabled) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!enabled || ready) return undefined;
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
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

function Loader({ slow, onRetry }) {
  return (
    <div className={`wd-loader${slow ? " is-slow" : ""}`} role="status" aria-live="polite">
      {slow ? (
        <>
          <p className="wd-loader-text">Taking longer than usual…</p>
          <button type="button" onClick={onRetry}>Reload video</button>
        </>
      ) : (
        <>
          <span className="wd-spinner" aria-hidden="true" />
          <p className="wd-loader-text">Loading video…</p>
        </>
      )}
    </div>
  );
}

function WeddingMedia({ video, portrait }) {
  const source = video.embedUrl || video.embedCode || video.url || "";
  const info = useMemo(() => getVideoInfo(source), [source]);
  const linkUrl = useMemo(() => extractSource(source), [source]);

  const frameRef = useRef(null);
  const near = useNearScreen(frameRef);
  const isPlayable = info?.type === "embed" || info?.type === "file";
  const load = usePlayerLoad(isPlayable && near);
  const frameClass = `wd-frame ${portrait ? "wd-frame--port" : "wd-frame--land"}`;

  if (!isPlayable) {
    return (
      <div className={frameClass} ref={frameRef}>
        <div className="wd-fallback">
          {info ? (
            <>
              <span>{info.name || "External link"}</span>
              <a href={linkUrl} target="_blank" rel="noopener noreferrer">Open video link ↗</a>
            </>
          ) : (
            <span>Video link is invalid.</span>
          )}
        </div>
      </div>
    );
  }

  const title = video.title || `${info.name || "Wedding"} video`;

  return (
    <div className={frameClass} ref={frameRef}>
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
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={load.markReady}
        />
      )}

      {near && !load.ready && <Loader slow={load.slow} onRetry={load.retry} />}
    </div>
  );
}

function WeddingCard({ video, portrait }) {
  return (
    <article className="wd-card">
      <WeddingMedia video={video} portrait={portrait} />
      {(video.title || video.description) && (
        <div className="wd-info">
          {video.title && <h4>{video.title}</h4>}
          {video.description && <p>{video.description}</p>}
        </div>
      )}
    </article>
  );
}

export default function WeddingVideos() {
  const filmsState = useVideoCollection(LANDSCAPE_COLLECTION);
  const shortsState = useVideoCollection(PORTRAIT_COLLECTION);

  const films = filmsState.items;
  const shorts = shortsState.items;
  const errors = [filmsState.error, shortsState.error].filter(Boolean);
  const loading = filmsState.loading || shortsState.loading;

  // Keep the section hidden when no published videos exist. Show a useful
  // diagnostic only when Firestore reports an actual read/configuration error.
  if (!loading && films.length === 0 && shorts.length === 0 && errors.length === 0) {
    return null;
  }

  return (
    <section className="wd" id="weddings" aria-labelledby="weddingsTitle">
      <div className="wd-wrap">
        <div className="wd-head">
          <h2 id="weddingsTitle">Wedding video edits</h2>
          <p className="wd-sub">Highlights and films from the weddings I've edited.</p>
        </div>

        {errors.length > 0 && (
          <p className="wd-load-error" role="status">
            Wedding videos could not be loaded. Please check the Firestore rules and browser console.
          </p>
        )}

        {loading && films.length === 0 && shorts.length === 0 && (
          <p className="wd-sub" role="status">Loading wedding videos…</p>
        )}

        {films.length > 0 && (
          <div className="wd-block">
            <div className="wd-grid wd-grid--land">
              {films.map((video) => (
                <WeddingCard key={video.id} video={video} portrait={false} />
              ))}
            </div>
          </div>
        )}

        {shorts.length > 0 && (
          <div className="wd-block">
            <h3 className="wd-block-title">Short wedding videos</h3>
            <div className="wd-grid wd-grid--port">
              {shorts.map((video) => (
                <WeddingCard key={video.id} video={video} portrait />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
