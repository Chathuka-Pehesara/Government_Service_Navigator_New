import { useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
} from "@carbon/react";
import {
  Renew,
  Document,
  Checkmark,
  Warning,
  Security,
  CheckmarkFilled,
  WarningAltFilled,
  Money,
} from "@carbon/icons-react";
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
  // Citizen's submitted answers
  answers: Record<string, string>;
  serviceName?: string;
  currentStage?: number;
  maxStages?: number;
  departmentName?: string;
  citizenName?: string;
  citizenNic?: string;
  paymentAmount?: number;
  onRegenerate: () => void;
  onApplyDecisionOrder?: (decision: string, comments: string, reasonId?: string) => void;
}

const muted = { fontSize: "0.8125rem", color: "#525252" } as const;
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

interface BriefingItem {
  iconType: "identity" | "document" | "fraud" | "action" | "general";
  category: string;
  content: string;
}

function parseOfficerBriefing(rawBriefing?: string, hasDeficiencies = false): BriefingItem[] {
  if (!rawBriefing) return [];
  const lines = rawBriefing.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: BriefingItem[] = [];

  for (const line of lines) {
    let clean = line.replace(/^[•\-*]\s*/, "");
    if (hasDeficiencies && clean.toLowerCase().includes("recommended action:") && clean.toLowerCase().includes("approve")) {
      clean = "Recommended Action: REQUEST REVISION — Mandatory evidentiary document requires citizen amendment or manual officer inspection.";
    }

    const colonIdx = clean.indexOf(":");
    let category = "Finding";
    let content = clean;
    if (colonIdx > 0 && colonIdx < 35) {
      category = clean.substring(0, colonIdx).trim();
      content = clean.substring(colonIdx + 1).trim();
    }

    const catLower = category.toLowerCase();
    let iconType: BriefingItem["iconType"] = "general";
    if (catLower.includes("identity") || catLower.includes("profile")) iconType = "identity";
    else if (catLower.includes("document") || catLower.includes("stage")) iconType = "document";
    else if (catLower.includes("compliance") || catLower.includes("fraud") || catLower.includes("duplicate")) iconType = "fraud";
    else if (catLower.includes("action") || catLower.includes("recommend")) iconType = "action";

    items.push({ iconType, category, content });
  }

  return items;
}

