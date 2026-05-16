import React, { useState } from "react";

export default function ProbeControls({ onStart, probeState }) {
  const [config, setConfig] = useState({ trace_limit: 50, attacks_per_type: 3 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Probe Configuration
      </h2>

      <label style={labelStyle}>
        Trace Limit
        <input
          type="number"
          value={config.trace_limit}
          onChange={(e) => setConfig((c) => ({ ...c, trace_limit: +e.target.value }))}
          style={inputStyle}
          min={10} max={500}
        />
      </label>

      <label style={labelStyle}>
        Attacks per Type
        <input
          type="number"
          value={config.attacks_per_type}
          onChange={(e) => setConfig((c) => ({ ...c, attacks_per_type: +e.target.value }))}
          style={inputStyle}
          min={1} max={10}
        />
      </label>

      <button
        onClick={() => onStart(config)}
        disabled={probeState === "running"}
        style={{
          padding: "0.75rem",
          background: probeState === "running" ? "#1e293b" : "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: probeState === "running" ? "not-allowed" : "pointer",
          fontSize: "0.875rem",
        }}
      >
        {probeState === "running" ? "Running..." : "Launch Probe"}
      </button>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
        <h3 style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.75rem", textTransform: "uppercase" }}>
          Attack Types
        </h3>
        {[
          ["INJECTION", "Prompt injection via data fields"],
          ["BOUNDARY", "Decision boundary probing"],
          ["SANDBAGGING", "Framing-based behavioral delta"],
          ["CASCADE", "Upstream corruption propagation"],
          ["CONSISTENCY", "Semantic equivalence variance"],
        ].map(([type, desc]) => (
          <div key={type} style={{ marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#a855f7" }}>{type}</span>
            <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  fontSize: "0.8rem",
  color: "#cbd5e1",
};

const inputStyle = {
  background: "#12121a",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.5rem",
  color: "#e2e8f0",
  fontSize: "0.875rem",
};
