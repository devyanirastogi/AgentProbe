import React, { useState, useRef } from "react";

export default function IngestPage({ onIngested }) {
  const [dragOver, setDragOver]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [preview, setPreview]         = useState(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authHeader, setAuthHeader]   = useState("");
  const [urlError, setUrlError]       = useState(null);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState(null);
  const fileRef = useRef();

  async function testEndpoint() {
    if (!endpointUrl.trim()) { setUrlError("Endpoint URL is required."); return; }
    if (!endpointUrl.trim().startsWith("http")) { setUrlError("URL must start with http:// or https://"); return; }
    setUrlError(null);
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("http://localhost:8000/api/probe/test-endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: endpointUrl.trim(), auth_header: authHeader.trim() || null }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: "Backend unreachable: " + e.message, url: endpointUrl.trim(), status: null, latency_ms: 0 });
    } finally {
      setTesting(false);
    }
  }

  async function handleFile(file) {
    if (!file || !file.name.endsWith(".csv")) {
      setError("Expected a .csv file exported from LangFuse.");
      return;
    }
    setError(null);
    setLoading(true);
    const csvContent = await file.text();
    const parsed = parseCSV(csvContent);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("http://localhost:8000/api/ingest/csv", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const agentNames = [...new Set(data.traces.map((t) => t.agent_name))].filter(Boolean);
      setPreview({ agentNames, traceCount: data.ingested, csvContent, workflowName: parsed.workflowName, modelName: parsed.modelName });
    } catch {
      setPreview({ agentNames: parsed.agentNames, traceCount: parsed.traceCount, csvContent, workflowName: parsed.workflowName, modelName: parsed.modelName });
    } finally {
      setLoading(false);
    }
  }

  function parseCSV(csv) {
    const lines = csv.split("\n");
    if (lines.length < 2) return { agentNames: [], traceCount: 0, workflowName: null, modelName: null };

    const header       = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
    const nameIdx      = header.indexOf("name");
    const typeIdx      = header.indexOf("type");
    const traceNameIdx = header.indexOf("traceName");
    const outputIdx    = header.indexOf("output");
    const startTimeIdx = header.indexOf("startTime");

    const agentFirstSeen = {};
    let workflowName = null;
    let modelName    = null;
    let spanCount    = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols      = splitCsvLine(lines[i]);
      const type      = cols[typeIdx]?.replace(/"/g, "").trim().toUpperCase();
      const name      = cols[nameIdx]?.replace(/"/g, "").trim();
      const tName     = traceNameIdx >= 0 ? cols[traceNameIdx]?.replace(/"/g, "").trim() : "";
      const startTime = startTimeIdx >= 0 ? cols[startTimeIdx]?.replace(/"/g, "").trim() : null;

      if (!workflowName && tName) workflowName = tName;
      if (!name || name === tName) continue;
      if (type !== "SPAN" && type !== "GENERATION") continue;

      if (startTime && (!agentFirstSeen[name] || startTime < agentFirstSeen[name])) {
        agentFirstSeen[name] = startTime;
      } else if (!agentFirstSeen[name]) {
        agentFirstSeen[name] = "";
      }
      spanCount++;

      if (!modelName && outputIdx >= 0) {
        try {
          const raw = cols[outputIdx] ?? "";
          const unquoted = raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw;
          const out = JSON.parse(unquoted);
          if (out?._meta?.model) modelName = out._meta.model;
        } catch { /* ignore */ }
      }
    }

    const agentNames = Object.keys(agentFirstSeen).sort((a, b) => {
      const ta = agentFirstSeen[a] || "", tb = agentFirstSeen[b] || "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    return { agentNames, traceCount: spanCount, workflowName, modelName };
  }

  function splitCsvLine(line) {
    const result = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const orderedAgents = preview?.agentNames ?? [];

  return (
    <div className="fade-in" style={S.page}>
      <Header step={0} />

      <div style={S.body}>
        {!preview ? (
          /* ── Upload state ─────────────────────────────────────── */
          <div style={S.col}>
            <p style={S.eyebrow}>Step 1 of 3</p>
            <h1 style={S.h1}>Import your agent traces</h1>
            <p style={S.sub}>
              Export a CSV from LangFuse → Traces → Export CSV.
              AgentProbe reads your real production traces and generates
              targeted adversarial attacks from them.
            </p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current.click()}
              style={{
                ...S.dropzone,
                borderColor:   dragOver ? "#7c3aed" : "rgba(124,58,237,0.25)",
                background:    dragOver ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.03)",
                boxShadow:     dragOver ? "0 0 40px rgba(124,58,237,0.15), inset 0 0 40px rgba(124,58,237,0.03)" : "none",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])} />

              {loading ? (
                <div style={{ textAlign: "center", padding: "3rem 0" }}>
                  <Spinner />
                  <p style={{ color: "var(--text-muted)", marginTop: "1.25rem", fontFamily: "var(--mono)", fontSize: 12 }}>Parsing traces...</p>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "3.5rem 2rem" }}>
                  <UploadIcon active={dragOver} />
                  <p style={S.dropTitle}>{dragOver ? "Release to upload" : "Drop your LangFuse CSV here"}</p>
                  <p style={S.dropSub}>or click to browse &nbsp;·&nbsp; LangFuse → Traces → Export CSV</p>
                </div>
              )}
            </div>

            {error && <p style={S.errMsg}>{error}</p>}

            <div style={S.featureRow}>
              {[
                ["◈", "Trace-driven", "Attacks built from your real data"],
                ["⬡", "Any pipeline", "Works on any multi-agent workflow"],
                ["◎", "Live execution", "Real HTTP calls, not simulations"],
                ["◆", "Scored", "Per-agent reliability metrics"],
              ].map(([icon, title, desc]) => (
                <div key={title} style={S.featureCard}>
                  <span style={{ color: "var(--accent)", fontSize: 16, marginBottom: "0.5rem", display: "block" }}>{icon}</span>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)", marginBottom: "0.25rem" }}>{title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

        ) : (
          /* ── Pipeline detected ─────────────────────────────────── */
          <div style={S.col} className="fade-in">

            <div style={S.detectBadge}>
              <span style={{ color: "var(--pass)", marginRight: 6 }}>✓</span>Pipeline detected
            </div>

            <h1 style={{ ...S.h1, marginBottom: "0.5rem" }}>
              {orderedAgents.length}-agent pipeline found
            </h1>
            <p style={{ ...S.sub, marginBottom: "1.75rem" }}>
              AgentProbe will generate adversarial attacks targeting each agent.
            </p>

            {/* ── Pipeline node graph ── */}
            <PipelineGraph agents={orderedAgents} />

            {/* Stats */}
            <div style={S.statsRow}>
              {[
                { v: orderedAgents.length, l: "agents" },
                preview.traceCount != null && { v: preview.traceCount, l: "trace spans" },
                preview.workflowName && { v: preview.workflowName, l: "workflow", mono: true },
                preview.modelName    && { v: preview.modelName,    l: "model",    mono: true },
              ].filter(Boolean).map(({ v, l, mono }) => (
                <div key={l} style={S.statPill}>
                  <span style={{ color: "var(--text)", fontFamily: mono ? "var(--mono)" : "inherit", fontWeight: 600, fontSize: 13 }}>{v}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{l}</span>
                </div>
              ))}
            </div>

            {/* ── Endpoint config (our design + gargi's test feature) ── */}
            <EndpointConfig
              endpointUrl={endpointUrl}
              setEndpointUrl={setEndpointUrl}
              authHeader={authHeader}
              setAuthHeader={setAuthHeader}
              urlError={urlError}
              setUrlError={setUrlError}
              testEndpoint={testEndpoint}
              testing={testing}
              testResult={testResult}
            />

            <button
              onClick={() => {
                if (!endpointUrl.trim()) { setUrlError("Endpoint URL is required."); return; }
                if (!endpointUrl.trim().startsWith("http")) { setUrlError("URL must start with http:// or https://"); return; }
                onIngested(preview.csvContent, orderedAgents, endpointUrl.trim(), authHeader.trim(), preview.workflowName);
              }}
              style={S.cta}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#6d28d9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
            >
              Start Red-Teaming →
            </button>

            <button onClick={() => { setPreview(null); setUrlError(null); }} style={S.ghost}>
              ← Upload a different file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pipeline Graph ───────────────────────────────────────── */
function PipelineGraph({ agents }) {
  return (
    <div style={{
      width: "100%",
      marginBottom: "1.75rem",
      background: "linear-gradient(135deg, rgba(124,58,237,0.07) 0%, rgba(10,10,10,0) 70%)",
      border: "1px solid rgba(124,58,237,0.22)",
      padding: "2.5rem 2rem",
      position: "relative",
      overflow: "visible",
    }}>
      {/* Top glow */}
      <div style={{
        position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
        width: 400, height: 120,
        background: "radial-gradient(ellipse, rgba(124,58,237,0.2) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {agents.map((agent, i) => (
          <React.Fragment key={agent}>
            <AgentCard agent={agent} index={i} total={agents.length} />
            {i < agents.length - 1 && (
              <div style={{ display: "flex", alignItems: "center", flexShrink: 0, padding: "0 6px" }}>
                <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
                  <line x1="0" y1="8" x2="26" y2="8" stroke="rgba(124,58,237,0.4)" strokeWidth="1.5" strokeDasharray="4 3" />
                  <path d="M21 3l6 5-6 5" stroke="rgba(124,58,237,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const AGENT_COLORS = {
  document_extraction:  "#7c3aed",
  kyc_verification:     "#3b82f6",
  risk_assessment:      "#f59e0b",
  compliance_decision:  "#22c55e",
};

function AgentCard({ agent, index, total }) {
  // Wide enough for the longest agent name at 13px mono (~8px/char)
  // "document_extraction" = 19 chars × 8 = 152px → need 170px min
  const nodeWidth = total <= 2 ? 260 : total <= 3 ? 230 : total <= 4 ? 210 : total <= 5 ? 180 : 155;
  const color = AGENT_COLORS[agent] || "#7c3aed";

  return (
    <div
      style={{
        flexShrink: 0,
        width: nodeWidth,
        background: `${color}0d`,
        border: `1px solid ${color}33`,
        borderTop: `3px solid ${color}`,
        padding: "1.125rem 1rem",
        backdropFilter: "blur(8px)",
        position: "relative",
        transition: "background 0.18s, border-color 0.18s, transform 0.18s, box-shadow 0.18s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background     = `${color}1a`;
        e.currentTarget.style.borderColor    = `${color}66`;
        e.currentTarget.style.transform      = "translateY(-3px)";
        e.currentTarget.style.boxShadow      = `0 8px 24px ${color}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background     = `${color}0d`;
        e.currentTarget.style.borderColor    = `${color}33`;
        e.currentTarget.style.transform      = "translateY(0)";
        e.currentTarget.style.boxShadow      = "none";
      }}
    >
      {/* Index badge */}
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color, marginBottom: "0.6rem", opacity: 0.75, letterSpacing: "0.06em" }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      {/* Agent name — nowrap so it never breaks mid-word */}
      <div style={{
        fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700,
        color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis", letterSpacing: "-0.01em",
      }}>
        {agent}
      </div>
      {/* Color dot */}
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: color,
        marginTop: "0.75rem", boxShadow: `0 0 6px ${color}`,
      }} />
    </div>
  );
}

/* ── Endpoint Config ──────────────────────────────────────── */
function EndpointConfig({ endpointUrl, setEndpointUrl, authHeader, setAuthHeader, urlError, setUrlError, testEndpoint, testing, testResult }) {
  const [urlFocused, setUrlFocused] = useState(false);
  const [authFocused, setAuthFocused] = useState(false);

  return (
    <div style={{
      width: "100%",
      marginBottom: "1.25rem",
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.02)",
      backdropFilter: "blur(8px)",
    }}>
      {/* Header */}
      <div style={{
        padding: "1rem 1.25rem",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Target Endpoint
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Where AgentProbe sends adversarial attacks
          </div>
        </div>
        <button
          onClick={() => { setEndpointUrl("http://localhost:8000/api/pipeline/run"); setUrlError(null); }}
          style={{
            fontFamily: "var(--mono)", fontSize: 10, background: "rgba(124,58,237,0.12)",
            border: "1px solid rgba(124,58,237,0.3)", color: "var(--accent)",
            padding: "0.25rem 0.625rem", cursor: "pointer", letterSpacing: "0.03em",
          }}
        >
          use local
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: "0.5rem" }}>
            ENDPOINT URL <span style={{ color: "var(--fail)" }}>*</span>
          </label>
          <input
            type="text"
            value={endpointUrl}
            onChange={(e) => { setEndpointUrl(e.target.value); setUrlError(null); }}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            placeholder="https://your-api.com/pipeline/run"
            style={{
              width: "100%", background: "rgba(255,255,255,0.03)",
              border: `1px solid ${urlError ? "rgba(239,68,68,0.5)" : urlFocused ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 0, padding: "0.625rem 0.75rem",
              color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none",
              boxShadow: urlFocused ? "0 0 0 3px rgba(124,58,237,0.1)" : "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
          />
          {urlError
            ? <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--fail)", marginTop: "0.375rem" }}>{urlError}</p>
            : <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", marginTop: "0.375rem" }}>
                POST <code style={{ color: "rgba(124,58,237,0.8)" }}>{"{"}"documents": {"{"}"..."{"}"}{"}"}</code> → returns <code style={{ color: "rgba(124,58,237,0.8)" }}>{"{"}"stages": {"{"}"..."{"}"}{"}"}</code>
              </p>
          }
        </div>

        <div>
          <label style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: "0.5rem" }}>
            AUTHORIZATION HEADER&nbsp;<span style={{ color: "var(--text-dim)", fontSize: 9 }}>(OPTIONAL)</span>
          </label>
          <input
            type="text"
            value={authHeader}
            onChange={(e) => setAuthHeader(e.target.value)}
            onFocus={() => setAuthFocused(true)}
            onBlur={() => setAuthFocused(false)}
            placeholder="Bearer sk-..."
            style={{
              width: "100%", background: "rgba(255,255,255,0.03)",
              border: `1px solid ${authFocused ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 0, padding: "0.625rem 0.75rem",
              color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none",
              boxShadow: authFocused ? "0 0 0 3px rgba(124,58,237,0.1)" : "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
          />
        </div>

        {/* Test endpoint button + result */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            onClick={testEndpoint}
            disabled={testing}
            style={{
              fontFamily: "var(--mono)", fontSize: 11,
              background: "transparent",
              border: `1px solid ${testing ? "rgba(255,255,255,0.1)" : "rgba(124,58,237,0.4)"}`,
              color: testing ? "var(--text-dim)" : "var(--accent)",
              padding: "0.375rem 0.875rem", cursor: testing ? "wait" : "pointer",
              transition: "border-color 0.15s",
            }}
          >
            {testing ? "testing…" : "Test connection"}
          </button>
          {testResult && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: testResult.ok ? "var(--pass)" : "var(--fail)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
              {testResult.ok ? "✓" : "✗"}
              {testResult.status != null && <span style={{ color: "var(--text)" }}>HTTP {testResult.status}</span>}
              {testResult.latency_ms != null && <span style={{ color: "var(--text-muted)" }}>{testResult.latency_ms}ms</span>}
            </span>
          )}
        </div>
        {testResult?.error && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--fail)", marginTop: "-0.5rem" }}>
            {testResult.error}
          </p>
        )}
        {testResult?.response_keys && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", marginTop: "-0.5rem" }}>
            Response keys: {testResult.response_keys.join(", ") || "(empty)"}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────── */
export function Header({ step }) {
  const steps = ["Ingest", "Attack", "Results"];
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 2rem", height: 52, borderBottom: "1px solid rgba(255,255,255,0.06)",
      flexShrink: 0, background: "rgba(10,10,10,0.8)", backdropFilter: "blur(12px)",
      position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <div style={{ width: 14, height: 14, background: "var(--accent)", borderRadius: 2, boxShadow: "0 0 8px rgba(124,58,237,0.6)" }} />
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: "var(--text)", letterSpacing: "-0.02em" }}>AgentProbe</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 12,
              color: i === step ? "var(--text)" : i < step ? "var(--pass)" : "rgba(255,255,255,0.2)",
              fontWeight: i === step ? 600 : 400,
            }}>
              {i < step ? "✓" : s}
            </span>
            {i < steps.length - 1 && <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 12, margin: "0 2px" }}>›</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ width: 140 }} />
    </header>
  );
}

/* ── Misc ─────────────────────────────────────────────────── */
function UploadIcon({ active }) {
  return (
    <div style={{
      margin: "0 auto 1.5rem",
      width: 64, height: 64, borderRadius: 12,
      background: active ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.06)",
      border: `1px solid ${active ? "rgba(124,58,237,0.6)" : "rgba(124,58,237,0.2)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: active ? "0 0 24px rgba(124,58,237,0.3)" : "none",
      transition: "all 0.2s",
    }}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M13 18V6M13 6L8 11M13 6l5 5" stroke={active ? "#7c3aed" : "rgba(255,255,255,0.4)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 21h18" stroke={active ? "#7c3aed" : "rgba(255,255,255,0.2)"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 28, height: 28, margin: "0 auto", border: "2px solid rgba(124,58,237,0.2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
}

const S = {
  page:        { display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" },
  body:        { flex: 1, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3rem 1rem 4rem" },
  col:         { width: "100%", maxWidth: 1100, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },

  eyebrow:     { fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1rem" },
  h1:          { fontSize: 34, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: "1rem" },
  sub:         { fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "2rem", maxWidth: 480 },

  dropzone:    { width: "100%", border: "1px dashed", borderRadius: 4, cursor: "pointer", transition: "all 0.2s", marginBottom: "1.5rem" },
  dropTitle:   { fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" },
  dropSub:     { fontSize: 13, color: "var(--text-muted)" },

  errMsg:      { color: "var(--fail)", fontFamily: "var(--mono)", fontSize: 11, padding: "0.625rem 0.875rem", border: "1px solid rgba(239,68,68,0.2)", background: "var(--fail-dim)", width: "100%", textAlign: "left", marginBottom: "1rem" },

  featureRow:  { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", width: "100%", marginTop: "0.5rem" },
  featureCard: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: "1rem 0.75rem", textAlign: "left" },

  detectBadge: { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", padding: "0.2rem 0.75rem", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.05)", borderRadius: 2, marginBottom: "1.25rem", letterSpacing: "0.04em" },

  statsRow:    { display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "1.75rem" },
  statPill:    { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.75rem", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", fontSize: 12, color: "var(--text-muted)" },

  cta:         { width: "100%", padding: "0.9rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 0, fontWeight: 600, fontSize: 14, cursor: "pointer", letterSpacing: "0.01em", marginBottom: "0.75rem", transition: "background 0.15s", boxShadow: "0 0 24px rgba(124,58,237,0.3)" },
  ghost:       { background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)" },
};
