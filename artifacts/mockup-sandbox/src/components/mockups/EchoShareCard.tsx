export default function EchoShareCard() {
  const colors = {
    background: "#071828",
    card: "#0d2340",
    cardElevated: "#143554",
    border: "#143554",
    foreground: "#E8F4F8",
    teal: "#00BFA5",
    mutedForeground: "#7ba7c2",
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
          Shareable card preview
        </p>

        <div
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            border: `1px solid ${colors.border}`,
            padding: 16,
            paddingBottom: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <PhotoSlot
              gradient="linear-gradient(135deg, #2c5364 0%, #203a43 50%, #0f2027 100%)"
              accent="#7fdbff"
              label="river reflections"
              dateLabel="Apr 25"
            />
            <PhotoSlot
              gradient="linear-gradient(135deg, #614385 0%, #516395 100%)"
              accent="#fbd38d"
              label="empty mug"
              dateLabel="Apr 25"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <FlagPill flag="🇮🇪" colors={colors} />
            <FlagPill flag="🇮🇪" colors={colors} />
          </div>

          <div
            style={{
              alignSelf: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              backgroundColor: "#000000",
              borderColor: colors.teal,
              borderWidth: 1.5,
              borderStyle: "solid",
              borderRadius: 14,
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 9,
              paddingBottom: 9,
              marginTop: 8,
              width: "fit-content",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>✨</span>
              <span
                style={{
                  fontSize: 14,
                  color: "#FFFFFF",
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                Echo
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                color: colors.teal,
                fontWeight: 600,
                letterSpacing: 0.4,
                marginTop: 2,
              }}
            >
              Find it on Google Play
            </span>
          </div>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: colors.mutedForeground,
            marginTop: 14,
            lineHeight: 1.5,
          }}
        >
          Everything inside the card above is captured into the
          <br />
          shared image. Watermark sits inside the capture region.
        </p>
      </div>
    </div>
  );
}

function PhotoSlot({
  gradient,
  accent,
  label,
  dateLabel,
}: {
  gradient: string;
  accent: string;
  label: string;
  dateLabel: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 16,
          overflow: "hidden",
          background: gradient,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              backgroundColor: "rgba(0,0,0,0.55)",
              color: "#FFFFFF",
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 999,
              letterSpacing: 0.4,
            }}
          >
            {dateLabel}
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: accent,
              fontStyle: "italic",
              opacity: 0.7,
              fontFamily: "Georgia, serif",
            }}
          >
            “{label}”
          </span>
        </div>
      </div>
    </div>
  );
}

function FlagPill({
  flag,
  colors,
}: {
  flag: string;
  colors: { card: string; border: string };
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: 999,
          padding: "8px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 64,
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>{flag}</span>
      </div>
    </div>
  );
}
