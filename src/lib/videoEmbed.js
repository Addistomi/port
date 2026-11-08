// Shared by the admin Videos tab and the site's Short cuts section.

export function parseHttps(url = "") {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

// <iframe src="..."> -> the src
function srcFromIframe(code) {
  const m = code.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  return m ? m[1].replace(/&amp;/g, "&").trim() : null;
}

// TikTok's <blockquote class="tiktok-embed" ...> code -> embed URL
function srcFromTikTokCode(code) {
  if (!/tiktok-embed/i.test(code)) return null;
  const id =
    code.match(/data-video-id\s*=\s*["'](\d+)["']/i)?.[1] ||
    code.match(/cite\s*=\s*["'][^"']*\/video\/(\d+)/i)?.[1];
  return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
}

// Accepts an embed code, an embed URL, or a normal video link.
// Returns { type, name, label, link, embedUrl?, fileUrl? } or null if unusable.
export function resolveVideo(input = "") {
  const raw = String(input).trim();
  if (!raw) return null;

  let link = raw;
  let fromCode = false;

  if (raw.startsWith("<")) {
    link = srcFromTikTokCode(raw) || srcFromIframe(raw);
    fromCode = true;
    if (!link) return null;
  }

  const parsed = parseHttps(link);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const path = parsed.pathname;
  const make = (type, name, label, embedUrl) => ({ type, name, label, link, embedUrl });

  // TikTok: page link or embed URL
  if (host.endsWith("tiktok.com")) {
    const m =
      path.match(/\/video\/(\d+)/) ||
      path.match(/\/embed(?:\/v2)?\/(\d+)/) ||
      path.match(/\/player\/v1\/(\d+)/);
    if (m) return make("tiktok", "TikTok", "Watch on TikTok", `https://www.tiktok.com/embed/v2/${m[1]}`);
  }

  // YouTube
  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    let id = null;
    if (host === "youtu.be") id = path.split("/")[1];
    else if (path === "/watch") id = parsed.searchParams.get("v");
    else {
      const m = path.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
      id = m ? m[1] : null;
    }
    if (id) {
      return make("youtube", "YouTube", "Watch on YouTube",
        `https://www.youtube.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`);
    }
  }

  // Instagram
  if (host.endsWith("instagram.com")) {
    const m = path.match(/\/(reel|reels|p|tv)\/([\w-]+)/);
    if (m) {
      const kind = m[1] === "reels" ? "reel" : m[1];
      return make("instagram", "Instagram", "Watch on Instagram",
        `https://www.instagram.com/${kind}/${m[2]}/embed`);
    }
  }

  // Vimeo (page link or player link)
  if (host.endsWith("vimeo.com")) {
    const m = path.match(/\/(?:video\/)?(\d+)/);
    if (m) return make("vimeo", "Vimeo", "Watch on Vimeo", `https://player.vimeo.com/video/${m[1]}`);
  }

  // Facebook (plugin URLs are already embeds)
  if (host.endsWith("facebook.com") || host === "fb.watch") {
    const embedUrl = path.startsWith("/plugins/")
      ? link
      : `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(link)}&show_text=false`;
    return make("facebook", "Facebook", "Watch on Facebook", embedUrl);
  }

  // Google Drive
  if (host === "drive.google.com" || host === "docs.google.com") {
    const m = path.match(/\/file\/d\/([^/]+)/);
    const id = m ? m[1] : parsed.searchParams.get("id");
    if (id) {
      return make("drive", "Google Drive", "Open Google Drive video",
        `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`);
    }
  }

  // Direct video file
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(path)) {
    return { type: "file", name: "Video file", label: "Open video", link, fileUrl: link };
  }

  // An iframe from any other site: trust its src as the embed
  if (fromCode) return make("embed", "Embed", "Open video", link);

  // Anything else is shown as a link card
  return { type: "link", name: "Link", label: "Open link", link };
}