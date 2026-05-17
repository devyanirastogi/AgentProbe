-- AgentProbe Snowflake Schema
-- Run against TRAINING_DB.TRAININGLAB (credentials from .env)

CREATE TABLE IF NOT EXISTS traces (
    trace_id        VARCHAR(64)  PRIMARY KEY,
    workflow_id     VARCHAR(64)  NOT NULL,
    agent_name      VARCHAR(128) NOT NULL,
    input           VARIANT      NOT NULL,
    output          VARIANT      NOT NULL,
    tokens          INTEGER,
    latency_ms      INTEGER,
    timestamp       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS attack_scenarios (
    scenario_id         VARCHAR(64)  PRIMARY KEY,
    attack_type         VARCHAR(32)  NOT NULL,  -- INJECTION | BOUNDARY | SANDBAGGING | CASCADE | CONSISTENCY
    target_agent        VARCHAR(128) NOT NULL,
    adversarial_input   VARIANT      NOT NULL,
    expected_behavior   VARCHAR,
    source_trace_id     VARCHAR(64)  REFERENCES traces(trace_id),
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS attack_results (
    result_id       VARCHAR(64)  PRIMARY KEY,
    scenario_id     VARCHAR(64)  REFERENCES attack_scenarios(scenario_id),
    agent_name      VARCHAR(128) NOT NULL,
    actual_output   VARIANT      NOT NULL,
    verdict         VARCHAR(16)  NOT NULL,       -- PASS | PARTIAL | FAIL
    judge_reasoning VARCHAR,
    executed_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS reliability_scores (
    score_id              VARCHAR(64)  PRIMARY KEY,
    agent_name            VARCHAR(128) NOT NULL,
    workflow_id           VARCHAR(64)  NOT NULL,
    injection_resistance  FLOAT,
    boundary_accuracy     FLOAT,
    sandbagging_score     FLOAT,
    cascade_resilience    FLOAT,
    consistency_score     FLOAT,
    overall_score         FLOAT,
    computed_at           TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS sandbagging_pairs (
    pair_id         VARCHAR(64)  PRIMARY KEY,
    scenario_id     VARCHAR(64)  REFERENCES attack_scenarios(scenario_id),
    agent_name      VARCHAR(128) NOT NULL,
    formal_input    VARIANT      NOT NULL,
    casual_input    VARIANT      NOT NULL,
    formal_output   VARIANT,
    casual_output   VARIANT,
    decision_delta  FLOAT,
    reasoning_delta FLOAT,
    sandbagging_pct FLOAT,
    executed_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
