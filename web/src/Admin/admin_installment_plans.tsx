import "@carbon/styles/css/styles.css";
import { hasErrors, v, validateForm } from "../utils/validation";
import { useState } from "react";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref } from "../utils/currentUser";
import {
  Button,
  Column,
  Grid,
  Header,
  HeaderContainer,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Search,
  SideNav,
  SideNavItems,
  SideNavLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Catalog,
  Categories,
  Dashboard,
  Logout,
  Notification,
  Wallet,
  Rule,
  Settings,
  UserMultiple,
  Security,
  TrashCan,
  Checkmark,
} from "@carbon/icons-react";
import {
  createInstallmentPlan,
  getInstallmentPlan,
  payInstallment,
  cancelInstallmentPlan,
  rejectBankTransfer,
  openInstallmentReceipt,
  type InstallmentPlanResponse,
  type InstallmentResponse,
} from "../Finance/paymentsApi";
import { API_BASE_URL } from "../utils/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

type InstallmentStatus = "Pending" | "PendingVerification" | "Paid" | "Overdue";

function statusTagType(status: string): "blue" | "green" | "red" | "cool-gray" {
  if (status === "Paid") return "green";
  if (status === "Overdue") return "red";
  if (status === "Pending") return "blue";
  if (status === "PendingVerification") return "cool-gray";
  return "cool-gray";
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(inst: InstallmentResponse): boolean {
  return inst.status === "Overdue";
}

function canCancel(plan: InstallmentPlanResponse): boolean {
  return (
    plan.status === "Active" &&
    plan.installments.every((i) => i.status !== "Paid")
  );
}

function planStatusTagType(status: string): "teal" | "green" | "cool-gray" | "red" {
  if (status === "Active") return "teal";
  if (status === "Completed") return "green";
  if (status === "Cancelled") return "red";
  return "cool-gray";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminInstallmentPlans() {
  const overviewHref = getAdminOverviewHref(getStoredUser());

  // ── Search / Create form state ─────────────────────────────────────────────
  const [paymentIdInput, setPaymentIdInput] = useState("");
  const [numInstallments, setNumInstallments] = useState(3);
  const [intervalDays, setIntervalDays] = useState(30);
  const [formErrors, setFormErrors] = useState<Partial<Record<"paymentId" | "installments" | "interval", string>>>({});

  // ── Plan state ─────────────────────────────────────────────────────────────
  const [plan, setPlan] = useState<InstallmentPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [paying, setPaying] = useState<number | null>(null); // installment id being paid

  // ── Auth/logout ────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    const token = localStorage.getItem("officerToken");
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (e) {
      console.error("Logout failed:", e);
    } finally {
      localStorage.removeItem("officerToken");
      localStorage.removeItem("officerUser");
      window.location.href = "/officer/login";
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleLookup() {
    // Same limits as the backend's CreateInstallmentPlanDto
    const errors = validateForm({
      paymentId: [paymentIdInput, v.integer("Payment ID", 1, 2147483647)],
      installments: [String(numInstallments), v.integer("Number of instalments", 2, 60)],
      interval: [String(intervalDays), v.integer("Interval (days)", 1, 365)],
    });
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    const pid = parseInt(paymentIdInput.trim(), 10);
    setLoading(true);
    setError(null);
    setBanner(null);
    setPlan(null);
    try {
      // The backend has no "get plan by payment ID" endpoint directly, so we
      // attempt to create (PUT is idempotent per business rule: 409 if active plan
      // already exists). A 400/409 from the backend signals there is already a plan;
      // we then need the plan ID — which we can only obtain by creating. To handle
      // the lookup-only path the user should enter the PLAN ID in the second field.
      // For now, attempt create with the current form values and surface any error.
      const result = await createInstallmentPlan(pid, numInstallments, intervalDays);
      setPlan(result);
      setBanner({ kind: "success", msg: `Installment plan #${result.id} created for Payment #${pid}.` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create installment plan.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadById(planIdStr: string) {
    const planId = parseInt(planIdStr, 10);
    if (isNaN(planId) || planId <= 0) return;
    setLoading(true);
    setError(null);
    setBanner(null);
    try {
      const result = await getInstallmentPlan(planId);
      setPlan(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load installment plan.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid(installmentId: number) {
    if (!plan) return;
    setPaying(installmentId);
    setBanner(null);
    try {
      await payInstallment(installmentId);
      // Refresh the full plan so statuses update correctly (plan may become Completed).
      const refreshed = await getInstallmentPlan(plan.id);
      setPlan(refreshed);
      setBanner({ kind: "success", msg: "Installment marked as paid." });
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to mark installment paid." });
    } finally {
      setPaying(null);
    }
  }

  async function handleViewReceipt(installmentId: number) {
    setBanner(null);
    try {
      await openInstallmentReceipt(installmentId);
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to open the receipt." });
    }
  }

  // Bank transfer receipt rejected: the installment becomes payable again for the citizen
  async function handleRejectTransfer(installmentId: number) {
    if (!plan) return;
    setPaying(installmentId);
    setBanner(null);
    try {
      await rejectBankTransfer(installmentId);
      setPlan(await getInstallmentPlan(plan.id));
      setBanner({ kind: "success", msg: "Bank transfer rejected. The citizen can pay this installment again." });
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to reject the bank transfer." });
    } finally {
      setPaying(null);
    }
  }

  async function handleCancelPlan() {
    if (!plan) return;
    setLoading(true);
    setBanner(null);
    try {
      await cancelInstallmentPlan(plan.id);
      const refreshed = await getInstallmentPlan(plan.id);
      setPlan(refreshed);
      setBanner({ kind: "success", msg: `Plan #${plan.id} has been cancelled.` });
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to cancel plan." });
    } finally {
      setLoading(false);
    }
  }

  // ── Derived summary ────────────────────────────────────────────────────────
  const paidCount = plan?.installments.filter((i) => i.status === "Paid").length ?? 0;
  const overdueCount = plan?.installments.filter((i) => isOverdue(i)).length ?? 0;
  const pendingCount = plan?.installments.filter((i) => i.status === "Pending").length ?? 0;
  const paidAmount = plan?.installments
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + i.amount, 0) ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <Header aria-label="Registry Admin System">
            <HeaderMenuButton
              aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
              isCollapsible
            />
            <HeaderName href="#" prefix="GSN">
              Registry Admin
            </HeaderName>

            <HeaderGlobalBar>
              <div className="flex items-center w-[120px] sm:w-[250px] mr-2 sm:mr-4">
                <Search size="sm" id="search-admin-ip" labelText="Search" placeholder="Search records…" />
              </div>
              <CurrentUserBadge />
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href={overviewHref}>
                  Overview
                </SideNavLink>
                <SideNavLink renderIcon={Catalog} href="/admin/services">
                  Service Catalog
                </SideNavLink>
                <SideNavLink renderIcon={Rule} href="/admin/services/rules">
                  Eligibility Rules
                </SideNavLink>
                <SideNavLink renderIcon={Categories} href="/admin/services/config">
                  Service Configuration
                </SideNavLink>
                <SideNavLink renderIcon={Rule} href="/admin/services/simulator">
                  Eligibility Simulator
                </SideNavLink>
                <SideNavLink renderIcon={UserMultiple} href="/admin/manage-officers">
                  Manage Officers
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/admin/audit-logs">
                  Audit Logs
                </SideNavLink>
                <SideNavLink renderIcon={Wallet} href="/admin/installment-plans" isActive>
                  Installment Plans
                </SideNavLink>
                <SideNavLink renderIcon={Settings} href="/admin/system-settings">
                  System Settings
                </SideNavLink>
                <div style={{ marginTop: "auto", borderTop: "1px solid #393939" }}>
                  <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: "pointer" }}>
                    Sign Out
                  </SideNavLink>
                </div>
              </SideNavItems>
            </SideNav>
          </Header>

          <main
            className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64"
            style={{ backgroundColor: "#f4f4f4" }}
          >
            {/* Page title */}
            <div style={{ marginBottom: "1.5rem" }}>
              <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
                Installment Plan Manager
              </h1>
              <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                Create a new installment schedule for a payment or load an existing
                plan to review and manage individual instalments.
              </p>
            </div>

            {/* ── Create / Load card ─────────────────────────────────────── */}
            <Tile style={{ marginBottom: "2rem" }}>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1.25rem" }}>
                Create Plan for a Payment
              </h3>

              <Grid style={{ paddingLeft: 0, paddingRight: 0 }}>
                <Column sm={4} md={3} lg={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="ip-payment-id"
                    labelText="Payment ID *"
                    placeholder="e.g. 42"
                    value={paymentIdInput}
                    onChange={(e) => setPaymentIdInput(e.target.value)}
                    helperText="The numeric ID of the payment to split."
                    maxLength={10}
                    invalid={!!formErrors.paymentId}
                    invalidText={formErrors.paymentId}
                  />
                </Column>

                <Column sm={2} md={2} lg={3} style={{ marginBottom: "1rem" }}>
                  <NumberInput
                    id="ip-num-installments"
                    label="Number of Instalments *"
                    min={2}
                    max={60}
                    value={numInstallments}
                    onChange={(_e, { value }) =>
                      setNumInstallments(typeof value === "number" ? value : parseInt(String(value), 10))
                    }
                    helperText="Between 2 and 60."
                    invalid={!!formErrors.installments}
                    invalidText={formErrors.installments}
                  />
                </Column>

                <Column sm={2} md={2} lg={3} style={{ marginBottom: "1rem" }}>
                  <NumberInput
                    id="ip-interval-days"
                    label="Interval (days) *"
                    min={1}
                    max={365}
                    value={intervalDays}
                    onChange={(_e, { value }) =>
                      setIntervalDays(typeof value === "number" ? value : parseInt(String(value), 10))
                    }
                    helperText="Days between each instalment (1-365)."
                    invalid={!!formErrors.interval}
                    invalidText={formErrors.interval}
                  />
                </Column>

                <Column sm={4} md={2} lg={2} style={{ marginBottom: "1rem", display: "flex", alignItems: "flex-end" }}>
                  <Button onClick={handleLookup} disabled={loading || !paymentIdInput.trim()}>
                    {loading ? "Working…" : "Create Plan"}
                  </Button>
                </Column>
              </Grid>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #e0e0e0", margin: "1.5rem 0 1.25rem" }} />

              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "#525252" }}>
                Or load an existing plan by Plan ID
              </h3>
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                <TextInput
                  id="ip-plan-id"
                  labelText="Plan ID"
                  placeholder="e.g. 7"
                  style={{ maxWidth: "200px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLoadById((e.target as HTMLInputElement).value);
                  }}
                />
                <Button
                  kind="secondary"
                  onClick={(e) => {
                    const input = (e.currentTarget.previousElementSibling?.querySelector("input")) as HTMLInputElement | null;
                    if (input) handleLoadById(input.value);
                  }}
                  disabled={loading}
                >
                  Load Plan
                </Button>
              </div>
            </Tile>

            {/* Loading indicator */}
            {loading && <InlineLoading description="Loading…" style={{ marginBottom: "1rem" }} />}

            {/* Error */}
            {error && !loading && (
              <InlineNotification
                kind="error"
                title="Error:"
                subtitle={error}
                style={{ marginBottom: "1rem" }}
                lowContrast
              />
            )}

            {/* Success / action banner */}
            {banner && (
              <InlineNotification
                kind={banner.kind}
                title={banner.kind === "success" ? "Success" : "Error"}
                subtitle={banner.msg}
                style={{ marginBottom: "1rem" }}
                lowContrast
              />
            )}

            {/* ── Plan detail ────────────────────────────────────────────── */}
            {plan && !loading && (
              <>
                {/* Plan meta */}
                <Tile style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <h3 style={{ fontSize: "1.25rem", fontWeight: 400, marginBottom: "0.5rem" }}>
                        Plan #{plan.id} — Payment #{plan.paymentId}
                      </h3>
                      <Tag type={planStatusTagType(plan.status)}>{plan.status}</Tag>
                    </div>
                    {canCancel(plan) && (
                      <Button
                        kind="danger--ghost"
                        renderIcon={TrashCan}
                        onClick={handleCancelPlan}
                        disabled={loading}
                        size="sm"
                      >
                        Cancel Plan
                      </Button>
                    )}
                  </div>

                  {/* Summary tiles */}
                  <Grid style={{ paddingLeft: 0, paddingRight: 0, marginTop: "1.5rem" }}>
                    {[
                      { label: "Total Amount", value: fmtAmount(plan.totalAmount), color: "#0f62fe" },
                      { label: "Amount Paid", value: fmtAmount(paidAmount), color: "#0e6027" },
                      { label: "Paid", value: `${paidCount} / ${plan.numberOfInstallments}`, color: "#007d79" },
                      { label: "Overdue", value: String(overdueCount), color: overdueCount > 0 ? "#da1e28" : "#6f6f6f" },
                      { label: "Pending", value: String(pendingCount), color: "#0f62fe" },
                    ].map(({ label, value, color }) => (
                      <Column sm={2} md={2} lg={3} key={label} style={{ marginBottom: "1rem" }}>
                        <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: "0.75rem" }}>
                          <p style={{ fontSize: "0.75rem", color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {label}
                          </p>
                          <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "#161616", marginTop: "0.25rem" }}>
                            {value}
                          </p>
                        </div>
                      </Column>
                    ))}
                  </Grid>
                </Tile>

                {/* Instalment schedule table */}
                <TableContainer
                  title="Instalment Schedule"
                  description="Mark individual instalments as paid once the bank transfer is confirmed."
                >
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeader>#</TableHeader>
                        <TableHeader>Amount</TableHeader>
                        <TableHeader>Due Date</TableHeader>
                        <TableHeader>Status</TableHeader>
                        <TableHeader>Paid Date</TableHeader>
                        <TableHeader>Action</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {plan.installments.map((inst) => {
                        const overdue = isOverdue(inst);
                        const rowStyle = overdue
                          ? { backgroundColor: "#fff1f1" }
                          : inst.status === "Paid"
                          ? { backgroundColor: "#defbe6" }
                          : {};

                        return (
                          <TableRow key={inst.id} style={rowStyle}>
                            <TableCell>{inst.installmentNumber}</TableCell>
                            <TableCell style={{ fontVariantNumeric: "tabular-nums" }}>
                              {fmtAmount(inst.amount)}
                            </TableCell>
                            <TableCell style={overdue ? { color: "#da1e28", fontWeight: 600 } : {}}>
                              {fmtDate(inst.dueDate)}
                              {overdue && (
                                <span
                                  style={{
                                    marginLeft: "0.5rem",
                                    fontSize: "0.7rem",
                                    color: "#da1e28",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  OVERDUE
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Tag type={statusTagType(inst.status as InstallmentStatus)}>
                                {inst.status === "PendingVerification" ? `Receipt to verify${inst.paymentMethod === "BankTransfer" ? " (bank transfer)" : ""}` : inst.status}
                              </Tag>
                            </TableCell>
                            <TableCell>{fmtDate(inst.paidDate)}</TableCell>
                            <TableCell>
                              {(inst.status === "Pending" || inst.status === "Overdue") &&
                                plan.status === "Active" && (
                                  <Button
                                    size="sm"
                                    kind={overdue ? "danger" : "primary"}
                                    renderIcon={Checkmark}
                                    onClick={() => handleMarkPaid(inst.id)}
                                    disabled={paying !== null}
                                  >
                                    {paying === inst.id ? "Saving…" : "Mark Paid"}
                                  </Button>
                                )}
                              {inst.status === "PendingVerification" && plan.status === "Active" && (
                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                  {inst.hasReceipt && (
                                    <Button size="sm" kind="ghost" onClick={() => handleViewReceipt(inst.id)}>
                                      View Receipt
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    kind="primary"
                                    renderIcon={Checkmark}
                                    onClick={() => handleMarkPaid(inst.id)}
                                    disabled={paying !== null}
                                  >
                                    {paying === inst.id ? "Saving…" : "Approve"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    kind="danger--tertiary"
                                    onClick={() => handleRejectTransfer(inst.id)}
                                    disabled={paying !== null}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                              {inst.status === "Paid" && (
                                <span style={{ color: "#0e6027", fontSize: "0.875rem", fontWeight: 600 }}>
                                  ✓ Paid
                                </span>
                              )}
                              {plan.status !== "Active" && inst.status !== "Paid" && (
                                <span style={{ color: "#6f6f6f", fontSize: "0.875rem" }}>—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </main>
        </>
      )}
    />
  );
}
