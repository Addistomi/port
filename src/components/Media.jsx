import { useEffect, useState } from "react";
import Art from "./Art.jsx";
import { parseVideo } from "../lib/video.js";

export default function Media({ p }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [p.thumbUrl, p.videoUrl]);

  const video = parseVideo(p.videoUrl);
  const sources = [
    p.thumbUrl && /^https:\/\//.test(p.thumbUrl) ? p.thumbUrl : null,
    ...(video?.thumbs || []),
  ].filter(Boolean);
  const src = sources[i];

  return src ? (
    <img src={src} alt="" loading="lazy" onError={() => setI((n) => n + 1)} />
  ) : (
    <Art kind={p.art} pal={p.pal} />
  );
}