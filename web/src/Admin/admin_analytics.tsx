import "@carbon/styles/css/styles.css";
import { v } from "../utils/validation";
import { useState, useEffect, useCallback } from "react";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref } from "../utils/currentUser";
import {
  Button,
  Column,
  ContentSwitcher,
  Grid,
  Header,
  HeaderContainer,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  InlineLoading,
  InlineNotification,
  Modal,
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
  Switch,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Analytics,
  Catalog,
  Categories,
  Dashboard,
  Logout,
  Notification,
  Rule,
  Save,
  Security,
  Settings,
  TrashCan,
  UserMultiple,
  Wallet,
} from "@carbon/icons-react";
import {
  getDailyAnalytics,
  getWeeklyAnalytics,
  getMonthlyAnalytics,
  getYearlyAnalytics,
  createReportSnapshot,
  getReportSnapshots,
  deleteReportSnapshot,
  type UsageAggregate,
  type ReportSnapshot,
} from "../Finance/analyticsApi";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "Daily" | "Weekly" | "Monthly" | "Yearly";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStartStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Inline bar chart (no external lib) ───────────────────────────────────────

interface BarChartProps {
  data: { label: string; value: number; color: string }[];
  max: number;
}

function BarChart({ data, max }: BarChartProps) {
  if (max === 0) {
    return (
      <div style={{ color: "#525252", fontSize: "0.875rem", textAlign: "center", padding: "2rem 0" }}>
        No data for this period
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-end", height: "120px", padding: "0 0.5rem" }}>
      {data.map(({ label, value, color }) => {
        const heightPct = max > 0 ? Math.round((value / max) * 100) : 0;
        return (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#161616" }}>{value}</span>
            <div
              style={{
                width: "100%",
                backgroundColor: color,
                height: `${Math.max(heightPct, 2)}px`,
                borderRadius: "3px 3px 0 0",
                transition: "height 0.4s ease",
              }}
            />
            <span style={{ fontSize: "0.6875rem", color: "#525252", textAlign: "center", lineHeight: 1.2 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
}

function StatCard({ label, value, accent, sub }: StatCardProps) {
  return (
    <Column sm={2} md={2} lg={4} style={{ marginBottom: "1rem" }}>
      <Tile style={{ borderTop: `4px solid ${accent}`, height: "100%" }}>
        <p style={{ fontSize: "0.75rem", color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          {label}
        </p>
        <p style={{ fontSize: "2rem", fontWeight: 600, color: "#161616", lineHeight: 1 }}>
          {value}
        </p>
        {sub && <p style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.375rem" }}>{sub}</p>}
      </Tile>
    </Column>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const overviewHref = getAdminOverviewHref(getStoredUser());

  // ── Period selection ───────────────────────────────────────────────────────
  const [period, setPeriod] = useState<Period>("Daily");
  const [dateInput, setDateInput] = useState(todayStr());
  const [weekInput, setWeekInput] = useState(weekStartStr());
  const [monthInput, setMonthInput] = useState(todayStr().slice(0, 7)); // "YYYY-MM"
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));

  // ── Data ───────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<UsageAggregate | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [snapsLoading, setSnapsLoading] = useState(false);
  const [snapsBanner, setSnapsBanner] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  // ── Save snapshot modal ────────────────────────────────────────────────────
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Delete confirmation ────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ReportSnapshot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    const token = localStorage.getItem("officerToken");
    try {
      await fetch("http://localhost:5119/api/auth/logout", {
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

  // ── Fetch analytics ────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      let result: UsageAggregate;
      if (period === "Daily") {
        result = await getDailyAnalytics(dateInput);
      } else if (period === "Weekly") {
        result = await getWeeklyAnalytics(weekInput);
      } else if (period === "Monthly") {
        const [yr, mo] = monthInput.split("-").map(Number);
        result = await getMonthlyAnalytics(yr, mo);
      } else {
        const yearProblem = v.integer("Year", 2000, new Date().getFullYear())(yearInput);
        setYearError(yearProblem);
        if (yearProblem) return;
        result = await getYearlyAnalytics(parseInt(yearInput, 10));
      }
      setStats(result);
    } catch (e: unknown) {
      setStatsError(e instanceof Error ? e.message : "Failed to load analytics.");
    } finally {
      setStatsLoading(false);
    }
  }, [period, dateInput, weekInput, monthInput, yearInput]);

  // Fetch on mount and whenever period / date inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStats]);

  // ── Fetch snapshots ────────────────────────────────────────────────────────
  const fetchSnapshots = useCallback(async () => {
    setSnapsLoading(true);
    try {
      const data = await getReportSnapshots();
      setSnapshots(data);
    } catch {
      // Non-fatal — just leave the list empty
    } finally {
      setSnapsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSnapshots();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSnapshots]);

  // ── Save snapshot ──────────────────────────────────────────────────────────
  async function handleSaveSnapshot() {
    if (!stats) return;
    // Same rule as the backend's SaveReportSnapshotDto
    const problem = v.text("Snapshot title", { min: 3, max: 200 })(snapshotTitle);
    setTitleError(problem);
    if (problem) return;
    setSaving(true);
    setSnapsBanner(null);
    try {
      await createReportSnapshot(snapshotTitle.trim(), period, stats);
      setSnapsBanner({ kind: "success", msg: `Snapshot "${snapshotTitle.trim()}" saved.` });
      setSaveModalOpen(false);
      setSnapshotTitle("");
      fetchSnapshots();
    } catch (e: unknown) {
      setSnapsBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to save snapshot." });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete snapshot ────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteReportSnapshot(deleteTarget.id);
      setSnapshots((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setSnapsBanner({ kind: "success", msg: `Snapshot "${deleteTarget.title}" deleted.` });
      setDeleteTarget(null);
    } catch (e: unknown) {
      setSnapsBanner({ kind: "error", msg: e instanceof Error ? e.message : "Delete failed." });
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived chart data ─────────────────────────────────────────────────────
  const chartMax = stats
    ? Math.max(stats.totalApplications, stats.approvedCount, stats.rejectedCount, 1)
    : 1;

  const chartData = stats
    ? [
        { label: "Total", value: stats.totalApplications, color: "#0f62fe" },
        { label: "Approved", value: stats.approvedCount, color: "#24a148" },
        { label: "Rejected", value: stats.rejectedCount, color: "#da1e28" },
      ]
    : [];

  // ── Approval rate ──────────────────────────────────────────────────────────
  const approvalRate =
    stats && stats.totalApplications > 0
      ? Math.round((stats.approvedCount / stats.totalApplications) * 100)
      : null;

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
                <Search size="sm" id="search-admin-an" labelText="Search" placeholder="Search records…" />
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
                <SideNavLink renderIcon={Wallet} href="/admin/installment-plans">
                  Installment Plans
                </SideNavLink>
                <SideNavLink renderIcon={Analytics} href="/admin/analytics" isActive>
                  Analytics
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
            {/* Page header */}
            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
                  Analytics Dashboard
                </h1>
                <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                  Application volume, approval/rejection rates, and processing times
                  aggregated by period.
                </p>
              </div>
              <Button
                renderIcon={Save}
                disabled={!stats || statsLoading}
                onClick={() => setSaveModalOpen(true)}
              >
                Save Snapshot
              </Button>
            </div>

            {/* ── Period toggle ────────────────────────────────────────────── */}
            <Tile style={{ marginBottom: "1.5rem" }}>
              <div style={{ marginBottom: "1.25rem" }}>
                <ContentSwitcher
                  onChange={(e) => setPeriod((e as { name: Period }).name)}
                  size="md"
                >
                  {(["Daily", "Weekly", "Monthly", "Yearly"] as Period[]).map((p) => (
                    <Switch key={p} name={p} text={p} />
                  ))}
                </ContentSwitcher>
              </div>

              {/* Date input for the selected period */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                {period === "Daily" && (
                  <TextInput
                    id="an-date"
                    type="date"
                    labelText="Date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    style={{ maxWidth: "180px" }}
                  />
                )}
                {period === "Weekly" && (
                  <TextInput
                    id="an-week"
                    type="date"
                    labelText="Week Starting"
                    value={weekInput}
                    onChange={(e) => setWeekInput(e.target.value)}
                    style={{ maxWidth: "180px" }}
                  />
                )}
                {period === "Monthly" && (
                  <TextInput
                    id="an-month"
                    type="month"
                    labelText="Month"
                    value={monthInput}
                    onChange={(e) => setMonthInput(e.target.value)}
                    style={{ maxWidth: "180px" }}
                  />
                )}
                {period === "Yearly" && (
                  <TextInput
                    id="an-year"
                    type="number"
                    labelText="Year"
                    value={yearInput}
                    min="2000"
                    max={String(new Date().getFullYear())}
                    onChange={(e) => setYearInput(e.target.value)}
                    style={{ maxWidth: "120px" }}
                    invalid={!!yearError}
                    invalidText={yearError ?? undefined}
                  />
                )}
                <Button kind="secondary" size="md" onClick={fetchStats} disabled={statsLoading}>
                  {statsLoading ? "Loading…" : "Refresh"}
                </Button>
              </div>
            </Tile>

            {/* Error */}
            {statsError && (
              <InlineNotification
                kind="error"
                title="Error:"
                subtitle={statsError}
                style={{ marginBottom: "1rem" }}
                lowContrast
              />
            )}

            {/* Loading spinner */}
            {statsLoading && <InlineLoading description="Fetching analytics…" style={{ marginBottom: "1rem" }} />}

            {/* ── Stats cards ──────────────────────────────────────────────── */}
            {stats && !statsLoading && (
              <>
                <div style={{ marginBottom: "0.5rem" }}>
                  <Tag type="blue" style={{ marginBottom: "1rem" }}>{stats.period}</Tag>
                </div>
                <Grid style={{ paddingLeft: 0, paddingRight: 0, marginBottom: "0.5rem" }}>
                  <StatCard
                    label="Total Applications"
                    value={stats.totalApplications}
                    accent="#0f62fe"
                  />
                  <StatCard
                    label="Approved"
                    value={stats.approvedCount}
                    accent="#24a148"
                    sub={approvalRate !== null ? `${approvalRate}% approval rate` : undefined}
                  />
                  <StatCard
                    label="Rejected"
                    value={stats.rejectedCount}
                    accent="#da1e28"
                    sub={
                      stats.totalApplications > 0
                        ? `${Math.round((stats.rejectedCount / stats.totalApplications) * 100)}% rejection rate`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Avg. Processing Time"
                    value={`${stats.averageProcessingHours.toFixed(1)} h`}
                    accent="#6929c4"
                    sub="Average hours per application"
                  />
                </Grid>

                {/* ── Bar chart ──────────────────────────────────────────── */}
                <Tile style={{ marginBottom: "2rem", padding: "1.5rem" }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#525252", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Volume Breakdown
                  </p>
                  <BarChart data={chartData} max={chartMax} />
                  {/* Legend */}
                  <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                    {chartData.map(({ label, color }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <div style={{ width: "12px", height: "12px", backgroundColor: color, borderRadius: "2px" }} />
                        <span style={{ fontSize: "0.75rem", color: "#525252" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </Tile>
              </>
            )}

            {/* ── Saved Snapshots ───────────────────────────────────────────── */}
            <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 400, color: "#161616" }}>
                Saved Snapshots
              </h2>
              {snapsLoading && <InlineLoading description="Loading…" />}
            </div>

            {snapsBanner && (
              <InlineNotification
                kind={snapsBanner.kind}
                title={snapsBanner.kind === "success" ? "Success" : "Error"}
                subtitle={snapsBanner.msg}
                style={{ marginBottom: "1rem" }}
                lowContrast
              />
            )}

            <TableContainer title="">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Title</TableHeader>
                    <TableHeader>Period Type</TableHeader>
                    <TableHeader>Period Label</TableHeader>
                    <TableHeader>Saved By</TableHeader>
                    <TableHeader>Date Saved</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {snapshots.length === 0 && !snapsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} style={{ textAlign: "center", color: "#525252" }}>
                        No saved snapshots yet. Use "Save Snapshot" to archive the current view.
                      </TableCell>
                    </TableRow>
                  ) : (
                    snapshots.map((snap) => {
                      const periodLabel = (() => {
                        try {
                          const d = JSON.parse(snap.dataJson) as UsageAggregate;
                          return d.period ?? "—";
                        } catch {
                          return "—";
                        }
                      })();
                      return (
                        <TableRow key={snap.id}>
                          <TableCell style={{ fontWeight: 600 }}>{snap.title}</TableCell>
                          <TableCell>
                            <Tag type="blue">{snap.period}</Tag>
                          </TableCell>
                          <TableCell>{periodLabel}</TableCell>
                          <TableCell>{snap.generatedByEmail}</TableCell>
                          <TableCell>{fmtDate(snap.generatedDate)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              kind="danger--ghost"
                              renderIcon={TrashCan}
                              hasIconOnly
                              iconDescription="Delete snapshot"
                              onClick={() => setDeleteTarget(snap)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </main>

          {/* ── Save Snapshot Modal ───────────────────────────────────────── */}
          <Modal
            open={saveModalOpen}
            modalHeading="Save Report Snapshot"
            primaryButtonText={saving ? "Saving…" : "Save"}
            secondaryButtonText="Cancel"
            primaryButtonDisabled={saving || !snapshotTitle.trim()}
            onRequestSubmit={handleSaveSnapshot}
            onRequestClose={() => { setSaveModalOpen(false); setSnapshotTitle(""); }}
            size="sm"
          >
            <p style={{ color: "#525252", marginBottom: "1rem", fontSize: "0.875rem" }}>
              Archive the current <strong>{period}</strong> analytics view ({stats?.period ?? "—"}) as a named snapshot
              that you can refer back to later.
            </p>
            <TextInput
              id="snapshot-title"
              labelText="Snapshot Title *"
              placeholder="e.g. September 2026 Weekly Summary"
              value={snapshotTitle}
              onChange={(e) => setSnapshotTitle(e.target.value)}
              maxLength={200}
              invalid={!!titleError}
              invalidText={titleError ?? undefined}
            />
          </Modal>

          {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
          <Modal
            open={deleteTarget !== null}
            danger
            modalHeading="Delete Snapshot"
            primaryButtonText={deleting ? "Deleting…" : "Delete"}
            secondaryButtonText="Cancel"
            primaryButtonDisabled={deleting}
            onRequestSubmit={handleDelete}
            onRequestClose={() => setDeleteTarget(null)}
            size="sm"
          >
            <p style={{ color: "#525252", fontSize: "0.875rem" }}>
              Are you sure you want to permanently delete the snapshot{" "}
              <strong>"{deleteTarget?.title}"</strong>? This action cannot be undone.
            </p>
          </Modal>
        </>
      )}
    />
  );
}
