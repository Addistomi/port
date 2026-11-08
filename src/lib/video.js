// Works out what kind of video link you pasted.
// Videos stay on YouTube, Vimeo or any web address (free). Firebase only stores the link.

function identify(url) {
  if (!url || !/^https:\/\//.test(url)) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  let id = null;
  if (host === "youtu.be") {
    id = u.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/);
      if (m) id = m[2];
    }
  }
  if (id && /^[\w-]{6,15}$/.test(id)) return { provider: "youtube", id };

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(\d{6,})/);
    if (m) {
      const hash = u.pathname.match(/\/\d+\/([a-f0-9]+)/)?.[1] || u.searchParams.get("h");
      return { provider: "vimeo", id: m[1], hash };
    }
  }
  return null;
}

// For project films: click to play, with sound.
export function parseVideo(url) {
  const v = identify(url);
  if (!v) return null;
  if (v.provider === "youtube") {
    return {
      provider: "youtube",
      embed: `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&autoplay=1`,
      thumbs: [
        `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      ],
    };
  }
  return {
    provider: "vimeo",
    embed: `https://player.vimeo.com/video/${v.id}?autoplay=1${v.hash ? `&h=${v.hash}` : ""}`,
    thumbs: [], // Vimeo has no public thumbnail URL
  };
}

// For the hero showreel: starts by itself, muted, and loops.
export function parseReel(url) {
  const v = identify(url);
  if (v?.provider === "youtube") {
    return {
      provider: "youtube",
      embed: `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&playsinline=1&rel=0`,
    };
  }
  if (v?.provider === "vimeo") {
    return {
      provider: "vimeo",
      embed: `https://player.vimeo.com/video/${v.id}?autoplay=1&muted=1&loop=1&playsinline=1${v.hash ? `&h=${v.hash}` : ""}`,
    };
  }
  // A direct video file, for example https://example.com/reel.mp4
  if (/^https:\/\/.+\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url || "")) {
    return { provider: "file", src: url };
  }
  return null;
}