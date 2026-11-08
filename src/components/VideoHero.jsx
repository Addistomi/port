import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db, configured } from "../firebase.js";

/**
 * Reads ONE document: site/settings
 *   reelUrl       string  required  a Vimeo / YouTube / .mp4 link,
 *                                   OR a pasted <iframe> embed code
 *   heroTitle     string  optional  (nothing is shown if empty)
 *   heroSubtitle  string  optional
 *   reelPoster    string  optional  cover image for direct video files
 */

const VIMEO_ORIGIN = "https://player.vimeo.com";
const GIVE_UP_LOADER_MS = 8000; // hide the loader even if no "playing" signal arrives

// true  = clean hero: no title, author, avatar, badge or controls (video just plays)
// false = normal player with controls, but still without title/author/avatar/badge
const CLEAN_PLAYER = true;

const IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i;

/* ==========================================================================
   Link helpers
   ========================================================================== */

/** Accepts a plain URL or a pasted <iframe> embed code and returns the URL. */
function extractSource(value = "") {
  const input = String(value).trim();
  const match = input.match(IFRAME_SRC);
  return (match ? match[1] : input).replace(/&amp;/g, "&").trim();
}

function parseUrl(value = "") {
  try {
    const parsed = new URL(extractSource(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function getYouTubeId(value = "") {
  const parsed = parseUrl(value);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  let id = null;

  if (host === "youtu.be") {
    id = parsed.pathname.split("/")[1];
  } else if (["youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    id =
      parsed.pathname === "/watch"
        ? parsed.searchParams.get("v")
        : parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/)?.[1];
  }

  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

/** Returns { src, pageUrl } for a Vimeo link or embed code, or null. */
function getVimeo(value = "") {
  const parsed = parseUrl(value);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const match = parsed.pathname.match(/\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
  if (!match) return null;

  const [, id, pathHash] = match;
  // Unlisted videos carry a hash, either in the path or as ?h=...
  const hash = pathHash || parsed.searchParams.get("h");

  const params = new URLSearchParams({
    autoplay: "1",   // browsers only allow autoplay when muted
    muted: "1",
    loop: "1",
    playsinline: "1",
    autopause: "0",
    title: "0",
    byline: "0",
    portrait: "0",
    badge: "0",
    dnt: "1",
  });

  // "background" mode hides every Vimeo overlay and the control bar.
  if (CLEAN_PLAYER) params.set("background", "1");

  if (hash) params.set("h", hash);

  return {
    src: `${VIMEO_ORIGIN}/video/${id}?${params}`,
    pageUrl: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}`,
  };
}

/**
 * Returns { type: "embed" | "file", src, provider?, pageUrl? }
 * or null when the link is not supported.
 */
function getPlayer(value) {
  const vimeo = getVimeo(value);
  if (vimeo) return { type: "embed", provider: "vimeo", ...vimeo };

  const youtubeId = getYouTubeId(value);
  if (youtubeId) {
    return {
      type: "embed",
      provider: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&playsinline=1&rel=0&modestbranding=1`,
    };
  }

  const parsed = parseUrl(value);
  if (!parsed) return null;

  if (/\.(mp4|webm|ogg|mov)$/i.test(parsed.pathname)) {
    return { type: "file", src: parsed.href };
  }

  // Any other pasted <iframe> embed code is shown as it is.
  if (IFRAME_SRC.test(String(value))) {
    return { type: "embed", provider: "other", src: parsed.href };
  }

  return null;
}

/* ==========================================================================
   Hooks
   ========================================================================== */

/** Cover image of a Vimeo video, fetched from Vimeo's public oEmbed API. */
function useVimeoPoster(pageUrl, fallback = "") {
  const [poster, setPoster] = useState(fallback);

  useEffect(() => {
    setPoster(fallback);
    if (!pageUrl) return undefined;

    const controller = new AbortController();
    const endpoint = `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(pageUrl)}`;

    fetch(endpoint, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.thumbnail_url && setPoster(data.thumbnail_url))
      .catch(() => {}); // the poster is optional

    return () => controller.abort();
  }, [pageUrl, fallback]);

  return poster;
}

/* ==========================================================================
   Components
   ========================================================================== */

/** Cover + animation shown until the video is really playing. */
function Loader({ poster, hidden }) {
  return (
    <div
      className={`vh__loader${hidden ? " is-hidden" : ""}`}
      role="status"
      aria-live="polite"
      aria-hidden={hidden}
    >
      {poster && <img className="vh__poster" src={poster} alt="" fetchPriority="high" />}
      <span className="vh__ring" aria-hidden="true" />
      <p className="vh__loader-text">Loading video…</p>
      <span className="vh__scan" aria-hidden="true" />
    </div>
  );
}

function HeroPlayer({ player, title, poster }) {
  const iframeRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Safety net: hide the loader even if no "playing" signal ever arrives.
  useEffect(() => {
    const timer = setTimeout(() => setPlaying(true), GIVE_UP_LOADER_MS);
    return () => clearTimeout(timer);
  }, []);

  // Vimeo tells us (through postMessage) when the video starts playing.
  useEffect(() => {
    if (player.provider !== "vimeo") return undefined;

    const onMessage = (event) => {
      if (event.origin !== VIMEO_ORIGIN) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.event === "play" || data?.event === "playProgress") setPlaying(true);
      } catch {
        /* ignore messages that are not JSON */
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [player.provider]);

  const handleIframeLoad = () => {
    if (player.provider === "vimeo") {
      // Ask the Vimeo player to tell us when it starts playing.
      ["play", "playProgress"].forEach((value) => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ method: "addEventListener", value }),
          VIMEO_ORIGIN
        );
      });
    } else {
      setPlaying(true);
    }
  };

  return (
    <>
      {player.type === "embed" ? (
        <iframe
          ref={iframeRef}
          className="vh__media"
          src={player.src}
          title={title || "Showreel"}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleIframeLoad}
        />
      ) : (
        <video
          className="vh__media"
          src={player.src}
          poster={poster || undefined}
          controls
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setPlaying(true)}
        />
      )}

      <Loader poster={poster} hidden={playing} />
    </>
  );
}

