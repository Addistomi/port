import { useState } from "react";
import { profile } from "../Data/profile.js";

// Shows your photo, or your initials if the photo file is missing.
export default function Avatar({ alt = "" }) {
  const [failed, setFailed] = useState(false);
  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return failed ? (
    <span className="av-fallback" aria-hidden="true">{initials}</span>
  ) : (
    <img src={profile.photo} alt={alt} onError={() => setFailed(true)} />
  );
}