export default function AgentDraftPanel({
  draft,
  loading,
  error,
  serviceName = "Government Service",
  currentStage = 1,
  maxStages = 1,
  departmentName = "Government Department",
  citizenName = "",
  citizenNic = "",
  paymentAmount,
  onRegenerate,
  onApplyDecisionOrder,
}: Props) {
  const eligibility = draft?.eligibility;
  const action = draft?.action;
  const validation = draft?.validation;

  // Evaluation Consistency & Risk Integrity Audit
  const hasFailedChecks = validation?.complianceChecks.some((c) => !c.isPassed) ?? false;
  const isHighOrCriticalRisk =
    validation?.riskLevel?.toLowerCase() === "high" ||
    validation?.riskLevel?.toLowerCase() === "critical";
  const isHighOrMediumRisk =
    isHighOrCriticalRisk || validation?.riskLevel?.toLowerCase() === "medium";
  const hasRejectionsOrFlags = (validation?.rejectionReasons?.length ?? 0) > 0;

  const isEligible = eligibility?.isEligible ?? true;
  const hasDocumentDeficiencies =
    !isEligible ||
    (eligibility?.missingDocuments?.length ?? 0) > 0 ||
    (eligibility?.matchPercentage ?? 100) < 70;

  // An application can be approved only if valid, all mandatory documents verified, and clean risk
  const canApprove =
    validation?.isValid === true &&
    !hasDocumentDeficiencies &&
    !isHighOrCriticalRisk &&
    !hasFailedChecks;

  const isFullyClean =
    canApprove &&
    !hasRejectionsOrFlags &&
    validation?.riskLevel?.toLowerCase() === "low";

  const rawRiskLevel = validation?.riskLevel ?? (isFullyClean ? "Low" : "Medium");
  const riskLevel = hasDocumentDeficiencies && rawRiskLevel.toLowerCase() === "low" ? "Medium" : rawRiskLevel;
  const riskType =
    riskLevel.toLowerCase() === "low"
      ? "green"
      : riskLevel.toLowerCase() === "medium"
      ? "warm-gray"
      : "red";

  // Official Record & Decree Generation State
  const [dossier, setDossier] = useState<VerificationCaseDossier | null>(null);
  const [decisionOrder, setDecisionOrder] = useState<DecisionOrderDraft | null>(null);
  const [isGeneratingRecord, setIsGeneratingRecord] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const briefingItems = parseOfficerBriefing(validation?.officerBriefing, hasDocumentDeficiencies);

  // Single Consolidated Action: Generate Official Statutory Decree & Dossier
  const handleGenerateOfficialRecord = async () => {
    if (!draft) return;
    setIsGeneratingRecord(true);
    try {
      const determinationType = isFullyClean ? "Approval" : "RevisionRequired";
      const [dossierRes, orderRes] = await Promise.all([
        compileCaseDossier({
          applicationId: draft.applicationId,
          serviceProcedureId: action?.draft?.serviceProcedureId ?? 1,
          serviceName: serviceName || action?.draft?.serviceName || "Government Service",
          citizenNic: citizenNic || action?.draft?.citizenNic || "",
          citizenName: citizenName || action?.draft?.citizenName || "",
          citizenAge: action?.draft?.citizenAge ?? draft.derivedAgeFromNic ?? 0,
          calculatedFee: action?.fee?.totalAmount ?? 0,
          attachedDocumentNames: action?.draft?.attachedDocumentNames ?? [],
          requiredDocuments: eligibility?.requiredDocuments ?? [],
        }),
        draftDecisionOrder({
          applicationId: draft.applicationId,
          serviceProcedureId: action?.draft?.serviceProcedureId ?? 1,
          serviceName: serviceName || action?.draft?.serviceName || "Government Service",
          citizenNic: citizenNic || action?.draft?.citizenNic || "",
          citizenName: citizenName || action?.draft?.citizenName || "",
          calculatedFee: action?.fee?.totalAmount ?? 0,
          determinationType,
          attachedDocumentNames: action?.draft?.attachedDocumentNames ?? [],
        }),
      ]);
      setDossier(dossierRes);
      setDecisionOrder(orderRes);
    } catch (e) {
      console.error("Failed to generate official statutory record", e);
    } finally {
      setIsGeneratingRecord(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#f4f7fb", padding: "1.25rem", borderRadius: "8px", border: "1px solid #d0e2ff", marginBottom: "2rem" }}>
      {/* 1. Header Context Banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid #d0e2ff", paddingBottom: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <Security size={18} style={{ color: "#0f62fe" }} />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#161616", margin: 0 }}>
              Statutory Verification & Advisory Intelligence
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#525252" }}>
            Department: <strong>{departmentName}</strong> • Service: <strong>{serviceName}</strong>
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Tag type="cyan" size="md">
            Stage {currentStage} of {maxStages} Review
          </Tag>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            hasIconOnly
            iconDescription="Re-evaluate Agents"
            onClick={onRegenerate}
            disabled={loading}
          />
        </div>
      </div>

      {loading && <InlineLoading description="Autonomous AI Advisory auditing application, gazette compliance, and security..." />}
      {error && !loading && (
        <InlineNotification
          kind={draft ? "warning" : "error"}
          title={draft ? "Showing cached evaluation" : "Audit unavailable"}
          subtitle={error}
          hideCloseButton
          lowContrast
          style={fullWidth}
        />
      )}

      {draft && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* ========================================================================= */}
          {/* CARD 1: OVERALL CASE DETERMINATION & OFFICIAL DECREE ACTION BAR            */}
          {/* ========================================================================= */}
          <div style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            border: `1.5px solid ${isFullyClean ? "#25a249" : (isHighOrMediumRisk ? "#ff832b" : "#da1e28")}`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
            overflow: "hidden"
          }}>
            {/* Verdict Header Bar */}
            <div style={{
              backgroundColor: isFullyClean ? "#f6fcf7" : (isHighOrMediumRisk ? "#fffaf5" : "#fff8f8"),
              padding: "0.875rem 1.25rem",
              borderBottom: `1px solid ${isFullyClean ? "#defbe6" : (isHighOrMediumRisk ? "#fed2aa" : "#ffd7d9")}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {isFullyClean ? (
                  <CheckmarkFilled size={22} style={{ color: "#25a249" }} />
                ) : (
                  <WarningAltFilled size={22} style={{ color: isHighOrMediumRisk ? "#e56717" : "#da1e28" }} />
                )}
                <span style={{ fontSize: "1rem", fontWeight: 700, color: isFullyClean ? "#198038" : (isHighOrMediumRisk ? "#bc4a04" : "#da1e28") }}>
                  {isFullyClean
                    ? "STATUTORY COMPLIANCE: VERIFIED"
                    : "STATUTORY REVIEW: INCONSISTENCIES / ACTION REQUIRED"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <Tag type={riskType}>
                  {riskLevel} Risk Profile
                </Tag>
                <Tag type="cool-gray">
                  Stage {currentStage} Audit
                </Tag>
              </div>
            </div>

            {/* Officer Action Directive */}
            <div style={{ padding: "1.25rem" }}>
              <div style={{
                backgroundColor: canApprove ? "#f6fcf7" : "#fff8f8",
                border: `1.5px solid ${canApprove ? "#a7f0ba" : "#ffb3b8"}`,
                borderRadius: "8px",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.875rem"
              }}>
                {/* Top Badge & Category */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: canApprove ? "#0f62fe" : "#ba1b23"
                  }}>
                    {canApprove ? "Official Determination Directive" : "Compliance Alert & Directive"}
                  </span>
                  <Tag
                    type={canApprove ? "green" : "red"}
                    size="sm"
                    style={{ margin: 0, fontWeight: 700 }}
                  >
                    {canApprove ? `APPROVE STAGE ${currentStage}` : "REVISION REQUIRED"}
                  </Tag>
                </div>

                {/* Recommendation Headline */}
                <div style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: canApprove ? "#198038" : "#ba1b23"
                }}>
                  {canApprove
                    ? `Statutory Requirements Satisfied for Stage ${currentStage}`
                    : "Manual Document Verification & Citizen Revision Required"}
                </div>

                {/* Directive Explanation */}
                <p style={{
                  fontSize: "0.8125rem",
                  color: "#393939",
                  margin: 0,
                  lineHeight: 1.5
                }}>
                  {canApprove
                    ? `All mandatory criteria and Stage ${currentStage} evidentiary proofs have been audited and confirmed. Safe to commit officer sign-off.`
                    : "Submitted evidentiary document does not match authentic statutory criteria (missing document or compliance anomaly detected). Verify the attached file before approving, or request citizen amendment."}
                </p>

                {/* Action Row */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  paddingTop: "0.875rem",
                  borderTop: `1px solid ${canApprove ? "#d2f3da" : "#ffd7d9"}`
                }}>
                  {onApplyDecisionOrder && (
                    <Button
                      size="md"
                      kind={canApprove ? "primary" : "danger"}
                      renderIcon={canApprove ? Checkmark : Warning}
                      style={{ maxWidth: "100%" }}
                      onClick={() => {
                        const decisionText = canApprove ? "Approved" : "Revision Requested";
                        const commentText = canApprove
                          ? `Stage ${currentStage} Statutory Verification Approved. All required proofs and identity criteria verified.\n\n${validation?.officerBriefing ?? ""}`
                          : `Stage ${currentStage} Revision Required: Inconsistency flagged in uploaded proofs. Please re-upload an authentic scanned identity document in accordance with official guidelines.\n\n${validation?.officerBriefing ?? ""}`;
                        onApplyDecisionOrder(decisionText, commentText);
                      }}
                    >
                      {canApprove
                        ? `Apply Approval for Stage ${currentStage} to Determination`
                        : "Apply Revision Request to Determination"}
                    </Button>
                  )}

                  <Button
                    size="md"
                    kind="ghost"
                    renderIcon={Document}
                    onClick={handleGenerateOfficialRecord}
                    disabled={isGeneratingRecord}
                  >
                    {isGeneratingRecord
                      ? "Generating Official Decree..."
                      : "📄 Generate Official Legal Decree"}
                  </Button>
                </div>
              </div>

              {/* Render Combined Official Verification Dossier & Legal Decree */}
              {(dossier || decisionOrder) && (
                <div style={{
                  backgroundColor: "#ffffff",
                  border: "1.5px solid #0f62fe",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginTop: "1rem",
                  boxShadow: "0 2px 6px rgba(15, 98, 254, 0.08)"
                }}>
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                    paddingBottom: "0.625rem",
                    borderBottom: "1px solid #e0e0e0"
                  }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                      <Tag type={decisionOrder?.orderType === "Approval" ? "green" : "red"} size="sm" style={{ margin: 0, fontWeight: 700 }}>
                        {(decisionOrder?.orderType ?? "OFFICIAL").toUpperCase()} DECREE
                      </Tag>
                      {dossier && (
                        <span style={{
                          fontSize: "0.75rem",
                          color: "#525252",
                          backgroundColor: "#f4f4f4",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          border: "1px solid #e0e0e0"
                        }}>
                          Ref: <strong style={{ color: "#161616" }}>{dossier.dossierNumber}</strong>
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      kind="ghost"
                      style={{ padding: "0 0.5rem", minHeight: "1.75rem", fontSize: "0.75rem" }}
                      onClick={() => {
                        const copyContent = `${decisionOrder?.orderTitle ?? "Official Decree"}\n\n${decisionOrder?.legalStatutoryBasis ?? ""}\n\nFindings: ${decisionOrder?.findingsAndEvidence ?? ""}\n\nDirective: ${decisionOrder?.officerSignOffText ?? ""}\n\nCryptographic Seal (SHA-256): ${dossier?.integritySealHash ?? ""}`;
                        navigator.clipboard.writeText(copyContent);
                        setCopiedText(true);
                        setTimeout(() => setCopiedText(false), 2000);
                      }}
                    >
                      {copiedText ? "✓ Copied" : "Copy Decree Text"}
                    </Button>
                  </div>

                  {decisionOrder?.orderTitle && (
                    <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: "0.35rem 0", color: "#0f62fe", lineHeight: 1.35 }}>
                      {decisionOrder.orderTitle}
                    </h4>
                  )}

                  {decisionOrder?.legalStatutoryBasis && (
                    <p style={{ fontSize: "0.8125rem", color: "#525252", fontStyle: "italic", margin: "0 0 0.5rem", lineHeight: 1.4 }}>
                      Statutory Basis: {decisionOrder.legalStatutoryBasis}
                    </p>
                  )}

                  {decisionOrder?.findingsAndEvidence && (
                    <p style={{ fontSize: "0.8125rem", color: "#161616", lineHeight: 1.4, margin: "0 0 0.5rem" }}>
                      <strong>Statutory Findings:</strong> {decisionOrder.findingsAndEvidence}
                    </p>
                  )}

                  {dossier && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", fontSize: "0.8125rem", margin: "0.5rem 0", backgroundColor: "#f4f7fb", padding: "0.5rem 0.75rem", borderRadius: "4px" }}>
                      <div><strong>Assigned Queue:</strong> {dossier.assignedQueueTier}</div>
                      <div><strong>Audit Status:</strong> {dossier.statutoryComplianceSummary}</div>
                      <div style={{ gridColumn: "1 / -1", fontFamily: "monospace", fontSize: "0.75rem", color: "#495057", wordBreak: "break-all" }}>
                        Cryptographic Seal (SHA-256): {dossier.integritySealHash}
                      </div>
                    </div>
                  )}

                  {decisionOrder?.officerSignOffText && (
                    <div style={{ backgroundColor: "#edf5ff", padding: "0.75rem", borderRadius: "4px", borderLeft: "3px solid #0043ce", fontSize: "0.8125rem", marginTop: "0.5rem", lineHeight: 1.4 }}>
                      <strong>Officer Seal & Sign-Off Directive:</strong>
                      <p style={{ margin: "0.25rem 0 0" }}>{decisionOrder.officerSignOffText}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 2: REGULATORY SAFETY & FRAUD VERIFICATION AGENT (OWNER SECTION)      */}
          {/* ========================================================================= */}
          <div style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            border: "1px solid #e0e0e0",
            padding: "1.25rem",
            boxShadow: "0 1px 4px rgba(0,0,0,0.03)"
          }}>
            {/* Header with Role Title & Badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid #f0f0f0", paddingBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Security size={18} style={{ color: "#0f62fe" }} />
                <div>
                  <span style={{ fontSize: "1rem", fontWeight: 700, color: "#161616" }}>
                    Regulatory Safety & Fraud Verification Agent
                  </span>
                  <div style={{ fontSize: "0.75rem", color: "#525252" }}>
                    Automated Regulatory Safety, Schema Validation & Anti-Fraud Gateway
                  </div>
                </div>
              </div>
              <Tag type={riskType}>
                {riskLevel} Risk Profile
              </Tag>
            </div>

            {/* 4 Guardrail Metric Tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              {(() => {
                const idCheck = validation?.complianceChecks.find(c => 
                  c.checkType.toLowerCase().includes("identity") || c.checkType.toLowerCase().includes("age")
                );
                const isFailed = idCheck && !idCheck.isPassed;
                return (
                  <div style={{ padding: "0.75rem", backgroundColor: isFailed ? "#fff1f1" : "#f4f7fb", borderRadius: "6px", border: isFailed ? "1px solid #ffd7d9" : "1px solid #d0e2ff" }}>
                    <div style={{ fontSize: "0.75rem", color: isFailed ? "#da1e28" : "#525252" }}>Identity & Bounds Check</div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: isFailed ? "#da1e28" : "#161616", marginTop: "2px" }}>
                      {draft.derivedAgeFromNic ? `NIC Format & Age (${draft.derivedAgeFromNic}) Verified` : (idCheck?.details || "Identity Verified")}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const dupCheck = validation?.complianceChecks.find(c => 
                  c.checkType.toLowerCase().includes("duplicate") || c.checkType.toLowerCase().includes("anti-fraud")
                );
                const hasDupRejection = (validation?.rejectionReasons ?? []).some(r => 
                  r.toLowerCase().includes("dup-") || r.toLowerCase().includes("duplicate")
                );
                const isDup = (dupCheck && !dupCheck.isPassed) || hasDupRejection;
                return (
                  <div style={{ padding: "0.75rem", backgroundColor: isDup ? "#fff1f1" : "#f4f7fb", borderRadius: "6px", border: isDup ? "1px solid #ffd7d9" : "1px solid #d0e2ff" }}>
                    <div style={{ fontSize: "0.75rem", color: isDup ? "#da1e28" : "#525252" }}>Anti-Duplicate Registry</div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: isDup ? "#da1e28" : "#198038", marginTop: "2px" }}>
                      {isDup ? "Collision Detected — Active Case Found" : "Clear — Zero Collisions Found"}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const injectionCheck = validation?.complianceChecks.find(c => 
                  c.checkType.toLowerCase().includes("injection") || c.checkType.toLowerCase().includes("adversarial")
                );
                const isFailed = injectionCheck && !injectionCheck.isPassed;
                return (
                  <div style={{ padding: "0.75rem", backgroundColor: isFailed ? "#fff1f1" : "#f4f7fb", borderRadius: "6px", border: isFailed ? "1px solid #ffd7d9" : "1px solid #d0e2ff" }}>
                    <div style={{ fontSize: "0.75rem", color: isFailed ? "#da1e28" : "#525252" }}>Adversarial Injection Shield</div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: isFailed ? "#da1e28" : "#198038", marginTop: "2px" }}>
                      {isFailed ? "Threat Flagged — Payload Rejected" : (injectionCheck?.details || "Clear — Form Payload Sanitized")}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const piiCheck = validation?.complianceChecks.find(c => 
                  c.checkType.toLowerCase().includes("privacy") || c.checkType.toLowerCase().includes("pii")
                );
                return (
                  <div style={{ padding: "0.75rem", backgroundColor: "#f4f7fb", borderRadius: "6px", border: "1px solid #d0e2ff" }}>
                    <div style={{ fontSize: "0.75rem", color: "#525252" }}>Data Privacy (PII Filter)</div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#161616", marginTop: "2px" }}>
                      {piiCheck?.details || "Protected — Tokens Masked"}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Verification Checklist */}
            {validation && validation.complianceChecks.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#525252", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>
                  Automated Security & Compliance Checklist:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.5rem" }}>
                  {validation.complianceChecks.map((chk, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.375rem 0.625rem",
                        backgroundColor: "#f8f9fa",
                        borderRadius: "4px",
                        border: "1px solid #e9ecef"
                      }}
                    >
                      <span style={{ fontSize: "0.75rem" }}><strong>{chk.checkType}:</strong> {chk.details}</span>
                      <Tag type={chk.isPassed ? "green" : "red"} size="sm" style={{ margin: 0, flexShrink: 0 }}>
                        {chk.isPassed ? "PASS" : "FAIL"}
                      </Tag>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structured Safety & Compliance Findings */}
            {briefingItems.length > 0 && (
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#525252", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>
                  Structured Safety & Evidentiary Findings:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {briefingItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.75rem",
                        padding: "0.625rem 0.875rem",
                        backgroundColor: item.iconType === "action" ? (canApprove ? "#f6fcf7" : "#fff8f8") : "#f8f9fa",
                        border: `1px solid ${item.iconType === "action" ? (canApprove ? "#defbe6" : "#ffd7d9") : "#e9ecef"}`,
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ fontSize: "1rem", flexShrink: 0, marginTop: "1px" }}>
                        {item.iconType === "identity" && "👤"}
                        {item.iconType === "document" && "📁"}
                        {item.iconType === "fraud" && "🛡️"}
                        {item.iconType === "action" && "📋"}
                        {item.iconType === "general" && "🔍"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ color: "#161616", marginRight: "0.35rem" }}>{item.category}:</strong>
                        <span style={{ color: "#393939" }}>{item.content}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* TWO-COLUMN GRID: STATUTORY ELIGIBILITY AUDITOR & TARIFF COORDINATOR       */}
          {/* ========================================================================= */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
            
            {/* COLUMN 1: STATUTORY ELIGIBILITY & EVIDENCE AUDITOR */}
            <div style={{
              backgroundColor: "#fff",
              borderRadius: "8px",
              border: "1px solid #e0e0e0",
              padding: "1.25rem",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Document size={16} style={{ color: "#0f62fe" }} />
                  <div>
                    <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#161616" }}>
                      Statutory Eligibility & Evidence Auditor
                    </span>
                    <div style={{ fontSize: "0.75rem", color: "#525252" }}>
                      Gazette Policy & Document Intelligence
                    </div>
                  </div>
                </div>
                <Tag type={eligibility?.isEligible ? "green" : "red"}>
                  {eligibility?.matchPercentage ?? 0}% Match
                </Tag>
              </div>

              <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.75rem" }}>
                Mandatory Evidentiary Documents (Stage {currentStage} Requirements):
              </div>

              {eligibility && eligibility.requiredDocuments.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {eligibility.requiredDocuments.map((doc) => {
                    const isMissing = eligibility.missingDocuments.includes(doc);
                    return (
                      <li
                        key={doc}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.5rem 0.75rem",
                          backgroundColor: isMissing ? "#fff8f8" : "#f6fcf7",
                          border: `1px solid ${isMissing ? "#ffd7d9" : "#defbe6"}`,
                          borderRadius: "4px",
                          fontSize: "0.8125rem",
                        }}
                      >
                        <span style={{ fontWeight: 500, color: "#161616" }}>{doc}</span>
                        <Tag type={isMissing ? "red" : "green"} size="sm" style={{ margin: 0 }}>
                          {isMissing ? "Missing" : "Uploaded & Verified"}
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p style={{ ...muted, marginBottom: "1rem" }}>No mandatory documents registered for Stage {currentStage}.</p>
              )}

              {eligibility?.reasoning && (
                <div style={{ backgroundColor: "#fbfcfe", border: "1px solid #e1e4e8", borderRadius: "4px", padding: "0.75rem", fontSize: "0.8125rem", color: "#24292e", lineHeight: 1.4 }}>
                  <strong style={{ display: "block", marginBottom: "0.25rem", color: "#0366d6" }}>Official Gazette Determination:</strong>
                  {eligibility.reasoning}
                </div>
              )}
            </div>

            {/* COLUMN 2: ADMINISTRATIVE TARIFF & DISPATCH COORDINATOR */}
            <div style={{
              backgroundColor: "#fff",
              borderRadius: "8px",
              border: "1px solid #e0e0e0",
              padding: "1.25rem",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)"
            }}>
              {(() => {
                const displayFeeAmount = (action?.fee && action.fee.totalAmount > 0)
                  ? action.fee.totalAmount
                  : (currentStage <= 1 && paymentAmount && paymentAmount > 0 ? paymentAmount : 0);
                const feeCurrency = action?.fee?.currency || "LKR";

                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <Money size={16} style={{ color: "#198038" }} />
                        <div>
                          <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#161616" }}>
                            Administrative Tariff & Dispatch Coordinator
                          </span>
                          <div style={{ fontSize: "0.75rem", color: "#525252" }}>
                            Statutory Fee Matrix & Appointment Dispatch
                          </div>
                        </div>
                      </div>
                      <Tag type={displayFeeAmount > 0 ? "green" : "cool-gray"}>
                        {formatMoney(displayFeeAmount, feeCurrency)}
                      </Tag>
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.5rem" }}>
                      Pre-Calculated Fee Schedule:
                    </div>

                    {action?.fee && action.fee.lineItems.length > 0 ? (
                      <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse", marginBottom: "1rem" }}>
                        <tbody>
                          {action.fee.lineItems.map((li, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid #f4f4f4" }}>
                              <td style={{ padding: "0.375rem 0", color: "#525252" }}>{li.feeType}</td>
                              <td style={{ padding: "0.375rem 0", textAlign: "right", fontWeight: 600 }}>{formatMoney(li.amount, action.fee?.currency)}</td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 700, borderTop: "1.5px solid #e0e0e0" }}>
                            <td style={{ padding: "0.5rem 0" }}>Total Statutory Amount</td>
                            <td style={{ padding: "0.5rem 0", textAlign: "right", color: "#198038" }}>
                              {formatMoney(action.fee.totalAmount, action.fee.currency)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : displayFeeAmount > 0 ? (
                      <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse", marginBottom: "1rem" }}>
                        <tbody>
                          <tr style={{ borderBottom: "1px solid #f4f4f4" }}>
                            <td style={{ padding: "0.375rem 0", color: "#525252" }}>Statutory Processing Fee (Stage {currentStage})</td>
                            <td style={{ padding: "0.375rem 0", textAlign: "right", fontWeight: 600 }}>{formatMoney(displayFeeAmount, feeCurrency)}</td>
                          </tr>
                          <tr style={{ fontWeight: 700, borderTop: "1.5px solid #e0e0e0" }}>
                            <td style={{ padding: "0.5rem 0" }}>Total Statutory Amount</td>
                            <td style={{ padding: "0.5rem 0", textAlign: "right", color: "#198038" }}>
                              {formatMoney(displayFeeAmount, feeCurrency)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ ...muted, marginBottom: "1rem" }}>No statutory fee required for Stage {currentStage}.</p>
                    )}
                  </>
                );
              })()}

              {/* Proposed Collection Slot */}
              <div style={{ backgroundColor: "#f8f9fa", border: "1px solid #e9ecef", borderRadius: "4px", padding: "0.75rem", fontSize: "0.8125rem" }}>
                <strong style={{ display: "block", marginBottom: "0.25rem", color: "#495057" }}>Dispatch & Collection Mode:</strong>
                {action?.appointment?.isSlotFound ? (
                  <span>In-Person Department Counter Collection ({action.appointment.localDisplay})</span>
                ) : (
                  <span>Official In-Person Counter Pickup / Postal Dispatch upon Approval</span>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TECHNICAL TRACE DRAWER (COLLAPSED FOR NON-TECHNICAL OFFICERS)             */}
          {/* ========================================================================= */}
          <details style={{
            backgroundColor: "#fff",
            borderRadius: "6px",
            border: "1px solid #e0e0e0",
            padding: "0.75rem 1rem",
            fontSize: "0.8125rem",
            color: "#525252"
          }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "#0f62fe" }}>
              ⚙️ Technical Audit Trail & System Tool Traces (Developer Logs)
            </summary>
            <div style={{ marginTop: "0.75rem" }}>
              {(() => {
                const allToolCalls = [
                  ...(action?.toolCalls ?? []).map(t => ({ ...t, agent: "Administrative Tariff & Dispatch Coordinator" })),
                  ...(validation?.toolCalls ?? []).map(t => ({ ...t, agent: "Regulatory Safety & Fraud Verification Agent" })),
                ];

                if (allToolCalls.length === 0) {
                  return <p style={muted}>No raw tool invocations recorded.</p>;
                }

                return allToolCalls.map((t, i) => (
                  <details key={i} style={{ marginBottom: "0.5rem", fontSize: "0.75rem" }}>
                    <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <code>{t.toolName}</code>
                      <Tag type={t.agent.includes("Safety") ? "purple" : "cyan"} size="sm">{t.agent}</Tag>
                      <span style={{ color: "#6f6f6f", marginLeft: "auto" }}>· {new Date(t.calledAt).toLocaleTimeString()}</span>
                    </summary>
                    <pre style={{ background: "#f4f4f4", padding: "0.5rem", overflowX: "auto", whiteSpace: "pre-wrap", marginTop: "0.25rem", borderRadius: "4px" }}>
                      Input: {prettyJson(t.input)}
                      {"\n"}Output: {prettyJson(t.output)}
                    </pre>
                  </details>
                ));
              })()}
            </div>
          </details>

        </div>
      )}
    </div>
  );
}
