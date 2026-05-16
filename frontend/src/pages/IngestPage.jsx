import React, { useState, useRef } from "react";

export default function IngestPage({ onIngested }) {
  const [dragOver, setDragOver]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [preview, setPreview]         = useState(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authHeader, setAuthHeader]   = useState("");
  const [urlError, setUrlError]       = useState(null);
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file || !file.name.endsWith(".csv")) {
      setError("Expected a .csv file exported from LangFuse.");
      return;
    }
    setError(null);
    setLoading(true);
    const csvContent = await file.text();

    // Always parse client-side first so we have workflow metadata
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

    const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
    const nameIdx      = header.indexOf("name");
    const typeIdx      = header.indexOf("type");
    const traceNameIdx = header.indexOf("traceName");
    const outputIdx    = header.indexOf("output");

    const agents = new Set();
    let workflowName = null;
    let modelName    = null;
    let spanCount    = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols     = splitCsvLine(lines[i]);
      const type     = cols[typeIdx]?.replace(/"/g, "").trim().toUpperCase();
      const name     = cols[nameIdx]?.replace(/"/g, "").trim();
      const tName    = traceNameIdx >= 0 ? cols[traceNameIdx]?.replace(/"/g, "").trim() : "";

      if (!workflowName && tName) workflowName = tName;

      if (!name || name === tName) continue;
      if (type !== "SPAN" && type !== "GENERATION") continue;

      agents.add(name);
      spanCount++;

      // Try to extract model name from output JSON _meta field
      if (!modelName && outputIdx >= 0) {
        try {
          const out = JSON.parse(cols[outputIdx]?.replace(/^"|"$/g, "") ?? "{}");
          const m = out?._meta?.model;
          if (m) modelName = m;
        } catch { /* ignore */ }
      }
    }

    return { agentNames: [...agents], traceCount: spanCount, workflowName, modelName };
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

  const detectedAgents = preview?.agentNames ?? [];
  // Preserve order from CSV; no hardcoded known-order preference
  const orderedAgents  = detectedAgents;

  return (
    <div className="fade-in" style={S.page}>
      <Header step={0} />

      <div style={S.body}>
        {!preview ? (
          /* ── Upload state ─────────────────────────────────────── */
          <div style={S.center}>
            <p style={S.eyebrow}>Step 1 of 3</p>
            <h1 style={S.h1}>Import your agent traces</h1>
            <p style={S.sub}>
              Export a CSV from LangFuse → Traces → Export CSV.<br />
              AgentProbe detects your pipeline structure automatically and generates
              attacks from your real production data.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current.click()}
              style={{
                ...S.dropzone,
                borderColor: dragOver ? "var(--accent)" : "rgba(255,255,255,0.1)",
                background:  dragOver ? "var(--accent-dim)" : "transparent",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])} />

              {loading ? (
                <div style={{ textAlign: "center" }}>
                  <Spinner />
                  <p style={{ color: "var(--text-muted)", marginTop: "1rem", fontFamily: "var(--mono)", fontSize: 13 }}>
                    Parsing traces...
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <UploadIcon active={dragOver} />
                  <p style={S.dropTitle}>{dragOver ? "Release to upload" : "Drop your LangFuse CSV here"}</p>
                  <p style={S.dropSub}>or click to browse files</p>
                </div>
              )}
            </div>

            {error && <p style={S.error}>{error}</p>}

            <div style={S.pillRow}>
              {["Trace-driven attacks", "5 attack vectors", "Live agent execution", "Any pipeline"].map((t) => (
                <span key={t} style={S.pill}>{t}</span>
              ))}
            </div>
          </div>
        ) : (
          /* ── Pipeline detected state ──────────────────────────── */
          <div style={S.center} className="fade-in">
            <div style={S.successBadge}>
              <span style={{ color: "var(--pass)" }}>✓</span>&nbsp; Pipeline detected
            </div>

            <h1 style={{ ...S.h1, marginBottom: "0.5rem" }}>
              {orderedAgents.length}-agent pipeline found
            </h1>
            <p style={{ ...S.sub, marginBottom: "2.5rem" }}>
              AgentProbe will generate adversarial attacks targeting each agent below.
            </p>

            {/* Node graph */}
            <div style={S.graph}>
              {orderedAgents.map((agent, i) => (
                <React.Fragment key={agent}>
                  <AgentCard agent={agent} index={i} model={preview.modelName} />
                  {i < orderedAgents.length - 1 && <Arrow />}
                </React.Fragment>
              ))}
            </div>

            {/* Stats row — fully dynamic */}
            <div style={S.statsRow}>
              <StatPill value={orderedAgents.length} label="agents" />
              {preview.traceCount != null && <StatPill value={preview.traceCount} label="trace spans" />}
              {preview.workflowName && <StatPill value={preview.workflowName} label="workflow" mono />}
              {preview.modelName   && <StatPill value={preview.modelName}   label="model"    mono />}
            </div>

            {/* Endpoint configuration */}
            <div style={{ width: "100%", borderTop: "1px solid var(--border)", paddingTop: "1.5rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.875rem", textAlign: "left" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Target Pipeline Endpoint
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>
                    Endpoint URL <span style={{ color: "var(--fail)" }}>*</span>
                  </label>
                  <button
                    onClick={() => { setEndpointUrl("http://localhost:8000/api/pipeline/run"); setUrlError(null); }}
                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 10, padding: "0.15rem 0.5rem", cursor: "pointer" }}
                  >
                    use local
                  </button>
                </div>
                <input
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => { setEndpointUrl(e.target.value); setUrlError(null); }}
                  placeholder="https://your-api.com/pipeline/run"
                  style={S.input}
                />
                <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
                  Must accept POST {"{"}"documents": {"{"}"..."{"}"}{"}"} and return {"{"}"stages": {"{"}"..."{"}"}{"}"}.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <label style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  Authorization Header <span style={{ color: "var(--text-dim)" }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={authHeader}
                  onChange={(e) => setAuthHeader(e.target.value)}
                  placeholder="Bearer sk-..."
                  style={S.input}
                />
              </div>

              {urlError && <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fail)" }}>{urlError}</p>}
            </div>

            <button
              onClick={() => {
                if (!endpointUrl.trim()) { setUrlError("Endpoint URL is required."); return; }
                if (!endpointUrl.trim().startsWith("http")) { setUrlError("URL must start with http:// or https://"); return; }
                onIngested(preview.csvContent, orderedAgents, endpointUrl.trim(), authHeader.trim(), preview.workflowName);
              }}
              style={S.cta}
            >
              Start Red-Teaming →
            </button>

            <button onClick={() => setPreview(null)} style={S.ghost}>
              Upload a different file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function AgentCard({ agent, index, model }) {
  return (
    <div style={S.agentCard}>
      <div style={S.agentIndex}>{String(index + 1).padStart(2, "0")}</div>
      <div style={S.agentName}>{agent}</div>
      {model && <div style={S.agentModel}>{model}</div>}
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ display: "flex", alignItems: "center", color: "var(--text-dim)", flexShrink: 0 }}>
      <div style={{ width: 24, height: 1, background: "rgba(255,255,255,0.12)" }} />
      <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
        <path d="M1 1l4 4-4 4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function StatPill({ value, label, mono }) {
  return (
    <div style={S.statPill}>
      <span style={{ color: "var(--text)", fontFamily: mono ? "var(--mono)" : "inherit", fontWeight: 600, fontSize: 13 }}>
        {value}
      </span>
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{label}</span>
    </div>
  );
}

function UploadIcon({ active }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 1.5rem", display: "block", opacity: active ? 1 : 0.4, transition: "opacity 0.15s" }}>
      <rect width="48" height="48" rx="8" fill={active ? "var(--accent-dim)" : "rgba(255,255,255,0.04)"} />
      <path d="M24 30V18M24 18l-5 5M24 18l5 5" stroke={active ? "var(--accent)" : "rgba(255,255,255,0.4)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 34h16" stroke={active ? "var(--accent)" : "rgba(255,255,255,0.2)"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{ width: 32, height: 32, margin: "0 auto", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
  );
}

export function Header({ step }) {
  const steps = ["Ingest", "Attack", "Results"];
  return (
    <header style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <div style={S.logoSquare} />
        <span style={S.wordmark}>AgentProbe</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: i === step ? "var(--text)" : i < step ? "var(--pass)" : "var(--text-dim)", fontWeight: i === step ? 600 : 400 }}>
              {i < step ? "✓" : s}
            </span>
            {i < steps.length - 1 && <span style={{ color: "var(--text-dim)", fontSize: 12 }}>›</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ width: 160 }} />
    </header>
  );
}

const S = {
  page:         { display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" },
  header:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", height: 56, borderBottom: "1px solid var(--border)", flexShrink: 0, position: "sticky", top: 0, background: "var(--bg)", zIndex: 10 },
  logoSquare:   { width: 16, height: 16, background: "var(--accent)", borderRadius: 2, flexShrink: 0 },
  wordmark:     { fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "var(--text)", letterSpacing: "-0.02em" },
  body:         { flex: 1, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 2rem" },
  center:       { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  eyebrow:      { fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" },
  h1:           { fontSize: 36, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: "1rem" },
  sub:          { fontSize: 15, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "2.5rem" },
  dropzone:     { width: "100%", border: "1px dashed", borderRadius: 2, padding: "4rem 3rem", cursor: "pointer", transition: "all 0.15s", marginBottom: "1.5rem" },
  dropTitle:    { fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" },
  dropSub:      { fontSize: 13, color: "var(--text-muted)" },
  error:        { color: "var(--fail)", fontFamily: "var(--mono)", fontSize: 12, marginTop: "0.75rem", padding: "0.75rem 1rem", border: "1px solid rgba(239,68,68,0.2)", background: "var(--fail-dim)", width: "100%", textAlign: "left" },
  pillRow:      { display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" },
  pill:         { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", padding: "0.25rem 0.625rem", border: "1px solid var(--border)", borderRadius: 2 },
  successBadge: { fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-muted)", padding: "0.25rem 0.75rem", border: "1px solid var(--border)", borderRadius: 2, marginBottom: "1.5rem" },
  graph:        { display: "flex", alignItems: "center", gap: "0", width: "100%", justifyContent: "center", marginBottom: "2rem", flexWrap: "wrap" },
  agentCard:    { background: "var(--surface)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)", padding: "1rem 1.25rem", borderLeft: "3px solid var(--accent)", textAlign: "left", minWidth: 140 },
  agentIndex:   { fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", marginBottom: "0.375rem" },
  agentName:    { fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: "0.25rem" },
  agentModel:   { fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" },
  statsRow:     { display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" },
  statPill:     { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.75rem", border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text-muted)" },
  cta:          { width: "100%", padding: "0.875rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 0, fontWeight: 600, fontSize: 14, cursor: "pointer", letterSpacing: "0.01em", marginBottom: "0.75rem" },
  ghost:        { background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", textDecoration: "underline" },
  input:        { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 0, padding: "0.625rem 0.75rem", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, width: "100%", outline: "none" },
};
