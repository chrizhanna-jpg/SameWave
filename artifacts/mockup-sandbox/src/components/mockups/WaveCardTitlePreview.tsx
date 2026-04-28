// The actual brand glyph the mobile app renders. Source PNG is mirrored
// from artifacts/same-same/assets/images/samewave-glyph.png into
// artifacts/mockup-sandbox/public/ so the canvas preview matches what
// users see in the app. Aspect ratio 974×444 ≈ 2.19:1, same as the app.
const WAVE_GLYPH_ASPECT = 974 / 444;

function WaveGlyph({ size = 52 }: { size?: number }) {
  return (
    <img
      src="/__mockup/samewave-glyph.png"
      alt=""
      style={{
        width: size * WAVE_GLYPH_ASPECT,
        height: size,
        display: "block",
      }}
    />
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
