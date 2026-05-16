import React, { useEffect, useRef } from "react";

const VERDICT_COLOR = { PASS: "#22c55e", PARTIAL: "#eab308", FAIL: "#ef4444", ERROR: "#6b7280" };

export default function LiveFeed({ events, probeState }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events]);

  if (events.length === 0 && probeState === "idle") {
    return (
      <div style={emptyStyle}>
        Launch a probe to start red-teaming your agent pipeline.
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>Live Feed</span>
        {probeState === "running" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite" }} />}
      </div>
      <div style={{ maxHeight: 400, overflowY: "auto", padding: "0.5rem" }}>
        {events.map((evt, i) => (
          <EventRow key={i} event={evt} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EventRow({ event }) {
  if (event.event === "result") {
    const verdict = event.result?.verdict || "UNKNOWN";
    return (
      <div style={{ display: "flex", gap: "0.75rem", padding: "0.4rem 0.5rem", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
        <span style={{ color: VERDICT_COLOR[verdict] || "#64748b", fontWeight: 700, minWidth: 56 }}>{verdict}</span>
        <span style={{ color: "#94a3b8" }}>{event.result?.agent_name}</span>
        <span style={{ color: "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {event.result?.judge_reasoning}
        </span>
      </div>
    );
  }

  if (event.event === "stage") {
    return (
      <div style={{ padding: "0.5rem", color: "#3b82f6", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
        ▶ {event.stage.replace(/_/g, " ")}
      </div>
    );
  }

  return (
    <div style={{ padding: "0.3rem 0.5rem", color: "#475569", fontSize: "0.75rem" }}>
      {JSON.stringify(event)}
    </div>
  );
}

const emptyStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "3rem",
  textAlign: "center",
  color: "#475569",
  fontSize: "0.875rem",
};
