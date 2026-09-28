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

const STORAGE_KEY = "financePayments";

const BANKS = ["Bank of Ceylon", "People's Bank", "Commercial Bank", "Hatton National Bank", "Sampath Bank"];
const GATEWAYS = ["PayHere", "LankaQR / Genie", "VISA/Mastercard Gateway"];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function pad(n: number, len = 4) {
  return n.toString().padStart(len, "0");
}

function buildSeedPayments(): Payment[] {
  const rand = seededRandom(42);
  const now = new Date();
  const payments: Payment[] = [];
  let id = 1;

  // Spread submissions across the last ~14 months so daily/weekly/monthly/yearly
  // ledger views all have real data to show, not just the current bucket.
  for (let daysAgo = 420; daysAgo >= 0; daysAgo -= Math.floor(2 + rand() * 4)) {
    const submitted = new Date(now);
    submitted.setDate(submitted.getDate() - daysAgo);
    submitted.setHours(8 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0);

    const methodRoll = rand();
    const method: PaymentMethod =
      methodRoll < 0.4 ? "OnlineBankTransfer" : methodRoll < 0.7 ? "BankDeposit" : "OnlinePay";

    const statusRoll = rand();
    const status: PaymentStatus = statusRoll < 0.72 ? "Verified" : statusRoll < 0.88 ? "Pending" : "Rejected";

    const amount = [1500, 2500, 3500, 5000, 7500, 10000][Math.floor(rand() * 6)];
    const applicationId = `APP-${submitted.getFullYear()}-${pad(1000 + id * 7)}`;
    const userId = `USR-${pad(4000 + id * 3)}`;

    const isDirect = id % 3 === 0;
    const payment: Payment = {
      id,
      applicationId: isDirect ? `PAY-${submitted.getFullYear()}${pad(1000 + id * 7, 6)}` : applicationId,
      userId,
      citizenNic: `200${pad(id * 13, 9)}`,
      citizenName: `Citizen ${id}`,
      serviceName: isDirect ? "Department Statutory Fee" : "Public Service Procedure",
      stageNumber: isDirect ? 1 : (id % 3) + 1,
      paymentCategory: isDirect ? "DirectMobile" : "ApplicationStage",
      isDirectPayment: isDirect,
      method,
      amount,
      status,
      submittedAt: submitted.toISOString(),
    };

    if (method === "OnlineBankTransfer" || method === "BankDeposit") {
      const paymentDate = new Date(submitted);
      payment.bankName = BANKS[Math.floor(rand() * BANKS.length)];
      payment.branchName = ["Colombo Main", "Kandy City", "Galle Fort", "Kurunegala", "Negombo"][
        Math.floor(rand() * 5)
      ];
      payment.accountNumber = `${100000000 + Math.floor(rand() * 899999999)}`;
      payment.referenceNumber = `${method === "BankDeposit" ? "DEP" : "TRF"}-${submitted.getFullYear()}${pad(
        id,
        5
      )}`;
      payment.paymentDate = paymentDate.toISOString();
      payment.slipFileName = `slip_${payment.referenceNumber}.jpg`;
      payment.slipUploadedAt = submitted.toISOString();
    } else {
      payment.gatewayName = GATEWAYS[Math.floor(rand() * GATEWAYS.length)];
      payment.transactionId = `TXN${submitted.getFullYear()}${pad(id, 6)}`;
      payment.payerName = `Citizen ${pad(id, 3)}`;
      payment.paidAt = submitted.toISOString();
    }

    if (status !== "Pending") {
      const verified = new Date(submitted);
      verified.setDate(verified.getDate() + 1 + Math.floor(rand() * 2));
      if (verified > now) verified.setTime(now.getTime());
      payment.verifiedAt = verified.toISOString();
      payment.verifiedByOfficerName = ["S. Perera", "N. Jayasuriya", "R. Fernando"][Math.floor(rand() * 3)];
      payment.verificationNotes =
        status === "Rejected" ? "Slip amount does not match the invoiced fee." : "Confirmed against bank statement.";
    }

    payments.push(payment);
    id += 1;
  }

  return payments.reverse();
}

export function loadPayments(): Payment[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // fall through to reseed
  }
  const seeded = buildSeedPayments();
  persistPayments(seeded);
  return seeded;
}

export function persistPayments(payments: Payment[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
  } catch {
    // localStorage unavailable (private mode, etc.) - state just won't persist
  }
}

export function verifyPayment(
  id: number,
  decision: Extract<PaymentStatus, "Verified" | "Rejected">,
  notes: string,
  officerName: string
): Payment[] {
  const payments = loadPayments();
  const updated = payments.map((p) =>
    p.id === id
      ? {
          ...p,
          status: decision,
          verifiedAt: new Date().toISOString(),
          verifiedByOfficerName: officerName,
          verificationNotes: notes,
        }
      : p
  );
  persistPayments(updated);
  return updated;
}
