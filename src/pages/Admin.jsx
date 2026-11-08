import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { auth, configured, db } from "../firebase";
import { sampleProjects } from "../data/sampleProjects.js";
import Media from "../components/Media.jsx";

const ART = ["road", "glitch", "sails", "bloom", "phones"];
const TYPES = ["Documentary","Educational", "Vlog", "Podcast", "Short"];

const BLANK = {
  title: "",
  type: "Documentary",
  len: "",
  role: "",
  tools: "",
  blurb: "",
  art: "road",
  pal: ["#F2A65A", "#C8553D", "#FFE3A3"],
  clr: "#3558E8",
  on: "#ffffff",
  featured: false,
  published: true,
  gradeNote: "",
  order: 99,
  thumbUrl: "",
  videoUrl: "",
};

const BLANK_TT = {
  url: "",
  title: "",
  description: "",
  order: 1,
  published: true,
};

// Wedding videos: landscape (1920 x 1080) and portrait (1080 x 1920) are two collections.
const WEDDING_FORMATS = {
  landscape: {
    collection: "wedding",
    label: "Landscape",
    size: "1920 × 1080",
    ratio: "16 / 9",
    heading: "Wedding films · 1920 × 1080",
  },
  portrait: {
    collection: "pwedding",
    label: "Portrait (short)",
    size: "1080 × 1920",
    ratio: "9 / 16",
    heading: "Short wedding videos · 1080 × 1920",
  },
};

const BLANK_WEDDING = {
  embedUrl: "",
  title: "",
  sortOrder: 1,
  description: "",
  published: true,
};

const AVATAR = [
  "var(--c1)",
  "var(--c2)",
  "var(--c3)",
  "var(--c4)",
  "var(--c5)",
];

// In the form, "imageUrl" is the box where you paste EITHER a normal image link
// OR a YouTube link. On save it is turned into the real image address.
const THUMB_BLANK = {
  title: "",
  imageUrl: "",
  type: "",
  length: "",
  role: "",
  tools: "",
  blurb: "",
  published: true,
};

// ---------- video link helpers (any link is accepted) ----------

// Accept either a normal video URL or a complete iframe snippet.
function extractEmbedSource(value = "") {
  const input = value.trim();
  const iframeMatch = input.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  return (iframeMatch ? iframeMatch[1] : input).replaceAll("&amp;", "&").trim();
}

