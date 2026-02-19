import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

export default function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "Note2Tabs";
  const subtitle = searchParams.get("subtitle") || "Convert audio to guitar tabs online";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0f172a 0%, #0b1020 60%, #12233f 100%)",
          color: "#f8fafc",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ fontSize: 22, color: "#94a3b8", marginBottom: 16 }}>Note2Tabs</div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 28, color: "#cbd5f5", marginTop: 24 }}>{subtitle}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
