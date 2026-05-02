import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { geoEqualEarth, geoPath } from "d3-geo";

// Mirror ComposableMap's defaults (width 800, height 600) so paths we render
// ourselves line up perfectly with markers placed via <Marker>. If you change
// projection settings on <ComposableMap>, mirror them here.
const PROJECTION = geoEqualEarth()
  .scale(175)
  .center([15, 8])
  .translate([400, 300]);
const PATH_GEN = geoPath(PROJECTION);

function arcPath(from: [number, number], to: [number, number]): string {
  return PATH_GEN({ type: "LineString", coordinates: [from, to] }) ?? "";
}

const SPLASH = "#166FFC";
const SPLASH_DEEP = "#0B4FC8";
const SPLASH_LIGHT = "#3F8AFF";
const NAVY = "#0A2552";
const NAVY_DEEP = "#06173A";
const LAND = "#04102A";
const LAND_HIGHLIGHT = "#0E2860";
const CARD = "rgba(255, 255, 255, 0.06)";
const CARD_ELEVATED = "rgba(255, 255, 255, 0.14)";
const PRIMARY = "#1FA9F0";
const ACCENT = "#4FD89C";
const GOLD = "#FFD166";
const TEXT = "#FFFFFF";
const TEXT_MUTED = "#92BCE0";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type TimeFilter = "today" | "week" | "all";
type TypeFilter = "all" | "ripples" | "waves";

type Country = {
  code: string;
  name: string;
  flag: string;
  // [longitude, latitude]
  coords: [number, number];
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
  { code: "US", name: "United States", flag: "🇺🇸", coords: [-96, 38], count: 18, thumbSeeds: ["us-1", "us-2", "us-3"] },
  { code: "MX", name: "Mexico", flag: "🇲🇽", coords: [-102, 23], count: 6, ripple: "recent", inWave: true, thumbSeeds: ["mx-1", "mx-2", "mx-3"] },
  { code: "CA", name: "Canada", flag: "🇨🇦", coords: [-106, 56], count: 5, thumbSeeds: ["ca-1", "ca-2"] },
  { code: "BR", name: "Brazil", flag: "🇧🇷", coords: [-52, -10], count: 12, inWave: true, thumbSeeds: ["br-1", "br-2", "br-3"] },
  { code: "AR", name: "Argentina", flag: "🇦🇷", coords: [-65, -35], count: 4, ripple: "fresh", thumbSeeds: ["ar-1", "ar-2"] },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", coords: [-2, 54], count: 22, thumbSeeds: ["gb-1", "gb-2", "gb-3"] },
  { code: "FR", name: "France", flag: "🇫🇷", coords: [2, 46], count: 9, thumbSeeds: ["fr-1", "fr-2", "fr-3"] },
  { code: "DE", name: "Germany", flag: "🇩🇪", coords: [10, 51], count: 7, thumbSeeds: ["de-1", "de-2"] },
  { code: "ES", name: "Spain", flag: "🇪🇸", coords: [-4, 40], count: 5, inWave: true, thumbSeeds: ["es-1", "es-2", "es-3"] },
  { code: "IT", name: "Italy", flag: "🇮🇹", coords: [12, 42], count: 8, ripple: "fresh", thumbSeeds: ["it-1", "it-2", "it-3"] },
  { code: "NO", name: "Norway", flag: "🇳🇴", coords: [10, 62], count: 3, inWave: true, thumbSeeds: ["no-1", "no-2"] },
  { code: "EG", name: "Egypt", flag: "🇪🇬", coords: [30, 27], count: 4, thumbSeeds: ["eg-1", "eg-2"] },
  { code: "KE", name: "Kenya", flag: "🇰🇪", coords: [38, 0], count: 6, inWave: true, thumbSeeds: ["ke-1", "ke-2", "ke-3"] },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", coords: [25, -29], count: 5, ripple: "recent", thumbSeeds: ["za-1", "za-2"] },
  { code: "IN", name: "India", flag: "🇮🇳", coords: [78, 21], count: 14, inWave: true, thumbSeeds: ["in-1", "in-2", "in-3"] },
  { code: "CN", name: "China", flag: "🇨🇳", coords: [105, 35], count: 11, inWave: true, thumbSeeds: ["cn-1", "cn-2", "cn-3"] },
  { code: "JP", name: "Japan", flag: "🇯🇵", coords: [138, 36], count: 17, inWave: true, thumbSeeds: ["jp-1", "jp-2", "jp-3"] },
  { code: "TH", name: "Thailand", flag: "🇹🇭", coords: [101, 15], count: 6, ripple: "fresh", thumbSeeds: ["th-1", "th-2"] },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", coords: [118, -3], count: 8, thumbSeeds: ["id-1", "id-2", "id-3"] },
  { code: "AU", name: "Australia", flag: "🇦🇺", coords: [134, -27], count: 9, inWave: true, thumbSeeds: ["au-1", "au-2", "au-3"] },
  { code: "RU", name: "Russia", flag: "🇷🇺", coords: [90, 62], count: 7, ripple: "recent", thumbSeeds: ["ru-1", "ru-2"] },
  { code: "TR", name: "Turkey", flag: "🇹🇷", coords: [35, 39], count: 4, thumbSeeds: ["tr-1", "tr-2"] },
];