export default function VideoHero({ embedded = false }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | empty | error
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!configured || !db) {
      setStatus("error");
      setErrorMessage("Firebase is not configured. Check your Firebase settings.");
      return undefined;
    }

    return onSnapshot(
      doc(db, "site", "settings"),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setSettings(data);
        setStatus(data?.reelUrl ? "ready" : "empty");
      },
      (error) => {
        console.error("Hero video fetch failed:", error);
        setErrorMessage(error.code ? `${error.code}: ${error.message}` : error.message || "Unknown Firebase error.");
        setStatus("error");
      }
    );
  }, []);

  const reelUrl = settings?.reelUrl;
  const player = useMemo(() => (reelUrl ? getPlayer(reelUrl) : null), [reelUrl]);
  const poster = useVimeoPoster(player?.pageUrl, settings?.reelPoster);

  const title = settings?.heroTitle || "";
  const hasText = Boolean(title || settings?.heroSubtitle);

  return (
    <section className={`vh${hasText ? "" : " vh--solo"}${embedded ? " vh--embedded" : ""}`}>
      {hasText && (
        <div className="vh__text">
          {title && <h1 className="vh__title">{title}</h1>}
          {settings?.heroSubtitle && <p className="vh__subtitle">{settings.heroSubtitle}</p>}
        </div>
      )}

      <div className="vh__stage">
        <div className="vh__frame">
          {status === "loading" && <Loader hidden={false} />}

          {status === "ready" && player && (
            // key: a new link starts a fresh player and a fresh loader
            <HeroPlayer key={player.src} player={player} title={title} poster={poster} />
          )}

          {status === "ready" && !player && (
            <p className="vh__msg">
              The reel link isn't supported. Use a Vimeo, YouTube or .mp4 link, or a pasted embed code.
            </p>
          )}

          {status === "empty" && (
            <p className="vh__msg">No reel yet. Add a reelUrl field to site/settings in Firestore.</p>
          )}

          {status === "error" && (
            <div className="vh__msg" role="alert">
              <p>Couldn't load the video. Please refresh and try again.</p>
              <p>
                <small>{errorMessage}</small>
              </p>
            </div>
          )}
        </div>

        {/* Decorative editing timeline */}
        <div className="vh__timeline" aria-hidden="true">
          <div className="vh__ruler" />
          <div className="vh__track">
            <span className="vh__clip vh__clip--a" />
            <span className="vh__clip vh__clip--b" />
            <span className="vh__clip vh__clip--c" />
          </div>
          <div className="vh__playhead" />
        </div>
      </div>
    </section>
  );
}