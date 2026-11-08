import { useState } from "react";
import Header from "../components/Header.jsx";
import Timeline from "../components/Timeline.jsx";
import WorkGrid from "../components/WorkGrid.jsx";
import GradeCompare from "../components/GradeCompare.jsx";
import Process from "../components/Process.jsx";
import Services from "../components/Services.jsx";
import Contact from "../components/Contact.jsx";
import Footer from "../components/Footer.jsx";
import ProjectDialog from "../components/ProjectDialog.jsx";
import Profile from "../components/Profile.jsx";
import { useProjects } from "../lib/useProjects.js";
import TikTokReels from "../components/Tiktok.jsx";
import Thumbnails from "../components/Thumbnails.jsx";
import VideoHero from "../components/VideoHero.jsx";
import WeddingVideos from "../components/Wedding.jsx";


export default function Home() {
  const { projects, demo } = useProjects();
  const [open, setOpen] = useState(null); // the project shown in the popup
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <Header onProfile={() => setProfileOpen(true)} />
      <main id="top">
        <div className="wrap hero">
          <div className="hero-row">
            <h1 aria-label="I edit films people finish watching.">
              <span className="cut" aria-hidden="true" style={{ "--d": 0, "--cc": "var(--c1)" }}>I edit films</span>{" "}
              <span className="cut" aria-hidden="true" style={{ "--d": 1, "--cc": "var(--c2)" }}>people finish</span>{" "}
              <span className="cut" aria-hidden="true" style={{ "--d": 2, "--cc": "var(--c3)" }}>watching.</span>
            </h1>
            <VideoHero embedded />
          </div>
          <div className="hero-row">
            <p>
              Freelance video editor for documentaries, music videos and brand films.
              I take raw footage to a final master, and keep the story moving the whole way.
            </p>
            {/* <span className="status"><b aria-hidden="true" />Booking from November</span>*/}
          </div>

          {demo && (
            <p className="demo-note">
              Showing sample projects. Your own projects will replace these once you add them.
            </p>
          )}

          <Timeline projects={projects} onOpen={setOpen} />        </div>
        <TikTokReels />
        <WorkGrid projects={projects} onOpen={setOpen} />
        <GradeCompare projects={projects} />
        <WeddingVideos />
        <Thumbnails />
        <Process />
        <Services />
        <Contact />
      </main>

      <Footer />

      <ProjectDialog project={open} onClose={() => setOpen(null)} />
      <Profile open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}