function parseVideoUrl(value = "") {
  try {
    const parsed = new URL(extractEmbedSource(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

// Works out what kind of link this is. Same rules as the reels section on the site.
function getVideoInfo(url = "") {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const path = parsed.pathname;

  if (host.endsWith("tiktok.com")) {
    const m = path.match(/\/video\/(\d+)/);
    if (m) {
      return {
        type: "tiktok",
        name: "TikTok",
        embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`,
      };
    }
  }

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    let id = null;
    if (host === "youtu.be") id = path.split("/")[1];
    else if (path === "/watch") id = parsed.searchParams.get("v");
    else {
      const m = path.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
      id = m ? m[1] : null;
    }
    if (id) {
      return {
        type: "youtube",
        name: "YouTube",
        embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(
          id
        )}?playsinline=1&rel=0`,
      };
    }
  }

  if (host.endsWith("instagram.com")) {
    const m = path.match(/\/(reel|reels|p|tv)\/([\w-]+)/);
    if (m) {
      const kind = m[1] === "reels" ? "reel" : m[1];
      return {
        type: "instagram",
        name: "Instagram",
        embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed`,
      };
    }
  }

  if (host.endsWith("vimeo.com")) {
    const m = path.match(/\/(?:video\/)?(\d+)/);
    if (m) {
      // Preserve Vimeo privacy/hash parameters when a player URL is pasted.
      const embedUrl =
        host === "player.vimeo.com" && path.startsWith("/video/")
          ? parsed.href
          : `https://player.vimeo.com/video/${m[1]}${parsed.search}${parsed.hash}`;
      return { type: "vimeo", name: "Vimeo", embedUrl };
    }
  }

  if (host.endsWith("facebook.com") || host === "fb.watch") {
    return {
      type: "facebook",
      name: "Facebook",
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
        url.trim()
      )}&show_text=false`,
    };
  }

  if (host === "drive.google.com" || host === "docs.google.com") {
    const m = path.match(/\/file\/d\/([^/]+)/);
    const id = m ? m[1] : parsed.searchParams.get("id");
    if (id) {
      return {
        type: "drive",
        name: "Google Drive",
        embedUrl: `https://drive.google.com/file/d/${encodeURIComponent(
          id
        )}/preview`,
      };
    }
  }

  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(path)) {
    return { type: "file", name: "Video file", fileUrl: url.trim() };
  }

  // Any other link is still saved and shows on the site as a link card.
  return { type: "link", name: "Link" };
}

// ---------- thumbnail link helpers (YouTube link OR normal image link) ----------

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

// Turns whatever was pasted into what gets saved. Returns null if it is not a valid link.
function resolveThumbSource(value = "") {
  const raw = String(value).trim();

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  const videoId = getYouTubeId(raw);

  if (videoId) {
    return {
      kind: "youtube",
      videoId,
      sourceUrl: raw,
      imageUrl: youTubeThumbCandidates(videoId)[0],
    };
  }

  return { kind: "image", videoId: "", sourceUrl: raw, imageUrl: raw };
}

// Shows the thumbnail for a pasted link. For YouTube it falls back to a smaller
// size if the biggest one does not exist for that video.
function ThumbImg({ value, alt, style }) {
  const [index, setIndex] = useState(0);

  const info = resolveThumbSource(value || "");
  const sources = info
    ? info.kind === "youtube"
      ? youTubeThumbCandidates(info.videoId)
      : [info.imageUrl]
    : [];

  useEffect(() => {
    setIndex(0);
  }, [value]);

  if (sources.length === 0 || index >= sources.length) {
    return <span className="hint2">No image</span>;
  }

  return (
    <img
      src={sources[index]}
      alt={alt}
      style={style}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}

// Compress images for regular projects.
// The Thumbnails tab below uses image or YouTube links instead.
function fileToThumb(file, maxWidth = 1280, maxChars = 800000) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(
        new Error("Please choose an image file (JPG, PNG or WebP).")
      );
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      reject(
        new Error(
          "The original image is too large. Choose an image under 20 MB."
        )
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error("The selected image is invalid."));
        return;
      }

      let w = Math.min(maxWidth, img.naturalWidth);
      let quality = 0.82;

      for (let i = 0; i < 10; i++) {
        const h = Math.max(
          1,
          Math.round((img.naturalHeight / img.naturalWidth) * w)
        );

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(
            new Error("Your browser could not process this image.")
          );
          return;
        }

        context.drawImage(img, 0, 0, w, h);

        const output = canvas.toDataURL("image/jpeg", quality);

        if (output.length <= maxChars) {
          resolve(output);
          return;
        }

        w = Math.max(1, Math.round(w * 0.8));
        quality = Math.max(0.35, quality - 0.06);
      }

      reject(
        new Error(
          "This image is too large after compression. Choose a smaller image."
        )
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };

    img.src = url;
  });
}

// Display an uploaded project thumbnail or generated artwork.
function Thumb({ p }) {
  return p.thumbUrl ? (
    <img src={p.thumbUrl} alt={p.title || "Project thumbnail"} />
  ) : (
    <Media p={p} />
  );
}

// ---------- small pieces ----------

const Eye = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

function Shell({ children, right }) {
  return (
    <div className="admin">
      <header className="admin-top">
        <div className="wrap">
          <a className="brand" href="/">
            <i aria-hidden="true" />
            Admin <small>Edit suite</small>
          </a>

          <div className="acts">
            {right}
            <a className="btn ghost sm" href="/">
              View site
            </a>
          </div>
        </div>
      </header>

      <main className="wrap admin-main">{children}</main>
    </div>
  );
}

// ---------- login ----------

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Login failed:", err);
      setError("Wrong email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-art">
        <div>
          <h2>Welcome back to the edit suite.</h2>
          <p>
            Add films, switch projects on and off, and read new messages.
          </p>
        </div>

        <div className="clips" aria-hidden="true">
          <i
            style={{
              width: "72%",
              background: "var(--c1)",
              "--s": "28%",
            }}
          />
          <i
            style={{
              width: "48%",
              background: "var(--c2)",
              "--s": "50%",
              animationDelay: ".4s",
            }}
          />
          <i
            style={{
              width: "60%",
              background: "var(--c3)",
              "--s": "38%",
              animationDelay: ".8s",
            }}
          />
          <i
            style={{
              width: "34%",
              background: "var(--c4)",
              "--s": "60%",
              animationDelay: "1.2s",
            }}
          />
        </div>
      </div>

      <form className="login-form fields" onSubmit={submit}>
        <h2 className="ed-h">Sign in</h2>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label>
          Password
          <div className="pw">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              className="eye"
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              onClick={() => setShow((s) => !s)}
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </label>

        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}

        <button className="btn" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ---------- project editor ----------

function ProjectEditor({ initial, onDone, onCancel }) {
  const [d, setD] = useState({ ...BLANK, ...initial });
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");

  const set = (k, v) =>
    setD((x) => ({ ...x, [k]: v }));

  const setPal = (i, v) =>
    setD((x) => ({
      ...x,
      pal: x.pal.map((c, j) => (j === i ? v : c)),
    }));

  async function handleThumbnailChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    setImageBusy(true);
    setImageError("");

    try {
      const imageData = await fileToThumb(file);
      set("thumbUrl", imageData);
    } catch (err) {
      console.error("Thumbnail processing failed:", err);
      setImageError(err.message || "Could not process this image.");
    } finally {
      setImageBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();

    if (imageBusy) {
      setError("Please wait for the image to finish processing.");
      return;
    }

    setBusy(true);
    setError("");

    const { id, ...rest } = d;

    const data = {
      ...rest,
      order: Number(rest.order) || 0,
      updatedAt: serverTimestamp(),
    };

    try {
      if (id) {
        await setDoc(doc(db, "projects", id), data);
      } else {
        await addDoc(collection(db, "projects"), data);
      }

      onDone(`Saved "${d.title}".`);
    } catch (err) {
      console.error("Project save failed:", err);

      setError(
        err.code === "permission-denied"
          ? "Permission denied. Check your Firestore rules and admin account."
          : "Could not save the project. The image or project may be too large for Firestore."
      );

      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h2 className="ed-h">
        {d.id ? "Edit project" : "New project"}
      </h2>

      <div className="editor">
        <div className="panel">
          <div className="fgrid">
            <label>
              Title
              <input
                value={d.title}
                onChange={(e) => set("title", e.target.value)}
                required
              />
            </label>

            <label>
              Type
              <select
                value={d.type}
                onChange={(e) => set("type", e.target.value)}
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>

            <label>
              Length (for example 3:42)
              <input
                value={d.len}
                onChange={(e) => set("len", e.target.value)}
                required
              />
            </label>

            <label>
              Sort order (1 shows first)
              <input
                type="number"
                value={d.order}
                onChange={(e) => set("order", e.target.value)}
              />
            </label>

            <label>
              My role
              <input
                value={d.role}
                onChange={(e) => set("role", e.target.value)}
              />
            </label>

            <label>
              Tools
              <input
                value={d.tools}
                onChange={(e) => set("tools", e.target.value)}
              />
            </label>

            <label className="full">
              Description
              <textarea
                value={d.blurb}
                onChange={(e) => set("blurb", e.target.value)}
                rows={3}
              />
            </label>

            <label className="full">
              Colour grade note
              <textarea
                value={d.gradeNote}
                onChange={(e) => set("gradeNote", e.target.value)}
                rows={2}
              />
              <span className="hint2">
                A project with a note appears in the Raw vs Graded slider.
              </span>
            </label>

            <label className="full">
              Film link (YouTube or Vimeo, optional)
              <input
                type="url"
                value={d.videoUrl}
                onChange={(e) => set("videoUrl", e.target.value)}
                placeholder="https://youtu.be/..."
              />
            </label>

            <div className="full">
              <label>
                Thumbnail image (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailChange}
                  disabled={imageBusy}
                />
              </label>

              <p className="hint2">
                This upload is for regular projects. The Thumbnails tab
                uses image or YouTube links instead.
              </p>

              {imageBusy && (
                <p role="status">Processing image…</p>
              )}

              {imageError && (
                <p className="err" role="alert">
                  {imageError}
                </p>
              )}

              {d.thumbUrl && (
                <div style={{ marginTop: 12 }}>
                  <img
                    src={d.thumbUrl}
                    alt="Project thumbnail preview"
                    style={{
                      width: "100%",
                      maxWidth: 320,
                      maxHeight: 220,
                      objectFit: "cover",
                      borderRadius: 10,
                      display: "block",
                    }}
                  />

                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      set("thumbUrl", "");
                      setImageError("");
                    }}
                  >
                    Remove thumbnail
                  </button>
                </div>
              )}
            </div>

            <label>
              Artwork style (used when there is no thumbnail)
              <select
                value={d.art}
                onChange={(e) => set("art", e.target.value)}
              >
                {ART.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>

            <div className="pal">
              {d.pal.map((c, i) => (
                <label key={i}>
                  Colour {i + 1}
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => setPal(i, e.target.value)}
                  />
                </label>
              ))}
            </div>

            <label>
              Timeline clip colour
              <input
                type="color"
                value={d.clr}
                onChange={(e) => set("clr", e.target.value)}
              />
            </label>

            <label>
              Clip text colour
              <input
                type="color"
                value={d.on}
                onChange={(e) => set("on", e.target.value)}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={d.featured}
                onChange={(e) => set("featured", e.target.checked)}
              />
              Featured on the hero reel (the first 5 are used)
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={d.published}
                onChange={(e) => set("published", e.target.checked)}
              />
              Published (visible on the website)
            </label>
          </div>
        </div>

        <aside className="live" aria-label="Live preview">
          <div className="mini">
            <Thumb p={d} />
            <div className="lt">
              <strong>{d.title || "Project title"}</strong>
              <span>
                {d.type} · {d.len || "0:00"}
              </span>
            </div>
          </div>

          <div className="clipbar">
            <i style={{ background: d.clr, color: d.on }}>
              {d.title || "Timeline clip"}
            </i>
          </div>

          <p className="hint2">
            A live preview of how this project looks on the site and on the reel.
          </p>
        </aside>
      </div>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      <div className="savebar">
        <button className="btn" disabled={busy || imageBusy}>
          {busy ? "Saving…" : imageBusy ? "Processing image…" : "Save project"}
        </button>

        <button
          type="button"
          className="btn ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------- projects tab ----------

function ProjectsPanel({ projects }) {
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState("");

  async function seed() {
    const batch = writeBatch(db);

    sampleProjects.forEach(({ id, ...rest }) => {
      batch.set(doc(db, "projects", id), rest);
    });

    try {
      await batch.commit();
      setFlash("Sample projects added.");
    } catch (err) {
      console.error("Seeding failed:", err);
      setFlash("Could not add the samples. Check your rules.");
    }
  }

  async function toggle(p, field) {
    try {
      await updateDoc(doc(db, "projects", p.id), {
        [field]: !p[field],
      });
    } catch (err) {
      console.error("Project update failed:", err);
      setFlash("Could not update the video. Check the Firebase error in the browser console and your Firestore rules.");
    }
  }

  async function remove(p) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "projects", p.id));
    } catch (err) {
      console.error("Project deletion failed:", err);
      setFlash("Could not delete the video. Check the Firebase error in the browser console and your Firestore rules.");
    }
  }

  if (editing !== null) {
    return (
      <ProjectEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onDone={(msg) => {
          setEditing(null);
          setFlash(msg);
        }}
      />
    );
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className="btn sm"
          onClick={() => setEditing({})}
        >
          + Add project
        </button>

        {projects.length === 0 && (
          <button className="btn ghost sm" onClick={seed}>
            Add the sample projects
          </button>
        )}
      </div>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      {projects.length === 0 && (
        <div className="empty">
          <b>No projects yet</b>
          <p>Until you add some, visitors see the sample projects.</p>
        </div>
      )}

      {projects.map((p) => (
        <div
          className={"prow" + (p.published ? "" : " draft")}
          key={p.id}
        >
          <div className="th">
            <Thumb p={p} />
          </div>

          <div className="info">
            <b>{p.title}</b>

            <span>
              <i className="swatch" style={{ "--k": p.clr }} />
              {p.type} · {p.len}
            </span>

            <div className="tags">
              <span className={"badge" + (p.published ? " on" : "")}>
                {p.published ? "Published" : "Hidden"}
              </span>

              {p.featured && (
                <span className="badge on">On the reel</span>
              )}

              {p.gradeNote && (
                <span className="badge">Grade slider</span>
              )}

              {p.videoUrl && (
                <span className="badge">Has film</span>
              )}
            </div>
          </div>

          <div className="acts">
            <button
              className="btn ghost sm"
              onClick={() => toggle(p, "published")}
            >
              {p.published ? "Hide" : "Publish"}
            </button>

            <button
              className="btn ghost sm"
              onClick={() => toggle(p, "featured")}
            >
              {p.featured ? "Remove from reel" : "Add to reel"}
            </button>

            <button
              className="btn ghost sm"
              onClick={() => setEditing(p)}
            >
              Edit
            </button>

            <button
              className="btn danger sm"
              onClick={() => remove(p)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- video editor (accepts any link) ----------

function TikTokEditor({ initial, onDone, onCancel }) {
  const [d, setD] = useState({ ...BLANK_TT, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const info = d.url.trim() ? getVideoInfo(d.url) : null;
  const canEmbed = info && info.type !== "link";

  async function save(e) {
    e.preventDefault();
    setError("");

    const inputValue = d.url.trim();
    const url = extractEmbedSource(inputValue);

    if (!parseVideoUrl(inputValue)) {
      setError("Paste a valid https:// video URL or a complete iframe embed snippet.");
      return;
    }

    setBusy(true);
    const { id, ...rest } = d;
    const isIframeSnippet = /<iframe\b/i.test(inputValue);

    const data = {
      url,
      ...(isIframeSnippet ? { embedCode: inputValue } : { embedCode: "" }),
      title: rest.title.trim(),
      description: rest.description.trim(),
      order: Number(rest.order) || 0,
      published: !!rest.published,
      updatedAt: serverTimestamp(),
    };

    try {
      if (id) {
        await setDoc(doc(db, "tiktoks", id), data, { merge: true });
      } else {
        await addDoc(collection(db, "tiktoks"), data);
      }
      onDone(`Saved "${data.title || "video"}".`);
    } catch (err) {
      console.error("Video save failed:", err);
      const code = err?.code ? ` (${err.code})` : "";
      const detail = err?.message ? ` ${err.message}` : "";
      setError(`Firebase could not save this video${code}.${detail}`);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h2 className="ed-h">{d.id ? "Edit video" : "Add a video"}</h2>

      <div className="editor">
        <div className="panel">
          <div className="fgrid">
            <label className="full">
              Video link
              <textarea
                value={d.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder={'Paste a video URL or full iframe code, e.g. <iframe src="https://player.vimeo.com/video/123..."></iframe>'}
                rows={4}
                required
              />
              <span className="hint2">
                Paste a normal video link or the complete iframe embed code from Vimeo or another video host.
                The admin saves the iframe code and its source URL; the website displays the video in a 9:16 frame.
              </span>
            </label>

            {info && (
              <p className="hint2 full">
                {canEmbed
                  ? `Recognised as: ${info.name}.`
                  : "This link can't be embedded, so it will show as a link card. Short TikTok links (vm.tiktok.com) work better as the full /video/... address."}
              </p>
            )}

            <label>
              Title
              <input value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Video title" />
            </label>

            <label>
              Sort order (1 shows first)
              <input type="number" value={d.order} onChange={(e) => set("order", e.target.value)} />
            </label>

            <label className="full">
              Description
              <textarea
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                placeholder="A short description of this video."
              />
            </label>

            <label className="check">
              <input type="checkbox" checked={d.published} onChange={(e) => set("published", e.target.checked)} />
              Published (visible on the website)
            </label>
          </div>
        </div>

        <aside className="live" aria-label="Live preview">
          {canEmbed ? (
            <div className="mini">
              <div
                className="tiktok-preview-frame"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  aspectRatio: "9 / 16",
                  marginInline: "auto",
                  overflow: "hidden",
                  background: "#000",
                  borderRadius: 10,
                }}
              >
                {info.type === "file" ? (
                  <video
                    src={info.fileUrl}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <iframe
                    src={info.embedUrl}
                    title={`${info.name} preview`}
                    loading="lazy"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#000" }}
                  />
                )}
              </div>

              <div className="lt">
                <strong>{d.title || "Video title"}</strong>
                <span>{d.description || "Description"}</span>
              </div>
            </div>
          ) : (
            <p className="hint2">
              {info
                ? "No preview for this link. It will appear on the site as a link card."
                : "Paste a link to preview it here."}
            </p>
          )}
        </aside>
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      <div className="savebar">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save video"}</button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// ---------- videos tab ----------

function TikTokPanel({ tiktoks }) {
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState("");

  async function toggle(t) {
    try {
      await updateDoc(doc(db, "tiktoks", t.id), {
        published: !t.published,
      });
    } catch (err) {
      console.error("TikTok update failed:", err);
      setFlash("Could not update the video. Check the Firebase error in the browser console and your Firestore rules.");
    }
  }

  async function remove(t) {
    if (
      !window.confirm(
        `Delete "${t.title || "this video"}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "tiktoks", t.id));
    } catch (err) {
      console.error("TikTok deletion failed:", err);
      setFlash("Could not delete the video. Check the Firebase error in the browser console and your Firestore rules.");
    }
  }

  if (editing !== null) {
    return (
      <TikTokEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onDone={(msg) => {
          setEditing(null);
          setFlash(msg);
        }}
      />
    );
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className="btn sm"
          onClick={() => setEditing({ order: tiktoks.length + 1 })}
        >
          + Add video
        </button>
      </div>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      {tiktoks.length === 0 && (
        <div className="empty">
          <b>No videos yet</b>
          <p>Add a video link here.</p>
        </div>
      )}

      {tiktoks.map((t) => (
        <div
          className={"prow" + (t.published === false ? " draft" : "")}
          key={t.id}
        >
          <div
            className="th"
            style={{
              display: "grid",
              placeItems: "center",
              background: "var(--surface)",
              fontWeight: 700,
            }}
          >
            {getVideoInfo(t.url)?.name || "Link"}
          </div>

          <div className="info">
            <b>{t.title || "Untitled video"}</b>
            <span>{t.description || t.url}</span>

            <div className="tags">
              <span
                className={
                  "badge" + (t.published === false ? "" : " on")
                }
              >
                {t.published === false ? "Hidden" : "Published"}
              </span>

              <span className="badge">
                Order {t.order ?? 0}
              </span>
            </div>
          </div>

          <div className="acts">
            <a
              className="btn ghost sm"
              href={t.url}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>

            <button
              className="btn ghost sm"
              onClick={() => toggle(t)}
            >
              {t.published === false ? "Publish" : "Hide"}
            </button>

            <button
              className="btn ghost sm"
              onClick={() => setEditing(t)}
            >
              Edit
            </button>

            <button
              className="btn danger sm"
              onClick={() => remove(t)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- weddings tab (landscape + portrait) ----------

function WeddingEditor({ initial, counts, onDone, onCancel }) {
  const { format: startFormat = "landscape", ...startValues } = initial;

  // Accept the previous field names when editing older documents.
  // New documents are always saved using the current Firestore schema.
  const [d, setD] = useState(() => ({
    ...BLANK_WEDDING,
    sortOrder: counts[startFormat] + 1,
    ...startValues,
    embedUrl:
      startValues.embedUrl ?? startValues.url ?? startValues.embedCode ?? "",
    sortOrder:
      startValues.sortOrder ?? startValues.order ?? counts[startFormat] + 1,
  }));
  const [format, setFormat] = useState(startFormat);
  const [orderTouched, setOrderTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const locked = Boolean(d.id); // an existing video stays in its own collection
  const portrait = format === "portrait";

  const info = d.embedUrl.trim() ? getVideoInfo(d.embedUrl) : null;
  const canEmbed = info && info.type !== "link";

  function chooseFormat(key) {
    setFormat(key);
    if (!orderTouched && !d.id) set("sortOrder", counts[key] + 1);
  }

  async function save(e) {
    e.preventDefault();
    setError("");

    const inputValue = d.embedUrl.trim();
    const title = d.title.trim();
    const description = d.description.trim();

    if (!title) {
      setError("Please enter a title for this wedding video.");
      return;
    }

    if (title.length > 200) {
      setError("The title must be 200 characters or fewer.");
      return;
    }

    if (description.length > 4000) {
      setError("The description must be 4,000 characters or fewer.");
      return;
    }

    if (!parseVideoUrl(inputValue)) {
      setError("Paste a valid http:// or https:// video URL or a complete iframe embed code.");
      return;
    }

    const embedUrl = extractEmbedSource(inputValue);
    if (!embedUrl || embedUrl.length > 5000) {
      setError("The video link is empty or longer than 5,000 characters.");
      return;
    }

    const numericOrder = Number(d.sortOrder);
    const sortOrder = Number.isFinite(numericOrder)
      ? Math.trunc(numericOrder)
      : 0;

    // Keep this object in exact sync with the Firestore wedding rules.
    // No createdAt, updatedAt, url, order, or embedCode fields are written.
    const data = {
      title,
      sortOrder,
      description,
      embedUrl,
      published: !!d.published,
    };

    const col = WEDDING_FORMATS[format].collection;
    setBusy(true);

    try {
      if (d.id) {
        // Replace the full document so legacy fields are removed as well.
        await setDoc(doc(db, col, d.id), data);
      } else {
        await addDoc(collection(db, col), data);
      }
      onDone(`Saved "${data.title}" (${WEDDING_FORMATS[format].label.toLowerCase()}).`);
    } catch (err) {
      console.error("Wedding video save failed:", err);
      const code = err?.code ? ` (${err.code})` : "";
      setError(
        err?.code === "permission-denied"
          ? `Permission denied${code}. Confirm that you are signed in with the account whose UID is the document ID in the admins collection, and that the latest Firestore rules are published.`
          : `Firebase could not save this video${code}: ${err?.message || "Unknown error"}`
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h2 className="ed-h">{d.id ? "Edit wedding video" : "Add a wedding video"}</h2>

      <div className="editor">
        <div className="panel">
          <div className="fgrid">
            <div className="full">
              <span className="pick-label">Which video are you posting?</span>

              <div className="fmt-pick" role="radiogroup" aria-label="Video format">
                {Object.entries(WEDDING_FORMATS).map(([key, f]) => (
                  <button
                    type="button"
                    key={key}
                    role="radio"
                    aria-checked={format === key}
                    className={"fmt" + (format === key ? " on" : "")}
                    onClick={() => chooseFormat(key)}
                    disabled={locked}
                  >
                    <i className={"fmt-shape " + key} aria-hidden="true" />
                    <b>{f.label}</b>
                    <small>{f.size}</small>
                  </button>
                ))}
              </div>

              <p className="hint2" style={{ marginTop: ".5rem" }}>
                {locked
                  ? "The format of a posted video can't be changed. To move it, delete it and post it again."
                  : portrait
                    ? "Shows on the website under the heading “Short wedding videos”."
                    : "Shows on the website first, as a wide video."}
              </p>
            </div>

            <label className="full">
              Video link or embed code
              <textarea
                value={d.embedUrl}
                onChange={(e) => set("embedUrl", e.target.value)}
                placeholder={'Paste a video URL or the full embed code, e.g. <iframe src="https://player.vimeo.com/video/123..."></iframe>'}
                rows={4}
                required
              />
              <span className="hint2">
                On Vimeo, click Share, then Embed, and paste the code here. A normal Vimeo, YouTube,
                Instagram, TikTok, Facebook, Google Drive or direct .mp4 link works too.
              </span>
            </label>

            {info && (
              <p className="hint2 full">
                {canEmbed
                  ? `Recognised as: ${info.name}.`
                  : "This link is not supported as an embedded player by the current website player."}
              </p>
            )}

            <label>
              Title
              <input
                value={d.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Sara & Daniel wedding"
                maxLength={200}
                required
              />
            </label>

            <label>
              Sort order (1 shows first)
              <input
                type="number"
                min="0"
                step="1"
                value={d.sortOrder}
                onChange={(e) => {
                  setOrderTouched(true);
                  set("sortOrder", e.target.value);
                }}
              />
            </label>

            <label className="full">
              Description
              <textarea
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="A short description of this wedding video."
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={d.published}
                onChange={(e) => set("published", e.target.checked)}
              />
              Published (visible on the website)
            </label>
          </div>
        </div>

        <aside className="live" aria-label="Live preview">
          {canEmbed ? (
            <div className="mini">
              <div
                className={"wedding-preview-frame" + (portrait ? " is-portrait" : "")}
                style={{
                  width: "100%",
                  maxWidth: portrait ? 300 : "100%",
                  aspectRatio: WEDDING_FORMATS[format].ratio,
                  marginInline: portrait ? "auto" : 0,
                  overflow: "hidden",
                  background: "#000",
                  borderRadius: 10,
                }}
              >
                {info.type === "file" ? (
                  <video
                    src={info.fileUrl}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <iframe
                    src={info.embedUrl}
                    title={`${info.name} preview`}
                    loading="lazy"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#000" }}
                  />
                )}
              </div>

              <div className="lt">
                <strong>{d.title || "Wedding video"}</strong>
                <span>{WEDDING_FORMATS[format].size}</span>
              </div>
            </div>
          ) : (
            <p className="hint2">
              {info
                ? "This link is not supported as an embedded player by the current website player."
                : "Paste a video link or embed code to preview it here."}
            </p>
          )}
        </aside>
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      <div className="savebar">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save wedding video"}</button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function WeddingPanel({ landscape, portrait }) {
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState("");

  const total = landscape.length + portrait.length;
  const colOf = (w) => WEDDING_FORMATS[w.format].collection;

  async function toggle(w) {
    try {
      await updateDoc(doc(db, colOf(w), w.id), {
        published: w.published === false,
      });
    } catch (err) {
      console.error("Wedding video update failed:", err);
      setFlash(
        `Could not update this video (${err?.code || "unknown error"}). If this is an older wedding document, edit and save it once to migrate it to the new fields.`
      );
    }
  }

  async function remove(w) {
    if (!window.confirm(`Delete "${w.title || "this wedding video"}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, colOf(w), w.id));
    } catch (err) {
      console.error("Wedding video deletion failed:", err);
      setFlash(`Could not delete this video (${err?.code || "unknown error"}). Check admin access and Firestore rules.`);
    }
  }

  if (editing !== null) {
    return (
      <WeddingEditor
        initial={editing}
        counts={{ landscape: landscape.length, portrait: portrait.length }}
        onCancel={() => setEditing(null)}
        onDone={(msg) => {
          setEditing(null);
          setFlash(msg);
        }}
      />
    );
  }

  return (
    <div>
      <div className="toolbar">
        <button className="btn sm" onClick={() => setEditing({})}>
          + Add wedding video
        </button>
      </div>

      <p className="meta" style={{ margin: "0 0 1rem" }}>
        {total} wedding video{total === 1 ? "" : "s"} posted · {landscape.length} landscape ·{" "}
        {portrait.length} portrait
      </p>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      {total === 0 && (
        <div className="empty">
          <b>No wedding videos yet</b>
          <p>
            The wedding section stays hidden on your website until you post one. The collections are
            created automatically with your first post.
          </p>
        </div>
      )}

      {[
        ["landscape", landscape],
        ["portrait", portrait],
      ].map(
        ([key, list]) =>
          list.length > 0 && (
            <div className="wd-group" key={key}>
              <h3 className="wd-group-h">
                {WEDDING_FORMATS[key].heading}
                <span className="num">{list.length}</span>
              </h3>

              {list.map((w) => (
                <div className={"prow" + (w.published === false ? " draft" : "")} key={w.id}>
                  <div className="th">
                    <span>
                      <b>{getVideoInfo(w.embedUrl)?.name || "Link"}</b>
                      <small>{WEDDING_FORMATS[key].label}</small>
                    </span>
                  </div>

                  <div className="info">
                    <b>{w.title || "Untitled wedding video"}</b>
                    <span>{w.description || w.embedUrl}</span>

                    <div className="tags">
                      <span className={"badge" + (w.published === false ? "" : " on")}>
                        {w.published === false ? "Hidden" : "Published"}
                      </span>
                      <span className="badge">{WEDDING_FORMATS[key].size}</span>
                      <span className="badge">Order {w.sortOrder ?? 0}</span>
                    </div>
                  </div>

                  <div className="acts">
                    <a className="btn ghost sm" href={w.embedUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>

                    <button className="btn ghost sm" onClick={() => toggle(w)}>
                      {w.published === false ? "Publish" : "Hide"}
                    </button>

                    <button className="btn ghost sm" onClick={() => setEditing(w)}>
                      Edit
                    </button>

                    <button className="btn danger sm" onClick={() => remove(w)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}

// ---------- messages tab ----------
function InquiriesPanel({ inquiries }) {
  const [selectedId, setSelectedId] = useState(null);
  const [actionError, setActionError] = useState("");

  const selected = inquiries.find(
    (item) => item.id === selectedId
  );

  function formatDate(timestamp) {
    if (!timestamp) return "Date unavailable";

    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  async function openMessage(item) {
    setSelectedId(item.id);
    setActionError("");

    if (!item.read) {
      try {
        await updateDoc(doc(db, "inquiries", item.id), {
          read: true,
        });
      } catch (error) {
        console.error("Could not mark message as read:", error);
        setActionError(
          "Message opened, but its read status could not be updated."
        );
      }
    }
  }

  async function toggleRead(item) {
    setActionError("");

    try {
      await updateDoc(doc(db, "inquiries", item.id), {
        read: !item.read,
      });
    } catch (error) {
      console.error("Could not update message:", error);
      setActionError("Could not update the message status.");
    }
  }

  async function deleteMessage(item) {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this message?"
    );

    if (!confirmed) return;

    setActionError("");

    try {
      await deleteDoc(doc(db, "inquiries", item.id));
      setSelectedId(null);
    } catch (error) {
      console.error("Could not delete message:", error);
      setActionError("Could not delete the message.");
    }
  }

  return (
    <section className="inquiries-panel">
      <div className="inquiries-heading">
        <div>
          <h2>Messages</h2>
          <p className="meta">
            {inquiries.length} total message
            {inquiries.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {actionError && (
        <p className="inquiry-error" role="alert">
          {actionError}
        </p>
      )}

      {inquiries.length === 0 ? (
        <div className="empty">
          <b>No messages yet</b>
          <p>Contact form submissions will appear here.</p>
        </div>
      ) : (
        <div className="inquiries-list">
          {inquiries.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`inquiry-item ${item.read ? "" : "new"}`}
              onClick={() => openMessage(item)}
            >
              <span className="avatar">
                {(item.name || "?").charAt(0).toUpperCase()}
              </span>

              <span className="inquiry-summary">
                <strong>
                  {item.name || "Unknown sender"}
                </strong>

                <span className="meta">
                  {item.email || "No email provided"}
                </span>

                <span className="inquiry-preview">
                  {item.message || "No message content"}
                </span>
              </span>

              <span className="inquiry-side">
                <span className={`badge ${item.read ? "" : "on"}`}>
                  {item.read ? "Read" : "New"}
                </span>

                <span className="meta inquiry-date">
                  {formatDate(item.createdAt)}
                </span>
                <span className="inquiry-open-label">
                  Open message →
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="inquiry-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedId(null);
            }
          }}
        >
          <section
            className="inquiry-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inquiry-card-title"
          >
            <header className="inquiry-card-header">
              <div>
                <span className="meta">CONTACT MESSAGE</span>
                <h2 id="inquiry-card-title">
                  {selected.name || "Unknown sender"}
                </h2>
              </div>

              <button
                type="button"
                className="btn ghost inquiry-close"
                onClick={() => setSelectedId(null)}
                aria-label="Close message"
              >
                ✕
              </button>
            </header>

            <div className="inquiry-sender">
              <span className="avatar inquiry-large-avatar">
                {(selected.name || "?").charAt(0).toUpperCase()}
              </span>

              <div>
                <strong>{selected.name || "Unknown sender"}</strong>
                <a href={`mailto:${selected.email || ""}`}>
                  {selected.email || "No email provided"}
                </a>
                <span className="meta">
                  Received {formatDate(selected.createdAt)}
                </span>
              </div>
            </div>

            <div className="inquiry-message-content">
              <h3>Project brief</h3>
              <p className="msg">
                {selected.message || "No message content"}
              </p>
            </div>

            <footer className="inquiry-card-actions">
              {selected.email && (
                <a
                  className="btn"
                  href={`mailto:${selected.email}?subject=${encodeURIComponent(
                    `Re: Project brief from ${selected.name || "visitor"}`
                  )}`}
                >
                  Reply by email
                </a>
              )}

              <button
                type="button"
                className="btn ghost"
                onClick={() => toggleRead(selected)}
              >
                {selected.read ? "Mark unread" : "Mark read"}
              </button>

              <button
                type="button"
                className="btn danger"
                onClick={() => deleteMessage(selected)}
              >
                Delete
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

// ---------- thumbnails tab ----------

// Edit an existing thumbnail. The link box accepts a normal image link
// or a YouTube link (the YouTube thumbnail is fetched automatically).
function ThumbRow({ t, setFlash }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({
    ...THUMB_BLANK,
    ...t,
    imageUrl: t.sourceUrl || t.imageUrl || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) =>
    setD((current) => ({ ...current, [key]: value }));

  const resolved = resolveThumbSource(d.imageUrl || "");

  // What the row shows in the list (older documents may only have imageUrl).
  const rowLink = t.sourceUrl || t.imageUrl || "";
  const rowIsYouTube = Boolean(t.videoId || getYouTubeId(rowLink));

  async function save(e) {
    e.preventDefault();
    setError("");

    if (!d.title.trim() || !d.imageUrl.trim() || !d.blurb.trim()) {
      setError("Please enter a title, an image or YouTube link, and a description.");
      return;
    }

    const source = resolveThumbSource(d.imageUrl);

    if (!source) {
      setError("Please paste a valid https:// image link or YouTube link.");
      return;
    }

    setBusy(true);

    try {
      await updateDoc(doc(db, "thumbnails", t.id), {
        title: d.title.trim(),
        imageUrl: source.imageUrl,
        sourceUrl: source.sourceUrl,
        videoId: source.videoId,
        kind: source.kind,
        type: (d.type || "").trim(),
        length: (d.length || "").trim(),
        role: (d.role || "").trim(),
        tools: (d.tools || "").trim(),
        blurb: d.blurb.trim(),
      });

      setOpen(false);
      setFlash("Thumbnail details saved.");
    } catch (err) {
      console.error("Thumbnail update failed:", err);
      setError(
        "Could not save. Check your Firestore rules and admin permissions."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    try {
      await updateDoc(doc(db, "thumbnails", t.id), {
        published: !t.published,
      });

      setFlash(t.published ? "Thumbnail hidden." : "Thumbnail published.");
    } catch (err) {
      console.error("Thumbnail visibility update failed:", err);
      setFlash("Could not update the video. Check the Firebase error in the browser console and your Firestore rules.");
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${t.title || "this thumbnail"}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "thumbnails", t.id));
      setFlash("Thumbnail deleted.");
    } catch (err) {
      console.error("Thumbnail deletion failed:", err);
      setFlash("Could not delete the video. Check the Firebase error in the browser console and your Firestore rules.");
    }
  }

  return (
    <div className={"prow" + (t.published ? "" : " draft")}>
      <div className="th">
        <ThumbImg
          value={rowLink}
          alt={t.title || "Thumbnail"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>

      <div className="info">
        <b>{t.title || "Untitled"}</b>

        <span>
          {[t.type, t.length].filter(Boolean).join(" · ") ||
            "Add details with Edit"}
        </span>

        <div className="tags">
          <span className={"badge" + (t.published ? " on" : "")}>
            {t.published ? "Published" : "Hidden"}
          </span>

          {rowIsYouTube && <span className="badge">YouTube</span>}
        </div>
      </div>

      <div className="acts">
        <button
          type="button"
          className="btn ghost sm"
          onClick={toggle}
        >
          {t.published ? "Hide" : "Publish"}
        </button>

        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setD({
              ...THUMB_BLANK,
              ...t,
              imageUrl: t.sourceUrl || t.imageUrl || "",
            });
            setError("");
            setOpen((current) => !current);
          }}
        >
          {open ? "Close" : "Edit"}
        </button>

        <button
          type="button"
          className="btn danger sm"
          onClick={remove}
        >
          Delete
        </button>
      </div>

      {open && (
        <form
          className="fgrid"
          style={{ gridColumn: "1 / -1" }}
          onSubmit={save}
        >
          <label className="full">
            Image link or YouTube link *
            <input
              type="url"
              value={d.imageUrl || ""}
              onChange={(e) => set("imageUrl", e.target.value)}
              placeholder="https://youtu.be/... or https://example.com/images/thumbnail.jpg"
              required
            />
            <span className="hint2">
              Paste a YouTube link to use that video's thumbnail, or paste a normal image link.
            </span>
          </label>

          {d.imageUrl && (
            <div className="full">
              <p className="hint2">
                {resolved
                  ? resolved.kind === "youtube"
                    ? "Recognised as a YouTube video. Preview:"
                    : "Recognised as an image link. Preview:"
                  : "This is not a valid https:// link yet."}
              </p>

              {resolved && (
                <ThumbImg
                  value={d.imageUrl}
                  alt="Thumbnail preview"
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    maxHeight: 220,
                    objectFit: "cover",
                    borderRadius: 10,
                    display: "block",
                  }}
                />
              )}
            </div>
          )}

          <label>
            Title *
            <input
              value={d.title || ""}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          </label>

          <label>
            Type
            <input
              value={d.type || ""}
              onChange={(e) => set("type", e.target.value)}
              placeholder="Documentary, Music video..."
            />
          </label>

          <label>
            Length
            <input
              value={d.length || ""}
              onChange={(e) => set("length", e.target.value)}
              placeholder="3:42"
            />
          </label>

          <label>
            My role
            <input
              value={d.role || ""}
              onChange={(e) => set("role", e.target.value)}
            />
          </label>

          <label>
            Tools
            <input
              value={d.tools || ""}
              onChange={(e) => set("tools", e.target.value)}
            />
          </label>

          <label className="full">
            Description *
            <textarea
              rows={4}
              value={d.blurb || ""}
              onChange={(e) => set("blurb", e.target.value)}
              placeholder="Describe the project and what you did..."
              required
            />
          </label>

          {error && (
            <p className="err full" role="alert">
              {error}
            </p>
          )}

          <div className="full">
            <button className="btn sm" disabled={busy}>
              {busy ? "Saving..." : "Save thumbnail"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Add a thumbnail using a YouTube link or a normal image link, plus a description.
function ThumbnailsPanel({ thumbs }) {
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [d, setD] = useState({ ...THUMB_BLANK });

  const set = (key, value) =>
    setD((current) => ({ ...current, [key]: value }));

  const resolved = resolveThumbSource(d.imageUrl);

  async function submit(e) {
    e.preventDefault();
    setFlash("");

    if (!d.title.trim() || !d.imageUrl.trim() || !d.blurb.trim()) {
      setFlash("Please enter a title, an image or YouTube link, and a description.");
      return;
    }

    const source = resolveThumbSource(d.imageUrl);

    if (!source) {
      setFlash("Please paste a valid https:// image link or YouTube link.");
      return;
    }

    setBusy(true);

    try {
      await addDoc(collection(db, "thumbnails"), {
        title: d.title.trim(),
        imageUrl: source.imageUrl,
        sourceUrl: source.sourceUrl,
        videoId: source.videoId,
        kind: source.kind,
        type: d.type.trim(),
        length: d.length.trim(),
        role: d.role.trim(),
        tools: d.tools.trim(),
        blurb: d.blurb.trim(),
        published: d.published,
        createdAt: serverTimestamp(),
      });

      setD({ ...THUMB_BLANK });
      setShowForm(false);
      setFlash("Thumbnail saved successfully.");
    } catch (err) {
      console.error("Thumbnail save failed:", err);

      setFlash(
        err.code === "permission-denied"
          ? "Permission denied. Check your Firestore rules and admin permissions."
          : "Could not save the thumbnail. Check your connection and Firestore rules."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setFlash("");
            setShowForm((current) => !current);
          }}
        >
          {showForm ? "Cancel" : "+ Add thumbnail"}
        </button>
      </div>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      {showForm && (
        <form
          className="panel"
          onSubmit={submit}
          style={{ marginBottom: 24 }}
        >
          <h2 className="ed-h">Add a thumbnail</h2>

          <div className="fgrid">
            <label className="full">
              Image link or YouTube link *
              <input
                type="url"
                value={d.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="https://youtu.be/... or https://example.com/images/thumbnail.jpg"
                required
              />
              <span className="hint2">
                Paste a YouTube link to use that video's thumbnail, or paste a normal image link.
              </span>
            </label>

            {d.imageUrl.trim() && (
              <div className="full">
                <p className="hint2">
                  {resolved
                    ? resolved.kind === "youtube"
                      ? "Recognised as a YouTube video. Preview:"
                      : "Recognised as an image link. Preview:"
                    : "This is not a valid https:// link yet."}
                </p>

                {resolved && (
                  <ThumbImg
                    value={d.imageUrl}
                    alt="Thumbnail preview"
                    style={{
                      width: "100%",
                      maxWidth: 360,
                      maxHeight: 240,
                      objectFit: "cover",
                      borderRadius: 10,
                      display: "block",
                    }}
                  />
                )}
              </div>
            )}

            <label>
              Title *
              <input
                value={d.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Music video edit"
                required
              />
            </label>

            <label>
              Type
              <input
                value={d.type}
                onChange={(e) => set("type", e.target.value)}
                placeholder="Documentary, Music video..."
              />
            </label>

            <label>
              Length
              <input
                value={d.length}
                onChange={(e) => set("length", e.target.value)}
                placeholder="3:42"
              />
            </label>

            <label>
              My role
              <input
                value={d.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="Video editor"
              />
            </label>

            <label>
              Tools
              <input
                value={d.tools}
                onChange={(e) => set("tools", e.target.value)}
                placeholder="Premiere Pro, After Effects"
              />
            </label>

            <label className="full">
              Description *
              <textarea
                rows={4}
                value={d.blurb}
                onChange={(e) => set("blurb", e.target.value)}
                placeholder="Describe the project and what you did..."
                required
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={d.published}
                onChange={(e) => set("published", e.target.checked)}
              />
              Publish immediately
            </label>
          </div>

          <div className="savebar">
            <button className="btn" disabled={busy}>
              {busy ? "Saving..." : "Save thumbnail"}
            </button>

            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {thumbs.length === 0 && (
        <div className="empty">
          <b>No thumbnails yet</b>
          <p>
            Click Add thumbnail to paste a YouTube link or an image link and add a description.
          </p>
        </div>
      )}

      {thumbs.map((t) => (
        <ThumbRow key={t.id} t={t} setFlash={setFlash} />
      ))}
    </div>
  );
}

// ---------- hero video tab ----------

const IFRAME_TAG = /<iframe\b/i;
const isEmbedCode = (value = "") => IFRAME_TAG.test(value);

// Works out what kind of video this is. Accepts a normal https link
// OR a complete <iframe> embed code (the address inside it is used).
// Returns null when the value is not supported.
function reelKind(value) {
  const raw = (value || "").trim();
  if (!raw) return null;

  // Anything with HTML in it must be an <iframe> embed code.
  if (raw.includes("<") && !isEmbedCode(raw)) return null;

  const parsed = parseVideoUrl(raw);
  if (!parsed || parsed.protocol !== "https:") return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();

  if (host === "youtu.be" && parsed.pathname.length > 1) return "YouTube";

  if (
    ["youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host) &&
    (parsed.searchParams.get("v") ||
      /^\/(embed|shorts|live|v)\/[\w-]{6,}/.test(parsed.pathname))
  ) {
    return "YouTube";
  }

  if (
    (host === "vimeo.com" || host === "player.vimeo.com") &&
    /\d{6,}/.test(parsed.pathname)
  ) {
    return "Vimeo";
  }

  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(parsed.pathname)) return "Video file";

  // Any other iframe embed code is accepted and shown as it is.
  return isEmbedCode(raw) ? "Embedded video" : null;
}

// Label for badges, e.g. "Vimeo embed code" or "YouTube".
function kindLabel(value) {
  const kind = reelKind(value);
  if (!kind) return null;
  return isEmbedCode(value) && kind !== "Embedded video" ? `${kind} embed code` : kind;
}

// What to show in the preview box: { type: "embed" | "file", src } or null.
function heroPreview(value) {
  const info = getVideoInfo(value);
  if (!info) return null;
  if (info.type === "file") return { type: "file", src: info.fileUrl };
  if (info.type !== "link") return { type: "embed", src: info.embedUrl };
  return isEmbedCode(value) ? { type: "embed", src: extractEmbedSource(value) } : null;
}

function HeroPanel({ settings }) {
  const saved = settings.reelUrl || "";
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Keep the box in step with what is saved in Firebase
  useEffect(() => {
    setValue(saved);
  }, [saved]);

  const label = kindLabel(value);
  const savedLabel = kindLabel(saved);
  const savedLink = extractEmbedSource(saved);
  const changed = value.trim() !== saved.trim();
  const preview = label ? heroPreview(value) : null;

  async function write(newValue, okText) {
    setBusy(true);
    setMsg({ type: "", text: "" });

    try {
      await setDoc(
        doc(db, "site", "settings"),
        { reelUrl: newValue, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setMsg({ type: "flash", text: okText });
    } catch (err) {
      console.error("Hero video save failed:", err);
      setMsg({
        type: "err",
        text:
          err.code === "permission-denied"
            ? "Permission denied. Publish the updated Firestore rules (they need the site collection) and check that you are an admin."
            : "Could not save. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    const trimmed = value.trim();

    if (!trimmed) {
      setMsg({
        type: "err",
        text: "Paste a link or embed code first, or use Remove video to turn the hero video off.",
      });
      return;
    }

    if (!label) {
      setMsg({
        type: "err",
        text: "That is not supported. Paste a YouTube or Vimeo link, a direct .mp4/.webm/.mov link, or the full <iframe> embed code. The video address must start with https://",
      });
      return;
    }

    write(trimmed, "Saved. Your home page hero now plays this video.");
  }

  function remove() {
    if (!window.confirm("Remove the hero video? The hero will show the project preview instead.")) {
      return;
    }
    write("", "Removed. The hero shows the project preview again.");
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2 className="ed-h">Hero video</h2>

      <div className="hero-state">
        <span className={"badge" + (savedLabel ? " on" : "")}>
          {savedLabel ? `On · ${savedLabel}` : "Off"}
        </span>

        {savedLabel && (
          <>
            <span className="hero-link">{savedLink}</span>
            <a className="btn ghost sm" href={savedLink} target="_blank" rel="noreferrer">
              Open link
            </a>
          </>
        )}
      </div>

      <label>
        Hero video link or embed code
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'Paste a video link, or the full embed code, e.g.\n<iframe src="https://player.vimeo.com/video/123456789?h=abcdef1234" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture"></iframe>'}
        />
      </label>

      <p className="hint2" style={{ margin: ".6rem 0 1rem" }}>
        This video plays by itself (muted, on a loop) in the main screen at the top of your home page.
        On Vimeo, click Share, then Embed, copy the code and paste it here. A normal Vimeo or YouTube link,
        or a direct .mp4 link, works too. In Vimeo, allow embedding on your website
        (Settings, Privacy). For YouTube, choose Unlisted and make sure embedding is allowed.
      </p>

      {value.trim() && (
        <p className="hint2" style={{ marginBottom: "1rem" }}>
          {label
            ? `Recognised as: ${label}.`
            : "Not recognised yet. Paste a full video link starting with https:// or the complete <iframe> embed code."}
        </p>
      )}

      {preview && (
        <div style={{ marginBottom: "1rem" }}>
          <p className="hint2" style={{ marginBottom: ".5rem" }}>Preview:</p>

          <div
            style={{
              width: "100%",
              maxWidth: 480,
              aspectRatio: "16 / 9",
              overflow: "hidden",
              background: "#000",
              borderRadius: 10,
            }}
          >
            {preview.type === "file" ? (
              <video
                src={preview.src}
                controls
                muted
                playsInline
                preload="metadata"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <iframe
                src={preview.src}
                title="Hero video preview"
                loading="lazy"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#000" }}
              />
            )}
          </div>
        </div>
      )}

      {msg.text && (
        <p className={msg.type} role="status" style={{ marginBottom: "1rem" }}>
          {msg.text}
        </p>
      )}

      <div className="savebar">
        <button className="btn" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save hero video"}
        </button>

        {savedLabel && (
          <button type="button" className="btn danger" onClick={remove} disabled={busy}>
            Remove video
          </button>
        )}
      </div>
    </form>
  );
}

// ---------- dashboard ----------

function Dashboard({ user }) {
  const [tab, setTab] = useState("projects");
  const [projects, setProjects] = useState([]);
  const [tiktoks, setTiktoks] = useState([]);
  const [videoReadError, setVideoReadError] = useState("");
  const [thumbs, setThumbs] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [settings, setSettings] = useState({});
  const [wedLand, setWedLand] = useState([]);
  const [wedPort, setWedPort] = useState([]);
  const [weddingReadError, setWeddingReadError] = useState("");

  const byOrder = (snap) =>
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  useEffect(
    () =>
      onSnapshot(
        collection(db, "projects"),
        (snap) => setProjects(byOrder(snap)),
        (err) => console.error("Projects read failed:", err.code)
      ),
    []
  );

  useEffect(
    () =>
      onSnapshot(
        collection(db, "tiktoks"),
        (snap) => {
          setTiktoks(byOrder(snap));
          setVideoReadError("");
        },
        (err) => {
          console.error("Videos read failed:", err);
          setVideoReadError(`Could not load videos from Firebase (${err?.code || "unknown error"}). Check Firestore rules and admin access.`);
        }
      ),
    []
  );

  useEffect(
    () =>
      onSnapshot(
        collection(db, "thumbnails"),
        (snap) =>
          setThumbs(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort(
                (a, b) =>
                  (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
              )
          ),
        (err) => console.error("Thumbnails read failed:", err.code)
      ),
    []
  );

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "inquiries"), orderBy("createdAt", "desc")),
        (snap) =>
          setInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("Inquiries read failed:", err.code)
      ),
    []
  );

  // Wedding collections use the same field names as the public WeddingVideos component.
  // The fallback fields let old documents remain visible until they are edited and resaved.
  useEffect(() => {
    const listen = (format, setList) =>
      onSnapshot(
        collection(db, WEDDING_FORMATS[format].collection),
        (snap) => {
          const videos = snap.docs
            .map((document) => {
              const data = document.data();
              return {
                id: document.id,
                ...data,
                embedUrl: data.embedUrl ?? data.url ?? data.embedCode ?? "",
                sortOrder: data.sortOrder ?? data.order ?? 0,
                format,
              };
            })
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

          setList(videos);
          setWeddingReadError("");
        },
        (err) => {
          console.error(`Reading ${WEDDING_FORMATS[format].collection} failed:`, err);
          setWeddingReadError(
            `Could not load ${WEDDING_FORMATS[format].collection} (${err?.code || "unknown error"}). Check the admin UID document and published Firestore rules.`
          );
        }
      );

    const stopLandscape = listen("landscape", setWedLand);
    const stopPortrait = listen("portrait", setWedPort);

    return () => {
      stopLandscape();
      stopPortrait();
    };
  }, []);

  // The hero video link, saved at site/settings
  useEffect(
    () =>
      onSnapshot(
        doc(db, "site", "settings"),
        (snap) => setSettings(snap.data() || {}),
        (err) => console.error("Settings read failed:", err.code)
      ),
    []
  );

  // Live counts for everything posted on the website
  const unread = inquiries.filter((m) => !m.read).length;
  const pubProjects = projects.filter((p) => p.published === true).length;
  const pubThumbs = thumbs.filter((t) => t.published === true).length;
  const pubTikToks = tiktoks.filter((t) => t.published === true).length;
  const featured = projects.filter((p) => p.featured).length;
  const heroKind = kindLabel(settings.reelUrl);
  const heroOn = Boolean(heroKind);
  const pubWedLand = wedLand.filter((w) => w.published !== false).length;
  const pubWedPort = wedPort.filter((w) => w.published !== false).length;
  const live = pubProjects + pubThumbs + pubTikToks + pubWedLand + pubWedPort + (heroOn ? 1 : 0);

  const stats = [
    ["Projects", projects.length, `${pubProjects} published`, "var(--c1)"],
    ["On the reel", featured, "first 5 are shown", "var(--c3)"],
    ["Thumbnails", thumbs.length, `${pubThumbs} published`, "var(--c5)"],
    ["Videos", tiktoks.length, `${pubTikToks} published`, "var(--c2)"],
    ["Wedding films", wedLand.length, `${pubWedLand} published · 1920 × 1080`, "var(--c3)"],
    ["Short wedding", wedPort.length, `${pubWedPort} published · 1080 × 1920`, "var(--c5)"],
    ["Hero video", heroOn ? "On" : "Off", heroOn ? heroKind : "No link yet", "var(--c4)"],
    ["New messages", unread, `${inquiries.length} in total`, "var(--c1)"],
  ];

  return (
    <>
      <h1 className="admin-h">Welcome back</h1>

      <p className="sub" style={{ margin: 0 }}>
        {live} {live === 1 ? "item is" : "items are"} live on your website · Signed in as {user.email}
      </p>

      <div className="stats">
        {stats.map(([label, n, sub, k]) => (
          <div className="stat" key={label} style={{ "--k": k }}>
            <b>{n}</b>
            <span>{label}</span>
            <small>{sub}</small>
          </div>
        ))}
      </div>

      <div className="tabs" role="tablist">
        <button
          className="chip"
          role="tab"
          aria-pressed={tab === "projects"}
          onClick={() => setTab("projects")}
        >
          Projects<span className="num">{projects.length}</span>
        </button>

        <button
          className="chip"
          role="tab"
          aria-pressed={tab === "thumbnails"}
          onClick={() => setTab("thumbnails")}
        >
          Thumbnails<span className="num">{thumbs.length}</span>
        </button>

        <button
          className="chip"
          role="tab"
          aria-pressed={tab === "tiktoks"}
          onClick={() => setTab("tiktoks")}
        >
          Videos<span className="num">{tiktoks.length}</span>
        </button>

        <button
          className="chip"
          role="tab"
          aria-pressed={tab === "weddings"}
          onClick={() => setTab("weddings")}
        >
          Weddings<span className="num">{wedLand.length + wedPort.length}</span>
        </button>

        <button
          className="chip"
          role="tab"
          aria-pressed={tab === "hero"}
          onClick={() => setTab("hero")}
        >
          Hero video<span className={"dot" + (heroOn ? " on" : "")} aria-hidden="true" />
        </button>

        <button
          className="chip"
          role="tab"
          aria-pressed={tab === "inquiries"}
          onClick={() => setTab("inquiries")}
        >
          Messages
          {unread > 0 && <span className="count">{unread}</span>}
        </button>
      </div>

      {tab === "projects" && <ProjectsPanel projects={projects} />}
      {tab === "thumbnails" && <ThumbnailsPanel thumbs={thumbs} />}
      {tab === "tiktoks" && (
        <>
          {videoReadError && <p className="err" role="alert">{videoReadError}</p>}
          <TikTokPanel tiktoks={tiktoks} />
        </>
      )}
      {tab === "weddings" && (
        <>
          {weddingReadError && <p className="err" role="alert">{weddingReadError}</p>}
          <WeddingPanel landscape={wedLand} portrait={wedPort} />
        </>
      )}
      {tab === "hero" && <HeroPanel settings={settings} />}
      {tab === "inquiries" && <InquiriesPanel inquiries={inquiries} />}
    </>
  );
}

// ---------- page ----------

export default function Admin() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return undefined;

    let active = true;
    let latestUid = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!active) return;

      latestUid = currentUser?.uid ?? null;
      setReady(false);
      setUser(currentUser);
      setIsAdmin(false);
      setAdminError("");

      if (currentUser) {
        try {
          // Firestore rules allow a user to read only their own admins/{uid} document.
          const adminDoc = await getDoc(
            doc(db, "admins", currentUser.uid)
          );

          if (!active || latestUid !== currentUser.uid) return;
          setIsAdmin(adminDoc.exists());
        } catch (err) {
          if (!active || latestUid !== currentUser.uid) return;
          console.error("Admin check failed:", err);
          setAdminError(err?.code || err?.message || "unknown error");
          setIsAdmin(false);
        }
      }

      if (active && latestUid === (currentUser?.uid ?? null)) {
        setReady(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!configured) {
    return (
      <Shell>
        <div className="panel">
          <p>
            Firebase is not connected yet. Check that your{" "}
            <code>.env</code> file is in the main folder, then restart{" "}
            <code>npm run dev</code>.
          </p>
        </div>
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell>
        <p>Loading…</p>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <Login />
      </Shell>
    );
  }

  const out = (
    <button
      className="btn ghost sm"
      onClick={() => signOut(auth)}
    >
      Sign out
    </button>
  );

  if (!isAdmin) {
    return (
      <Shell right={out}>
        <div className="panel">
          <p>
            You are signed in as <b>{user.email}</b>, but this account
            is not an admin yet.
          </p>

          {adminError && (
            <p className="err" role="alert">
              Firebase said: <code>{adminError}</code>
              {adminError.includes("permission") &&
                " (Check your Firestore rules and publish them.)"}
            </p>
          )}

          <p className="sub" style={{ margin: "1rem 0 0" }}>
            In the Firebase console, open Firestore and create a
            document in the <code>admins</code> collection with the
            Document ID <code>{user.uid}</code>. Add a field such as{" "}
            <code>role = owner</code>, then refresh this page.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell right={out}>
      <Dashboard user={user} />
    </Shell>
  );
}