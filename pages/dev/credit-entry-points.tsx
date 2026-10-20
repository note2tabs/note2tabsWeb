import { useState } from "react";
import CreditPurchaseLink from "../../components/CreditPurchaseLink";
import CreditShortfallDialog from "../../components/CreditShortfallDialog";
export default function Preview() {
  const [dialog, setDialog] = useState(0);
  return (
    <main
      className="content"
      style={{ maxWidth: 850, margin: "48px auto", padding: "0 24px" }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 600 }}>
        Credit purchase entry points
      </h1>
      <p style={{ color: "#69716b", margin: "8px 0 32px" }}>
        Local preview · example Premium account
      </p>
      <section
        className="credit-entry-preview-card"
        style={{ padding: 28, marginBottom: 24, border:"1px solid #e1e4de",borderRadius:14,background:"#fffefb" }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
          Transcriber
        </h2>
        <p className="hero-credits-inline">
          Credits: <strong>8</strong>
          <span className="hero-credits-next">
            {" "}
            • Next credits Nov 10, 2026
          </span>
          <CreditPurchaseLink />
        </p>
      </section>
      <section
        className="credit-entry-preview-card"
        style={{ padding: 28, marginBottom: 24, border:"1px solid #e1e4de",borderRadius:14,background:"#fffefb" }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
          Settings · Plan and credits
        </h2>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div>
            <strong>8 credits remaining</strong>
            <p style={{ fontSize: 13, color: "#69716b", marginTop: 6 }}>
              Next credit refresh: Nov 10, 2026
            </p>
          </div>
          <CreditPurchaseLink button />
        </div>
      </section>
      <button
        className="settingsButton settingsButtonPrimary"
        onClick={() => setDialog((n) => n + 1)}
      >
        Show insufficient-credits popup
      </button>
      {dialog > 0 && (
        <CreditShortfallDialog
          key={String(dialog)}
          preview
          context={{
            attempt: dialog,
            plan: "PREMIUM",
            remaining: 8,
            required: 15,
          }}
        />
      )}
    </main>
  );
}
export const getServerSideProps = async () =>
  process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
