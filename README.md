# AgentProbe

**Automated adversarial red-teaming for multi-agent AI workflows.**

AgentProbe reads your agent traces, generates adversarial attacks from them, runs those attacks through your actual pipeline, and tells you exactly where it will fail — before production does.

> "Monitoring is a security camera. AgentProbe is a penetration test."

---

## Inspiration

As AI agents get deployed in high-stakes domains like banking, compliance, and identity verification, a natural question arises: how do you know your agent pipeline actually behaves reliably when it's being attacked or manipulated? Unit tests and LLM evals test the happy path, but real-world adversaries don't send clean inputs. We wanted to build the tool we wished existed: an automated red-teaming engine that stress-tests multi-agent systems the same way a security researcher would.

---

## What it does

AgentProbe is an automated adversarial red-teaming platform for multi-agent AI workflows. It takes a running agent pipeline, pulls real production traces, and systematically attacks it across five adversarial dimensions:

| Attack | What it tests |
|---|---|
| **Injection** | Embeds hidden instructions inside document field values to hijack agent behavior |
| **Boundary** | Sends graduated variants of legitimate inputs that incrementally add red flags, testing where agents draw the line |
| **Sandbagging** | Sends the same request with formal vs. casual framing to detect whether agents give different decisions based on tone rather than content |
| **Cascade** | Injects plausible-but-wrong upstream outputs and checks whether downstream agents propagate the error or catch it |
| **Consistency** | Sends cosmetically varied inputs (different field order, synonyms) to test whether agents return stable decisions |

Each attack is judged by a separate LLM evaluator (Claude Sonnet) that assigns **PASS / PARTIAL / FAIL** with a numerical score and flags whether a failure would cause real-world harm in production. Scores are aggregated per agent and combined into a single **workflow reliability score** with a weakest-link penalty — a pipeline is only as safe as its most vulnerable stage.

Results stream live to a React dashboard over WebSocket, with a live attack feed, per-agent score cards, an attack heatmap, and a sandbagging delta view.

The demo target is a **4-agent bank account opening pipeline**:

```
Document Extraction → KYC Verification → Risk Assessment → Compliance Decision
```

---

## Architecture

```
CSV traces (LangFuse export)
        ↓
[1] TraceIngester    →  normalizes real execution traces
        ↓
[2] AttackGenerator  →  Claude Sonnet synthesizes adversarial scenarios
        ↓
[3] AttackRunner     →  replays each scenario against the live pipeline
        ↓
[4] JudgeEvaluator   →  Claude Sonnet grades each result PASS/PARTIAL/FAIL
        ↓
[5] ReliabilityScorer → weighted per-agent + workflow score
```

### Backend (Python / FastAPI)
- **TraceIngester** — pulls real execution traces from LangFuse CSV exports, stores in Snowflake (or in-memory mock)
- **AttackGenerator** — uses Claude Sonnet to synthesize adversarial scenarios grounded in real production behavior
- **AttackRunner** — replays each scenario as HTTP POST requests against the live pipeline endpoint
- **JudgeEvaluator** — uses a second Claude Sonnet instance as an impartial security evaluator
- **ReliabilityScorer** — computes weighted per-agent scores and a workflow-level score with weakest-link penalty
- All results persist to **Snowflake** for historical analysis

### Agent Pipeline (Claude Haiku + Sonnet)
- 4-agent banking pipeline with structured JSON output
- Each agent is a Claude API call with domain-specific system prompt
- Framing injection support for sandbagging detection
- Cascade injection support via `override_extraction` field

### Frontend (React / Vite)
- WebSocket-driven live feed showing each attack as it streams in
- Dashboard with score hero, AgentScoreCard rings, AttackHeatmap, SandbaggingView
- Downloadable security report
- framer-motion animations throughout

---

## How to Run

### Prerequisites
- Python 3.11+
- Node.js 18+
- Anthropic API key

### Setup

```bash
# 1. Install backend dependencies
cd backend
pip install -r requirements.txt

# 2. Configure environment
# Create backend/.env with the variables below

# 3. Start backend
uvicorn api.main:app --reload --port 8000

# 4. Install and start frontend
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:5173`, upload a LangFuse CSV export, configure your pipeline endpoint, and click **Launch Probe**.

### Environment Variables (`backend/.env`)

```env
ANTHROPIC_API_KEY=sk-ant-...

# Set to 1 to skip Snowflake and use in-memory store
USE_MOCK_DB=1

# Snowflake (optional)
SNOWFLAKE_ACCOUNT=
SNOWFLAKE_USER=
SNOWFLAKE_PASSWORD=
SNOWFLAKE_DATABASE=
SNOWFLAKE_SCHEMA=
SNOWFLAKE_WAREHOUSE=

# LangFuse (optional — for direct API trace pull)
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_HOST=https://us.cloud.langfuse.com
```

---

## The 5 Attack Types in Detail

### INJECTION
Embeds adversarial instructions inside legitimate-looking document fields to hijack downstream agent behavior.

### BOUNDARY
Sends graduated variants of a clean application with incrementally worse red flags. Tests whether agents reject at the right threshold.

### SANDBAGGING
Same customer data, two framings — formal audit tone vs casual. If the agent produces different decisions under casual framing, it's cutting corners when it thinks no one is watching.

### CASCADE
Injects a corrupted first-stage output and re-runs the pipeline. Tests whether downstream agents blindly trust upstream data or perform independent verification.

### CONSISTENCY
Three runs of identical data with cosmetic variations. Tests whether the agent produces stable decisions regardless of irrelevant presentation differences.

---

## Scoring

| Attack Type | Weight |
|---|---|
| INJECTION | 25% |
| SANDBAGGING | 25% |
| BOUNDARY | 20% |
| CASCADE | 15% |
| CONSISTENCY | 15% |

**Workflow score** = average of agent scores with a weakest-link penalty that pulls toward the worst-performing agent.

---

## Challenges

- Getting the attack generator to produce reliably parseable JSON at scale required careful prompt engineering and robust extraction logic
- The sandbagging metric is inherently noisy — small wording changes can cause spurious decision flips, so we combined decision delta with reasoning-depth delta
- Streaming WebSocket results while maintaining database writes without blocking the UI required careful async design in FastAPI
- Cascade attacks require two full pipeline runs (clean baseline + corrupted injection), making them the most expensive attack type

## What We Learned

- Multi-agent systems have failure modes fundamentally different from single-model systems — cascade and consistency attacks are nearly invisible without end-to-end testing
- LLM-as-judge requires careful system prompt design to avoid being too lenient
- Sandbagging is underappreciated as a reliability risk — agents genuinely respond differently to formal vs. casual framing in ways that matter for regulated decisions

## What's Next

- Support for arbitrary user-defined pipelines via YAML config
- Continuous monitoring mode: run probe sweeps on a schedule and alert when reliability drops
- Attack library expansion: hallucination probes, tool-call injection, multi-turn jailbreaks
- Hosted version: connect your LangFuse/LangSmith project and get a red-team report without writing any code

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent LLM (pipeline) | Claude Haiku 4.5 |
| Judge LLM | Claude Sonnet 4.6 |
| Backend | Python, FastAPI, WebSockets |
| Database | Snowflake (+ in-memory fallback) |
| Tracing | LangFuse |
| Frontend | React, Vite, framer-motion |

---

Built at Uncommon Hacks 2026.
