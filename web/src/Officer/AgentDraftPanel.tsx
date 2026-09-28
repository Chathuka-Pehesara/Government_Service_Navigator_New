import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import type { AgentDraftView } from "./agentDraftApi";

interface Props {
  draft: AgentDraftView | null;
  loading: boolean;
  error: string;
  // Citizen's submitted answers, to flag agent-drafted values that differ
  answers: Record<string, string>;
  onRegenerate: () => void;
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

export default function AgentDraftPanel({ draft, loading, error, answers, onRegenerate }: Props) {
  const eligibility = draft?.eligibility;
  const action = draft?.action;
  const fields = action?.draft?.formFields ?? {};

  return (
    <div style={{ backgroundColor: "#fff", padding: "1rem", borderLeft: "4px solid #0f62fe", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Agent Reasoning Trail</h3>
        <Tag type="blue" style={{ marginLeft: "auto" }}>AI Assisted</Tag>
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
          {/* Agent 2 */}
          <AccordionItem title="Phase 1: Eligibility Check" open>
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

          {/* Agent 3 */}
          <AccordionItem title="Phase 2: Draft Application (Action/Tool Agent)" open>
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

          {/* Agent 4: Validation & Safety Agent */}
          <AccordionItem title="Phase 4: Safety & Compliance Audit (Agent 4)" open>
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
                  <Tag type="blue" size="sm">Groq LLM Cognitive Guardrails Active</Tag>
                </div>

                <p style={{ ...muted, marginBottom: "0.75rem" }}>{draft.validation.summary}</p>

                {draft.validation.officerBriefing && (
                  <div style={{
                    backgroundColor: "#edf5ff",
                    borderLeft: "3px solid #0f62fe",
                    padding: "0.75rem 1rem",
                    borderRadius: "4px",
                    marginBottom: "1rem"
                  }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0043ce", marginBottom: "0.375rem" }}>
                      Agent 4 Officer Safety Briefing:
                    </div>
                    <p style={{ fontSize: "0.875rem", color: "#161616", lineHeight: 1.4, whiteSpace: "pre-line", margin: 0 }}>
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
              </>
            ) : (
              <p style={muted}>Safety and duplicate checks pending review generation.</p>
            )}
          </AccordionItem>

          {/* What the officer needs to act on */}
          <AccordionItem title="Phase 3: Officer Attention" open>
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

          {/* Agent Tool Calls */}
          {(() => {
            const allToolCalls = [
              ...action.toolCalls.map(t => ({ ...t, agent: "Agent 3: Action & Tool Agent" })),
              ...(draft?.validation?.toolCalls ?? []).map(t => ({ ...t, agent: "Agent 4: Validation & Safety Agent" }))
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
                        <Tag type={t.agent.includes("Agent 4") ? "purple" : "cyan"} size="sm">{t.agent.split(":")[0]}</Tag>
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
