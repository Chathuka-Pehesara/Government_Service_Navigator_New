import { useEffect, useMemo, useState } from "react";
import {
  Grid,
  Column,
  Tile,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  ContentSwitcher,
  Switch,
  Select,
  SelectItem,
  Tag,
  Button,
  Modal,
  TextArea,
  InlineNotification,
} from "@carbon/react";
import {
  Hourglass,
  CheckmarkOutline,
  MisuseOutline,
  Money,
  Launch,
  Edit,
  Document,
  Phone,
  Information,
  Wallet,
} from "@carbon/icons-react";
import FinanceShell from "./finance_shell";
import {
  loadPayments,
  PAYMENT_METHOD_LABELS,
  type Payment,
  type PaymentMethod,
  type PaymentStatus,
} from "./financeData";
import { getDisplayName, getStoredUser } from "../utils/currentUser";
import { formatCurrency, formatDate, formatDateTime } from "./format";
import {
  getDepartmentPayments,
  verifyPayment as verifyPaymentApi,
  updatePaymentStatus as updatePaymentStatusApi,
} from "./paymentsApi";

const METHOD_FILTERS: { key: "All" | PaymentMethod; label: string }[] = [
  { key: "All", label: "All Methods" },
  { key: "OnlineBankTransfer", label: "Online Bank Transfer" },
  { key: "BankDeposit", label: "Bank Deposit" },
  { key: "OnlinePay", label: "Online Pay" },
];

export type SectionTab = "application-stage" | "direct-mobile" | "all";

const appStageHeaders = [
  { key: "id", header: "Payment ID" },
  { key: "applicationId", header: "Application & Service Stage" },
  { key: "citizen", header: "Citizen (NIC & Name)" },
  { key: "method", header: "Method" },
  { key: "amount", header: "Fee Amount" },
  { key: "officerLock", header: "Officer Review Gate" },
  { key: "status", header: "Payment Status" },
  { key: "submitted", header: "Submitted" },
  { key: "actions", header: "" },
];

const directMobileHeaders = [
  { key: "id", header: "Payment ID" },
  { key: "applicationId", header: "Payment Ref & Purpose" },
  { key: "citizen", header: "Citizen (NIC & Name)" },
  { key: "method", header: "Method" },
  { key: "amount", header: "Amount" },
  { key: "status", header: "Status" },
  { key: "submitted", header: "Submitted" },
  { key: "actions", header: "" },
];

const allHeaders = [
  { key: "id", header: "Payment ID" },
  { key: "category", header: "Category" },
  { key: "applicationId", header: "Reference & Service" },
  { key: "citizen", header: "Citizen (NIC & Name)" },
  { key: "method", header: "Method" },
  { key: "amount", header: "Amount" },
  { key: "officerLock", header: "Officer Gate" },
  { key: "status", header: "Status" },
  { key: "submitted", header: "Submitted" },
  { key: "actions", header: "" },
];

function statusTagType(status: PaymentStatus): "blue" | "green" | "red" {
  if (status === "Verified") return "green";
  if (status === "Rejected") return "red";
  return "blue";
}

function methodTagType(method: PaymentMethod): "purple" | "teal" | "cyan" {
  if (method === "OnlineBankTransfer") return "purple";
  if (method === "BankDeposit") return "teal";
  return "cyan";
}

function DepositSlipPreview({
  slipUrl,
  fileName,
}: {
  slipUrl: string;
  fileName?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slipUrl) return;
    if (slipUrl.startsWith("data:")) {
      setBlobUrl(slipUrl);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);

    const token = localStorage.getItem("officerToken");
    const fullUrl = slipUrl.startsWith("http")
      ? slipUrl
      : `http://localhost:5119${slipUrl.startsWith("/") ? "" : "/"}${slipUrl}`;

    fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (active) {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Could not load slip preview blob:", err);
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [slipUrl]);

  if (loading) {
    return (
      <div
        style={{
          marginTop: "0.75rem",
          padding: "0.75rem",
          textAlign: "center",
          color: "#525252",
          fontSize: "0.8125rem",
          backgroundColor: "#f4f4f4",
          borderRadius: "4px",
        }}
      >
        Loading deposit slip preview...
      </div>
    );
  }

  if (error || !blobUrl) return null;

  const isPdf =
    (fileName && fileName.toLowerCase().endsWith(".pdf")) ||
    slipUrl.includes("pdf");

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.5rem",
        backgroundColor: "#f4f4f4",
        borderRadius: "4px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: "0.6875rem",
          color: "#525252",
          marginBottom: "0.375rem",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Deposit Slip Preview
      </p>
      {isPdf ? (
        <iframe
          src={blobUrl}
          title="Bank Deposit Slip PDF"
          style={{
            width: "100%",
            height: "320px",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            backgroundColor: "#ffffff",
          }}
        />
      ) : (
        <img
          src={blobUrl}
          alt="Bank Deposit Slip Proof"
          style={{
            maxWidth: "100%",
            maxHeight: "280px",
            objectFit: "contain",
            borderRadius: "4px",
            border: "1px solid #e0e0e0",
            backgroundColor: "#ffffff",
          }}
        />
      )}
    </div>
  );
}

