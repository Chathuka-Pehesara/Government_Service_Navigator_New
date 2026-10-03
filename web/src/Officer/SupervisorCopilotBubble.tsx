import { useState, useEffect, useRef } from "react";
import {
  Button,
  TextInput,
  Tag,
  InlineLoading,
  Tooltip,
} from "@carbon/react";
import {
  Close,
  Send,
  Security,
  Document,
  Finance,
  Search,
  CheckmarkFilled,
  WarningAltFilled,
  ChevronDown,
  ChevronUp,
} from "@carbon/icons-react";
import {
  askSupervisorAgent,
  type AgentExecutionTraceItem,
  type SupervisorRecommendation,
} from "./agentDraftApi";

interface Message {
  id: string;
  sender: "officer" | "supervisor";
  content: string;
  trace?: AgentExecutionTraceItem[];
  recommendation?: SupervisorRecommendation;
  followups?: string[];
  timestamp: Date;
}

function renderInlineFormatting(text: string, isOfficer: boolean) {
  // Support <br> or <br/>
  const htmlParts = text.split(/<br\s*\/?>/i);
  return htmlParts.map((htmlPart, hIdx) => {
    // Parse code tokens `code` and bold **bold**
    const parts = htmlPart.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return (
      <span key={hIdx}>
        {hIdx > 0 && <br />}
        {parts.map((part, i) => {
          if (!part) return null;
          if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            return (
              <code
                key={i}
                style={{
                  backgroundColor: isOfficer ? "rgba(255,255,255,0.2)" : "#f1f5f9",
                  color: isOfficer ? "#ffffff" : "#0f172a",
                  padding: "1px 4px",
                  borderRadius: "3px",
                  fontSize: "0.72rem",
                  fontFamily: "monospace",
                  border: isOfficer ? "none" : "1px solid #cbd5e1",
                  margin: "0 1px",
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
              <strong
                key={i}
                style={{
                  fontWeight: 700,
                  color: isOfficer ? "#ffffff" : "#0f172a",
                }}
              >
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  });
}

function renderFormattedMessageContent(content: string, isOfficer: boolean) {
  if (isOfficer) {
    return <div>{content}</div>;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      elements.push(<div key={`empty-${i}`} style={{ height: "4px" }} />);
      i++;
      continue;
    }

    // Dividers: --- or ___
    if (line === "---" || line === "___" || line === "***") {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: "none",
            borderTop: "1px solid #e0e0e0",
            margin: "8px 0",
          }}
        />
      );
      i++;
      continue;
    }

    // Markdown Table Detection: line starts and ends with |
    if (line.startsWith("|") && line.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const rawHeaders = tableLines[0].split("|").slice(1, -1).map(h => h.trim());
        // Skip separator row (second line)
        const startIndex = tableLines[1].replace(/[\s\-\|:]/g, "").length === 0 ? 2 : 1;
        const rawRows = tableLines.slice(startIndex).map(r => r.split("|").slice(1, -1).map(c => c.trim()));

        elements.push(
          <div key={`table-${i}`} style={{ overflowX: "auto", margin: "6px 0", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem", backgroundColor: "#ffffff" }}>
              <thead>
                <tr style={{ backgroundColor: "#f4f4f4", borderBottom: "2px solid #e0e0e0" }}>
                  {rawHeaders.map((h, hi) => (
                    <th key={hi} style={{ padding: "5px 7px", textAlign: "left", fontWeight: 700, color: "#161616", fontSize: "0.7rem" }}>
                      {renderInlineFormatting(h, isOfficer)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: "1px solid #e8e8e8", backgroundColor: ri % 2 === 1 ? "#fafafa" : "#ffffff" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "5px 7px", color: "#393939", verticalAlign: "top", fontSize: "0.72rem", lineHeight: "1.4" }}>
                        {renderInlineFormatting(cell, isOfficer)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Numbered Section Header: 1. Section Title
    const secMatch = line.match(/^(\d+)\.\s+([A-Za-z].*)$/);
    if (secMatch) {
      elements.push(
        <div key={`sec-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", marginBottom: "4px" }}>
          <span style={{ backgroundColor: "#0f62fe", color: "#ffffff", borderRadius: "3px", padding: "1px 5px", fontSize: "0.6875rem", fontWeight: 700 }}>
            § {secMatch[1]}
          </span>
          <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: "#0f172a" }}>
            {secMatch[2]}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // Header 3 or 2: ### Header
    if (line.startsWith("### ") || line.startsWith("## ") || line.startsWith("# ")) {
      const heading = line.replace(/^#+\s*/, "").trim();
      elements.push(
        <div
          key={`heading-${i}`}
          style={{
            fontWeight: 700,
            fontSize: "0.85rem",
            color: "#0f172a",
            marginTop: "8px",
            marginBottom: "3px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span style={{ width: "3px", height: "12px", backgroundColor: "#0f62fe", borderRadius: "2px", display: "inline-block" }} />
          {heading}
        </div>
      );
      i++;
      continue;
    }

    // Bullet Point: - Item or * Item or • Item
    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      const bullet = line.substring(2).trim();
      elements.push(
        <div key={`bullet-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: "6px", margin: "2px 0 2px 4px" }}>
          <span style={{ color: "#0f62fe", fontWeight: 700, fontSize: "0.875rem", lineHeight: "1" }}>•</span>
          <div style={{ flex: 1 }}>{renderInlineFormatting(bullet, isOfficer)}</div>
        </div>
      );
      i++;
      continue;
    }

    // Blockquote or Administrative Callout
    if (line.startsWith("> ") || line.startsWith("*Notice") || line.startsWith("*Administrative")) {
      const text = line.startsWith("> ") ? line.substring(2).trim() : line;
      elements.push(
        <div
          key={`quote-${i}`}
          style={{
            margin: "4px 0",
            padding: "6px 10px",
            backgroundColor: "#f4f4f4",
            borderLeft: "3px solid #0f62fe",
            borderRadius: "0 4px 4px 0",
            fontSize: "0.75rem",
            color: "#393939",
          }}
        >
          {renderInlineFormatting(text, isOfficer)}
        </div>
      );
      i++;
      continue;
    }

    // Standard paragraph
    elements.push(
      <div key={`p-${i}`} style={{ marginBottom: "2px" }}>
        {renderInlineFormatting(line, isOfficer)}
      </div>
    );
    i++;
  }

  return <div style={{ display: "flex", flexDirection: "column" }}>{elements}</div>;
}

interface Props {
  applicationId?: number;
  serviceProcedureId?: number;
  serviceName?: string;
  currentStage?: number;
  maxStages?: number;
  citizenName?: string;
  citizenNic?: string;
  departmentName?: string;
}

export default function SupervisorCopilotBubble({
  applicationId,
  serviceProcedureId,
  serviceName = "Government Service",
  currentStage = 1,
  maxStages = 1,
  citizenName = "",
  citizenNic = "",
  departmentName = "Government Department",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Initial welcome & case audit message when opening
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      handleInitialAudit();
    }
  }, [isOpen]);

  const handleInitialAudit = async () => {
    setLoading(true);
    try {
      const res = await askSupervisorAgent({
        query: `Perform initial statutory compliance, evidentiary verification, and safety audit for this case.`,
        applicationId,
        serviceProcedureId,
        stage: currentStage,
        platformContext: "web",
      });

      setMessages([
        {
          id: "welcome-1",
          sender: "supervisor",
          content: res.answer,
          trace: res.collaborationTrace,
          recommendation: res.recommendation,
          followups: res.suggestedFollowups,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages([
        {
          id: "welcome-err",
          sender: "supervisor",
          content:
            "GovNavigator Statutory Supervisor connected. I am ready to advise on evidentiary audits, statutory fee gazette regulations, and anti-fraud duplicate checks across all 4 autonomous sub-agents.",
          followups: [
            "Audit uploaded documents against gazette rules",
            "Check duplicate submissions in database",
            "Explain statutory fee tariff calculation",
          ],
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (queryToSend?: string) => {
    const q = (queryToSend || input).trim();
    if (!q || loading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "officer",
      content: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.sender === "officer" ? "user" : "assistant",
        content: m.content,
      }));

      const res = await askSupervisorAgent({
        query: q,
        applicationId,
        serviceProcedureId,
        stage: currentStage,
        platformContext: "web",
        history,
      });

      const supMsg: Message = {
        id: `sup-${Date.now()}`,
        sender: "supervisor",
        content: res.answer,
        trace: res.collaborationTrace,
        recommendation: res.recommendation,
        followups: res.suggestedFollowups,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, supMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "supervisor",
          content: `⚠️ Statutory Advisory encountered an error: ${err?.message || "Unable to reach Supervisor Orchestrator."}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── 1. Floating Copilot Trigger Button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backgroundColor: "#002d9c",
            color: "#ffffff",
            border: "2px solid #4589ff",
            borderRadius: "50px",
            padding: "10px 18px",
            boxShadow: "0 8px 24px rgba(0, 45, 156, 0.35)",
            cursor: "pointer",
            transition: "all 0.25s ease-in-out",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-3px)";
            e.currentTarget.style.boxShadow = "0 12px 28px rgba(0, 45, 156, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 45, 156, 0.35)";
          }}
        >
          <div
            style={{
              backgroundColor: "#0f62fe",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Security size={18} style={{ color: "#ffffff" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.2 }}>
              Statutory Copilot
            </div>
            <div style={{ fontSize: "0.6875rem", color: "#a6c8ff" }}>
              4 Agents Supervising
            </div>
          </div>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#42be65",
              boxShadow: "0 0 6px #42be65",
            }}
          />
        </button>
      )}

      {/* ── 2. Expanded Multi-Agent Supervisor Copilot Panel ── */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            width: "480px",
            maxWidth: "calc(100vw - 32px)",
            height: "640px",
            maxHeight: "calc(100vh - 48px)",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.24)",
            border: "1px solid #c6c6c6",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            overflow: "hidden",
            fontFamily: "inherit",
          }}
        >
          {/* Header */}
          <div
            style={{
              backgroundColor: "#002d9c",
              color: "#ffffff",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #001d6c",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  backgroundColor: "#0f62fe",
                  borderRadius: "6px",
                  padding: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Security size={20} style={{ color: "#ffffff" }} />
              </div>
              <div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 700 }}>
                  GovNavigator Statutory Supervisor
                </div>
                <div style={{ fontSize: "0.75rem", color: "#a6c8ff" }}>
                  Autonomous Multi-Agent Regulatory & Compliance Advisory
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
              aria-label="Close Statutory Copilot"
            >
              <Close size={20} />
            </button>
          </div>

          {/* Active Case Context Banner */}
          <div
            style={{
              backgroundColor: "#edf5ff",
              borderBottom: "1px solid #d0e2ff",
              padding: "8px 14px",
              fontSize: "0.75rem",
              color: "#0043ce",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "6px",
            }}
          >
            <div>
              <strong>Case:</strong> {applicationId ? `APP-${applicationId}` : "Unspecified"} •{" "}
              <strong>Stage {currentStage} of {maxStages}</strong> • {serviceName}
              {departmentName ? ` (${departmentName})` : ""}
            </div>
            {citizenNic && (
              <Tag type="blue" size="sm">
                NIC: {citizenNic} {citizenName ? `(${citizenName})` : ""}
              </Tag>
            )}
          </div>

          {/* Multi-Agent Cockpit: Status of all 4 Agents */}
          <div
            style={{
              backgroundColor: "#f4f4f4",
              borderBottom: "1px solid #e0e0e0",
              padding: "8px 12px",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "6px",
              fontSize: "0.6875rem",
            }}
          >
            <Tooltip label="Citizen Intake & Procedure Discovery (Mobile Primary)" align="bottom">
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  border: "1px solid #d0d0d0",
                  textAlign: "center",
                }}
              >
                <Search size={14} style={{ color: "#0f62fe", marginBottom: "2px" }} />
                <div style={{ fontWeight: 600 }}>Agent 1</div>
                <div style={{ color: "#525252", fontSize: "0.625rem" }}>Intake/Plan</div>
              </div>
            </Tooltip>

            <Tooltip label="Statutory Eligibility & Evidentiary Proof Audit (Active)" align="bottom">
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  border: "1px solid #0f62fe",
                  textAlign: "center",
                }}
              >
                <Document size={14} style={{ color: "#0f62fe", marginBottom: "2px" }} />
                <div style={{ fontWeight: 700, color: "#0043ce" }}>Agent 2</div>
                <div style={{ color: "#0043ce", fontSize: "0.625rem" }}>Evidence Audit</div>
              </div>
            </Tooltip>

            <Tooltip label="Administrative Action & Tariff Calculation (Active)" align="bottom">
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  border: "1px solid #0f62fe",
                  textAlign: "center",
                }}
              >
                <Finance size={14} style={{ color: "#0f62fe", marginBottom: "2px" }} />
                <div style={{ fontWeight: 700, color: "#0043ce" }}>Agent 3</div>
                <div style={{ color: "#0043ce", fontSize: "0.625rem" }}>Tariff & Form</div>
              </div>
            </Tooltip>

            <Tooltip label="Regulatory Safety & Anti-Fraud Gateway (Active)" align="bottom">
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  border: "1px solid #0f62fe",
                  textAlign: "center",
                }}
              >
                <Security size={14} style={{ color: "#0f62fe", marginBottom: "2px" }} />
                <div style={{ fontWeight: 700, color: "#0043ce" }}>Agent 4</div>
                <div style={{ color: "#0043ce", fontSize: "0.625rem" }}>Fraud Gateway</div>
              </div>
            </Tooltip>
          </div>

          {/* Conversation Stream */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              backgroundColor: "#f8f9fb",
            }}
          >
            {messages.map((m) => {
              const isOfficer = m.sender === "officer";
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isOfficer ? "flex-end" : "flex-start",
                    maxWidth: "92%",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      color: isOfficer ? "#0f62fe" : "#161616",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {!isOfficer && <Security size={12} style={{ color: "#0f62fe" }} />}
                    {isOfficer ? "Verification Officer" : "GovNavigator Supervisor"}
                  </div>

                  <div
                    style={{
                      backgroundColor: isOfficer ? "#002d9c" : "#ffffff",
                      color: isOfficer ? "#ffffff" : "#161616",
                      padding: "10px 14px",
                      borderRadius: isOfficer ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
                      border: isOfficer ? "none" : "1px solid #e0e0e0",
                      fontSize: "0.8125rem",
                      lineHeight: "1.5",
                    }}
                  >
                    {renderFormattedMessageContent(m.content, isOfficer)}

                    {/* Official Recommendation Badge if present */}
                    {m.recommendation && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          backgroundColor:
                            m.recommendation.actionType === "Approve"
                              ? "#defbe6"
                              : m.recommendation.actionType === "RequestRevision"
                              ? "#fef0c7"
                              : "#fde8e8",
                          border: `1px solid ${
                            m.recommendation.actionType === "Approve"
                              ? "#24a148"
                              : m.recommendation.actionType === "RequestRevision"
                              ? "#f1c21b"
                              : "#da1e28"
                          }`,
                          fontSize: "0.75rem",
                          color: "#161616",
                        }}
                      >
                        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                          {m.recommendation.actionType === "Approve" ? (
                            <CheckmarkFilled size={14} style={{ color: "#24a148" }} />
                          ) : (
                            <WarningAltFilled size={14} style={{ color: "#da1e28" }} />
                          )}
                          Official Recommendation: {m.recommendation.title}
                        </div>
                        <div style={{ marginTop: "2px", color: "#525252" }}>
                          {m.recommendation.rationale}
                        </div>
                      </div>
                    )}

                    {/* Multi-Agent Collaboration Trace Accordion */}
                    {m.trace && m.trace.length > 0 && (
                      <div style={{ marginTop: "10px", borderTop: "1px dashed #d0d0d0", paddingTop: "6px" }}>
                        <button
                          onClick={() => setExpandedTraceId(expandedTraceId === m.id ? null : m.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "2px 0",
                            fontSize: "0.6875rem",
                            color: "#0f62fe",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {expandedTraceId === m.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          Sub-Agent Collaboration Trace ({m.trace.length} actions invoked)
                        </button>

                        {expandedTraceId === m.id && (
                          <div
                            style={{
                              marginTop: "6px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                              backgroundColor: "#f4f7fb",
                              padding: "8px",
                              borderRadius: "6px",
                            }}
                          >
                            {m.trace.map((t, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: "0.6875rem",
                                  backgroundColor: "#ffffff",
                                  padding: "6px 8px",
                                  borderRadius: "4px",
                                  borderLeft: `3px solid ${
                                    t.status === "Completed" ? "#24a148" : "#da1e28"
                                  }`,
                                  border: "1px solid #e0e0e0",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                                  <span>{t.agentName}</span>
                                  <span style={{ color: "#6f6f6f", fontWeight: 400 }}>{t.latencyMs}ms</span>
                                </div>
                                <div style={{ color: "#525252", marginTop: "2px" }}>{t.summary}</div>
                                <div style={{ fontSize: "0.625rem", color: "#8d8d8d", marginTop: "2px" }}>
                                  Action: <code>{t.action}</code> • {t.isDeterministic ? "Deterministic Tool" : "Cognitive LLM"}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contextual Follow-up Quick Action Chips */}
                  {m.followups && m.followups.length > 0 && !isOfficer && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                      {m.followups.map((chip, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(chip)}
                          style={{
                            background: "#ffffff",
                            border: "1px solid #a6c8ff",
                            borderRadius: "14px",
                            padding: "4px 10px",
                            fontSize: "0.6875rem",
                            color: "#0f62fe",
                            cursor: "pointer",
                            transition: "background-color 0.15s ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#edf5ff")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "#ffffff",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                  fontSize: "0.8125rem",
                  color: "#525252",
                  border: "1px solid #e0e0e0",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <InlineLoading description="Supervisor dispatching inquiries across Agent 2, 3, and 4..." />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Bar */}
          <div
            style={{
              padding: "10px 12px",
              backgroundColor: "#ffffff",
              borderTop: "1px solid #e0e0e0",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <TextInput
              id="supervisor-query-input"
              labelText=""
              hideLabel
              placeholder="Ask Supervisor about documents, gazette rules, fees..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
              size="sm"
              style={{ flex: 1 }}
            />
            <Button
              kind="primary"
              size="sm"
              hasIconOnly
              renderIcon={Send}
              iconDescription="Send Inquiry"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
            />
          </div>
        </div>
      )}
    </>
  );
}
