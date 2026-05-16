import React, { useState } from "react";
import IngestPage from "./pages/IngestPage";
import AttackPage from "./pages/AttackPage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  const [page, setPage]               = useState("ingest");
  const [csvContent, setCsvContent]   = useState(null);
  const [agentNames, setAgentNames]   = useState([]);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authHeader, setAuthHeader]   = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [scores, setScores]           = useState(null);

  function handleIngested(csv, agents, url, auth, wfName) {
    setCsvContent(csv);
    setAgentNames(agents);
    setEndpointUrl(url);
    setAuthHeader(auth);
    setWorkflowName(wfName || "");
    setPage("attack");
  }

  function handleComplete(completionEvent) {
    setScores(completionEvent);
    setPage("dashboard");
  }

  function handleReset() {
    setCsvContent(null);
    setAgentNames([]);
    setEndpointUrl("");
    setAuthHeader("");
    setWorkflowName("");
    setScores(null);
    setPage("ingest");
  }

  if (page === "ingest") {
    return <IngestPage onIngested={handleIngested} />;
  }

  if (page === "attack") {
    return (
      <AttackPage
        csvContent={csvContent}
        agentNames={agentNames}
        endpointUrl={endpointUrl}
        authHeader={authHeader}
        workflowName={workflowName}
        onComplete={handleComplete}
        onBack={() => setPage("ingest")}
      />
    );
  }

  return (
    <DashboardPage
      scores={scores}
      agentNames={agentNames}
      onReset={handleReset}
    />
  );
}
