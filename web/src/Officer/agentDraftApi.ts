import { apiFetch, ApiError } from "../utils/api";

// Mirrors backend AgentDraftView (Agent 2 eligibility + Agent 3 ActionDraftResponse), camelCased.

export interface EligibilityResult {
  isEligible: boolean;
  matchPercentage: number;
  missingCriteria: string[];
  requiredDocuments: string[];
  missingDocuments: string[];
  reasoning: string;
  retrievedContextSnippets: string[];
}

export interface DraftApplication {
  applicationId: number;
  serviceProcedureId: number;
  serviceName: string;
  citizenNic: string;
  citizenName: string;
  citizenAge: number;
  citizenIncome: number;
  formFields: Record<string, string>;
  attachedDocumentNames: string[];
  calculatedFee: number;
  proposedAppointmentDate: string | null;
  draftedAt: string;
}

export interface FeeCalculation {
  currency: string;
  lineItems: { feeType: string; amount: number }[];
  totalAmount: number;
  notes: string[];
}

export interface AppointmentSlot {
  isSlotFound: boolean;
  slotStartUtc: string | null;
  slotEndUtc: string | null;
  localDisplay: string;
  message: string;
}

export interface ToolCall {
  toolName: string;
  input: string;
  output: string;
  calledAt: string;
}

export interface ActionDraft {
  isReadyForValidation: boolean;
  draft: DraftApplication | null;
  fee: FeeCalculation | null;
  appointment: AppointmentSlot | null;
  unfilledRequiredFields: string[];
  blockers: string[];
  notesForOfficer: string[];
  reasoning: string;
  toolCalls: ToolCall[];
  retrievedContextSnippets: string[];
}

export interface ComplianceCheckItem {
  checkType: string;
  isPassed: boolean;
  details: string;
}
export interface ValidationResult {
  isValid: boolean;
  decision: string;
  summary: string;
  riskLevel?: string;
  officerBriefing?: string;
  complianceChecks: ComplianceCheckItem[];
  rejectionReasons: string[];
  toolCalls?: ToolCall[];
  sanitizedFormFields?: Record<string, string>;
}

export interface AgentDraftView {
  applicationId: number;
  generatedAt: string;
  derivedAgeFromNic: number | null;
  eligibility: EligibilityResult;
  action: ActionDraft;
  validation?: ValidationResult | null;
}

export interface VerificationCaseDossier {
  dossierNumber: string;
  applicationId: number;
  citizenNic: string;
  citizenName: string;
  serviceName: string;
  department: string;
  riskScore: number;
  riskTier: string;
  assignedQueueTier: string;
  integritySealHash: string;
  statutoryComplianceSummary: string;
  verifiedChecks: ComplianceCheckItem[];
  flaggedDefects: string[];
  generatedAt: string;
}

export interface DecisionOrderDraft {
  orderType: string;
  orderTitle: string;
  legalStatutoryBasis: string;
  findingsAndEvidence: string;
  termsAndConditions: string[];
  officerSignOffText: string;
  recommendedNextStep: string;
  draftedAt: string;
}

/** Stored draft for the task, or null if the agents haven't run on it yet. */
export async function getAgentDraft(taskId: string | number): Promise<AgentDraftView | null> {
  try {
    return await apiFetch<AgentDraftView>(`/api/Verification/tasks/${taskId}/agent-draft`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Runs Agent 2 → Agent 3 on the application and returns the fresh draft. */
export function generateAgentDraft(taskId: string | number): Promise<AgentDraftView> {
  return apiFetch<AgentDraftView>(`/api/Verification/tasks/${taskId}/agent-draft`, { method: "POST" });
}

/** Agent 4 Action 1: Compiles full Verification Case Dossier & Routing Tier */
export function compileCaseDossier(payload: any): Promise<VerificationCaseDossier> {
  return apiFetch<VerificationCaseDossier>("/api/ValidationAgent/dossier", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/** Agent 4 Action 2: Autonomously drafts official Legal Determination Order */
export function draftDecisionOrder(payload: {
  applicationId: number;
  serviceProcedureId?: number;
  serviceName?: string;
  citizenNic?: string;
  citizenName?: string;
  calculatedFee?: number;
  determinationType: "Approval" | "RevisionRequired" | "Rejection";
  officerNotes?: string;
  attachedDocumentNames?: string[];
}): Promise<DecisionOrderDraft> {
  return apiFetch<DecisionOrderDraft>("/api/ValidationAgent/decision-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
