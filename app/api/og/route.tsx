import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "linear-gradient(135deg, #317EFB 0%, #1E40AF 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "40px",
        }}
      >
        {/* Logo/Brand */}
        <div
          style={{
            fontSize: 80,
            fontWeight: "800",
            marginBottom: 20,
            letterSpacing: "-0.02em",
          }}
        >
          Noblocks
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            textAlign: "center",
            maxWidth: "900px",
            lineHeight: 1.2,
            opacity: 0.95,
            fontWeight: "400",
          }}
        >
          Change stablecoins to cash in seconds
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            textAlign: "center",
            maxWidth: "800px",
            marginTop: 30,
            opacity: 0.8,
            fontWeight: "300",
          }}
        >
          Decentralized payments to any bank or mobile wallet
        </div>

        {/* Visual element */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 40,
            display: "flex",
            alignItems: "center",
            fontSize: 20,
            opacity: 0.7,
          }}
        >
          noblocks.xyz
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
