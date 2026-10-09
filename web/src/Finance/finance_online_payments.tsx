import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Grid,
  Column,
  Tile,
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
  Tag,
  Button,
  Modal,
  InlineNotification,
} from "@carbon/react";
import { Renew, View, CheckmarkOutline, Hourglass, MisuseOutline, Money, Document } from "@carbon/icons-react";
import jsPDF from "jspdf";
import FinanceShell from "./finance_shell";
import { formatCurrency, formatDateTime } from "./format";
import { getDepartmentPayments, type BackendPayment } from "./paymentsApi";

type StatusFilter = "All" | "Paid" | "Pending" | "Failed";

const STATUS_FILTERS: StatusFilter[] = ["All", "Paid", "Pending", "Failed"];

// Online card payments are stored with Method "Online"; anything not Paid/Failed is still waiting on Stripe
function statusBucket(p: BackendPayment): Exclude<StatusFilter, "All"> {
  if (p.status === "Paid") return "Paid";
  if (p.status === "Failed") return "Failed";
  return "Pending";
}

function statusTag(p: BackendPayment) {
  const bucket = statusBucket(p);
  if (bucket === "Paid") return <Tag type="green">Paid</Tag>;
  if (bucket === "Failed") return <Tag type="red">Failed</Tag>;
  return <Tag type="blue">Awaiting Stripe</Tag>;
}

function stageLabel(p: BackendPayment) {
  const stage = p.stageNumber ?? 1;
  return p.maxStages && p.maxStages > 1 ? `Stage ${stage} of ${p.maxStages}` : `Stage ${stage}`;
}

function amountLabel(p: BackendPayment) {
  // formatCurrency prints "Rs."; online payments are always charged in LKR on Stripe
  return p.currency && p.currency !== "LKR" ? `${p.currency} ${p.amount.toFixed(2)}` : formatCurrency(p.amount);
}

