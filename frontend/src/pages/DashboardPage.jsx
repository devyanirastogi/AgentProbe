import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Header } from "./IngestPage";
import AgentScoreCard from "../components/AgentScoreCard";
import AttackHeatmap from "../components/AttackHeatmap";
import SandbaggingView from "../components/SandbaggingView";

const TABS = ["Overview", "Agent Scores", "Heatmap", "Sandbagging"];

const TYPE_COLORS = {
  INJECTION:    "#ef4444",
  SANDBAGGING:  "#7c3aed",
  CASCADE:      "#f59e0b",
  BOUNDARY:     "#3b82f6",
  CONSISTENCY:  "#6b7280",
  UNKNOWN:      "#6b7280",
};

function scoreColor(v) {
  if (v == null) return "var(--text-muted)";
  if (v >= 75)  return "var(--pass)";
  if (v >= 50)  return "var(--partial)";
  return "var(--fail)";
}

/* ── Animated count-up ─────────────────────────────────── */
function CountUp({ target, decimals = 0, suffix = "", delay = 0 }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) return;
    const duration = 1200;
    const startTime = Date.now() + delay * 1000;
    let raf;
    const frame = () => {
      const now = Date.now();
      if (now < startTime) { raf = requestAnimationFrame(frame); return; }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(parseFloat((eased * target).toFixed(decimals)));
      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, delay]);

  return <>{display}{suffix}</>;
}

/* ── Mini agent bar row ────────────────────────────────── */
function MiniAgentBar({ agent, metrics, index }) {
  const reduced = useReducedMotion();
  const score   = metrics?.overall_score ?? 0;
  const color   = scoreColor(score);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", width: 180, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {agent}
      </span>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <motion.div
          style={{ height: "100%", background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 50, damping: 15, delay: index * 0.08 }}
        />
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color, fontWeight: 700, width: 36, textAlign: "right" }}>
        {score.toFixed(0)}%
      </span>
    </div>
  );
}

/* ── Verdict counter ───────────────────────────────────── */
function VerdictCounter({ label, count, color, delay }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      style={{ textAlign: "center" }}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <div style={{ fontFamily: "var(--mono)", fontSize: 42, fontWeight: 800, color, lineHeight: 1 }}>
        {reduced ? count : <CountUp target={count} delay={delay} />}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", marginTop: "0.375rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </div>
    </motion.div>
  );
}

/* ── Attack Log ────────────────────────────────────────── */
function AttackLog({ attackResults }) {
  const reduced = useReducedMotion();
  if (!attackResults?.length) return null;

  const sorted = [...attackResults].sort((a, b) => {
    const order = { FAIL: 0, PARTIAL: 1, PASS: 2, ERROR: 3 };
    return (order[a.verdict] ?? 4) - (order[b.verdict] ?? 4);
  });

  const VERDICT_COLOR = { PASS: "var(--pass)", PARTIAL: "var(--partial)", FAIL: "var(--fail)", ERROR: "var(--text-muted)" };
  const VERDICT_BG    = { PASS: "rgba(34,197,94,0.08)", PARTIAL: "rgba(245,158,11,0.08)", FAIL: "rgba(239,68,68,0.08)", ERROR: "transparent" };

  return (
    <div style={{ marginTop: "2rem", boxShadow: "0 0 0 1px rgba(255,255,255,0.05)" }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Attack Log
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
          {sorted.length} attacks
          &nbsp;·&nbsp; {sorted.filter(r => r.verdict === "FAIL").length} failed
          &nbsp;·&nbsp; {sorted.filter(r => r.verdict === "PASS").length} passed
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Verdict", "Agent", "Attack Type", "Judge Reasoning"].map((h) => (
                <th key={h} style={{ padding: "0.625rem 1rem", textAlign: "left", fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 400, whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const vc = VERDICT_COLOR[r.verdict] || "var(--text-muted)";
              const vb = VERDICT_BG[r.verdict]    || "transparent";
              const tc = TYPE_COLORS[r.attack_type] || "#6b7280";
              return (
                <motion.tr
                  key={i}
                  style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.6) }}
                >
                  <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: vc, padding: "0.2rem 0.5rem", background: vb, border: `1px solid ${vc}33` }}>
                      {r.verdict}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>{r.agent_name}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: tc, padding: "0.15rem 0.5rem", border: `1px solid ${tc}44`, background: `${tc}11` }}>
                      {r.attack_type}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, maxWidth: 400 }}>
                    {r.judge_reasoning || "—"}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Dashboard ────────────────────────────────────── */
