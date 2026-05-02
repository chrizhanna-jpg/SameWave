import { useState } from "react";

const NAVY = "#0A2552";
const NAVY_DEEP = "#06173A";
const CARD = "#133370";
const CARD_ELEVATED = "#1A4585";
const PRIMARY = "#1FA9F0";
const ACCENT = "#4FD89C";
const GOLD = "#FFD166";
const TEXT = "#E8F4F8";
const TEXT_MUTED = "#92BCE0";

type TimeFilter = "today" | "week" | "all";
type TypeFilter = "all" | "ripples" | "waves";

type Country = {
  code: string;
  name: string;
  flag: string;
  x: number;
  y: number;
  count: number;
  ripple?: "fresh" | "recent";
  inWave?: boolean;
  thumbSeeds: string[];
};

type WaveArc = {
  from: string;
  to: string;
};

const COUNTRIES: Country[] = [
  { code: "US", name: "United States", flag: "🇺🇸", x: 175, y: 130, count: 18, thumbSeeds: ["us-1", "us-2", "us-3"] },
  { code: "MX", name: "Mexico", flag: "🇲🇽", x: 155, y: 180, count: 6, ripple: "recent", inWave: true, thumbSeeds: ["mx-1", "mx-2", "mx-3"] },
  { code: "BR", name: "Brazil", flag: "🇧🇷", x: 250, y: 270, count: 12, inWave: true, thumbSeeds: ["br-1", "br-2", "br-3"] },
  { code: "AR", name: "Argentina", flag: "🇦🇷", x: 245, y: 330, count: 4, ripple: "fresh", thumbSeeds: ["ar-1", "ar-2"] },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", x: 378, y: 110, count: 22, thumbSeeds: ["gb-1", "gb-2", "gb-3"] },
  { code: "FR", name: "France", flag: "🇫🇷", x: 402, y: 132, count: 9, thumbSeeds: ["fr-1", "fr-2", "fr-3"] },
  { code: "DE", name: "Germany", flag: "🇩🇪", x: 418, y: 118, count: 7, thumbSeeds: ["de-1", "de-2"] },
  { code: "ES", name: "Spain", flag: "🇪🇸", x: 384, y: 152, count: 5, inWave: true, thumbSeeds: ["es-1", "es-2", "es-3"] },
  { code: "IT", name: "Italy", flag: "🇮🇹", x: 425, y: 148, count: 8, ripple: "fresh", thumbSeeds: ["it-1", "it-2", "it-3"] },
  { code: "NO", name: "Norway", flag: "🇳🇴", x: 412, y: 78, count: 3, inWave: true, thumbSeeds: ["no-1", "no-2"] },
  { code: "EG", name: "Egypt", flag: "🇪🇬", x: 450, y: 175, count: 4, thumbSeeds: ["eg-1", "eg-2"] },
  { code: "KE", name: "Kenya", flag: "🇰🇪", x: 480, y: 232, count: 6, inWave: true, thumbSeeds: ["ke-1", "ke-2", "ke-3"] },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", x: 472, y: 305, count: 5, ripple: "recent", thumbSeeds: ["za-1", "za-2"] },
  { code: "IN", name: "India", flag: "🇮🇳", x: 552, y: 178, count: 14, inWave: true, thumbSeeds: ["in-1", "in-2", "in-3"] },
  { code: "CN", name: "China", flag: "🇨🇳", x: 612, y: 142, count: 11, inWave: true, thumbSeeds: ["cn-1", "cn-2", "cn-3"] },
  { code: "JP", name: "Japan", flag: "🇯🇵", x: 680, y: 148, count: 17, inWave: true, thumbSeeds: ["jp-1", "jp-2", "jp-3"] },
  { code: "TH", name: "Thailand", flag: "🇹🇭", x: 590, y: 202, count: 6, ripple: "fresh", thumbSeeds: ["th-1", "th-2"] },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", x: 625, y: 240, count: 8, thumbSeeds: ["id-1", "id-2", "id-3"] },
  { code: "AU", name: "Australia", flag: "🇦🇺", x: 660, y: 298, count: 9, inWave: true, thumbSeeds: ["au-1", "au-2", "au-3"] },
  { code: "RU", name: "Russia", flag: "🇷🇺", x: 555, y: 80, count: 7, ripple: "recent", thumbSeeds: ["ru-1", "ru-2"] },
  { code: "TR", name: "Turkey", flag: "🇹🇷", x: 452, y: 142, count: 4, thumbSeeds: ["tr-1", "tr-2"] },
  { code: "CA", name: "Canada", flag: "🇨🇦", x: 175, y: 75, count: 5, thumbSeeds: ["ca-1", "ca-2"] },
];

