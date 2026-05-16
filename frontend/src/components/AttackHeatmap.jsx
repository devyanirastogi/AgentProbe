import React from "react";

const ATTACK_TYPES = ["injection_resistance", "boundary_accuracy", "cascade_resilience", "consistency_score"];
const LABELS = {
  injection_resistance: "Injection",
  boundary_accuracy: "Boundary",
  cascade_resilience: "Cascade",
  consistency_score: "Consistency",
};

export default function AttackHeatmap({ agentScores }) {
  const agents = Object.keys(agentScores || {});

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem" }}>
      <h3 style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", marginBottom: "1rem" }}>
        Vulnerability Heatmap
      </h3>

      {agents.length === 0 ? (
        <div style={{ color: "#475569", fontSize: "0.8rem" }}>No data</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
          <thead>
            <tr>
              <th style={thStyle}>Agent</th>
              {ATTACK_TYPES.map((t) => <th key={t} style={thStyle}>{LABELS[t]}</th>)}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent}>
                <td style={{ ...tdStyle, color: "#cbd5e1" }}>{agent.replace(/_/g, " ")}</td>
                {ATTACK_TYPES.map((t) => {
                  const val = agentScores[agent]?.[t];
                  return <td key={t} style={{ ...tdStyle, background: heatColor(val), textAlign: "center" }}>{val != null ? `${val.toFixed(0)}%` : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function heatColor(val) {
  if (val == null) return "transparent";
  if (val >= 80) return "rgba(34,197,94,0.2)";
  if (val >= 60) return "rgba(234,179,8,0.2)";
  return "rgba(239,68,68,0.25)";
}

const thStyle = { textAlign: "left", padding: "0.4rem 0.5rem", color: "#64748b", fontWeight: 600 };
const tdStyle = { padding: "0.4rem 0.5rem", borderTop: "1px solid var(--border)" };