export default function FinanceOnlinePayments() {
  const [payments, setPayments] = useState<BackendPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<BackendPayment | null>(null);

  const fetchPayments = useCallback(
    () =>
      getDepartmentPayments()
        .then((all) => setPayments(all.filter((p) => p.method?.toLowerCase() === "online")))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load online payments."))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  function refresh() {
    setLoading(true);
    setError(null);
    fetchPayments();
  }

  const summary = useMemo(() => {
    const paid = payments.filter((p) => statusBucket(p) === "Paid");
    return {
      received: paid.reduce((acc, p) => acc + p.amount, 0),
      paid: paid.length,
      pending: payments.filter((p) => statusBucket(p) === "Pending").length,
      failed: payments.filter((p) => statusBucket(p) === "Failed").length,
    };
  }, [payments]);

  const visible = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== "All" && statusBucket(p) !== statusFilter) return false;
      if (!term) return true;
      return [
        String(p.id),
        `APP-${p.applicationId}`,
        p.referenceNumber,
        p.stripeSessionId,
        p.citizenNic,
        p.citizenName,
        p.userEmail,
        p.serviceName,
      ].some((v) => v?.toLowerCase().includes(term));
    });
  }, [payments, statusFilter, searchTerm]);

  function exportPdf() {
    const doc = new jsPDF();
    const marginX = 14;
    let y = 18;

    doc.setFillColor(15, 98, 254);
    doc.rect(0, 0, 210, 8, "F");

    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 22, 22);
    doc.text("Government Service Navigator - Online Card Payments", marginX, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 82, 82);
    doc.text(
      `Stripe Card Payments Ledger | Filter: ${statusFilter} | Generated: ${new Date().toLocaleString()}`,
      marginX,
      y,
    );
    y += 6;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, y, 196, y);
    y += 6;

    // Table Header
    doc.setFillColor(244, 244, 244);
    doc.rect(marginX, y, 182, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 22, 22);

    doc.text("ID", marginX + 2, y + 5);
    doc.text("App Ref & Service", marginX + 16, y + 5);
    doc.text("Citizen (Name & NIC)", marginX + 70, y + 5);
    doc.text("Email", marginX + 118, y + 5);
    doc.text("Amount", marginX + 152, y + 5);
    doc.text("Status", marginX + 172, y + 5);
    y += 9;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    if (visible.length === 0) {
      doc.text("No online payments match the selected criteria.", marginX + 2, y + 4);
    } else {
      for (const p of visible) {
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFillColor(244, 244, 244);
          doc.rect(marginX, y, 182, 7, "F");
          doc.setFont("helvetica", "bold");
          doc.text("ID", marginX + 2, y + 5);
          doc.text("App Ref & Service", marginX + 16, y + 5);
          doc.text("Citizen (Name & NIC)", marginX + 70, y + 5);
          doc.text("Email", marginX + 118, y + 5);
          doc.text("Amount", marginX + 152, y + 5);
          doc.text("Status", marginX + 172, y + 5);
          y += 9;
          doc.setFont("helvetica", "normal");
        }

        const refText = `APP-${p.applicationId} (${p.serviceName || "Service"})`;
        const citText = `${p.citizenName || "Citizen"} (${p.citizenNic || "-"})`;

        doc.text(String(p.id), marginX + 2, y);
        doc.text(refText.substring(0, 26), marginX + 16, y);
        doc.text(citText.substring(0, 24), marginX + 70, y);
        doc.text((p.userEmail || "-").substring(0, 18), marginX + 118, y);
        doc.text(amountLabel(p), marginX + 152, y);

        if (p.status === "Paid") doc.setTextColor(36, 161, 72);
        else if (p.status === "Failed") doc.setTextColor(218, 30, 40);
        else doc.setTextColor(15, 98, 254);
        doc.text(p.status, marginX + 172, y);
        doc.setTextColor(22, 22, 22);

        y += 6;
      }
    }

    doc.save(`GSN_Online_Payments_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const tiles = [
    { label: "Total Received (Paid)", value: formatCurrency(summary.received), color: "#24a148", Icon: Money },
    { label: "Paid Transactions", value: String(summary.paid), color: "#0f62fe", Icon: CheckmarkOutline },
    { label: "Awaiting Stripe", value: String(summary.pending), color: "#f1c21b", Icon: Hourglass },
    { label: "Failed / Expired", value: String(summary.failed), color: "#da1e28", Icon: MisuseOutline },
  ];

  return (
    <FinanceShell active="online">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>Online Payments</h1>
          <p style={{ color: "#525252", marginTop: "0.5rem", maxWidth: "46rem" }}>
            Card payments made through the Stripe gateway in LKR for your department. A payment is marked Paid only
            after Stripe confirms it, and the citizen is emailed a receipt at that moment.
          </p>
        </div>
        <Button kind="tertiary" renderIcon={Renew} onClick={refresh} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <InlineNotification
          kind="error"
          title="Could not load online payments"
          subtitle={error}
          lowContrast
          onClose={() => setError(null)}
          style={{ marginBottom: "1rem", maxWidth: "100%" }}
        />
      )}

      <Grid narrow style={{ marginBottom: "1.5rem", paddingInline: 0 }}>
        {tiles.map(({ label, value, color, Icon }) => (
          <Column key={label} sm={2} md={4} lg={4} style={{ marginBottom: "1rem" }}>
            <Tile style={{ borderTop: `4px solid ${color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.875rem", color: "#525252" }}>{label}</span>
                <Icon size={20} style={{ color }} />
              </div>
              <div style={{ fontSize: "1.75rem", marginTop: "0.75rem", color: "#161616" }}>{value}</div>
            </Tile>
          </Column>
        ))}
      </Grid>

      <div style={{ marginBottom: "1rem", maxWidth: "520px" }}>
        <ContentSwitcher
          selectedIndex={STATUS_FILTERS.indexOf(statusFilter)}
          onChange={({ index }) => setStatusFilter(STATUS_FILTERS[index as number])}
        >
          {STATUS_FILTERS.map((s) => (
            <Switch key={s} name={s} text={s === "Pending" ? "Awaiting Stripe" : s} />
          ))}
        </ContentSwitcher>
      </div>

      <TableContainer
        title="Stripe Card Payments"
        description={loading ? "Loading..." : `${visible.length} of ${payments.length} online payments`}
      >
        <TableToolbar>
          <TableToolbarContent>
            <TableToolbarSearch
              persistent
              placeholder="Search payment ID, application, NIC, name, email or Stripe reference"
              onChange={(e) => setSearchTerm(typeof e === "string" ? e : e.target.value)}
            />
            <Button
              kind="secondary"
              size="md"
              renderIcon={Document}
              onClick={exportPdf}
              style={{ whiteSpace: "nowrap" }}
            >
              Export to PDF
            </Button>
          </TableToolbarContent>
        </TableToolbar>
        <div style={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Payment ID</TableHeader>
                <TableHeader>Application & Service Stage</TableHeader>
                <TableHeader>Citizen (Name & NIC)</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Amount</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Paid On</TableHeader>
                <TableHeader />
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((p) => (
                <TableRow key={p.id}>
                  <TableCell style={{ fontWeight: 600 }}>#{p.id}</TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 600 }}>APP-{p.applicationId}</div>
                    <div style={{ fontSize: "0.75rem", color: "#525252" }}>
                      {p.serviceName || "Government Service"} &middot; {stageLabel(p)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{p.citizenName || "Citizen"}</div>
                    <div style={{ fontSize: "0.75rem", color: "#525252" }}>{p.citizenNic || "-"}</div>
                  </TableCell>
                  <TableCell>{p.userEmail || "-"}</TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{amountLabel(p)}</TableCell>
                  <TableCell>{statusTag(p)}</TableCell>
                  <TableCell>{formatDateTime(p.paidDate ?? undefined)}</TableCell>
                  <TableCell>
                    <Button kind="ghost" size="sm" renderIcon={View} onClick={() => setSelected(p)}>
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} style={{ textAlign: "center", color: "#525252", padding: "2rem" }}>
                    No online payments match this view.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TableContainer>

      <Modal
        open={selected !== null}
        passiveModal
        modalHeading={selected ? `Online Payment #${selected.id}` : ""}
        modalLabel="Stripe card payment"
        onRequestClose={() => setSelected(null)}
        size="md"
      >
        {selected && (
          <div style={{ display: "grid", gap: "1.25rem" }}>
            <DetailSection
              title="Payment"
              rows={[
                ["Payment ID", `#${selected.id}`],
                ["Status", statusTag(selected)],
                ["Amount", amountLabel(selected)],
                ["Currency", selected.currency || "LKR"],
                ["Gateway", "Stripe Checkout (card)"],
                ["Stripe Session", selected.stripeSessionId || "-"],
                ["Payment Reference", selected.referenceNumber || "-"],
                ["Created", formatDateTime(selected.createdDate)],
                ["Paid On", formatDateTime(selected.paidDate ?? undefined)],
              ]}
            />
            <DetailSection
              title="Application"
              rows={[
                ["Application ID", `APP-${selected.applicationId}`],
                ["Service", selected.serviceName || "Government Service"],
                ["Service Stage", stageLabel(selected)],
                ["Stage Status", selected.stageStatus || "-"],
                ["Department", selected.department || "-"],
                ["Category", selected.isDirectPayment ? "Direct department payment" : "Application stage fee"],
              ]}
            />
            <DetailSection
              title="Citizen"
              rows={[
                ["Name", selected.citizenName || "Citizen"],
                ["NIC Number", selected.citizenNic || "-"],
                ["Email (receipt sent to)", selected.userEmail || "-"],
              ]}
            />
          </div>
        )}
      </Modal>
    </FinanceShell>
  );
}

function DetailSection({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section>
      <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#161616", marginBottom: "0.5rem" }}>{title}</h4>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(9rem, auto) 1fr", rowGap: "0.5rem", columnGap: "1rem" }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ color: "#525252", fontSize: "0.875rem" }}>{label}</dt>
            <dd style={{ color: "#161616", fontSize: "0.875rem", wordBreak: "break-all" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
