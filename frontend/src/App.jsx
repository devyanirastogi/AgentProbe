import React, { useState } from "react";
import IngestPage from "./pages/IngestPage";
import AttackPage from "./pages/AttackPage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  const [page, setPage] = useState("ingest"); // ingest | attack | dashboard
  const [csvContent, setCsvContent] = useState(null);
  const [agentNames, setAgentNames] = useState([]);
  const [scores, setScores] = useState(null);

  function handleIngested(csv, agents) {
    setCsvContent(csv);
    setAgentNames(agents);
    setPage("attack");
  }

  function handleComplete(completionEvent) {
    setScores(completionEvent);
    setPage("dashboard");
  }

  function handleReset() {
    setCsvContent(null);
    setAgentNames([]);
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
