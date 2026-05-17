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
  const feedRef          = useRef(null);
  const wsRef            = useRef(null);
  const attackTypesRef   = useRef({});   // index → attack_type
  const allResultsRef    = useRef([]);   // enriched results for dashboard

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  function launch() {
    setEvents([]); setProgress({ current: 0, total: 0 }); setErrorMsg(null); setStatus("running");
    attackTypesRef.current = {};
    allResultsRef.current  = [];
    const ws = new WebSocket("ws://localhost:8000/ws/probe");
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({
      attacks_per_type: attacksPerType,
      max_scenarios: attacksPerType === 1 ? 1 : undefined,
      csv_content: csvContent,
      pipeline_url: endpointUrl,
      auth_header: authHeader,
      workflow_name: workflowName,
    }));
    ws.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      setEvents((prev) => [...prev, evt]);
      if (evt.event === "attacks_generated") setProgress({ current: 0, total: evt.count });
      if (evt.event === "attacking") {
        attackTypesRef.current[evt.index] = evt.scenario?.attack_type || "UNKNOWN";
        setProgress({ current: evt.index + 1, total: evt.total });
      }
      if (evt.event === "result") {
        allResultsRef.current.push({
          ...evt.result,
          attack_type: attackTypesRef.current[evt.index] || "UNKNOWN",
        });
      }
      if (evt.event === "complete") {
        const payload = { ...evt, attack_results: allResultsRef.current };
        setStatus("complete"); setCompleteEvt(payload); ws.close(); onComplete(payload);
      }
      if (evt.event === "error") { setStatus("error"); setErrorMsg(evt.message); ws.close(); }
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

          {/* Launch / Stop */}
          <div style={{ padding: "1rem", borderTop: "1px solid var(--border)" }}>
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

  if (evt.event === "attacking") {
    return <AttackingRow scenario={evt.scenario} index={evt.index} total={evt.total} />;
  }

  if (evt.event === "traces_ingested") {
    return <div className="slide-in" style={S.infoRow}>Ingested {evt.count} trace spans</div>;
  }
  if (evt.event === "attacks_generated") {
    return <div className="slide-in" style={S.infoRow}>Generated {evt.count} adversarial scenarios</div>;
  }
  return null;
}

const ATTACK_COLORS = {
  INJECTION:   "#a855f7",
  SANDBAGGING: "#06b6d4",
  BOUNDARY:    "#f59e0b",
  CASCADE:     "#ef4444",
  CONSISTENCY: "#22c55e",
};

function AttackingRow({ scenario, index, total }) {
  const [expanded, setExpanded] = React.useState(false);
  const attackType  = scenario?.attack_type ?? "UNKNOWN";
  const target      = scenario?.target_node_id ?? scenario?.target_agent ?? "?";
  const description = scenario?.description ?? "";
  const adversarial = scenario?.adversarial_input;
  const corruption  = scenario?.corruption_spec;
  const injectionP  = scenario?.injection_path;
  const color = ATTACK_COLORS[attackType] || "var(--accent)";

  // Build a tiny call-shape hint so the user knows what the runner will do.
  let shapeHint = "1 POST";
  if (attackType === "SANDBAGGING") shapeHint = "2 POSTs (formal + casual)";
  else if (attackType === "CASCADE") shapeHint = "2 POSTs (clean + corrupted)";
  else if (Array.isArray(adversarial)) shapeHint = `${adversarial.length} POSTs (variants)`;

  const previewJSON = (() => {
    try { return JSON.stringify(adversarial, null, 2); }
    catch { return String(adversarial); }
  })();
  const truncated = previewJSON.length > 220 && !expanded ? previewJSON.slice(0, 220) + " …" : previewJSON;

  return (
    <div className="slide-in" style={{
      ...S.resultRow,
      borderLeft: `3px solid ${color}`,
      flexDirection: "column",
      alignItems: "stretch",
      gap: "0.4rem",
      padding: "0.6rem 1rem",
    }}>
      {/* Header line */}
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 10, color, padding: "0.1rem 0.4rem", border: `1px solid ${color}`, letterSpacing: "0.05em" }}>
          {attackType}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
          [{index + 1}/{total}]
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>
          → {target}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
          {shapeHint}
        </span>
      </div>

      {/* Description */}
      {description && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, paddingLeft: 4 }}>
          {description}
        </div>
      )}

      {/* Field path / corruption hint for CASCADE & INJECTION */}
      {(injectionP || corruption) && (
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", paddingLeft: 4 }}>
          {injectionP && <>injection_path: <span style={{ color }}>{injectionP}</span></>}
          {corruption && (
            <div>corruption_spec: <span style={{ color: "var(--fail)" }}>{JSON.stringify(corruption)}</span></div>
          )}
        </div>
      )}

      {/* Payload preview */}
      <div style={{ paddingLeft: 4 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}
        >
          {expanded ? "▾ payload" : "▸ payload"}
        </button>
        <pre style={{
          margin: "0.25rem 0 0", padding: "0.5rem 0.625rem",
          background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
          fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text)",
          lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: expanded ? "none" : 120, overflow: "auto",
        }}>
          {truncated}
        </pre>
      </div>
    </div>
  );
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
  sidebar:     { display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", overflowY: "auto" },
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