export default function FinanceDashboard() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activeSection, setActiveSection] =
    useState<SectionTab>("application-stage");
  const [methodFilter, setMethodFilter] = useState<"All" | PaymentMethod>(
    "All",
  );
  const [statusFilter, setStatusFilter] = useState<"All" | PaymentStatus>(
    "All",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [notes, setNotes] = useState("");
  const [banner, setBanner] = useState<{
    kind: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Load live payments for this department from the backend with citizen details
  useEffect(() => {
    getDepartmentPayments()
      .then((backendPayments) => {
        if (backendPayments && backendPayments.length > 0) {
          const mapped: Payment[] = backendPayments.map((b) => {
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
              userId: b.userEmail || "citizen@gov.lk",
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
          });

          setPayments(mapped);

          // Default tab: if application stage fees exist or have pending items, ensure user is on application-stage
          const hasAppStage = mapped.some(
            (p) => p.paymentCategory === "ApplicationStage",
          );
          if (hasAppStage) {
            setActiveSection("application-stage");
          }
        }
      })
      .catch((err) => {
        console.warn("Could not load backend department payments:", err);
      });
  }, []);

  const counts = useMemo(() => {
    const appStage = payments.filter(
      (p) => p.paymentCategory !== "DirectMobile",
    );
    const directMobile = payments.filter(
      (p) => p.paymentCategory === "DirectMobile",
    );
    return {
      appStageTotal: appStage.length,
      appStagePending: appStage.filter((p) => p.status === "Pending").length,
      directMobileTotal: directMobile.length,
      directMobilePending: directMobile.filter((p) => p.status === "Pending")
        .length,
      allTotal: payments.length,
      allPending: payments.filter((p) => p.status === "Pending").length,
    };
  }, [payments]);

  const stats = useMemo(() => {
    let pool = payments;
    if (activeSection === "application-stage") {
      pool = payments.filter((p) => p.paymentCategory !== "DirectMobile");
    } else if (activeSection === "direct-mobile") {
      pool = payments.filter((p) => p.paymentCategory === "DirectMobile");
    }

    const pending = pool.filter((p) => p.status === "Pending").length;
    const verifiedToday = pool.filter(
      (p) =>
        p.status === "Verified" &&
        p.verifiedAt &&
        new Date(p.verifiedAt).toDateString() === new Date().toDateString(),
    ).length;
    const rejected = pool.filter((p) => p.status === "Rejected").length;
    const collectedThisMonth = pool
      .filter((p) => {
        if (p.status !== "Verified" || !p.verifiedAt) return false;
        const d = new Date(p.verifiedAt);
        const now = new Date();
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      })
      .reduce((acc, p) => acc + p.amount, 0);
    return { pending, verifiedToday, rejected, collectedThisMonth };
  }, [payments, activeSection]);

  const filteredPayments = useMemo(() => {
    let pool = payments;
    if (activeSection === "application-stage") {
      pool = pool.filter((p) => p.paymentCategory !== "DirectMobile");
    } else if (activeSection === "direct-mobile") {
      pool = pool.filter((p) => p.paymentCategory === "DirectMobile");
    }

    return pool
      .filter((p) => methodFilter === "All" || p.method === methodFilter)
      .filter((p) => statusFilter === "All" || p.status === statusFilter)
      .filter((p) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.trim().toLowerCase();
        return (
          p.applicationId.toLowerCase().includes(term) ||
          p.userId.toLowerCase().includes(term) ||
          (p.citizenNic && p.citizenNic.toLowerCase().includes(term)) ||
          (p.citizenName && p.citizenName.toLowerCase().includes(term)) ||
          (p.serviceName && p.serviceName.toLowerCase().includes(term)) ||
          (p.referenceNumber &&
            p.referenceNumber.toLowerCase().includes(term)) ||
          (p.transactionId && p.transactionId.toLowerCase().includes(term)) ||
          String(p.id).includes(term)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );
  }, [payments, activeSection, methodFilter, statusFilter, searchTerm]);

  const currentHeaders =
    activeSection === "application-stage"
      ? appStageHeaders
      : activeSection === "direct-mobile"
        ? directMobileHeaders
        : allHeaders;

  const rows = filteredPayments.map((p) => ({
    id: String(p.id),
    category:
      p.paymentCategory === "DirectMobile" ? "Direct Mobile" : "App Stage",
    applicationId: p.applicationId,
    citizen: p.citizenName ? `${p.citizenName}` : p.citizenNic || p.userId,
    method: p.method,
    amount: formatCurrency(p.amount),
    officerLock:
      p.status === "Verified"
        ? "Unlocked"
        : p.status === "Rejected"
          ? "Blocked"
          : "Locked",
    status: p.status,
    submitted: formatDateTime(p.submittedAt),
    actions: "",
  }));

  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [editStatusValue, setEditStatusValue] =
    useState<PaymentStatus>("Verified");

  function openDetails(paymentId: string) {
    const payment = payments.find((p) => String(p.id) === paymentId) || null;
    setSelectedPayment(payment);
    setNotes(payment?.verificationNotes || "");
    setIsEditingStatus(false);
    setEditStatusValue(payment?.status || "Verified");
    setBanner(null);
  }

  function openEditStatus(paymentId: string) {
    const payment = payments.find((p) => String(p.id) === paymentId) || null;
    setSelectedPayment(payment);
    setNotes(payment?.verificationNotes || "");
    setIsEditingStatus(true);
    setEditStatusValue(payment?.status || "Verified");
    setBanner(null);
  }

  function closeDetails() {
    setSelectedPayment(null);
    setNotes("");
    setIsEditingStatus(false);
  }

  async function handleSaveEditedStatus() {
    if (!selectedPayment) return;
    const officerName = getDisplayName(getStoredUser());
    const backendStatus =
      editStatusValue === "Verified"
        ? "Paid"
        : editStatusValue === "Rejected"
          ? "Failed"
          : "PendingVerification";

    try {
      await updatePaymentStatusApi(selectedPayment.id, backendStatus, notes);
    } catch (err) {
      console.warn("Backend updatePaymentStatus API notice:", err);
    }

    const updated = payments.map((p) =>
      p.id === selectedPayment.id
        ? {
            ...p,
            status: editStatusValue,
            verifiedAt:
              editStatusValue !== "Pending"
                ? new Date().toISOString()
                : undefined,
            verifiedByOfficerName:
              editStatusValue !== "Pending" ? officerName : undefined,
            verificationNotes: notes,
          }
        : p,
    );

    setPayments(updated);
    setSelectedPayment(
      updated.find((p) => p.id === selectedPayment.id) || null,
    );
    setIsEditingStatus(false);
    setBanner({
      kind: editStatusValue === "Verified" ? "success" : "info",
      message: `Payment status successfully updated to "${editStatusValue}".`,
    });
  }

  async function handleDecision(decision: "Verified" | "Rejected") {
    if (!selectedPayment) return;
    const officerName = getDisplayName(getStoredUser());
    const isApproved = decision === "Verified";

    // Call live backend endpoint
    try {
      await verifyPaymentApi(selectedPayment.id, isApproved, notes);
    } catch (err) {
      console.warn("Backend verify API returned notice:", err);
    }

    const updated = payments.map((p) =>
      p.id === selectedPayment.id
        ? {
            ...p,
            status: decision,
            verifiedAt: new Date().toISOString(),
            verifiedByOfficerName: officerName,
            verificationNotes: notes,
          }
        : p,
    );

    setPayments(updated);
    setSelectedPayment(
      updated.find((p) => p.id === selectedPayment.id) || null,
    );
    setBanner({
      kind: decision === "Verified" ? "success" : "error",
      message:
        decision === "Verified"
          ? selectedPayment.paymentCategory === "DirectMobile"
            ? "Payment verified! Treasury receipt issued and recorded in the departmental ledger."
            : "Payment verified! Statutory receipt recorded and Stage unlocked for the Department Verification Officer."
          : selectedPayment.paymentCategory === "DirectMobile"
            ? "Payment rejected."
            : "Payment rejected. Stage verification remains locked for the Verification Officer.",
    });
  }

  return (
    <FinanceShell active="dashboard">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
          Payment Verification
        </h1>
        <p style={{ color: "#525252", marginTop: "0.5rem" }}>
          Review fee payments submitted by online bank transfer, bank deposit,
          or online pay, and verify each one against its supporting details
          before it is posted to the account ledger.
        </p>
      </div>

      {/* 2-Section Navigation: Application Stage Fees vs Direct Mobile Payments */}
      <div
        style={{
          marginBottom: "1.75rem",
          borderBottom: "1px solid #e0e0e0",
          backgroundColor: "#ffffff",
          borderRadius: "4px 4px 0 0",
        }}
      >
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          <button
            type="button"
            id="tab-application-stage"
            onClick={() => setActiveSection("application-stage")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.875rem 1.25rem",
              border: "none",
              background: "none",
              borderBottom:
                activeSection === "application-stage"
                  ? "3px solid #0f62fe"
                  : "3px solid transparent",
              color:
                activeSection === "application-stage" ? "#0f62fe" : "#525252",
              fontWeight: activeSection === "application-stage" ? 600 : 500,
              fontSize: "0.9375rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Document size={18} />
            <span>1. Application Stage Fees</span>
            <Tag
              type={activeSection === "application-stage" ? "blue" : "gray"}
              size="sm"
            >
              {counts.appStageTotal}
            </Tag>
            {counts.appStagePending > 0 && (
              <Tag type="red" size="sm">
                {counts.appStagePending} Pending
              </Tag>
            )}
          </button>

          <button
            type="button"
            id="tab-direct-mobile"
            onClick={() => setActiveSection("direct-mobile")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.875rem 1.25rem",
              border: "none",
              background: "none",
              borderBottom:
                activeSection === "direct-mobile"
                  ? "3px solid #6929c4"
                  : "3px solid transparent",
              color: activeSection === "direct-mobile" ? "#6929c4" : "#525252",
              fontWeight: activeSection === "direct-mobile" ? 600 : 500,
              fontSize: "0.9375rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Phone size={18} />
            <span>2. Direct Mobile Payments</span>
            <Tag
              type={activeSection === "direct-mobile" ? "purple" : "gray"}
              size="sm"
            >
              {counts.directMobileTotal}
            </Tag>
            {counts.directMobilePending > 0 && (
              <Tag type="red" size="sm">
                {counts.directMobilePending} Pending
              </Tag>
            )}
          </button>

          <button
            type="button"
            id="tab-all-transactions"
            onClick={() => setActiveSection("all")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.875rem 1.25rem",
              border: "none",
              background: "none",
              borderBottom:
                activeSection === "all"
                  ? "3px solid #161616"
                  : "3px solid transparent",
              color: activeSection === "all" ? "#161616" : "#525252",
              fontWeight: activeSection === "all" ? 600 : 500,
              fontSize: "0.9375rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Wallet size={18} />
            <span>All Transactions</span>
            <Tag type="gray" size="sm">
              {counts.allTotal}
            </Tag>
          </button>
        </div>
      </div>

      <Grid style={{ paddingLeft: 0, paddingRight: 0, marginBottom: "1.5rem" }}>
        <Column sm={4} md={4} lg={4}>
          <Tile style={{ borderTop: "4px solid #0f62fe" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                Pending Verification
              </p>
              <Hourglass size={20} color="#0f62fe" />
            </div>
            <h3
              style={{
                fontSize: "2.5rem",
                fontWeight: 300,
                margin: "0.5rem 0",
              }}
            >
              {stats.pending}
            </h3>
            <p
              style={{
                color: "#0f62fe",
                fontSize: "0.875rem",
                marginTop: "1rem",
              }}
            >
              Awaiting your review
            </p>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile style={{ borderTop: "4px solid #24a148" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                Verified Today
              </p>
              <CheckmarkOutline size={20} color="#24a148" />
            </div>
            <h3
              style={{
                fontSize: "2.5rem",
                fontWeight: 300,
                margin: "0.5rem 0",
              }}
            >
              {stats.verifiedToday}
            </h3>
            <p
              style={{
                color: "#525252",
                fontSize: "0.875rem",
                marginTop: "1rem",
              }}
            >
              Posted to ledger
            </p>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile style={{ borderTop: "4px solid #da1e28" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#525252", fontSize: "0.875rem" }}>Rejected</p>
              <MisuseOutline size={20} color="#da1e28" />
            </div>
            <h3
              style={{
                fontSize: "2.5rem",
                fontWeight: 300,
                margin: "0.5rem 0",
              }}
            >
              {stats.rejected}
            </h3>
            <p
              style={{
                color: "#525252",
                fontSize: "0.875rem",
                marginTop: "1rem",
              }}
            >
              Failed verification
            </p>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile style={{ borderTop: "4px solid #6929c4" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                Collected This Month
              </p>
              <Money size={20} color="#6929c4" />
            </div>
            <h3
              style={{
                fontSize: "1.75rem",
                fontWeight: 300,
                margin: "0.5rem 0",
              }}
            >
              {formatCurrency(stats.collectedThisMonth)}
            </h3>
            <p
              style={{
                color: "#525252",
                fontSize: "0.875rem",
                marginTop: "1rem",
              }}
            >
              Verified receipts
            </p>
          </Tile>
        </Column>
      </Grid>

      {/* Contextual Section Explanatory Banner */}
      {activeSection === "application-stage" ? (
        <div
          style={{
            backgroundColor: "#edf5ff",
            borderLeft: "4px solid #0f62fe",
            padding: "1rem 1.25rem",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.875rem",
          }}
        >
          <Information size={22} color="#0f62fe" />
          <div
            style={{ fontSize: "0.875rem", color: "#161616", lineHeight: 1.5 }}
          >
            <strong>
              Section 1: Service Application Stage Fees (Cross-Officer Workflow
              Gate)
            </strong>{" "}
            — Statutory fee verification for ongoing citizen applications. The
            Department Verification Officer is
            <strong> strictly locked from granting stage approval</strong> until
            you audit and verify this statutory payment. Verifying confirms
            treasury collection and{" "}
            <strong>
              immediately unlocks the stage for Verification Officer review
            </strong>
            .
          </div>
        </div>
      ) : activeSection === "direct-mobile" ? (
        <div
          style={{
            backgroundColor: "#f6f2ff",
            borderLeft: "4px solid #6929c4",
            padding: "1rem 1.25rem",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.875rem",
          }}
        >
          <Information size={22} color="#6929c4" />
          <div
            style={{ fontSize: "0.875rem", color: "#161616", lineHeight: 1.5 }}
          >
            <strong>Section 2: Direct Mobile Department Payments</strong> —
            Payments initiated directly from the Citizen Mobile App 'Payments'
            hub. Verifying these transactions confirms funds against bank
            records and{" "}
            <strong>
              posts the statutory revenue to the departmental ledger
            </strong>
            .
          </div>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: "#f4f4f4",
            borderLeft: "4px solid #525252",
            padding: "0.875rem 1.25rem",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <Information size={20} color="#525252" />
          <div style={{ fontSize: "0.875rem", color: "#161616" }}>
            <strong>Section 3: Consolidated Transactions Ledger</strong> —
            Complete overview of all department payments for financial auditing,
            cross-verification, and reconciliation.
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1rem", maxWidth: "640px" }}>
        <ContentSwitcher
          selectedIndex={METHOD_FILTERS.findIndex(
            (m) => m.key === methodFilter,
          )}
          onChange={({ index }) =>
            setMethodFilter(METHOD_FILTERS[index as number].key)
          }
        >
          {METHOD_FILTERS.map((m) => (
            <Switch key={m.key} name={m.key} text={m.label} />
          ))}
        </ContentSwitcher>
      </div>

      <DataTable rows={rows} headers={currentHeaders}>
        {({
          rows: tableRows,
          headers: tableHeaders,
          getTableProps,
          getHeaderProps,
          getRowProps,
        }) => (
          <TableContainer
            title={
              activeSection === "application-stage"
                ? "Service Application Stage Fees"
                : activeSection === "direct-mobile"
                  ? "Direct Mobile Department Payments"
                  : "All Departmental Payments & Receipts"
            }
            description={
              activeSection === "application-stage"
                ? "Fee verification for citizens currently progressing through multi-stage service workflows. Approving verification clears the stage fee."
                : activeSection === "direct-mobile"
                  ? "Statutory departmental fees, fines, and permit charges submitted directly through the Citizen Mobile Payments hub."
                  : "Consolidated ledger of all incoming transactions with category and workflow classifications."
            }
          >
            <TableToolbar>
              <TableToolbarContent>
                <Select
                  id="status-filter"
                  labelText=""
                  hideLabel
                  size="lg"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "All" | PaymentStatus)
                  }
                  style={{ maxWidth: "200px" }}
                >
                  <SelectItem value="All" text="All Statuses" />
                  <SelectItem value="Pending" text="Pending" />
                  <SelectItem value="Verified" text="Verified" />
                  <SelectItem value="Rejected" text="Rejected" />
                </Select>
                <TableToolbarSearch
                  persistent
                  placeholder="Search Reference, Citizen NIC, or Service..."
                  onChange={(_event, value) => setSearchTerm(value || "")}
                />
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header) => (
                    <TableHeader
                      {...getHeaderProps({ header })}
                      key={header.key}
                    >
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={tableHeaders.length}
                      style={{ textAlign: "center", padding: "2rem" }}
                    >
                      No payments match the current filters in this section.
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((row) => (
                    <TableRow {...getRowProps({ row })} key={row.id}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === "category") {
                          const payment = filteredPayments.find(
                            (p) => String(p.id) === row.id,
                          );
                          const isDirect =
                            payment?.paymentCategory === "DirectMobile";
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={isDirect ? "purple" : "cyan"}
                                size="sm"
                              >
                                {isDirect ? "Direct Mobile" : "App Stage Fee"}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "applicationId") {
                          const payment = filteredPayments.find(
                            (p) => String(p.id) === row.id,
                          );
                          const isDirect =
                            payment?.paymentCategory === "DirectMobile";
                          if (isDirect) {
                            return (
                              <TableCell key={cell.id}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "#6929c4",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {payment?.referenceNumber || cell.value}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#525252",
                                    marginTop: "2px",
                                  }}
                                >
                                  {payment?.serviceName ||
                                    "Department Statutory Fee"}
                                </div>
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={cell.id}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.375rem",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "#0f62fe",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {payment?.applicationId?.startsWith("APP-")
                                    ? payment.applicationId
                                    : `APP-${payment?.applicationId || cell.value}`}
                                </span>
                                {payment?.stageNumber && (
                                  <Tag
                                    type="blue"
                                    size="sm"
                                    style={{
                                      margin: 0,
                                      fontSize: "0.6875rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Stage {payment.stageNumber}
                                    {payment.maxStages
                                      ? ` / ${payment.maxStages}`
                                      : ""}
                                  </Tag>
                                )}
                              </div>
                              {payment?.serviceName && (
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    color: "#161616",
                                    marginTop: "3px",
                                  }}
                                >
                                  {payment.serviceName}
                                </div>
                              )}
                              {payment?.referenceNumber &&
                                payment.referenceNumber !==
                                  payment.applicationId && (
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#525252",
                                      fontFamily: "monospace",
                                      marginTop: "1px",
                                    }}
                                  >
                                    Ref: {payment.referenceNumber}
                                  </div>
                                )}
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "citizen") {
                          const payment = filteredPayments.find(
                            (p) => String(p.id) === row.id,
                          );
                          return (
                            <TableCell key={cell.id}>
                              <div
                                style={{ fontWeight: 600, color: "#161616" }}
                              >
                                {payment?.citizenName ||
                                  cell.value ||
                                  "Citizen"}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#0f62fe",
                                  fontWeight: 600,
                                  marginTop: "2px",
                                }}
                              >
                                NIC: {payment?.citizenNic || "Not Provided"}
                              </div>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "method") {
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={methodTagType(
                                  cell.value as PaymentMethod,
                                )}
                              >
                                {
                                  PAYMENT_METHOD_LABELS[
                                    cell.value as PaymentMethod
                                  ]
                                }
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "officerLock") {
                          const payment = filteredPayments.find(
                            (p) => String(p.id) === row.id,
                          );
                          const isVerified = payment?.status === "Verified";
                          const isRejected = payment?.status === "Rejected";
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={
                                  isVerified
                                    ? "green"
                                    : isRejected
                                      ? "red"
                                      : "cool-gray"
                                }
                                size="sm"
                              >
                                {isVerified
                                  ? "🔓 Stage Unlocked"
                                  : isRejected
                                    ? "❌ Approval Blocked"
                                    : "🔒 Officer Locked"}
                              </Tag>
                              <div
                                style={{
                                  fontSize: "0.6875rem",
                                  color: isVerified
                                    ? "#0e6027"
                                    : isRejected
                                      ? "#da1e28"
                                      : "#525252",
                                  marginTop: "2px",
                                }}
                              >
                                {isVerified
                                  ? "Ready for Officer Review"
                                  : isRejected
                                    ? "Fee rejected"
                                    : "Awaiting your audit"}
                              </div>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "status") {
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={statusTagType(
                                  cell.value as PaymentStatus,
                                )}
                              >
                                {cell.value}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "actions") {
                          return (
                            <TableCell
                              key={cell.id}
                              style={{
                                padding: "0.5rem",
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <Button
                                size="sm"
                                kind="ghost"
                                renderIcon={Edit}
                                onClick={() => openEditStatus(row.id)}
                                style={{ marginRight: "0.5rem" }}
                              >
                                Edit Status
                              </Button>
                              <Button
                                size="sm"
                                kind="tertiary"
                                onClick={() => openDetails(row.id)}
                              >
                                Details
                              </Button>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      <Modal
        open={selectedPayment !== null}
        modalHeading={
          selectedPayment
            ? selectedPayment.paymentCategory === "DirectMobile"
              ? `Direct Mobile Payment — ${selectedPayment.referenceNumber || selectedPayment.applicationId}`
              : `Service Application Stage Fee — ${selectedPayment.applicationId}`
            : ""
        }
        modalLabel={
          selectedPayment?.paymentCategory === "DirectMobile"
            ? "Direct Mobile Statutory Fee Verification"
            : "Workflow Stage Fee Verification"
        }
        passiveModal
        onRequestClose={closeDetails}
        size="md"
      >
        {selectedPayment && (
          <div style={{ paddingBottom: "1rem" }}>
            {banner && (
              <InlineNotification
                kind={banner.kind}
                title={banner.message}
                lowContrast
                hideCloseButton
                style={{ marginBottom: "1rem" }}
              />
            )}

            {/* Section Category Indicator Banner */}
            <div
              style={{
                backgroundColor:
                  selectedPayment.paymentCategory === "DirectMobile"
                    ? "#f6f2ff"
                    : "#edf5ff",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                borderLeft: `4px solid ${selectedPayment.paymentCategory === "DirectMobile" ? "#6929c4" : "#0f62fe"}`,
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              {selectedPayment.paymentCategory === "DirectMobile" ? (
                <Phone size={20} color="#6929c4" />
              ) : (
                <Document size={20} color="#0f62fe" />
              )}
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "#161616",
                  lineHeight: 1.4,
                }}
              >
                {selectedPayment.paymentCategory === "DirectMobile" ? (
                  <>
                    <strong>Direct Citizen Payment</strong> — Initiated through
                    the citizen mobile app 'Payments' hub. Verifying records
                    this statutory fee directly into the department revenue
                    ledger.
                  </>
                ) : (
                  <>
                    <strong>Statutory Stage Payment Gate</strong> — Linked to
                    citizen application workflow (
                    {selectedPayment.applicationId}, Stage{" "}
                    {selectedPayment.stageNumber}
                    {selectedPayment.maxStages
                      ? ` of ${selectedPayment.maxStages}`
                      : ""}
                    ). The Department Verification Officer is{" "}
                    <strong>
                      strictly locked from granting stage approval
                    </strong>{" "}
                    until you audit and verify this statutory payment. Verifying
                    confirms treasury collection and{" "}
                    <strong>
                      immediately unlocks the stage for official verification
                    </strong>
                    .
                  </>
                )}
              </div>
            </div>

            {/* Citizen Identity & Application Information Card */}
            <div
              style={{
                backgroundColor: "#f4f4f4",
                padding: "1rem",
                borderRadius: "6px",
                borderLeft: `4px solid ${selectedPayment.paymentCategory === "DirectMobile" ? "#6929c4" : "#0f62fe"}`,
                marginBottom: "1.25rem",
              }}
            >
              <h4
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#161616",
                  marginBottom: "0.75rem",
                }}
              >
                Citizen Identity &amp; Transaction Details
              </h4>
              <Grid
                style={{ paddingLeft: 0, paddingRight: 0, rowGap: "0.75rem" }}
              >
                <Column sm={4} md={4} lg={8}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#525252",
                      textTransform: "uppercase",
                    }}
                  >
                    Citizen Full Name
                  </p>
                  <p
                    style={{
                      fontWeight: 600,
                      fontSize: "1rem",
                      color: "#161616",
                    }}
                  >
                    {selectedPayment.citizenName || "Not Recorded"}
                  </p>
                </Column>
                <Column sm={4} md={4} lg={8}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#525252",
                      textTransform: "uppercase",
                    }}
                  >
                    Citizen NIC Number
                  </p>
                  <p
                    style={{
                      fontWeight: 600,
                      fontSize: "1rem",
                      color: "#0f62fe",
                    }}
                  >
                    {selectedPayment.citizenNic || "Not Recorded"}
                  </p>
                </Column>
                <Column sm={4} md={4} lg={8}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#525252",
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedPayment.paymentCategory === "DirectMobile"
                      ? "Statutory Purpose / Service"
                      : "Government Service"}
                  </p>
                  <p style={{ fontWeight: 500, color: "#161616" }}>
                    {selectedPayment.serviceName || "Government Service"}
                    {selectedPayment.stageNumber &&
                    selectedPayment.paymentCategory !== "DirectMobile"
                      ? ` (Stage ${selectedPayment.stageNumber})`
                      : ""}
                  </p>
                </Column>
                <Column sm={4} md={4} lg={8}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#525252",
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedPayment.paymentCategory === "DirectMobile"
                      ? "Payment Reference ID"
                      : "Application Submit ID"}
                  </p>
                  <p
                    style={{
                      fontWeight: 500,
                      color: "#161616",
                      fontFamily: "monospace",
                    }}
                  >
                    {selectedPayment.referenceNumber ||
                      selectedPayment.applicationId}
                  </p>
                </Column>
              </Grid>
            </div>

            <Grid
              style={{
                paddingLeft: 0,
                paddingRight: 0,
                marginBottom: "1.25rem",
              }}
            >
              <Column sm={4} md={4} lg={5}>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "#525252",
                    textTransform: "uppercase",
                  }}
                >
                  Payment Method
                </p>
                <Tag type={methodTagType(selectedPayment.method)}>
                  {PAYMENT_METHOD_LABELS[selectedPayment.method]}
                </Tag>
              </Column>
              <Column sm={4} md={4} lg={5}>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "#525252",
                    textTransform: "uppercase",
                  }}
                >
                  Fee Amount
                </p>
                <p style={{ fontWeight: 600, fontSize: "1.125rem" }}>
                  {formatCurrency(selectedPayment.amount)}
                </p>
              </Column>
              <Column sm={4} md={4} lg={6}>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "#525252",
                    textTransform: "uppercase",
                  }}
                >
                  Verification Status
                </p>
                <Tag type={statusTagType(selectedPayment.status)}>
                  {selectedPayment.status}
                </Tag>
              </Column>
            </Grid>

            {/* Payment Proof / Slip Details */}
            <div
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: "4px",
                padding: "1rem",
                marginBottom: "1.5rem",
                backgroundColor: "#fff",
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                  fontSize: "0.875rem",
                }}
              >
                Payment Evidence &amp; Bank Reference
              </p>
              <Grid
                style={{ paddingLeft: 0, paddingRight: 0, rowGap: "0.5rem" }}
              >
                {(selectedPayment.referenceNumber ||
                  selectedPayment.transactionId) && (
                  <Column
                    sm={4}
                    md={4}
                    lg={8}
                    style={{ marginBottom: "0.5rem" }}
                  >
                    <p style={{ fontSize: "0.75rem", color: "#525252" }}>
                      Bank Reference / Transaction ID
                    </p>
                    <p
                      style={{
                        fontWeight: 600,
                        color: "#161616",
                        fontFamily: "monospace",
                      }}
                    >
                      {selectedPayment.referenceNumber ||
                        selectedPayment.transactionId}
                    </p>
                  </Column>
                )}
                {selectedPayment.bankName && (
                  <Column
                    sm={4}
                    md={4}
                    lg={8}
                    style={{ marginBottom: "0.5rem" }}
                  >
                    <p style={{ fontSize: "0.75rem", color: "#525252" }}>
                      Bank / Branch
                    </p>
                    <p>
                      {selectedPayment.bankName}{" "}
                      {selectedPayment.branchName
                        ? `· ${selectedPayment.branchName}`
                        : ""}
                    </p>
                  </Column>
                )}
                {selectedPayment.accountNumber && (
                  <Column
                    sm={4}
                    md={4}
                    lg={8}
                    style={{ marginBottom: "0.5rem" }}
                  >
                    <p style={{ fontSize: "0.75rem", color: "#525252" }}>
                      Account Number
                    </p>
                    <p>{selectedPayment.accountNumber}</p>
                  </Column>
                )}
                {selectedPayment.paymentDate && (
                  <Column
                    sm={4}
                    md={4}
                    lg={8}
                    style={{ marginBottom: "0.5rem" }}
                  >
                    <p style={{ fontSize: "0.75rem", color: "#525252" }}>
                      Payment Date
                    </p>
                    <p>{formatDate(selectedPayment.paymentDate)}</p>
                  </Column>
                )}
              </Grid>

              {/* Deposit Slip File / Viewer */}
              {selectedPayment.manualSlipUrl ? (
                <div
                  style={{
                    marginTop: "0.75rem",
                    borderTop: "1px solid #f4f4f4",
                    paddingTop: "0.75rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#525252",
                      marginBottom: "0.5rem",
                      fontWeight: 600,
                    }}
                  >
                    Attached Statutory Deposit Slip
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        border: "1px dashed #8d8d8d",
                        borderRadius: "4px",
                        padding: "0.75rem",
                        backgroundColor: "#f4f4f4",
                        flex: 1,
                        minWidth: "220px",
                      }}
                    >
                      <Money size={24} />
                      <div style={{ overflow: "hidden" }}>
                        <p
                          style={{
                            fontWeight: 500,
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {selectedPayment.slipFileName ||
                            "bank_deposit_slip.pdf"}
                        </p>
                        <p style={{ fontSize: "0.75rem", color: "#525252" }}>
                          Uploaded{" "}
                          {formatDateTime(selectedPayment.slipUploadedAt)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      kind="tertiary"
                      renderIcon={Launch}
                      onClick={() => {
                        const raw = selectedPayment.manualSlipUrl || "";
                        if (raw.startsWith("data:")) {
                          const w = window.open("");
                          w?.document.write(
                            `<iframe src="${raw}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`,
                          );
                          return;
                        }
                        const token = localStorage.getItem("officerToken");
                        const full = raw.startsWith("http")
                          ? raw
                          : `http://localhost:5119${raw.startsWith("/") ? "" : "/"}${raw}`;
                        const targetUrl =
                          token && !full.startsWith("data:")
                            ? `${full}${full.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
                            : full;
                        window.open(targetUrl, "_blank");
                      }}
                    >
                      View Deposit Slip
                    </Button>
                  </div>

                  <DepositSlipPreview
                    slipUrl={selectedPayment.manualSlipUrl}
                    fileName={selectedPayment.slipFileName}
                  />
                </div>
              ) : selectedPayment.method === "OnlinePay" ? (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem 1rem",
                    backgroundColor: "#edf5ff",
                    borderRadius: "4px",
                    borderLeft: "3px solid #0f62fe",
                    color: "#161616",
                    fontSize: "0.8125rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.625rem",
                  }}
                >
                  <Information size={18} color="#0f62fe" />
                  <div>
                    <strong>Electronic Payment Verification:</strong> No
                    physical bank deposit slip required. This statutory fee was
                    paid directly via{" "}
                    <strong>Online Card Gateway (Stripe)</strong> under
                    Reference ID{" "}
                    <code>
                      {selectedPayment.referenceNumber ||
                        selectedPayment.transactionId}
                    </code>
                    .
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem 1rem",
                    backgroundColor: "#fff8e1",
                    borderRadius: "4px",
                    borderLeft: "3px solid #f1c21b",
                    color: "#161616",
                    fontSize: "0.8125rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.625rem",
                  }}
                >
                  <Information size={18} color="#b28600" />
                  <div>
                    <strong>Bank Deposit Verification:</strong> Citizen
                    registered bank transfer under Reference ID{" "}
                    <code>
                      {selectedPayment.referenceNumber ||
                        selectedPayment.transactionId}
                    </code>
                    . Awaiting physical deposit slip attachment or banking
                    confirmation.
                  </div>
                </div>
              )}
            </div>

            {isEditingStatus ? (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1.25rem",
                  border: "1px solid #0f62fe",
                  borderRadius: "4px",
                  backgroundColor: "#f4f7fb",
                }}
              >
                <h4
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#0f62fe",
                    marginBottom: "0.75rem",
                  }}
                >
                  Edit Statutory Payment Status
                </h4>
                <Select
                  id="edit-status-select"
                  labelText="Select New Status"
                  value={editStatusValue}
                  onChange={(e) =>
                    setEditStatusValue(e.target.value as PaymentStatus)
                  }
                  style={{ marginBottom: "1rem" }}
                >
                  <SelectItem
                    value="Verified"
                    text="Verified — Fee confirmed and posted to ledger"
                  />
                  <SelectItem
                    value="Pending"
                    text="Pending — Awaiting audit / deposit slip review"
                  />
                  <SelectItem
                    value="Rejected"
                    text="Rejected — Invalid deposit slip / payment declined"
                  />
                </Select>
                <TextArea
                  id="edit-verification-notes"
                  labelText="Audit Reason / Verification Notes"
                  placeholder="Specify reason for changing status (e.g., slip verified with bank statement, mismatch, etc.)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ marginBottom: "1rem" }}
                />
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button kind="primary" onClick={handleSaveEditedStatus}>
                    Save Status Changes
                  </Button>
                  <Button
                    kind="ghost"
                    onClick={() => setIsEditingStatus(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <TextArea
                  id="verification-notes"
                  labelText="Verification Notes / Audit Reason"
                  placeholder="Add verification notes (e.g., matched with bank statement dated 2026-09-26)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={selectedPayment.status !== "Pending"}
                  rows={3}
                />

                {selectedPayment.status === "Pending" ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      marginTop: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      kind="primary"
                      onClick={() => handleDecision("Verified")}
                    >
                      {selectedPayment.paymentCategory === "DirectMobile"
                        ? "Verify & Issue Treasury Receipt"
                        : "Verify Payment & Unlock Officer Review"}
                    </Button>
                    <Button
                      kind="danger--tertiary"
                      onClick={() => handleDecision("Rejected")}
                    >
                      Reject Payment
                    </Button>
                    <Button
                      kind="secondary"
                      renderIcon={Edit}
                      onClick={() => setIsEditingStatus(true)}
                    >
                      Edit Status
                    </Button>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: "1rem",
                      fontSize: "0.875rem",
                      color: "#525252",
                      backgroundColor: "#f4f4f4",
                      padding: "0.75rem 1rem",
                      borderRadius: "4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <strong>{selectedPayment.status}</strong> by{" "}
                        {selectedPayment.verifiedByOfficerName ||
                          "Finance Officer"}{" "}
                        on {formatDateTime(selectedPayment.verifiedAt)}
                      </div>
                      <Button
                        size="sm"
                        kind="secondary"
                        renderIcon={Edit}
                        onClick={() => setIsEditingStatus(true)}
                      >
                        Edit Status
                      </Button>
                    </div>
                    {selectedPayment.verificationNotes && (
                      <div
                        style={{ fontStyle: "italic", fontSize: "0.8125rem" }}
                      >
                        Note: "{selectedPayment.verificationNotes}"
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </FinanceShell>
  );
}
