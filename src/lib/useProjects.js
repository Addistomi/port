import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { configured, db } from "../firebase";
import { sampleProjects } from "../data/sampleProjects";

// Live list of published projects, sorted by their "order" field.
export function useProjects() {
  const [state, setState] = useState({
    projects: sampleProjects,
    loading: configured,
    demo: !configured,
  });

  useEffect(() => {
    if (!configured) return;

    const q = query(collection(db, "projects"), where("published", "==", true));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        // No projects yet? Keep showing the samples.
        setState({
          projects: list.length ? list : sampleProjects,
          loading: false,
          demo: list.length === 0,
        });
      },
      () => setState({ projects: sampleProjects, loading: false, demo: true })
    );
  }, []);

  return state;
}