const WAVES: WaveArc[] = [
  { from: "GB", to: "JP" },
  { from: "BR", to: "NO" },
  { from: "IN", to: "MX" },
  { from: "AU", to: "ES" },
  { from: "KE", to: "CN" },
];

export function Atlas() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const visibleCountries = COUNTRIES.filter((c) => {
    if (typeFilter === "ripples") return Boolean(c.ripple);
    if (typeFilter === "waves") return Boolean(c.inWave);
    return true;
  });

  const visibleWaves = typeFilter === "ripples" ? [] : WAVES;
  const showRipples = typeFilter !== "waves";

  const byCode = (code: string) => COUNTRIES.find((c) => c.code === code);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: NAVY,
        color: TEXT,
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: 0,
      }}
    >
      <style>{atlasCss}</style>
      <div
        style={{
          width: "100%",
          maxWidth: 390,
          minHeight: "100vh",
          background: NAVY,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Status bar */}
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 22px",
            fontSize: 13,
            fontWeight: 600,
            color: TEXT,
            opacity: 0.85,
          }}
        >
          <span>9:41</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11 }}>●●●●</span>
            <span style={{ fontSize: 11 }}>Wi-Fi</span>
            <span
              style={{
                width: 22,
                height: 11,
                borderRadius: 3,
                border: `1.2px solid ${TEXT}`,
                position: "relative",
                opacity: 0.9,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 1,
                  borderRadius: 1.5,
                  background: TEXT,
                  width: "85%",
                }}
              />
            </span>
          </div>
        </div>

        {/* Header */}
        <div style={{ padding: "8px 20px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: -0.5,
                  color: TEXT,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <GlobeIcon />
                Atlas
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: TEXT_MUTED,
                  marginTop: 2,
                  fontWeight: 500,
                }}
              >
                The world is sharing right now
              </div>
            </div>
            <div
              style={{
                background: CARD,
                border: `1px solid ${CARD_ELEVATED}`,
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                color: ACCENT,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: ACCENT,
                  animation: "atlas-blink 1.6s ease-in-out infinite",
                }}
              />
              Live
            </div>
          </div>

          {/* Filter row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(
              [
                ["today", "Today"],
                ["week", "This week"],
                ["all", "All time"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTimeFilter(key)}
                style={pill(timeFilter === key, "primary")}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setTypeFilter("all")} style={pill(typeFilter === "all", "primary")}>
              All
            </button>
            <button onClick={() => setTypeFilter("ripples")} style={pill(typeFilter === "ripples", "accent")}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT, display: "inline-block", marginRight: 6 }} />
              Ripples only
            </button>
            <button onClick={() => setTypeFilter("waves")} style={pill(typeFilter === "waves", "gold")}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: GOLD, display: "inline-block", marginRight: 6 }} />
              Waves only
            </button>
          </div>
        </div>

        {/* Map area */}
        <div
          style={{
            flex: 1,
            position: "relative",
            margin: "0 14px",
            borderRadius: 22,
            background: `radial-gradient(ellipse at 50% 35%, ${CARD} 0%, ${NAVY_DEEP} 80%)`,
            border: `1px solid ${CARD_ELEVATED}`,
            overflow: "hidden",
            minHeight: 420,
          }}
        >
          {/* Subtle grid lines (latitude/longitude) */}
          <svg
            viewBox="0 0 800 400"
            preserveAspectRatio="xMidYMid meet"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <defs>
              <radialGradient id="oceanGlow" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.06" />
                <stop offset="100%" stopColor={NAVY} stopOpacity="0" />
              </radialGradient>
              <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={GOLD} stopOpacity="0.2" />
                <stop offset="50%" stopColor={GOLD} stopOpacity="1" />
                <stop offset="100%" stopColor={GOLD} stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <rect width="800" height="400" fill="url(#oceanGlow)" />

            {/* Latitude lines */}
            {[80, 160, 240, 320].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="800"
                y2={y}
                stroke={CARD_ELEVATED}
                strokeWidth="0.4"
                strokeDasharray="3,5"
                opacity="0.45"
              />
            ))}
            {/* Longitude lines */}
            {[200, 400, 600].map((x) => (
              <line
                key={x}
                x1={x}
                y1="0"
                x2={x}
                y2="400"
                stroke={CARD_ELEVATED}
                strokeWidth="0.4"
                strokeDasharray="3,5"
                opacity="0.45"
              />
            ))}

            {/* Continent silhouettes (low-poly approximations) */}
            <g fill={CARD} stroke={CARD_ELEVATED} strokeWidth="1" strokeLinejoin="round">
              {/* North America */}
              <path d="M 60 70 L 110 50 L 165 55 L 210 75 L 230 110 L 215 150 L 180 175 L 145 195 L 130 175 L 110 145 L 95 120 L 75 100 Z" />
              {/* Greenland */}
              <path d="M 285 55 L 320 45 L 340 70 L 320 95 L 295 90 Z" />
              {/* South America */}
              <path d="M 200 200 L 240 195 L 270 215 L 285 250 L 280 295 L 260 335 L 240 355 L 220 340 L 215 310 L 210 270 L 205 235 Z" />
              {/* Europe */}
              <path d="M 360 95 L 395 85 L 425 90 L 445 105 L 440 135 L 420 150 L 395 155 L 375 145 L 365 125 Z" />
              {/* Africa */}
              <path d="M 410 165 L 460 155 L 495 175 L 510 215 L 505 260 L 490 305 L 470 325 L 450 320 L 435 290 L 425 250 L 415 215 Z" />
              {/* Asia */}
              <path d="M 445 70 L 510 55 L 580 60 L 645 75 L 695 95 L 720 125 L 715 165 L 685 185 L 645 195 L 610 200 L 575 205 L 545 195 L 510 180 L 480 165 L 455 145 L 445 115 Z" />
              {/* SE Asia / Indonesia */}
              <path d="M 590 215 L 625 215 L 655 225 L 660 250 L 630 255 L 600 245 Z" />
              {/* Australia */}
              <path d="M 625 285 L 670 280 L 700 295 L 705 320 L 680 335 L 645 330 L 625 315 Z" />
              {/* New Zealand */}
              <path d="M 720 335 L 735 330 L 740 350 L 725 355 Z" />
              {/* Antarctica suggestion */}
              <path d="M 100 380 L 700 380 L 700 400 L 100 400 Z" opacity="0.35" />
            </g>

            {/* Wave arcs */}
            {showRipples === false ? null : null}
            {visibleWaves.map((w, i) => {
              const a = byCode(w.from);
              const b = byCode(w.to);
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2;
              const dy = Math.abs(b.x - a.x) * 0.35;
              const my = Math.min(a.y, b.y) - dy;
              const path = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
              return (
                <g key={`${w.from}-${w.to}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={GOLD}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    opacity="0.85"
                    style={{
                      filter: `drop-shadow(0 0 4px ${GOLD})`,
                    }}
                  />
                  <circle r="3" fill={GOLD}>
                    <animateMotion dur={`${3.5 + i * 0.4}s`} repeatCount="indefinite" path={path} />
                  </circle>
                </g>
              );
            })}

            {/* Ripple pulses on fresh-ripple countries */}
            {showRipples &&
              visibleCountries
                .filter((c) => c.ripple === "fresh")
                .map((c, i) => (
                  <g key={`pulse-${c.code}`}>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r="4"
                      fill="none"
                      stroke={ACCENT}
                      strokeWidth="1.5"
                      style={{
                        transformOrigin: `${c.x}px ${c.y}px`,
                        animation: `atlas-ripple 2.6s ease-out ${i * 0.4}s infinite`,
                      }}
                    />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r="4"
                      fill="none"
                      stroke={ACCENT}
                      strokeWidth="1.2"
                      style={{
                        transformOrigin: `${c.x}px ${c.y}px`,
                        animation: `atlas-ripple 2.6s ease-out ${i * 0.4 + 1.3}s infinite`,
                      }}
                    />
                  </g>
                ))}

            {/* Wave-end glows */}
            {visibleWaves.map((w) => {
              const a = byCode(w.from);
              const b = byCode(w.to);
              if (!a || !b) return null;
              return (
                <g key={`glow-${w.from}-${w.to}`}>
                  <circle cx={a.x} cy={a.y} r="14" fill={GOLD} opacity="0.18" />
                  <circle cx={b.x} cy={b.y} r="14" fill={GOLD} opacity="0.18" />
                </g>
              );
            })}

            {/* Sparkles */}
            {SPARKLES.map((s, i) => (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill={GOLD}
                opacity="0.55"
                style={{ animation: `atlas-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite` }}
              />
            ))}
          </svg>

          {/* Country clusters as absolute-positioned divs over the SVG */}
          <div style={{ position: "absolute", inset: 0 }}>
            {visibleCountries.map((c) => (
              <CountryCluster key={c.code} country={c} />
            ))}
          </div>

          {/* Floating live counters */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <Stat label="Countries" value={visibleCountries.length} color={PRIMARY} />
            <Stat
              label="Ripples"
              value={visibleCountries.filter((c) => c.ripple).length}
              color={ACCENT}
            />
            <Stat label="Waves" value={visibleWaves.length} color={GOLD} />
          </div>

          {/* Bottom legend hint */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              gap: 14,
              fontSize: 9.5,
              color: TEXT_MUTED,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            <LegendDot color={ACCENT} label="Ripple" />
            <LegendDot color={GOLD} label="Wave" />
            <LegendDot color={PRIMARY} label="Active" />
          </div>
        </div>

        {/* Bottom Tab Bar */}
        <div
          style={{
            background: NAVY_DEEP,
            borderTop: `1px solid ${CARD_ELEVATED}`,
            padding: "8px 6px 22px",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "flex-end",
          }}
        >
          <Tab icon={<DiscoverIcon />} label="Discover" active={false} />
          <Tab icon={<GlobeIcon size={22} />} label="Atlas" active={true} />
          <Tab icon={<MatchIcon />} label="Match" active={false} />
          <Tab icon={<ProfileIcon />} label="Profile" active={false} />
        </div>
      </div>
    </div>
  );
}

function CountryCluster({ country }: { country: Country }) {
  // Convert SVG viewBox coords (800x400) to percentage
  const leftPct = (country.x / 800) * 100;
  const topPct = (country.y / 400) * 100;
  const thumbs = country.thumbSeeds.slice(0, 3);
  const overflow = country.count - thumbs.length;
  const rotations = [-7, 4, -2];

  return (
    <div
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: "translate(-50%, -100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 36,
          height: 36,
        }}
      >
        {thumbs.map((seed, i) => (
          <div
            key={seed}
            style={{
              position: "absolute",
              left: i * 4 - 4,
              top: i * 2 - 2,
              width: 24,
              height: 24,
              borderRadius: 6,
              background: gradientFor(seed),
              border: `1.5px solid ${
                country.inWave ? GOLD : country.ripple ? ACCENT : "#FFFFFF"
              }`,
              transform: `rotate(${rotations[i] ?? 0}deg)`,
              boxShadow: country.inWave
                ? `0 0 8px ${GOLD}88`
                : country.ripple
                  ? `0 0 6px ${ACCENT}88`
                  : "0 2px 4px rgba(0,0,0,0.4)",
              zIndex: i,
            }}
          />
        ))}
        {overflow > 0 && (
          <div
            style={{
              position: "absolute",
              right: -6,
              bottom: -6,
              minWidth: 18,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: PRIMARY,
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1.5px solid ${NAVY}`,
              zIndex: 10,
            }}
          >
            +{overflow}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          lineHeight: 1,
          textShadow: `0 1px 3px ${NAVY_DEEP}`,
          marginTop: 2,
        }}
      >
        {country.flag}
      </div>
    </div>
  );
}

