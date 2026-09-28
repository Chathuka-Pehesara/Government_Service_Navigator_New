import { apiFetch } from "../utils/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  type: string;
  amount: number;
  date: string;
  description: string;
}

export interface PaymentLedger {
  paymentId: number;
  originalAmount: number;
  totalRefunded: number;
  runningBalance: number;
  status: string;
  entries: LedgerEntry[];
}

export interface InstallmentResponse {
  id: number;
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: string; // "Pending" | "PendingVerification" | "Paid" | "Overdue"
  paidDate: string | null;
  paymentMethod?: string | null; // "Online" | "BankTransfer"
  hasReceipt?: boolean;
}

export interface InstallmentPlanResponse {
  id: number;
  paymentId: number;
  numberOfInstallments: number;
  totalAmount: number;
  status: string; // "Active" | "Completed" | "Cancelled"
  installments: InstallmentResponse[];
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface BackendPayment {
  id: number;
  applicationId: number;
  referenceNumber?: string;
  citizenNic?: string;
  citizenName?: string;
  userEmail?: string;
  serviceName?: string;
  stageNumber?: number;
  department?: string;
  amount: number;
  currency?: string;
  method: string;
  status: string;
  paymentCategory?: 'DirectMobile' | 'ApplicationStage';
  isDirectPayment?: boolean;
  stageStatus?: string;
  maxStages?: number;
  manualSlipUrl: string | null;
  slipFileName?: string;
  slipUploadedAt?: string;
  referenceNumberOrId?: string;
  submittedAt?: string;
  createdDate: string;
  paidDate?: string | null;
}

// GET /api/payments/pending-slips (Live Backend)
export function getPendingSlips(): Promise<BackendPayment[]> {
  return apiFetch<BackendPayment[]>("/api/payments/pending-slips");
}

// GET /api/payments/department-payments (Live Backend for all department payments)
export function getDepartmentPayments(): Promise<BackendPayment[]> {
  return apiFetch<BackendPayment[]>("/api/payments/department-payments");
}

// GET /api/payments/{id}/ledger
export function getPaymentLedger(paymentId: number): Promise<PaymentLedger> {
  return apiFetch(`/api/payments/${paymentId}/ledger`);
}

// POST /api/payments/{id}/verify
export function verifyPayment(
  paymentId: number,
  approved: boolean,
  note?: string
): Promise<unknown> {
  return apiFetch(`/api/payments/${paymentId}/verify`, {
    method: "POST",
    body: JSON.stringify({ approved, note: note ?? null }),
  });
}

// PUT /api/payments/{id}/status
export function updatePaymentStatus(
  paymentId: number,
  status: "Paid" | "Failed" | "PendingVerification" | "Verified" | "Rejected" | "Pending",
  note?: string
): Promise<unknown> {
  return apiFetch(`/api/payments/${paymentId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, note: note ?? null }),
  });
}

// ── Installment Plans ─────────────────────────────────────────────────────────

// PUT /api/payments/{id}/installment-plan
export function createInstallmentPlan(
  paymentId: number,
  numberOfInstallments: number,
  intervalDays: number
): Promise<InstallmentPlanResponse> {
  return apiFetch(`/api/payments/${paymentId}/installment-plan`, {
    method: "PUT",
    body: JSON.stringify({ numberOfInstallments, intervalDays }),
  });
}

// GET /api/installment-plans/{id}
export function getInstallmentPlan(
  planId: number
): Promise<InstallmentPlanResponse> {
  return apiFetch(`/api/installment-plans/${planId}`);
}

// POST /api/installment-plans/installments/{installmentId}/pay
export function payInstallment(
  installmentId: number
): Promise<InstallmentResponse> {
  return apiFetch(
    `/api/installment-plans/installments/${installmentId}/pay`,
    { method: "POST" }
  );
}

// POST /api/installment-plans/{id}/cancel
export function cancelInstallmentPlan(
  planId: number
): Promise<InstallmentPlanResponse> {
  return apiFetch(`/api/installment-plans/${planId}/cancel`, {
    method: "POST",
  });
}

// POST /api/installment-plans/installments/{installmentId}/reject-transfer
export function rejectBankTransfer(
  installmentId: number
): Promise<InstallmentResponse> {
  return apiFetch(
    `/api/installment-plans/installments/${installmentId}/reject-transfer`,
    { method: "POST" }
  );
}

// GET /api/installment-plans/installments/{installmentId}/receipt — opens the bank transfer receipt in a new tab.
// Fetched with the auth header (a plain link can't send it), then shown from a blob URL.
export async function openInstallmentReceipt(installmentId: number): Promise<void> {
  const token = localStorage.getItem("officerToken");
  const response = await fetch(
    `http://localhost:5119/api/installment-plans/installments/${installmentId}/receipt`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!response.ok) throw new Error(`Could not load the receipt (HTTP ${response.status}).`);

  const url = URL.createObjectURL(await response.blob());
  window.open(url, "_blank", "noopener");
  // Give the new tab time to load it before releasing the blob
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
