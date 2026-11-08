import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const EMAIL = "Natnaeldiribsa77@gmail.com";
const TELEGRAM_URL = "https://t.me/nhatty5";
const MAX_MESSAGE = 4000;

// The number is never printed on the page. It is only assembled
// when someone presses "Call me".
const PHONE_PARTS = ["+251", "900", "140", "261"];

function callMe() {
  window.location.href = "tel:" + PHONE_PARTS.join("");
}

const iconProps = {
  viewBox: "0 0 24 24",
  width: 22,
  height: 22,
  "aria-hidden": "true",
};

function PlaneIcon({ className }) {
  return (
    <svg {...iconProps} className={className} fill="currentColor">
      <path d="M21.4 3.6 2.7 10.8c-1.1.4-1.1 1.1-.2 1.4l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8l3.2-15.1c.3-1.3-.5-1.9-1.4-1.5ZM8.4 13.2l9.6-6c.5-.3.9-.1.5.2l-8 7.2-.3 3.3-1.8-4.7Z" />
    </svg>
  );
}

function PhoneIcon({ className }) {
  return (
    <svg {...iconProps} className={className} fill="currentColor">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z" />
    </svg>
  );
}

function MailIcon({ className }) {
  return (
    <svg {...iconProps} className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Contact() {
  // idle | sending | sent | error
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);

  function fail(text) {
    setStatus("error");
    setError(text);
  }

  async function submit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const name = (formData.get("name") || "").toString().trim();
    const email = (formData.get("email") || "").toString().trim();
    const message = (formData.get("message") || "").toString().trim();

    if (name === "" || email === "" || message === "") {
      fail("Please fill in all fields.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      fail("Please enter a valid email address.");
      return;
    }

    setStatus("sending");
    setError("");

    try {
      // Saved to Firebase Firestore, collection "inquiries"
      await addDoc(collection(db, "inquiries"), {
        name: name,
        email: email,
        message: message,
        createdAt: serverTimestamp(),
      });

      setCount(0);
      setStatus("sent");
    } catch (err) {
      console.error("Contact form error:", err);
      fail("Unable to send your message. Please try again.");
    }
  }

  const sending = status === "sending";
  const sent = status === "sent";

  return (
    <section id="contact" style={{ paddingTop: 0 }}>
      <div className="wrap contact">
        <div className="contact-intro">
          <p className="availability">
            <span className="pulse-dot" aria-hidden="true" />
            Available for new projects
          </p>

          <h2>Have footage waiting?</h2>

          <p className="lead">
            Tell me what you are making, when it is due and roughly how much
            footage there is. I reply within one working day.
          </p>

          <div className="ways">
            <a
              className="way way-telegram"
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Message me on Telegram"
            >
              <span className="way-icon"><PlaneIcon className="plane" /></span>
              <span className="way-text">
                <strong>Telegram</strong>
                <small>Message me directly</small>
              </span>
              <ArrowIcon className="way-arrow" />
            </a>

            <button type="button" className="way way-call" onClick={callMe}>
              <span className="way-icon">
                <span className="ring" />
                <PhoneIcon className="handset" />
              </span>
              <span className="way-text">
                <strong>Call me</strong>
                <small>Tap to start a call</small>
              </span>
              <ArrowIcon className="way-arrow" />
            </button>

            <a className="way way-mail" href={`mailto:${EMAIL}`} aria-label="Send me an email">
              <span className="way-icon"><MailIcon className="mail" /></span>
              <span className="way-text">
                <strong>Email</strong>
                <small>{EMAIL}</small>
              </span>
              <ArrowIcon className="way-arrow" />
            </a>
          </div>
        </div>

        <div className="panel">
          {sent ? (
            <div className="success" role="status">
              <svg className="check" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="check-circle" cx="26" cy="26" r="24" fill="none" />
                <path className="check-mark" fill="none" d="M15 27l8 8 15-16" />
              </svg>
              <h3>Brief received</h3>
              <p>Thank you. I will reply to your email within one working day.</p>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setStatus("idle")}
              >
                Send another message
              </button>
            </div>
          ) : (
            <form className="fields" onSubmit={submit} noValidate>
              <h3>Send a brief</h3>

              <label className="field">
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  placeholder=" "
                  required
                />
                <span>Your name</span>
              </label>

              <label className="field">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  placeholder=" "
                  required
                />
                <span>Email address</span>
              </label>

              <label className="field">
                <textarea
                  name="message"
                  maxLength={MAX_MESSAGE}
                  placeholder=" "
                  required
                  onInput={(e) => setCount(e.currentTarget.value.length)}
                />
                <span>About the project</span>
                <em className="counter">{count} / {MAX_MESSAGE}</em>
              </label>

              <button
                className={"send-btn is-" + status}
                type="submit"
                disabled={sending}
              >
                {sending && <span className="spinner" aria-hidden="true" />}
                <span>{sending ? "Sending" : "Send brief"}</span>
                {!sending && <ArrowIcon className="send-arrow" />}
              </button>

              <p
                className={"note" + (status === "error" ? " note-error" : "")}
                role="status"
                aria-live="polite"
              >
                {error}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
