import type { BackendPayment } from "./paymentsApi";

export type PaymentMethod = "OnlineBankTransfer" | "BankDeposit" | "OnlinePay";
export type PaymentStatus = "Pending" | "Verified" | "Rejected";

export interface Payment {
  id: number;
  applicationId: string;
  userId: string;
  citizenNic?: string;
  citizenName?: string;
  serviceName?: string;
  stageNumber?: number;
  department?: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  submittedAt: string; // ISO timestamp
  paymentCategory?: 'DirectMobile' | 'ApplicationStage';
  isDirectPayment?: boolean;
  stageStatus?: string;
  maxStages?: number;

  // Online Bank Transfer / Bank Deposit details
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  referenceNumber?: string;
  paymentDate?: string; // ISO date
  slipFileName?: string;
  slipUploadedAt?: string;
  manualSlipUrl?: string;

  // Online Pay details
  gatewayName?: string;
  transactionId?: string;
  payerName?: string;
  paidAt?: string;

  // Verification
  verifiedByOfficerName?: string;
  verifiedAt?: string;
  verificationNotes?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  OnlineBankTransfer: "Online Bank Transfer",
  BankDeposit: "Bank Deposit",
  OnlinePay: "Online Pay",
};

// Shapes a backend payment row into the view model the finance pages use
export function mapBackendPayment(b: BackendPayment): Payment {
  const isDirect =
    b.paymentCategory === "DirectMobile" ||
    (b.isDirectPayment === true &&
      (!b.serviceName ||
        b.serviceName === "Department Statutory Fee"));
  const category: "DirectMobile" | "ApplicationStage" = isDirect
    ? "DirectMobile"
    : "ApplicationStage";

  return {
    id: b.id,
    applicationId:
      category === "ApplicationStage"
        ? b.referenceNumber?.startsWith("APP-")
          ? b.referenceNumber
          : `APP-${b.applicationId}`
        : b.referenceNumber || `PAY-${b.id}`,
    userId: b.userEmail || "",
    citizenNic: b.citizenNic || "",
    citizenName: b.citizenName || "",
    serviceName:
      b.serviceName ||
      (category === "ApplicationStage"
        ? "Government Service"
        : "Department Statutory Fee"),
    stageNumber: b.stageNumber || 1,
    maxStages: b.maxStages,
    stageStatus: b.stageStatus,
    paymentCategory: category,
    isDirectPayment: isDirect,
    department: b.department || "",
    method:
      b.method === "Online" || b.method === "OnlinePay"
        ? "OnlinePay"
        : b.method === "Bank Deposit"
          ? "BankDeposit"
          : "OnlineBankTransfer",
    amount: b.amount,
    status:
      b.status === "Paid"
        ? "Verified"
        : b.status === "Failed"
          ? "Rejected"
          : "Pending",
    submittedAt: b.submittedAt || b.createdDate,
    slipFileName:
      b.slipFileName ||
      (b.manualSlipUrl
        ? b.manualSlipUrl.startsWith("data:")
          ? `deposit_slip_${b.referenceNumber || b.id}.${b.manualSlipUrl.includes("pdf") ? "pdf" : "png"}`
          : b.manualSlipUrl.split("/").pop() ||
            "bank_deposit_slip.pdf"
        : "bank_deposit_slip.pdf"),
    slipUploadedAt:
      b.slipUploadedAt || b.submittedAt || b.createdDate,
    manualSlipUrl: b.manualSlipUrl || undefined,
    referenceNumber: b.referenceNumberOrId || b.referenceNumber,
    transactionId: b.referenceNumberOrId || b.referenceNumber,
    paidAt: b.paidDate || undefined,
    verifiedAt: b.paidDate || undefined,
  };
}
