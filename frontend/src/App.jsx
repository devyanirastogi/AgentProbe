import React, { useState } from "react";
import Dashboard from "./components/Dashboard";
import ProbeControls from "./components/ProbeControls";
import LiveFeed from "./components/LiveFeed";

export default function App() {
  const [probeState, setProbeState] = useState("idle"); // idle | running | complete
  const [events, setEvents] = useState([]);
  const [finalScores, setFinalScores] = useState(null);

  function startProbe(config) {
    setEvents([]);
    setFinalScores(null);
    setProbeState("running");

    const ws = new WebSocket(`ws://localhost:8000/ws/probe`);
    ws.onopen = () => ws.send(JSON.stringify(config));
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents((prev) => [...prev, event]);
      if (event.event === "complete") {
        setFinalScores(event);
        setProbeState("complete");
        ws.close();
      }
      if (event.event === "error") {
        setProbeState("idle");
        ws.close();
      }
    };
    ws.onerror = () => setProbeState("idle");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={{ padding: "1rem 2rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>
          AgentProbe
        </span>
        <span style={{ fontSize: "0.75rem", color: "#64748b", padding: "0.2rem 0.5rem", border: "1px solid var(--border)", borderRadius: 4 }}>
          Adversarial Red-Teaming Engine
        </span>
      </header>

      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", gap: 0 }}>
        <aside style={{ borderRight: "1px solid var(--border)", padding: "1.5rem" }}>
          <ProbeControls onStart={startProbe} probeState={probeState} />
        </aside>

        <section style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {finalScores && <Dashboard scores={finalScores} />}
          <LiveFeed events={events} probeState={probeState} />
        </section>
      </main>
    </div>
  );
}
