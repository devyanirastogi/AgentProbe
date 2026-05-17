import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const ATTACK_TYPES = [
  { key: "injection_resistance", label: "INJECTION" },
  { key: "boundary_accuracy",    label: "BOUNDARY" },
  { key: "sandbagging_score",    label: "SANDBAGGING" },
  { key: "cascade_resilience",   label: "CASCADE" },
  { key: "consistency_score",    label: "CONSISTENCY" },
];

function heatBg(val) {
  if (val == null) return "rgba(255,255,255,0.02)";
  if (val >= 75) return "rgba(34,197,94,0.12)";
  if (val >= 50) return "rgba(245,158,11,0.10)";
  if (val >= 25) return "rgba(239,68,68,0.12)";
  return "rgba(239,68,68,0.22)";
}

function heatText(val) {
  if (val == null) return "var(--text-dim)";
  if (val >= 75) return "var(--pass)";
  if (val >= 50) return "var(--partial)";
  return "var(--fail)";
}

export default function AttackHeatmap({ agentScores, fullWidth, animate = false }) {
  const reduced = useReducedMotion();
  const agents  = Object.keys(agentScores ?? {});

  if (agents.length === 0) {
    return (
      <div style={S.wrap}>
        <p style={S.title}>Vulnerability Heatmap</p>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: "0.75rem" }}>No data</p>
      </div>
    );
  }

  let cellIndex = 0;

  return (
    <div style={{ ...S.wrap, ...(fullWidth ? { width: "100%" } : {}) }}>
      <p style={S.title}>Vulnerability Heatmap</p>
      <p style={S.sub}>Pass rate per agent × attack type. Red = failing, Green = reliable.</p>

      <div style={{ overflowX: "auto", marginTop: "1rem" }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Attack Type</th>
              {agents.map((a) => (
                <th key={a} style={{ ...S.th, textAlign: "center", minWidth: 110 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)" }}>
                    {a}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ATTACK_TYPES.map(({ key, label }) => (
              <tr key={key}>
                <td style={S.rowLabel}>{label}</td>
                {agents.map((agent) => {
                  const val = agentScores[agent]?.[key];
                  const idx = cellIndex++;
                  return (
                    <motion.td
                      key={agent}
                      style={{ ...S.cell, background: heatBg(val) }}
                      initial={animate && !reduced ? { opacity: 0, scale: 0.5 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, delay: idx * 0.02, ease: "easeOut" }}
                    >
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: heatText(val) }}>
                        {val != null ? `${val.toFixed(0)}%` : "—"}
                      </span>
                    </motion.td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
        {[["0%", "var(--fail)"], ["50%", "var(--partial)"], ["100%", "var(--pass)"]].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <div style={{ width: 10, height: 10, background: c, opacity: 0.6 }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  wrap:     { background: "var(--bg)", padding: "1.5rem", boxShadow: "0 0 0 1px rgba(255,255,255,0.05)" },
  title:    { fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" },
  sub:      { fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", marginTop: "0.25rem" },
  table:    { width: "100%", borderCollapse: "collapse" },
  th:       { padding: "0.625rem 0.875rem", textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", fontWeight: 400, borderBottom: "1px solid var(--border)" },
  rowLabel: { padding: "0.875rem", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap", fontWeight: 600 },
  cell:     { padding: "0.875rem", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.04)", borderLeft: "1px solid rgba(255,255,255,0.04)" },
};
