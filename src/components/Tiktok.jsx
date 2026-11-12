import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db, configured } from "../firebase.js";

/* ==========================================================================
   Settings
   ========================================================================== */

const SLOW_AFTER_MS = 8000;        // after this, a "Reload / Open original" pill appears
const FETCH_ATTEMPTS = 3;          // tries for the Firestore video list
const CACHE_KEY = "reels:list:v1"; // last good list, shown instantly on repeat visits

const IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)$/i;
const VIMEO_PLAYER = /^https:\/\/player\.vimeo\.com\//;

const saveData = () =>
  typeof navigator !== "undefined" && navigator.connection?.saveData === true;

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

/** Adds autoplay for players that support it (used after the viewer taps play). */
function withAutoplay(href) {
  try {
    const url = new URL(href);
    if (url.hostname.endsWith("youtube.com") || url.hostname === "player.vimeo.com") {
      url.searchParams.set("autoplay", "1");
    }
    return url.href;
  } catch {
    return href;
  }
}

/**
 * One entry per supported site.
 *   embed  -> player URL, or a falsy value when the link is not a video
 *   poster -> optional cover image URL that needs no network lookup
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
    poster: (embedUrl) => {
      const id = new URL(embedUrl).pathname.split("/").pop();
      return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
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
 *   { type: "embed", embedUrl, poster? } -> <iframe> (after the viewer taps play)
 *   { type: "file",  fileUrl }           -> <video>  (after the viewer taps play)
 *   { type: "link" }                     -> plain link (not embeddable)
 *   null                                 -> not a valid URL
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
    if (embedUrl) {
      return { type: "embed", name: provider.name, embedUrl, poster: provider.poster?.(embedUrl) };
    }
  }

  if (VIDEO_FILE.test(url.pathname)) {
    return { type: "file", name: "Video file", fileUrl: url.href };
  }

  return { type: "link", name: host };
}

/* ==========================================================================
   Small helpers (network)
   ========================================================================== */

const posterCache = new Map();

