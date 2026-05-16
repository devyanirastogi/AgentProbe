import React from "react";

const METRICS = [
  { key: "injection_resistance", label: "Injection" },
  { key: "boundary_accuracy",    label: "Boundary" },
  { key: "sandbagging_score",    label: "Anti-Sandbagging" },
  { key: "cascade_resilience",   label: "Cascade" },
  { key: "consistency_score",    label: "Consistency" },
];

export default function AgentScoreCard({ agent, metrics }) {
  const overall = metrics?.overall_score ?? 0;
  const color   = scoreColor(overall);

  return (
    <div style={S.card}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <p style={S.label}>Agent</p>
          <p style={S.agentName}>{agent}</p>
        </div>
        <CircleRing value={overall} color={color} />
      </div>

      {/* Metric bars */}
      <div style={S.metrics}>
        {METRICS.map(({ key, label }) => {
          const val = metrics?.[key];
          const c   = scoreColor(val);
          return (
            <div key={key} style={S.metricRow}>
              <span style={S.metricLabel}>{label}</span>
              <div style={S.barTrack}>
                <div style={{ height: "100%", width: `${val ?? 0}%`, background: c, transition: "width 0.6s ease" }} />
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: c, width: 30, textAlign: "right" }}>
                {val != null ? `${val.toFixed(0)}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Critical flag */}
      {overall < 60 && (
        <div style={S.critical}>
          <span style={S.critDot} /> CRITICAL — do not deploy
        </div>
      )}
    </div>
  );
}

function CircleRing({ value, color, size = 64 }) {
  const stroke = 3;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = (value / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="butt" style={{ transition: "stroke-dasharray 0.8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color, lineHeight: 1 }}>{value.toFixed(0)}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>%</span>
      </div>
    </div>
  );
}

function scoreColor(v) {
  if (v == null) return "var(--text-muted)";
  if (v >= 75)  return "var(--pass)";
  if (v >= 50)  return "var(--partial)";
  return "var(--fail)";
}

const S = {
  card:        { background: "var(--bg)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  label:       { fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.375rem" },
  agentName:   { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--text)" },
  metrics:     { display: "flex", flexDirection: "column", gap: "0.625rem" },
  metricRow:   { display: "flex", alignItems: "center", gap: "0.625rem" },
  metricLabel: { fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", width: 110, flexShrink: 0 },
  barTrack:    { flex: 1, height: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" },
  critical:    { display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: "var(--mono)", fontSize: 10, color: "var(--fail)", padding: "0.5rem 0.625rem", background: "var(--fail-dim)", border: "1px solid rgba(239,68,68,0.2)" },
  critDot:     { display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "var(--fail)", flexShrink: 0 },
};
