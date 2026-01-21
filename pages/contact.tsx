import { FormEvent, useState } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    console.log("Contact message", { name, email, message });
    setSent(true);
  };

  return (
    <main className="page">
      <div className="container stack">
        <div>
          <h1 className="page-title">Contact</h1>
          <p className="page-subtitle">
            Questions or feedback? Send us a note. (Local-only placeholder form.)
          </p>
        </div>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="form-textarea"
            />
          </div>
          <div className="button-row">
            <button type="submit" className="button-primary">
              Send
            </button>
            {sent && <span className="muted text-small">Message logged to console.</span>}
          </div>
        </form>
      </div>
    </main>
  );
}
