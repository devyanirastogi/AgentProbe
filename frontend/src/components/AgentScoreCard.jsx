import React from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";

const METRIC_LABELS = {
  injection_resistance: "Injection",
  boundary_accuracy: "Boundary",
  cascade_resilience: "Cascade",
  consistency_score: "Consistency",
  sandbagging_score: "Anti-Sandbagging",
};

export default function AgentScoreCard({ agent, metrics }) {
  const overall = metrics?.overall_score ?? 0;
  const radarData = Object.entries(METRIC_LABELS).map(([key, label]) => ({
    metric: label,
    value: metrics?.[key] ?? 0,
  }));

  const color = overall >= 80 ? "#22c55e" : overall >= 60 ? "#eab308" : "#ef4444";

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "1.25rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase" }}>Agent</div>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{agent.replace(/_/g, " ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Score</div>
          <div style={{ fontWeight: 800, fontSize: "1.5rem", color }}>{overall.toFixed(0)}%</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={65}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#64748b" }} />
          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.2} />
        </RadarChart>
      </ResponsiveContainer>

      {overall < 60 && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "0.5rem", fontSize: "0.75rem", color: "#ef4444", marginTop: "0.5rem" }}>
          CRITICAL — do not deploy
        </div>
      )}
    </div>
  );
}