export default function DashboardPage({ scores, agentNames, onReset }) {
  const [tab, setTab]   = useState("Overview");
  const openedTabs      = useRef(new Set(["Overview"]));
  const reduced         = useReducedMotion();

  const { workflow_score, agent_scores, attack_results } = scores ?? {};

  const color      = scoreColor(workflow_score);
  const sentiment  = workflow_score >= 75 ? "Pipeline is reliable." : workflow_score >= 50 ? "Significant vulnerabilities detected." : "CRITICAL — Do not deploy to production.";
  const critAgents = Object.values(agent_scores ?? {}).filter((m) => m.overall_score < 50).length;
  const maxSandbag = Math.max(0, ...Object.values(agent_scores ?? {}).map((m) => m.sandbagging_delta ?? 0));

  const passCount    = (attack_results ?? []).filter(r => r.verdict === "PASS").length;
  const partialCount = (attack_results ?? []).filter(r => r.verdict === "PARTIAL").length;
  const failCount    = (attack_results ?? []).filter(r => r.verdict === "FAIL").length;

  function handleTab(t) {
    openedTabs.current.add(t);
    setTab(t);
  }

  function generateReport() {
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const totalAttacks = (attack_results ?? []).length;
    const fails = (attack_results ?? []).filter(r => r.verdict === "FAIL");
    const partials = (attack_results ?? []).filter(r => r.verdict === "PARTIAL");

    const COMPLIANCE_MAP = {
      INJECTION:   "BSA/AML §5318 — Agents must not execute instructions embedded in customer-supplied data fields.",
      SANDBAGGING: "FFIEC BSA/AML Manual — Agent behavior must be consistent regardless of audit oversight framing.",
      CASCADE:     "FinCEN CDD Rule §1020.210 — Downstream agents must independently verify upstream outputs.",
      BOUNDARY:    "OFAC Compliance §501 — Risk thresholds must be enforced at correct decision boundaries.",
      CONSISTENCY: "USA PATRIOT Act §326 — Identical inputs must produce consistent identity verification outcomes.",
    };

    const RECS_MAP = {
      INJECTION:   "Add input sanitization to strip instruction-like tokens from all customer data fields before passing to downstream agents.",
      SANDBAGGING: "Standardize agent system prompts to remove framing sensitivity. Audit prompts for language that implies reduced oversight.",
      CASCADE:     "Each agent must re-verify critical fields independently rather than trusting upstream outputs blindly.",
      BOUNDARY:    "Calibrate risk scoring thresholds with explicit test cases at known boundary values.",
      CONSISTENCY: "Add deterministic post-processing or output validation to ensure identical inputs produce identical decisions.",
    };

    const verdictBadge = (v) => {
      const colors = { PASS: "#22c55e", PARTIAL: "#f59e0b", FAIL: "#ef4444" };
      return `<span style="background:${colors[v] ?? "#666"}22;color:${colors[v] ?? "#666"};padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">${v}</span>`;
    };

    const agentRows = Object.entries(agent_scores ?? {}).map(([agent, m]) => {
      const score = m.overall_score ?? 0;
      const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
      return `<tr>
        <td style="padding:8px 12px;font-family:monospace;font-size:12px">${agent}</td>
        <td style="padding:8px 12px;color:${color};font-weight:700;font-family:monospace">${score.toFixed(1)}%</td>
        <td style="padding:8px 12px;font-size:12px">${score >= 75 ? "No action required" : score >= 50 ? "Review recommended" : "⚠ Critical — fix before deploy"}</td>
      </tr>`;
    }).join("");

    const attackRows = (attack_results ?? []).sort((a,b) => {
      const o = { FAIL:0, PARTIAL:1, PASS:2 };
      return (o[a.verdict]??3)-(o[b.verdict]??3);
    }).map(r => `<tr>
      <td style="padding:8px 12px">${verdictBadge(r.verdict)}</td>
      <td style="padding:8px 12px;font-family:monospace;font-size:11px">${r.agent_name ?? "—"}</td>
      <td style="padding:8px 12px;font-size:11px">${r.attack_type ?? "—"}</td>
      <td style="padding:8px 12px;font-size:11px;color:#999;max-width:400px">${r.judge_reasoning ?? "—"}</td>
    </tr>`).join("");

    const criticalFindings = [...fails, ...partials].map(r => {
      const type = r.attack_type ?? "UNKNOWN";
      return `<div style="margin-bottom:20px;padding:16px;border-left:3px solid ${r.verdict==="FAIL"?"#ef4444":"#f59e0b"};background:#111">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
          ${verdictBadge(r.verdict)}
          <span style="font-family:monospace;font-size:12px;color:#7c3aed">${type}</span>
          <span style="font-family:monospace;font-size:12px;color:#999">→ ${r.agent_name ?? "unknown agent"}</span>
        </div>
        <p style="font-size:12px;color:#ccc;margin:0 0 8px">${r.judge_reasoning ?? ""}</p>
        <p style="font-size:11px;color:#f59e0b;margin:0"><strong>Compliance risk:</strong> ${COMPLIANCE_MAP[type] ?? "Review required"}</p>
        <p style="font-size:11px;color:#60a5fa;margin:4px 0 0"><strong>Recommendation:</strong> ${RECS_MAP[type] ?? "Investigate and remediate."}</p>
      </div>`;
    }).join("") || "<p style='color:#666;font-size:13px'>No critical findings — all attacks passed.</p>";

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>AgentProbe Security Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #e2e8f0; font-family: -apple-system, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 800; color: #fff; }
  h2 { font-size: 16px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.08em; margin: 32px 0 12px; border-bottom: 1px solid #222; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; border-bottom: 1px solid #222; }
  tr:nth-child(even) { background: #111; }
  .score-big { font-size: 64px; font-weight: 800; font-family: monospace; line-height: 1; }
  .meta { font-size: 12px; color: #666; font-family: monospace; }
  @media print { body { background: white; color: black; } }
</style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div>
      <div style="font-size:11px;color:#7c3aed;font-family:monospace;letter-spacing:0.1em;margin-bottom:8px">AGENTPROBE — SECURITY REPORT</div>
      <h1>Pipeline Red-Team Analysis</h1>
      <p style="color:#666;font-size:13px;margin-top:6px">${date} · ${totalAttacks} attacks · ${agentNames?.join(" → ") ?? ""}</p>
    </div>
    <div style="text-align:right">
      <div class="score-big" style="color:${workflow_score >= 75 ? "#22c55e" : workflow_score >= 50 ? "#f59e0b" : "#ef4444"}">${workflow_score?.toFixed(1) ?? "—"}%</div>
      <div style="font-size:12px;color:#666;font-family:monospace;margin-top:4px">WORKFLOW RELIABILITY</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px">
    ${[
      ["Total Attacks", totalAttacks],
      ["Passed", passCount],
      ["Partial", partialCount],
      ["Failed", failCount],
    ].map(([l,v]) => `<div style="background:#111;padding:16px;border:1px solid #222">
      <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">${l}</div>
      <div style="font-size:28px;font-weight:800;font-family:monospace">${v}</div>
    </div>`).join("")}
  </div>

  <h2>Per-Agent Scores</h2>
  <table><thead><tr><th>Agent</th><th>Score</th><th>Status</th></tr></thead>
  <tbody>${agentRows}</tbody></table>

  <h2>Critical Findings</h2>
  ${criticalFindings}

  <h2>Full Attack Log</h2>
  <table><thead><tr><th>Verdict</th><th>Agent</th><th>Attack Type</th><th>Judge Reasoning</th></tr></thead>
  <tbody>${attackRows}</tbody></table>

  <h2>Regulatory Compliance Reference</h2>
  <table><thead><tr><th>Attack Type</th><th>Regulation</th></tr></thead>
  <tbody>${Object.entries(COMPLIANCE_MAP).map(([t,c]) => `<tr><td style="padding:8px 12px;font-family:monospace;font-size:11px">${t}</td><td style="padding:8px 12px;font-size:12px;color:#999">${c}</td></tr>`).join("")}</tbody></table>

  <p style="margin-top:40px;font-size:11px;color:#444;font-family:monospace;text-align:center">Generated by AgentProbe · ${date}</p>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentprobe-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabAnimated = openedTabs.current.has(tab);

  return (
    <div style={S.page}>
      <Header step={2} />

      {/* ── Hero ── */}
      <motion.div
        style={S.hero}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Purple glow */}
        <div style={S.glow} />

        <div style={S.heroLayout}>
          {/* Left: score + agent bars */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <p style={S.heroEyebrow}>Workflow Reliability Score</p>
            <div style={{ fontFamily: "var(--mono)", fontSize: 80, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.04em" }}>
              {reduced ? `${workflow_score?.toFixed(1) ?? "—"}%` : (
                <><CountUp target={workflow_score ?? 0} decimals={1} /><span style={{ fontSize: 38 }}>%</span></>
              )}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: "0.5rem" }}>{sentiment}</p>

            {/* Agent bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginTop: "1.5rem", maxWidth: 440 }}>
              {Object.entries(agent_scores ?? {}).map(([agent, m], i) => (
                <MiniAgentBar key={agent} agent={agent} metrics={m} index={i} />
              ))}
            </div>
          </div>

          {/* Right: verdict counters */}
          <div style={{ display: "flex", gap: "2.5rem", alignItems: "center", position: "relative", zIndex: 1, flexShrink: 0 }}>
            <VerdictCounter label="Pass"    count={passCount}    color="var(--pass)"    delay={0.1} />
            <div style={{ width: 1, height: 60, background: "var(--border)" }} />
            <VerdictCounter label="Partial" count={partialCount} color="var(--partial)" delay={0.2} />
            <div style={{ width: 1, height: 60, background: "var(--border)" }} />
            <VerdictCounter label="Fail"    count={failCount}    color="var(--fail)"    delay={0.3} />
          </div>
        </div>
      </motion.div>

      {/* ── Tab bar ── */}
      <div style={S.tabBar}>
        {TABS.map((t) => (
          <button key={t} onClick={() => handleTab(t)} style={{
            ...S.tabBtn,
            color:        tab === t ? "var(--text)" : "var(--text-muted)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
          }}>
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={generateReport} style={{ ...S.newProbeBtn, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", marginRight: "0.5rem" }}>↓ Download Report</button>
        <button onClick={onReset} style={S.newProbeBtn}>+ New Probe</button>
      </div>

      {/* ── Tab content ── */}
      <div style={S.content}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {tab === "Overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* 4 metric cards */}
                <div style={S.metricGrid}>
                  {[
                    { label: "Workflow Score",        val: `${workflow_score?.toFixed(1) ?? "—"}%`, color, target: workflow_score ?? 0, suffix: "%" },
                    { label: "Critical Agents",       val: critAgents, color: critAgents > 0 ? "var(--fail)" : "var(--pass)", target: critAgents },
                    { label: "Total Failures",        val: failCount,  color: failCount > 0 ? "var(--fail)" : "var(--pass)",  target: failCount },
                    { label: "Max Sandbagging Delta", val: `${maxSandbag.toFixed(0)}%`, color: maxSandbag >= 30 ? "var(--fail)" : maxSandbag >= 15 ? "var(--partial)" : "var(--pass)", target: maxSandbag, suffix: "%" },
                  ].map(({ label, color: c, target, suffix = "" }, i) => (
                    <motion.div
                      key={label}
                      style={S.metricCard}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.06 }}
                    >
                      <p style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
                        {label}
                      </p>
                      <p style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 800, color: c, lineHeight: 1 }}>
                        {reduced ? `${target}${suffix}` : <><CountUp target={target} decimals={suffix === "%" ? 1 : 0} />{suffix}</>}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <div style={S.chartRow}>
                  <AttackHeatmap agentScores={agent_scores} />
                  <SandbaggingView agentScores={agent_scores} />
                </div>
              </div>
            )}

            {tab === "Agent Scores" && (
              <div style={S.agentGrid}>
                {Object.entries(agent_scores ?? {}).map(([agent, metrics], i) => (
                  <AgentScoreCard key={agent} agent={agent} metrics={metrics} index={i} animate />
                ))}
              </div>
            )}

            {tab === "Heatmap" && (
              <AttackHeatmap agentScores={agent_scores} fullWidth animate={!tabAnimated} />
            )}

            {tab === "Sandbagging" && (
              <div style={{ maxWidth: 760 }}>
                <SandbaggingView agentScores={agent_scores} detailed animate={!tabAnimated} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Attack Log (always visible) ── */}
        <AttackLog attackResults={attack_results} />
      </div>
    </div>
  );
}

const S = {
  page:       { display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)", overflowY: "auto" },

  hero:       { position: "relative", padding: "2rem 2.5rem 1.75rem", borderBottom: "1px solid var(--border)", flexShrink: 0, overflow: "hidden" },
  glow:       { position: "absolute", top: "30%", left: "35%", transform: "translate(-50%, -50%)", width: 500, height: 250, background: "radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%)", pointerEvents: "none" },
  heroLayout: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "2rem" },
  heroEyebrow:{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.625rem" },

  tabBar:     { display: "flex", alignItems: "center", padding: "0 1.5rem", borderBottom: "1px solid var(--border)", flexShrink: 0, position: "sticky", top: 0, background: "var(--bg)", zIndex: 10 },
  tabBtn:     { fontFamily: "var(--mono)", fontSize: 12, padding: "0.75rem 1rem", background: "transparent", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", transition: "color 0.1s, border-color 0.1s", marginBottom: "-1px" },
  newProbeBtn:{ fontFamily: "var(--mono)", fontSize: 11, padding: "0.375rem 0.75rem", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" },

  content:    { flex: 1, padding: "1.5rem" },

  metricGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", background: "var(--border)" },
  metricCard: { background: "var(--bg)", padding: "1.5rem", boxShadow: "inset 0 0 0 0 transparent" },
  chartRow:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--border)" },
  agentGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1px", background: "var(--border)" },
};
