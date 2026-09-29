import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
} from "@carbon/react";
import { Renew, Document, ArrowRight, Checkmark, Warning } from "@carbon/icons-react";
import {
  compileCaseDossier,
  draftDecisionOrder,
  type AgentDraftView,
  type VerificationCaseDossier,
  type DecisionOrderDraft,
} from "./agentDraftApi";

interface Props {
  draft: AgentDraftView | null;
  loading: boolean;
  error: string;
  // Citizen's submitted answers, to flag agent-drafted values that differ
  answers: Record<string, string>;
  onRegenerate: () => void;
  onApplyDecisionOrder?: (decision: string, comments: string, reasonId?: string) => void;
}

const muted = { fontSize: "0.875rem", color: "#525252" } as const;
const sectionTitle = { fontSize: "0.875rem", fontWeight: 600, margin: "1rem 0 0.5rem" } as const;
const fullWidth = { maxWidth: "100%", width: "100%" } as const;

function formatMoney(amount: number, currency = "LKR") {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function AgentDraftPanel({ draft, loading, error, answers, onRegenerate, onApplyDecisionOrder }: Props) {
  const eligibility = draft?.eligibility;
  const action = draft?.action;
  const fields = action?.draft?.formFields ?? {};

  // Agent 4 Active Actions State
  const [dossier, setDossier] = useState<VerificationCaseDossier | null>(null);
  const [isCompilingDossier, setIsCompilingDossier] = useState(false);
  const [decisionOrder, setDecisionOrder] = useState<DecisionOrderDraft | null>(null);
  const [isDraftingOrder, setIsDraftingOrder] = useState(false);
  const [orderTypeDrafted, setOrderTypeDrafted] = useState<string>("");
  const [copiedText, setCopiedText] = useState(false);

  const handleCompileDossier = async () => {
    if (!draft) return;
    setIsCompilingDossier(true);
    try {
      const res = await compileCaseDossier({
        applicationId: draft.applicationId,
        serviceProcedureId: action?.draft?.serviceProcedureId ?? 1,
        serviceName: action?.draft?.serviceName ?? "Government Service",
        citizenNic: action?.draft?.citizenNic ?? "",
        citizenName: action?.draft?.citizenName ?? "",
        citizenAge: action?.draft?.citizenAge ?? draft.derivedAgeFromNic ?? 25,
        calculatedFee: action?.fee?.totalAmount ?? 0,
        attachedDocumentNames: action?.draft?.attachedDocumentNames ?? [],
        requiredDocuments: eligibility?.requiredDocuments ?? []
      });
      setDossier(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCompilingDossier(false);
    }
  };

  const handleDraftOrder = async (type: "Approval" | "RevisionRequired" | "Rejection") => {
    if (!draft) return;
    setIsDraftingOrder(true);
    setOrderTypeDrafted(type);
    try {
      const res = await draftDecisionOrder({
        applicationId: draft.applicationId,
        serviceProcedureId: action?.draft?.serviceProcedureId ?? 1,
        serviceName: action?.draft?.serviceName ?? "Government Service",
        citizenNic: action?.draft?.citizenNic ?? "",
        citizenName: action?.draft?.citizenName ?? "",
        calculatedFee: action?.fee?.totalAmount ?? 0,
        determinationType: type,
        attachedDocumentNames: action?.draft?.attachedDocumentNames ?? []
      });
      setDecisionOrder(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDraftingOrder(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#fff", padding: "1rem", borderLeft: "4px solid #0f62fe", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Statutory Audit & Agent Reasoning Trail</h3>
        <Tag type="blue" style={{ marginLeft: "auto" }}>Compliance Engine</Tag>
        <Button kind="ghost" size="sm" renderIcon={Renew} hasIconOnly iconDescription="Re-run agents" onClick={onRegenerate} disabled={loading} />
      </div>
      {draft && (
        <p style={{ ...muted, marginBottom: "1rem" }}>Generated {new Date(draft.generatedAt).toLocaleString()}</p>
      )}

      {loading && <InlineLoading description="Running Eligibility and Action/Tool agents…" />}
      {error && !loading && (
        <InlineNotification
          kind={draft ? "warning" : "error"}
          title={draft ? "Re-run failed — showing the last saved draft" : "Agent draft unavailable"}
          subtitle={error}
          hideCloseButton
          lowContrast
          style={fullWidth}
        />
      )}

      {eligibility && action && !loading && (
        <Accordion align="start" className="agent-trail">
          {/* Statutory Verification & Compliance Audit */}
          <AccordionItem title="Phase 4: Statutory Verification & Compliance Audit" open>
            {draft?.validation ? (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <Tag type={draft.validation.isValid ? "green" : "red"}>
                    {draft.validation.isValid ? "Safety Checks Passed" : "Safety Check Failed"}
                  </Tag>
                  <Tag type={
                    draft.validation.riskLevel?.toLowerCase() === "low" ? "green" :
                    draft.validation.riskLevel?.toLowerCase() === "medium" ? "warm-gray" :
                    draft.validation.riskLevel?.toLowerCase() === "high" ? "red" : "magenta"
                  }>
                    {draft.validation.riskLevel ? `${draft.validation.riskLevel} Risk` : (draft.validation.isValid ? "Low Risk" : "High Risk / Attention")}
                  </Tag>
                  <Tag type="cool-gray" size="sm">Cognitive Guardrails Active</Tag>
                </div>

                <p style={{ ...muted, marginBottom: "0.75rem" }}>{draft.validation.summary}</p>

                {draft.validation.officerBriefing && (
                  <div style={{
                    backgroundColor: draft.validation.riskLevel?.toLowerCase() === "high" ? "#fff8f8" : "#edf5ff",
                    borderLeft: `4px solid ${draft.validation.riskLevel?.toLowerCase() === "high" ? "#da1e28" : "#0f62fe"}`,
                    padding: "0.875rem 1rem",
                    borderRadius: "4px",
                    marginBottom: "1rem"
                  }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: draft.validation.riskLevel?.toLowerCase() === "high" ? "#da1e28" : "#0043ce", marginBottom: "0.375rem" }}>
                      Officer Safety & Statutory Briefing:
                    </div>
                    <p style={{ fontSize: "0.875rem", color: "#161616", lineHeight: 1.5, whiteSpace: "pre-line", margin: 0 }}>
                      {draft.validation.officerBriefing}
                    </p>
                  </div>
                )}

                {draft.validation.complianceChecks.length > 0 && (
                  <ul style={{ fontSize: "0.875rem", display: "grid", gap: "0.5rem" }}>
                    {draft.validation.complianceChecks.map((check, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.375rem 0.5rem",
                          background: "#f4f4f4",
                          borderRadius: "4px"
                        }}
                      >
                        <span><strong>{check.checkType}:</strong> {check.details}</span>
                        <Tag type={check.isPassed ? "green" : "red"} size="sm">
                          {check.isPassed ? "PASSED" : "FAILED"}
                        </Tag>
                      </li>
                    ))}
                  </ul>
                )}

                {draft.validation.rejectionReasons.length > 0 && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <Tag type="red">Flagged Issues:</Tag>
                    <ul style={{ listStyle: "disc", paddingLeft: "1.25rem", marginTop: "0.25rem", color: "#da1e28" }}>
                      {draft.validation.rejectionReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Agent 4 High-Impact Autonomous Actions */}
                <div style={{
                  marginTop: "1.25rem",
                  padding: "1rem",
                  backgroundColor: "#f4f7fb",
                  border: "1px solid #d0e2ff",
                  borderRadius: "8px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0043ce" }}>
                      Autonomous Verification Directives
                    </span>
                    <Tag type="purple" size="sm">Statutory Actions</Tag>
                  </div>

                  <p style={{ fontSize: "0.8125rem", color: "#525252", marginBottom: "0.75rem" }}>
                    Execute intelligent compliance actions or instruct Agent 4 to draft official statutory orders:
                  </p>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                    <Button
                      size="sm"
                      kind="secondary"
                      renderIcon={Document}
                      onClick={handleCompileDossier}
                      disabled={isCompilingDossier}
                    >
                      {isCompilingDossier ? "Compiling Dossier..." : "Compile Verification Dossier"}
                    </Button>

                    <Button
                      size="sm"
                      kind="primary"
                      renderIcon={Checkmark}
                      onClick={() => handleDraftOrder("Approval")}
                      disabled={isDraftingOrder}
                    >
                      {isDraftingOrder && orderTypeDrafted === "Approval" ? "Drafting..." : "Draft Legal Approval Order"}
                    </Button>

                    <Button
                      size="sm"
                      kind="tertiary"
                      renderIcon={Warning}
                      onClick={() => handleDraftOrder("RevisionRequired")}
                      disabled={isDraftingOrder}
                    >
                      {isDraftingOrder && orderTypeDrafted === "RevisionRequired" ? "Drafting..." : "Draft Revision Order"}
                    </Button>
                  </div>

                  {/* Render Compiled Dossier */}
                  {dossier && (
                    <div style={{
                      backgroundColor: "#fff",
                      border: "1px solid #c6c6c6",
                      borderRadius: "6px",
                      padding: "0.875rem 1rem",
                      marginBottom: "1rem"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#161616" }}>
                          Official Verification Dossier: {dossier.dossierNumber}
                        </span>
                        <Tag type={dossier.riskScore < 30 ? "green" : (dossier.riskScore <= 60 ? "warm-gray" : "red")}>
                          Risk Score: {dossier.riskScore}/100
                        </Tag>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                        <div><strong>Assigned Queue:</strong> {dossier.assignedQueueTier}</div>
                        <div><strong>Audit Status:</strong> {dossier.statutoryComplianceSummary}</div>
                      </div>

                      <div style={{
                        backgroundColor: "#f4f4f4",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                        color: "#393939"
                      }}>
                        Cryptographic Integrity Hash (SHA-256): {dossier.integritySealHash}
                      </div>
                    </div>
                  )}

                  {/* Render Drafted Decision Order */}
                  {decisionOrder && (
                    <div style={{
                      backgroundColor: "#fff",
                      border: "2px solid #0f62fe",
                      borderRadius: "6px",
                      padding: "1rem",
                      marginTop: "0.5rem"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <Tag type={decisionOrder.orderType === "Approval" ? "green" : "red"}>
                          {decisionOrder.orderType.toUpperCase()} ORDER
                        </Tag>
                        <Button
                          size="sm"
                          kind="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${decisionOrder.orderTitle}\n\n${decisionOrder.legalStatutoryBasis}\n\n${decisionOrder.findingsAndEvidence}\n\n${decisionOrder.officerSignOffText}`
                            );
                            setCopiedText(true);
                            setTimeout(() => setCopiedText(false), 2000);
                          }}
                        >
                          {copiedText ? "✓ Copied to Clipboard" : "Copy Legal Order Text"}
                        </Button>
                      </div>

                      <h4 style={{ fontSize: "0.875rem", fontWeight: 700, margin: "0.25rem 0 0.5rem", color: "#0f62fe" }}>
                        {decisionOrder.orderTitle}
                      </h4>

                      <p style={{ fontSize: "0.8125rem", color: "#525252", fontStyle: "italic", marginBottom: "0.5rem" }}>
                        {decisionOrder.legalStatutoryBasis}
                      </p>

                      <p style={{ fontSize: "0.8125rem", color: "#161616", lineHeight: 1.4, marginBottom: "0.5rem" }}>
                        <strong>Findings:</strong> {decisionOrder.findingsAndEvidence}
                      </p>

                      {decisionOrder.termsAndConditions.length > 0 && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Covenants & Conditions:</span>
                          <ul style={{ fontSize: "0.8125rem", listStyle: "disc", paddingLeft: "1.25rem", margin: "0.25rem 0" }}>
                            {decisionOrder.termsAndConditions.map((tc, idx) => (
                              <li key={idx}>{tc}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{
                        backgroundColor: "#edf5ff",
                        padding: "0.75rem",
                        borderRadius: "4px",
                        borderLeft: "3px solid #0043ce",
                        fontSize: "0.8125rem",
                        color: "#161616"
                      }}>
                        <strong>Officer Seal & Sign-Off Directive:</strong>
                        <p style={{ margin: "0.25rem 0 0" }}>{decisionOrder.officerSignOffText}</p>
                      </div>

                      {onApplyDecisionOrder && (
                        <Button
                          size="sm"
                          kind="primary"
                          renderIcon={ArrowRight}
                          style={{ marginTop: "0.75rem", width: "100%" }}
                          onClick={() => {
                            const decType = decisionOrder.orderType === "Approval" 
                              ? "Approved" 
                              : (decisionOrder.orderType === "RevisionRequired" ? "Revision Requested" : "Rejected");
                            const text = `${decisionOrder.orderTitle}\n${decisionOrder.legalStatutoryBasis}\n\nFindings: ${decisionOrder.findingsAndEvidence}\n\n${decisionOrder.officerSignOffText}`;
                            onApplyDecisionOrder(decType, text);
                          }}
                        >
                          Apply Statutory Order to Decision Record
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: "0.5rem 0" }}>
                <p style={{ ...muted, marginBottom: "0.75rem" }}>
                  Safety, duplicate detection, and Groq LLM cognitive audits are ready to execute for this case.
                </p>
                <Button
                  size="sm"
                  kind="primary"
                  onClick={onRegenerate}
                  disabled={loading}
                >
                  {loading ? "Running Statutory Compliance Audit..." : "Run Statutory Compliance & Safety Audit"}
                </Button>
              </div>
            )}
          </AccordionItem>

          {/* Statutory Eligibility Audit */}
          <AccordionItem title="Phase 1: Statutory Eligibility Audit">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Tag type={eligibility.isEligible ? "green" : "red"}>{eligibility.isEligible ? "Eligible" : "Not eligible"}</Tag>
              <Tag type="gray">{eligibility.matchPercentage}% match</Tag>
              {draft?.derivedAgeFromNic != null && <Tag type="cool-gray">Age {draft.derivedAgeFromNic} (from NIC)</Tag>}
            </div>
            {eligibility.missingCriteria.length > 0 && (
              <ul style={{ ...muted, listStyle: "disc", paddingLeft: "1.25rem" }}>
                {eligibility.missingCriteria.map((c) => <li key={c}>⚠ {c}</li>)}
              </ul>
            )}
            {eligibility.requiredDocuments.length > 0 && (
              <>
                <h4 style={sectionTitle}>Required Documents</h4>
                <ul style={{ fontSize: "0.875rem", display: "grid", gap: "0.375rem" }}>
                  {eligibility.requiredDocuments.map((d) => {
                    const unmatched = eligibility.missingDocuments.includes(d);
                    return (
                      <li key={d} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span>{d}</span>
                        <Tag type={unmatched ? "red" : "green"} size="sm" style={{ flexShrink: 0, margin: 0 }}>
                          {unmatched ? "Not matched" : "Uploaded"}
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p style={{ ...muted, marginTop: "0.75rem" }}>{eligibility.reasoning}</p>
          </AccordionItem>

          {/* Draft Application & Fee Calculations */}
          <AccordionItem title="Phase 2: Application Dossier & Fee Drafting (Dispatch Coordinator)">
            {!action.draft ? (
              <p style={muted}>No draft was prepared — see Phase 3 for the reasons.</p>
            ) : (
              <>
                <h4 style={sectionTitle}>Calculated Fee</h4>
                {action.fee && action.fee.lineItems.length > 0 ? (
                  <table style={{ width: "100%", fontSize: "0.875rem" }}>
                    <tbody>
                      {action.fee.lineItems.map((i) => (
                        <tr key={i.feeType}>
                          <td style={{ color: "#525252" }}>{i.feeType}</td>
                          <td style={{ textAlign: "right" }}>{formatMoney(i.amount, action.fee!.currency)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 600, borderTop: "1px solid #e0e0e0" }}>
                        <td>Total</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(action.fee.totalAmount, action.fee.currency)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p style={muted}>No fee in force — free of charge.</p>
                )}

                <h4 style={sectionTitle}>Proposed Appointment</h4>
                {action.appointment?.isSlotFound ? (
                  <>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{action.appointment.localDisplay}</p>
                    <p style={muted}>{action.appointment.message}</p>
                  </>
                ) : (
                  <p style={muted}>{action.appointment?.message ?? "No slot proposed."}</p>
                )}

                <h4 style={sectionTitle}>Pre-filled Form Fields</h4>
                {Object.keys(fields).length > 0 ? (
                  <dl style={{ display: "grid", gridTemplateColumns: "minmax(8rem, 40%) 1fr", gap: "0.5rem 1rem", fontSize: "0.875rem" }}>
                    {Object.entries(fields).map(([label, value]) => {
                      const submitted = answers[label];
                      const differs = submitted !== undefined && submitted.trim() !== value.trim();
                      return (
                        <div key={label} style={{ display: "contents" }}>
                          <dt style={{ color: "#525252" }}>{label}</dt>
                          <dd style={{ fontWeight: 500, wordBreak: "break-word" }}>
                            {value}
                            {differs && (
                              <Tag type="magenta" size="sm" style={{ marginLeft: "0.5rem" }} title={`Citizen entered: ${submitted}`}>
                                Differs from submission
                              </Tag>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : (
                  <p style={muted}>No fields could be pre-filled.</p>
                )}
                {action.unfilledRequiredFields.length > 0 && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    {action.unfilledRequiredFields.map((f) => <Tag key={f} type="red" size="sm">Missing: {f}</Tag>)}
                  </div>
                )}

                <p style={{ ...muted, marginTop: "1rem" }}>{action.reasoning}</p>
              </>
            )}
          </AccordionItem>

          {/* What the officer needs to act on */}
          <AccordionItem title="Phase 3: Officer Attention">
            {action.isReadyForValidation ? (
              <InlineNotification kind="success" title="Draft complete" subtitle="All required fields pre-filled; ready for validation." lowContrast hideCloseButton style={fullWidth} />
            ) : (
              <InlineNotification
                kind="warning"
                title="Manual Review Recommended"
                subtitle={action.blockers.length > 0 ? undefined : "The agent could not complete the draft."}
                lowContrast
                hideCloseButton
                style={fullWidth}
              >
                {action.blockers.length > 0 && (
                  <ul style={{ listStyle: "disc", paddingLeft: "1.25rem", marginTop: "0.25rem" }}>
                    {action.blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
              </InlineNotification>
            )}
            {action.notesForOfficer.length > 0 && (
              <ul style={{ ...muted, listStyle: "disc", paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
                {action.notesForOfficer.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
          </AccordionItem>

          {/* System Tool Execution Traces */}
          {(() => {
            const allToolCalls = [
              ...action.toolCalls.map(t => ({ ...t, agent: "Dispatch Coordinator: Action Tools" })),
              ...(draft?.validation?.toolCalls ?? []).map(t => ({ ...t, agent: "Compliance Officer: Safety Checks" }))
            ];
            return (
              <AccordionItem title={`Tool Execution Traces (${allToolCalls.length})`}>
                {allToolCalls.length === 0 ? (
                  <p style={muted}>No tools were called.</p>
                ) : (
                  allToolCalls.map((t, i) => (
                    <details key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
                      <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <code>{t.toolName}</code>
                        <Tag type={t.agent.includes("Compliance Officer") ? "purple" : "cyan"} size="sm">{t.agent.split(":")[0]}</Tag>
                        <span style={{ color: "#6f6f6f", marginLeft: "auto" }}>· {new Date(t.calledAt).toLocaleTimeString()}</span>
                      </summary>
                      <pre style={{ background: "#f4f4f4", padding: "0.5rem", overflowX: "auto", whiteSpace: "pre-wrap", marginTop: "0.25rem" }}>
                        Input: {prettyJson(t.input)}
                        {"\n"}Output: {prettyJson(t.output)}
                      </pre>
                    </details>
                  ))
                )}
              </AccordionItem>
            );
          })()}
        </Accordion>
      )}
    </div>
  );
}
