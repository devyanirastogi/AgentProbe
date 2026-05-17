import React, { useState, useRef, useEffect } from "react";
import { Header } from "./IngestPage";

const ATTACK_TYPES = [
  { type: "INJECTION",    weight: "25%" },
  { type: "SANDBAGGING",  weight: "25%" },
  { type: "BOUNDARY",     weight: "20%" },
  { type: "CASCADE",      weight: "15%" },
  { type: "CONSISTENCY",  weight: "15%" },
];

const VC = { PASS: "var(--pass)", PARTIAL: "var(--partial)", FAIL: "var(--fail)", ERROR: "var(--text-muted)" };
const VB = { PASS: "var(--pass-dim)", PARTIAL: "var(--partial-dim)", FAIL: "var(--fail-dim)", ERROR: "transparent" };
const VL = { PASS: "var(--pass)", PARTIAL: "var(--partial)", FAIL: "var(--fail)", ERROR: "var(--border)" };

export default function AttackPage({ csvContent, agentNames, endpointUrl, authHeader, workflowName, onComplete, onBack }) {
  const [attacksPerType, setAttacksPerType] = useState(3);
  const [status, setStatus]   = useState("idle");
  const [events, setEvents]   = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg]       = useState(null);
  const [completeEvt, setCompleteEvt] = useState(null);
  const feedRef = useRef(null);
  const wsRef   = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  function launch() {
    setEvents([]); setProgress({ current: 0, total: 0 }); setErrorMsg(null); setStatus("running");
    const ws = new WebSocket("ws://localhost:8000/ws/probe");
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({
      attacks_per_type: attacksPerType,
      csv_content: csvContent,
      pipeline_url: endpointUrl,
      auth_header: authHeader,
      workflow_name: workflowName,
    }));
    ws.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      setEvents((prev) => [...prev, evt]);
      if (evt.event === "attacks_generated") setProgress({ current: 0, total: evt.count });
      if (evt.event === "attacking") setProgress({ current: evt.index + 1, total: evt.total });
      if (evt.event === "complete") { setStatus("complete"); setCompleteEvt(evt); ws.close(); onComplete(evt); }
      if (evt.event === "error")    { setStatus("error"); setErrorMsg(evt.message); ws.close(); }
    };
    ws.onerror = () => { setStatus("error"); setErrorMsg("Cannot connect to backend at localhost:8000"); };
  }

  function stop() { wsRef.current?.close(); setStatus("idle"); }

  const results = events.filter((e) => e.event === "result");
  const counts  = results.reduce((a, e) => { const v = e.result?.verdict ?? "?"; a[v] = (a[v] ?? 0) + 1; return a; }, {});
  const pct     = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const stage   = [...events].reverse().find((e) => e.event === "stage")?.stage ?? null;

  return (
    <div className="fade-in" style={S.page}>
      <Header step={1} />

      <div style={S.layout}>
        {/* ── Sidebar ────────────────────────────────────────────── */}
        <aside style={S.sidebar}>
          {/* Workflow identity */}
          <div style={S.sideSection}>
            <p style={S.sideLabel}>Workflow</p>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", marginTop: "0.5rem" }}>
              {workflowName || "unknown"}
            </div>
          </div>

          <div style={S.divider} />

          {/* Target endpoint */}
          <div style={S.sideSection}>
            <p style={S.sideLabel}>Target Endpoint</p>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", wordBreak: "break-all", marginTop: "0.5rem", lineHeight: 1.5 }}>
              {endpointUrl || "localhost:8000"}
            </div>
            {authHeader && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", marginTop: "0.375rem" }}>
                Auth: {authHeader.slice(0, 16)}…
              </div>
            )}
          </div>

          <div style={S.divider} />

          {/* Pipeline */}
          <div style={S.sideSection}>
            <p style={S.sideLabel}>Agents</p>
            {agentNames.map((a, i) => (
              <div key={a} style={S.agentRow}>
                <span style={S.agentIdx}>{i + 1}</span>
                <span style={S.agentMono}>{a}</span>
              </div>
            ))}
          </div>

          <div style={S.divider} />

          {/* Config */}
          <div style={S.sideSection}>
            <p style={S.sideLabel}>Configuration</p>
            <div style={{ marginBottom: "0.875rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Attacks per type</span>
                <span style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>
                  {attacksPerType}
                </span>
              </div>
              <input type="range" min={1} max={10} value={attacksPerType}
                onChange={(e) => setAttacksPerType(+e.target.value)}
                disabled={status === "running"}
                style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <p style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--mono)", marginTop: "0.375rem" }}>
                {attacksPerType * 5} attacks total
              </p>
            </div>
          </div>

          <div style={S.divider} />

          {/* Attack types */}
          <div style={S.sideSection}>
            <p style={S.sideLabel}>Attack Types</p>
            {ATTACK_TYPES.map(({ type, weight }) => (
              <div key={type} style={S.attackRow}>
                <span style={S.attackMono}>{type}</span>
                <span style={S.weightBadge}>{weight}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Launch / Stop */}
          <div style={{ padding: "1rem" }}>
            {status === "running" ? (
              <button onClick={stop} style={S.stopBtn}>
                <span className="pulse-dot" style={S.dot} />
                Running...
              </button>
            ) : (
              <button onClick={launch} style={S.launchBtn}>
                {status === "complete" ? "Run Again" : "Launch Probe"}
              </button>
            )}
            <button onClick={onBack} style={S.backBtn}>← Back to Ingest</button>
            {errorMsg && <p style={S.errorMsg}>{errorMsg}</p>}
          </div>
        </aside>

        {/* ── Main ───────────────────────────────────────────────── */}
        <main style={S.main}>
          {/* Progress bar */}
          <div style={S.progressWrap}>
            <div style={{
              ...S.progressTrack,
              ...(status === "running" ? { animation: "progressPulse 2s ease infinite" } : {}),
            }}>
              <div style={{
                height: "100%",
                width: `${status === "complete" ? 100 : pct}%`,
                background: status === "complete" ? "var(--pass)" : "var(--accent)",
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
              <span style={S.progLabel}>
                {stage ? stage.replace(/_/g, " ") : status === "idle" ? "Ready" : status === "complete" ? "Complete" : "Waiting"}
              </span>
              {progress.total > 0 && (
                <span style={S.progLabel}>{progress.current} / {progress.total} attacks</span>
              )}
            </div>
          </div>

          {/* Verdict counters */}
          <div style={S.counters}>
            {[["PASS", "var(--pass)"], ["PARTIAL", "var(--partial)"], ["FAIL", "var(--fail)"]].map(([v, color]) => (
              <div key={v} style={S.counter}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>
                  {counts[v] ?? 0}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>

          {/* Live feed */}
          <div style={S.feedWrap}>
            <div style={S.feedHeader}>
              <span style={S.feedTitle}>Live Attack Feed</span>
              {status === "running" && <span className="pulse-dot" style={S.dot} />}
            </div>
            <div ref={feedRef} style={S.feedScroll}>
              {events.length === 0 ? (
                <div style={S.feedEmpty}>
                  {status === "idle"
                    ? "Configure your probe and click Launch Probe to begin."
                    : "Connecting to backend..."}
                </div>
              ) : (
                events.map((evt, i) => <FeedRow key={i} evt={evt} />)
              )}
            </div>
          </div>

          {/* Complete CTA */}
          {status === "complete" && (
            <button
              className="fade-in"
              onClick={() => onComplete(completeEvt)}
              style={S.completeCta}
            >
              View Results Dashboard →
            </button>
          )}
        </main>
      </div>
    </div>
  );
}

function FeedRow({ evt }) {
  if (evt.event === "stage") {
    return (
      <div className="slide-in" style={S.stageRow}>
        <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
          ▸ {evt.stage.replace(/_/g, " ")}
        </span>
      </div>
    );
  }

  if (evt.event === "result") {
    const verdict = evt.result?.verdict ?? "?";
    const agent   = evt.result?.agent_name ?? "";
    const type    = evt.result?.scenario?.attack_type ?? "";
    const reason  = evt.result?.judge_reasoning ?? "";
    const calls   = evt.result?.endpoint_calls ?? [];
    return (
      <div className="slide-in" style={{
        ...S.resultRow,
        borderLeft: `3px solid ${VL[verdict] ?? "transparent"}`,
        background: VB[verdict] ?? "transparent",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "0.35rem",
      }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 11, color: VC[verdict], width: 52, flexShrink: 0 }}>
            {verdict}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", width: 100, flexShrink: 0 }}>
            {type}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{reason}</span>
        </div>
        {calls.length > 0 && (
          <div style={{ paddingLeft: 52, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            {calls.map((c, i) => (
              <EndpointCallRow key={i} call={c} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (evt.event === "traces_ingested") {
    return <div className="slide-in" style={S.infoRow}>Ingested {evt.count} trace spans</div>;
  }
  if (evt.event === "attacks_generated") {
    return <div className="slide-in" style={S.infoRow}>Generated {evt.count} adversarial scenarios</div>;
  }
  return null;
}

function EndpointCallRow({ call }) {
  const ok = call.status != null && call.status < 400;
  const statusColor = call.error
    ? "var(--fail)"
    : ok
      ? "var(--pass)"
      : call.status != null
        ? "var(--partial)"
        : "var(--text-dim)";
  // Short path: last segment of url
  let shortUrl = call.url || "";
  try {
    const u = new URL(call.url);
    shortUrl = `${u.host}${u.pathname}`;
  } catch { /* keep raw */ }
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
      <span style={{ color: statusColor, width: 60, flexShrink: 0 }}>
        {call.error ? "ERR" : call.status != null ? `HTTP ${call.status}` : "no resp"}
      </span>
      <span style={{ color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        POST → {shortUrl}
      </span>
      {call.latency_ms != null && (
        <span style={{ color: "var(--text-dim)" }}>{call.latency_ms}ms</span>
      )}
    </div>
  );
}

const S = {
  page:        { display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" },
  layout:      { flex: 1, display: "grid", gridTemplateColumns: "260px 1fr", overflow: "hidden" },
  sidebar:     { display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", overflow: "hidden" },
  sideSection: { padding: "1.25rem 1rem" },
  sideLabel:   { fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: "0.75rem" },
  agentRow:    { display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.3rem 0" },
  agentIdx:    { fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", width: 16, flexShrink: 0 },
  agentMono:   { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" },
  divider:     { height: 1, background: "var(--border)", flexShrink: 0 },
  attackRow:   { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.3rem 0" },
  attackMono:  { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" },
  weightBadge: { fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", padding: "0.1rem 0.375rem", border: "1px solid var(--border)" },
  launchBtn:   { width: "100%", padding: "0.75rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 0, fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: "0.5rem" },
  stopBtn:     { width: "100%", padding: "0.75rem", background: "transparent", color: "var(--fail)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 0, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.5rem" },
  backBtn:     { width: "100%", padding: "0.5rem", background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 12, cursor: "pointer" },
  errorMsg:    { fontFamily: "var(--mono)", fontSize: 11, color: "var(--fail)", marginTop: "0.5rem", lineHeight: 1.5 },
  dot:         { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--fail)", flexShrink: 0 },
  main:        { display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.5rem", overflow: "hidden" },
  progressWrap: { flexShrink: 0 },
  progressTrack: { height: 3, background: "var(--surface-2)", width: "100%", overflow: "hidden" },
  progLabel:   { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" },
  counters:    { display: "flex", gap: "2rem", flexShrink: 0 },
  counter:     { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  feedWrap:    { flex: 1, display: "flex", flexDirection: "column", background: "var(--surface)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)", overflow: "hidden", minHeight: 0 },
  feedHeader:  { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1rem", borderBottom: "1px solid var(--border)", flexShrink: 0 },
  feedTitle:   { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" },
  feedScroll:  { flex: 1, overflowY: "auto", padding: "0.25rem 0" },
  feedEmpty:   { padding: "3rem 1.5rem", color: "var(--text-dim)", fontSize: 13, textAlign: "center" },
  stageRow:    { padding: "0.375rem 1rem", fontSize: 12, fontFamily: "var(--mono)", borderBottom: "1px solid var(--border-2)" },
  infoRow:     { padding: "0.3rem 1rem", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" },
  resultRow:   { display: "flex", gap: "1rem", padding: "0.5rem 1rem", borderBottom: "1px solid var(--border-2)", alignItems: "flex-start" },
  completeCta: { flexShrink: 0, padding: "0.875rem", background: "var(--pass)", color: "#fff", border: "none", borderRadius: 0, fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" },
};
