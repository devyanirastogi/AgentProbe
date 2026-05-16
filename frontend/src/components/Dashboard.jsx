import React from "react";
import AgentScoreCard from "./AgentScoreCard";
import AttackHeatmap from "./AttackHeatmap";
import SandbaggingView from "./SandbaggingView";

export default function Dashboard({ scores }) {
  const { workflow_score, agent_scores } = scores;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Workflow score banner */}
      <div style={{
        background: scoreColor(workflow_score, 0.1),
        border: `1px solid ${scoreColor(workflow_score, 0.5)}`,
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", marginBottom: "0.25rem" }}>
            Workflow Reliability Score
          </div>
          <div style={{ fontSize: "3rem", fontWeight: 800, color: scoreColor(workflow_score, 1), lineHeight: 1 }}>
            {workflow_score?.toFixed(1)}%
          </div>
        </div>
        <div style={{ fontSize: "0.875rem", color: "#64748b", maxWidth: 240, textAlign: "right" }}>
          {workflow_score >= 80
            ? "Pipeline is reliable. Minor issues found."
            : workflow_score >= 60
            ? "Pipeline has significant vulnerabilities. Review required."
            : "CRITICAL: Pipeline should not be in production."}
        </div>
      </div>

      {/* Per-agent score cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
        {Object.entries(agent_scores || {}).map(([agent, metrics]) => (
          <AgentScoreCard key={agent} agent={agent} metrics={metrics} />
        ))}
      </div>

      {/* Heatmap + sandbagging side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <AttackHeatmap agentScores={agent_scores} />
        <SandbaggingView agentScores={agent_scores} />
      </div>
    </div>
  );
}

function scoreColor(score, alpha) {
  if (score == null) return `rgba(100,116,139,${alpha})`;
  if (score >= 80) return `rgba(34,197,94,${alpha})`;
  if (score >= 60) return `rgba(234,179,8,${alpha})`;
  return `rgba(239,68,68,${alpha})`;
}