/** Vimeo cover image through oEmbed. Cached, and returns "" on any failure. */
function vimeoPoster(embedUrl) {
  if (!posterCache.has(embedUrl)) {
    const request = fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(embedUrl)}&width=480`
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.thumbnail_url || "")
      .catch(() => "");
    posterCache.set(embedUrl, request);
  }
  return posterCache.get(embedUrl);
}

const warmedOrigins = new Set();

/** Opens the connection to a player a moment before the viewer taps play. */
function warmUp(href) {
  try {
    const { origin } = new URL(href);
    if (warmedOrigins.has(origin)) return;
    warmedOrigins.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  } catch {
    /* ignore */
  }
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
 * True once the element is close to the visible part of the scrolling row.
 * The row itself is the observer root, because rootMargin does not reach
 * past an ancestor scroll container when the root is the page.
 */
function useNearScreen(ref, rootRef, margin = "0px 400px") {
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
      { root: rootRef?.current ?? null, rootMargin: margin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootRef, near, margin]);

  return near;
}

/** Cover image: a given one, an automatic one, or a Vimeo one (looked up once). */
function usePoster(video, info, enabled) {
  const given = video.poster || info?.poster || "";
  const embedUrl = info?.type === "embed" ? info.embedUrl : "";
  const [fetched, setFetched] = useState("");

  useEffect(() => {
    if (given || !enabled || !VIMEO_PLAYER.test(embedUrl) || saveData()) return undefined;
    let alive = true;
    vimeoPoster(embedUrl).then((url) => {
      if (alive) setFetched(url);
    });
    return () => { alive = false; };
  }, [given, enabled, embedUrl]);

  return given || fetched;
}

/**
 * Tracks one player after the viewer taps play. If it has not reported
 * "loaded" after a while, `slow` turns on. The player is never hidden for
 * good, because embeds often work without ever firing a load event.
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

/** Message shown over the cover while the player loads. */
function Loader({ slow, onRetry, href }) {
  if (!slow) {
    return (
      <div className="reel-status" role="status" aria-live="polite">
        <span className="reel-spinner" aria-hidden="true" />
        <p>Loading video…</p>
      </div>
    );
  }

  return (
    <div className="reel-status is-slow" role="status" aria-live="polite">
      <p>Taking longer than usual…</p>
      <div className="reel-actions">
        <button type="button" onClick={onRetry}>Reload</button>
        <a href={href} target="_blank" rel="noopener noreferrer">Open original ↗</a>
      </div>
    </div>
  );
}

function ReelMedia({ video, rootRef, active, onActivate }) {
  const source = video.embedCode || video.url || "";
  const info = useMemo(() => getVideoInfo(source), [source]);
  const linkUrl = useMemo(() => extractSource(video.url || source), [video.url, source]);

  const frameRef = useRef(null);
  const near = useNearScreen(frameRef, rootRef);
  const poster = usePoster(video, info, near);
  const load = usePlayerLoad(active);

  const isPlayable = info?.type === "embed" || info?.type === "file";

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
  const slow = active && load.slow;
  const warm = () => warmUp(info.embedUrl || info.fileUrl);

  return (
    <div className="reel-frame" ref={frameRef}>
      {active && info.type === "file" && (
        <video
          key={load.attempt}
          src={info.fileUrl}
          title={title}
          poster={poster || undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          onLoadedData={load.markReady}
          onError={load.markStuck}
        />
      )}

      {active && info.type === "embed" && (
        <iframe
          key={load.attempt}
          src={withAutoplay(info.embedUrl)}
          title={title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={load.markReady}
        />
      )}

      {!load.ready && (
        <div className={`reel-cover${slow ? " is-slow" : active ? " is-loading" : ""}`}>
          {near && poster && !slow && (
            <img className="reel-poster" src={poster} alt="" decoding="async" draggable="false" />
          )}

          {active ? (
            <Loader slow={slow} onRetry={load.retry} href={linkUrl} />
          ) : (
            <>
              <button
                type="button"
                className="reel-play"
                aria-label={`Play ${title}`}
                onClick={onActivate}
                onPointerEnter={warm}
                onFocus={warm}
              >
                <span className="reel-play-icon" aria-hidden="true" />
              </button>
              <span className="reel-source">{info.name}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReelCard({ video, rootRef }) {
  const [active, setActive] = useState(false);
  const activate = useCallback(() => setActive(true), []);

  return (
    <article className={`reel${active ? " is-playing" : ""}`}>
      <ReelMedia video={video} rootRef={rootRef} active={active} onActivate={activate} />
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

function readCache() {
  try {
    const list = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: ignore */
  }
}

/** Loads published videos from Firestore, retrying with a growing pause. */
async function fetchVideos() {
  let lastError;

  for (let index = 0; index < FETCH_ATTEMPTS; index += 1) {
    try {
      const snapshot = await getDocs(query(collection(db, "tiktoks"), orderBy("order")));

      return snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((video) => video.published === true && (video.url || video.embedCode))
        .map(({ id, title, description, url, embedCode, poster }) => ({
          id, title, description, url, embedCode, poster,
        }));
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
  const canLoad = Boolean(configured && db);

  const [items, setItems] = useState(() => (canLoad ? readCache() : []));
  const [status, setStatus] = useState(() =>
    !canLoad ? "off" : items.length ? "ready" : "loading"
  );
  const [reloadKey, setReloadKey] = useState(0);
  const online = useOnline();
  const wasOffline = useRef(false);
  const rowRef = useRef(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  // Load the list (again whenever `reload` is called).
  useEffect(() => {
    if (!canLoad) {
      console.warn("Reels: Firebase is not configured, so the section is hidden.");
      return undefined;
    }

    let alive = true;
    setStatus((current) => (current === "ready" ? current : "loading"));

    fetchVideos()
      .then((videos) => {
        if (!alive) return;
        setItems(videos);
        setStatus("ready");
        writeCache(videos);
      })
      .catch((error) => {
        console.error("Video loading failed:", error);
        if (alive) setStatus("error");
      });

    return () => { alive = false; };
  }, [canLoad, reloadKey]);

  // When the connection comes back, load the list again.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      reload();
    }
  }, [online, reload]);

  // Arrow buttons for mouse users.
  const scrollRow = useCallback((direction) => {
    const row = rowRef.current;
    if (!row) return;
    const card = row.querySelector(".reel");
    const gap = parseFloat(getComputedStyle(row).columnGap) || 16;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({
      left: direction * ((card?.offsetWidth ?? 280) + gap),
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  const hasItems = items.length > 0;

  if (status === "off" || (status === "ready" && !hasItems)) return null;

  const showError = status === "error" && !hasItems;
  const showSkeleton = status === "loading" && !hasItems;

  return (
    <section
      className="reels"
      id="reels"
      aria-labelledby="reelsTitle"
      aria-busy={status === "loading"}
    >
      <div className="reels-head">
        <div>
          <h2 id="reelsTitle">Short cuts</h2>
          <p>Quick edits from my videos. Tap one to play.</p>
        </div>

        {items.length > 1 && (
          <div className="reels-nav">
            <button type="button" onClick={() => scrollRow(-1)} aria-label="Previous videos">‹</button>
            <button type="button" onClick={() => scrollRow(1)} aria-label="Next videos">›</button>
          </div>
        )}
      </div>

      {showError ? (
        <div className="reels-error" role="alert">
          <p>{online ? "The videos couldn't be loaded." : "No internet connection."}</p>
          <button type="button" onClick={reload}>Try again</button>
        </div>
      ) : (
        <div className="reels-row" ref={rowRef}>
          {showSkeleton &&
            [0, 1, 2].map((index) => (
              <div className="reel skeleton" key={index} aria-hidden="true">
                <span className="reel-spinner" />
              </div>
            ))}

          {items.map((video) => (
            <ReelCard key={video.id} video={video} rootRef={rowRef} />
          ))}
        </div>
      )}
    </section>
  );
}
