import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const METRICS = [
  { key: "injection_resistance", label: "Injection" },
  { key: "boundary_accuracy",    label: "Boundary" },
  { key: "sandbagging_score",    label: "Anti-Sandbagging" },
  { key: "cascade_resilience",   label: "Cascade" },
  { key: "consistency_score",    label: "Consistency" },
];

function scoreColor(v) {
  if (v == null) return "var(--text-muted)";
  if (v >= 75)  return "var(--pass)";
  if (v >= 50)  return "var(--partial)";
  return "var(--fail)";
}

function AnimatedRing({ value, color, size = 80 }) {
  const reduced = useReducedMotion();
  const stroke  = 5;
  const r       = (size - stroke) / 2;
  const circ    = 2 * Math.PI * r;
  const offset  = circ - (value / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: reduced ? offset : circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color, lineHeight: 1 }}>
          {value.toFixed(0)}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", marginTop: 1 }}>%</span>
      </div>
    </div>
  );
}

export default function AgentScoreCard({ agent, metrics, index = 0, animate = true }) {
  const reduced = useReducedMotion();
  const overall = metrics?.overall_score ?? 0;
  const color   = scoreColor(overall);

  const borderColor = overall >= 75 ? "var(--pass)" : overall >= 50 ? "var(--partial)" : "var(--fail)";

  return (
    <motion.div
      style={{
        background: "var(--bg)",
        borderLeft: `3px solid ${borderColor}`,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.05)",
      }}
      initial={animate && !reduced ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08, ease: "easeOut" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.4rem" }}>
            Agent
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{agent}</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, color, marginTop: "0.25rem" }}>
            {overall >= 75 ? "Reliable" : overall >= 50 ? "Review required" : "Critical — do not deploy"}
          </p>
        </div>
        <AnimatedRing value={overall} color={color} />
      </div>

      {/* Metric bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {METRICS.map(({ key, label }, i) => {
          const val = metrics?.[key];
          const c   = scoreColor(val);
          return (
            <div key={key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: c, fontWeight: 600 }}>
                  {val != null ? `${val.toFixed(0)}%` : "—"}
                </span>
              </div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <motion.div
                  style={{ height: "100%", background: c }}
                  initial={{ width: 0 }}
                  animate={{ width: `${val ?? 0}%` }}
                  transition={{ duration: 0.8, delay: index * 0.08 + i * 0.05, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Critical flag */}
      {overall < 50 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", background: "var(--fail-dim)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--mono)", fontSize: 10, color: "var(--fail)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--fail)", display: "inline-block", flexShrink: 0 }} />
          CRITICAL — do not deploy
        </div>
      )}
    </motion.div>
  );
}
