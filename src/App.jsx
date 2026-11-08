import { lazy, Suspense } from "react";
import Home from "./pages/Home.jsx";

// The admin page only loads when someone visits /admin
const Admin = lazy(() => import("./pages/Admin.jsx"));

export default function App() {
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <Suspense fallback={<p style={{ padding: "2rem" }}>Loading…</p>}>
        <Admin />
      </Suspense>
    );
  }
  return <Home />;
}