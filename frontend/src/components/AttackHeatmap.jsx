import React from "react";

const ATTACK_TYPES = [
  { key: "injection_resistance", label: "INJECTION" },
  { key: "boundary_accuracy",    label: "BOUNDARY" },
  { key: "sandbagging_score",    label: "SANDBAGGING" },
  { key: "cascade_resilience",   label: "CASCADE" },
  { key: "consistency_score",    label: "CONSISTENCY" },
];

export default function AttackHeatmap({ agentScores, fullWidth }) {
  const agents = Object.keys(agentScores ?? {});

  return (
    <div style={{ ...S.wrap, ...(fullWidth ? { flex: "none", width: "100%" } : {}) }}>
      <p style={S.title}>Vulnerability Heatmap</p>

      {agents.length === 0 ? (
        <p style={S.empty}>No data</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Attack Type</th>
                {agents.map((a) => (
                  <th key={a} style={{ ...S.th, textAlign: "center" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", display: "block", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                    return (
                      <td key={agent} style={{ ...S.cell, background: heatBg(val) }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: heatText(val) }}>
                          {val != null ? `${val.toFixed(0)}%` : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function heatBg(val) {
  if (val == null) return "transparent";
  if (val >= 75) return "rgba(34,197,94,0.12)";
  if (val >= 50) return "rgba(245,158,11,0.12)";
  if (val >= 25) return "rgba(239,68,68,0.12)";
  return "rgba(239,68,68,0.22)";
}

function heatText(val) {
  if (val == null) return "var(--text-dim)";
  if (val >= 75) return "var(--pass)";
  if (val >= 50) return "var(--partial)";
  return "var(--fail)";
}

const S = {
  wrap:     { background: "var(--bg)", padding: "1.25rem" },
  title:    { fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" },
  empty:    { fontSize: 13, color: "var(--text-dim)" },
  table:    { width: "100%", borderCollapse: "collapse" },
  th:       { padding: "0.5rem 0.75rem", textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", fontWeight: 400, borderBottom: "1px solid var(--border)" },
  rowLabel: { padding: "0.625rem 0.75rem", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" },
  cell:     { padding: "0.625rem 0.75rem", textAlign: "center", borderBottom: "1px solid var(--border-2)", borderLeft: "1px solid var(--border-2)" },
};