function Tab({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "4px 10px",
        position: "relative",
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            top: -8,
            width: 28,
            height: 3,
            borderRadius: 999,
            background: PRIMARY,
            boxShadow: `0 0 8px ${PRIMARY}`,
          }}
        />
      )}
      <div style={{ color: active ? PRIMARY : TEXT_MUTED }}>{icon}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: active ? PRIMARY : TEXT_MUTED,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "rgba(6, 23, 58, 0.78)",
        border: `1px solid ${CARD_ELEVATED}`,
        borderRadius: 10,
        padding: "5px 9px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      {label}
    </div>
  );
}

function pill(active: boolean, tone: "primary" | "accent" | "gold") {
  const toneColor = tone === "accent" ? ACCENT : tone === "gold" ? GOLD : PRIMARY;
  return {
    background: active ? toneColor : "transparent",
    color: active ? (tone === "accent" || tone === "gold" ? NAVY : "#fff") : TEXT,
    border: `1px solid ${active ? toneColor : CARD_ELEVATED}`,
    borderRadius: 999,
    padding: "6px 11px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.2,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "inherit",
    boxShadow: active ? `0 0 10px ${toneColor}55` : "none",
    transition: "all 0.15s ease",
  } as React.CSSProperties;
}

// Deterministic gradient for each photo "thumbnail" (mockup placeholders).
function gradientFor(seed: string): string {
  const palettes = [
    ["#FF9F6A", "#FFD166"],
    ["#4FD89C", "#1FA9F0"],
    ["#FFD166", "#FF6B9D"],
    ["#A78BFA", "#1FA9F0"],
    ["#FF6B9D", "#A78BFA"],
    ["#1FA9F0", "#163C7E"],
    ["#4FD89C", "#FFD166"],
    ["#FF9F6A", "#FF6B9D"],
    ["#92BCE0", "#4FD89C"],
    ["#FFD166", "#1FA9F0"],
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const p = palettes[Math.abs(hash) % palettes.length];
  const angle = (Math.abs(hash) % 360);
  return `linear-gradient(${angle}deg, ${p[0]}, ${p[1]})`;
}

const SPARKLES = [
  { x: 120, y: 50, r: 1.2, dur: 4.5, delay: 0 },
  { x: 320, y: 35, r: 0.9, dur: 5.2, delay: 1.1 },
  { x: 540, y: 60, r: 1.4, dur: 3.9, delay: 2.3 },
  { x: 700, y: 80, r: 1, dur: 4.8, delay: 0.7 },
  { x: 80, y: 250, r: 1.1, dur: 5.5, delay: 1.8 },
  { x: 290, y: 380, r: 0.8, dur: 4.2, delay: 0.4 },
  { x: 580, y: 365, r: 1.3, dur: 5.0, delay: 2.7 },
  { x: 720, y: 200, r: 1, dur: 4.6, delay: 1.5 },
  { x: 410, y: 30, r: 1, dur: 6.0, delay: 3.2 },
  { x: 200, y: 360, r: 0.9, dur: 5.4, delay: 0.9 },
  { x: 480, y: 380, r: 1.2, dur: 4.4, delay: 2.0 },
  { x: 640, y: 25, r: 1, dur: 5.8, delay: 0.3 },
];

const atlasCss = `
  @keyframes atlas-ripple {
    0%   { transform: scale(0.6); opacity: 0.95; }
    70%  { opacity: 0.25; }
    100% { transform: scale(7); opacity: 0; }
  }
  @keyframes atlas-blink {
    0%, 100% { opacity: 0.4; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.15); }
  }
  @keyframes atlas-sparkle {
    0%, 100% { opacity: 0.15; transform: translateY(0); }
    50% { opacity: 0.85; transform: translateY(-3px); }
  }
`;

function GlobeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

function DiscoverIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M15.5 8.5L13.5 13.5L8.5 15.5L10.5 10.5Z"
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  );
}

function MatchIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
