function WaveGlyph({ size = 52 }: { size?: number }) {
  // Approximation of the SameWave brand glyph used in the actual app
  // (artifacts/same-same/assets/images/samewave-logo.png is rendered
  // there). Inline SVG so the preview is self-contained for the
  // screenshot tool — final share image uses the brand artwork.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="32" cy="32" r="30" fill="#0d2340" stroke="#00BFA5" strokeWidth="2" />
      <path
        d="M8 28 Q14 22, 20 28 T32 28 T44 28 T56 28"
        stroke="#00BFA5"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M8 38 Q14 32, 20 38 T32 38 T44 38 T56 38"
        stroke="#00BFA5"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M8 48 Q14 42, 20 48 T32 48 T44 48 T56 48"
        stroke="#00BFA5"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />
    </svg>
  );
}

export default function WaveCardTitlePreview() {
  const colors = {
    background: "#071828",
    card: "#0d2340",
    teal: "#00BFA5",
    foreground: "#E8F4F8",
    mutedForeground: "#7ba7c2",
    gold: "#FFD166",
  };

  return (
    <div
      style={{
        backgroundColor: colors.background,
        minHeight: "100vh",
        padding: "32px 16px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: colors.foreground,
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: colors.mutedForeground,
            marginBottom: 14,
          }}
        >
          Wave share card — title
        </p>

        <div
          style={{
            position: "relative",
            backgroundColor: colors.card,
            borderRadius: 24,
            border: `1.5px solid ${colors.gold}66`,
            padding: "24px 18px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {(["TL", "TR", "BL", "BR"] as const).map((corner) => (
            <span
              key={corner}
              style={{
                position: "absolute",
                top: corner.startsWith("T") ? 6 : "auto",
                bottom: corner.startsWith("B") ? 6 : "auto",
                left: corner.endsWith("L") ? 8 : "auto",
                right: corner.endsWith("R") ? 8 : "auto",
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              ✨
            </span>
          ))}

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <WaveGlyph size={52} />
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: -0.5,
                color: colors.teal,
              }}
            >
              Wave
            </span>
            <WaveGlyph size={52} />
          </div>

          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: colors.mutedForeground,
              marginTop: 4,
              maxWidth: 280,
              lineHeight: 1.4,
            }}
          >
            Card chrome, photos, and chips render below this title in the full
            share image. Only the title row changed.
          </p>
        </div>
      </div>
    </div>
  );
}