const WAVES: WaveArc[] = [
  { from: "GB", to: "JP" },
  { from: "BR", to: "NO" },
  { from: "IN", to: "MX" },
  { from: "AU", to: "ES" },
  { from: "KE", to: "CN" },
];

// Ripples are also pairs (someone matched their photo to another's photo) but
// the partner hasn't reciprocated yet. Visually they get a thin dashed green
// thread instead of the bold gold arc a Wave gets, so reciprocity reads at
// a glance. The `from` side is the country that pinged first (gets the pulse).
type RippleArc = { from: string; to: string; fresh?: boolean };
const RIPPLES: RippleArc[] = [
  { from: "IT", to: "CA", fresh: true },
  { from: "TH", to: "EG", fresh: true },
  { from: "AR", to: "ID", fresh: true },
  { from: "RU", to: "TR" },
  { from: "ZA", to: "FR" },
];

export function Atlas() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const ripplePairCodes = new Set(RIPPLES.flatMap((r) => [r.from, r.to]));
  const wavePairCodes = new Set(WAVES.flatMap((w) => [w.from, w.to]));

  const visibleCountries = COUNTRIES.filter((c) => {
    if (typeFilter === "ripples") return ripplePairCodes.has(c.code);
    if (typeFilter === "waves") return wavePairCodes.has(c.code);
    return true;
  });

  const visibleWaves = typeFilter === "ripples" ? [] : WAVES;
  const visibleRipples = typeFilter === "waves" ? [] : RIPPLES;
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
      }}
    >
      <style>{atlasCss}</style>
      <div
        style={{
          width: "100%",
          maxWidth: 390,
          minHeight: "100vh",
          background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
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
                fontWeight: 700,
                color: ACCENT,
                display: "flex",
                alignItems: "center",
                gap: 6,
                backdropFilter: "blur(6px)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: ACCENT,
                  boxShadow: `0 0 6px ${ACCENT}`,
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
            background: `radial-gradient(ellipse at 50% 40%, ${SPLASH_LIGHT} 0%, ${SPLASH} 55%, ${SPLASH_DEEP} 100%)`,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            overflow: "hidden",
            minHeight: 440,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 175, center: [15, 8] }}
            width={800}
            height={520}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          >
            <defs>
              <radialGradient id="oceanGlow" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.10" />
                <stop offset="100%" stopColor={SPLASH_DEEP} stopOpacity="0" />
              </radialGradient>
              <linearGradient id="landGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={LAND_HIGHLIGHT} />
                <stop offset="100%" stopColor={LAND} />
              </linearGradient>
              {COUNTRIES.flatMap((c) =>
                c.thumbSeeds.map((seed) => (
                  <pattern
                    key={`pat-${seed}`}
                    id={`thumb-${seed}`}
                    patternUnits="objectBoundingBox"
                    width="1"
                    height="1"
                  >
                    <image
                      href={photoFor(seed)}
                      x="0"
                      y="0"
                      width="20"
                      height="20"
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </pattern>
                ))
              )}
            </defs>
            <rect x="0" y="0" width="800" height="520" fill="url(#oceanGlow)" />

            {/* Latitude/longitude grid */}
            {[130, 260, 390].map((y) => (
              <line
                key={`lat-${y}`}
                x1="0"
                y1={y}
                x2="800"
                y2={y}
                stroke={CARD_ELEVATED}
                strokeWidth="0.4"
                strokeDasharray="3,5"
                opacity="0.2"
              />
            ))}
            {[200, 400, 600].map((x) => (
              <line
                key={`lon-${x}`}
                x1={x}
                y1="0"
                x2={x}
                y2="520"
                stroke={CARD_ELEVATED}
                strokeWidth="0.4"
                strokeDasharray="3,5"
                opacity="0.2"
              />
            ))}

            {/* Real country shapes — dark land with green coastline accent */}
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="url(#landGradient)"
                    stroke={ACCENT}
                    strokeWidth={0.45}
                    strokeOpacity={0.55}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: LAND_HIGHLIGHT },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Ripple threads — one-sided matches in flight. The line is
                a faint green dashed thread; a single small green dot drifts
                slowly from the sender to the recipient (their photo travelling
                across the world, hoping for reciprocation). */}
            {visibleRipples.map((r) => {
              const a = byCode(r.from);
              const b = byCode(r.to);
              if (!a || !b) return null;
              const d = arcPath(a.coords, b.coords);
              return (
                <g key={`ripple-arc-${r.from}-${r.to}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1}
                    strokeLinecap="round"
                    strokeDasharray="3 4"
                    opacity={r.fresh ? 0.85 : 0.6}
                  />
                  <circle r={2.5} fill={ACCENT} opacity={0.95}>
                    <animateMotion
                      dur="4.5s"
                      repeatCount="indefinite"
                      path={d}
                      rotate="auto"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.95;0.95;0"
                      keyTimes="0;0.15;0.85;1"
                      dur="4.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              );
            })}

            {/* Wave arcs — mutual matches. Bold gold line with glow, plus
                TWO bright dots travelling in OPPOSITE directions: their two
                photos crossing each other in flight, the visual signature of
                reciprocity. Faster than ripples — these are alive. */}
            {visibleWaves.map((w) => {
              const a = byCode(w.from);
              const b = byCode(w.to);
              if (!a || !b) return null;
              const d = arcPath(a.coords, b.coords);
              const dReverse = arcPath(b.coords, a.coords);
              return (
                <g key={`wave-${w.from}-${w.to}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={GOLD}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 4px ${GOLD})` }}
                  />
                  <circle
                    r={3}
                    fill="#FFFFFF"
                    stroke={GOLD}
                    strokeWidth={1}
                    style={{ filter: `drop-shadow(0 0 3px ${GOLD})` }}
                  >
                    <animateMotion
                      dur="2.6s"
                      repeatCount="indefinite"
                      path={d}
                    />
                  </circle>
                  <circle
                    r={3}
                    fill="#FFFFFF"
                    stroke={GOLD}
                    strokeWidth={1}
                    style={{ filter: `drop-shadow(0 0 3px ${GOLD})` }}
                  >
                    <animateMotion
                      dur="2.6s"
                      repeatCount="indefinite"
                      path={dReverse}
                    />
                  </circle>
                </g>
              );
            })}

            {/* Wave endpoint glows */}
            {visibleWaves.map((w) => {
              const a = byCode(w.from);
              const b = byCode(w.to);
              if (!a || !b) return null;
              return (
                <g key={`wave-glow-${w.from}-${w.to}`}>
                  <Marker coordinates={a.coords}>
                    <circle r={11} fill={GOLD} opacity="0.22" />
                    <circle
                      r={6}
                      fill="none"
                      stroke={GOLD}
                      strokeWidth="1"
                      style={{ animation: "atlas-wave-pulse 2.4s ease-out infinite" }}
                    />
                  </Marker>
                  <Marker coordinates={b.coords}>
                    <circle r={11} fill={GOLD} opacity="0.22" />
                    <circle
                      r={6}
                      fill="none"
                      stroke={GOLD}
                      strokeWidth="1"
                      style={{ animation: "atlas-wave-pulse 2.4s ease-out 1.2s infinite" }}
                    />
                  </Marker>
                </g>
              );
            })}

            {/* Ripple pulses */}
            {showRipples &&
              visibleCountries
                .filter((c) => c.ripple === "fresh")
                .map((c, i) => (
                  <Marker key={`ripple-${c.code}`} coordinates={c.coords}>
                    <circle
                      r={4}
                      fill="none"
                      stroke={ACCENT}
                      strokeWidth="1.4"
                      style={{
                        transformOrigin: "0 0",
                        animation: `atlas-ripple 2.6s ease-out ${i * 0.4}s infinite`,
                      }}
                    />
                    <circle
                      r={4}
                      fill="none"
                      stroke={ACCENT}
                      strokeWidth="1.1"
                      style={{
                        transformOrigin: "0 0",
                        animation: `atlas-ripple 2.6s ease-out ${i * 0.4 + 1.3}s infinite`,
                      }}
                    />
                  </Marker>
                ))}

            {/* Country clusters */}
            {visibleCountries.map((c) => (
              <Marker key={c.code} coordinates={c.coords}>
                <ClusterGlyph country={c} />
              </Marker>
            ))}
          </ComposableMap>

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
            <Stat label="Ripples" value={visibleRipples.length} color={ACCENT} />
            <Stat label="Waves" value={visibleWaves.length} color={GOLD} />
          </div>

          {/* Bottom legend */}
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
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
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

function ClusterGlyph({ country }: { country: Country }) {
  const thumbs = country.thumbSeeds.slice(0, 3);
  const overflow = country.count - thumbs.length;
  const ringColor = country.inWave ? GOLD : country.ripple ? ACCENT : "#FFFFFF";
  const glow = country.inWave
    ? `0 0 8px ${GOLD}aa`
    : country.ripple
      ? `0 0 6px ${ACCENT}aa`
      : "0 1px 3px rgba(0,0,0,0.5)";

  // Render as SVG <g> since we're inside a Marker (already translated to country position).
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* stacked photo tiles */}
      {thumbs.map((seed, i) => {
        const offsetX = i * 3 - 3;
        const offsetY = i * 1.5 - 1.5;
        const rot = [-7, 4, -2][i] ?? 0;
        return (
          <g key={seed} transform={`translate(${offsetX - 10} ${offsetY - 10}) rotate(${rot} 10 10)`}>
            <rect
              width="20"
              height="20"
              rx="3"
              ry="3"
              fill={`url(#thumb-${seed})`}
              stroke={ringColor}
              strokeWidth="1.2"
              style={{ filter: `drop-shadow(${glow})` }}
            />
          </g>
        );
      })}
      {/* +N badge */}
      {overflow > 0 && (
        <g transform="translate(7 7)">
          <rect
            x="-2"
            y="-5"
            width={overflow >= 10 ? 18 : 14}
            height="10"
            rx="5"
            ry="5"
            fill={PRIMARY}
            stroke={NAVY}
            strokeWidth="0.8"
          />
          <text
            x={overflow >= 10 ? 7 : 5}
            y="2.5"
            fontSize="6.5"
            fontWeight="800"
            fill="#FFFFFF"
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
          >
            +{overflow}
          </text>
        </g>
      )}
      {/* flag emoji below */}
      <text
        y="20"
        fontSize="9"
        textAnchor="middle"
        style={{
          paintOrder: "stroke",
          stroke: NAVY_DEEP,
          strokeWidth: 2,
          strokeLinejoin: "round",
        }}
      >
        {country.flag}
      </text>
    </g>
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
        background: "rgba(6, 23, 58, 0.65)",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        borderRadius: 10,
        padding: "5px 9px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        backdropFilter: "blur(8px)",
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
      <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{value}</div>
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

// Picsum gives us reliable, seed-deterministic stock photos. Pinning a few
// hand-picked picsum IDs per seed produces visually pleasing, varied tiles
// without going through Unsplash's CORS hoops.
function photoFor(seed: string): string {
  return `https://picsum.photos/seed/sw-${seed}/80/80`;
}

const atlasCss = `
  @keyframes atlas-ripple {
    0%   { transform: scale(0.6); opacity: 0.95; }
    70%  { opacity: 0.25; }
    100% { transform: scale(7); opacity: 0; }
  }
  @keyframes atlas-wave-pulse {
    0%   { transform: scale(0.6); opacity: 0.9; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  @keyframes atlas-blink {
    0%, 100% { opacity: 0.4; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.15); }
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
      <path d="M15.5 8.5L13.5 13.5L8.5 15.5L10.5 10.5Z" fill="currentColor" opacity="0.4" />
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
