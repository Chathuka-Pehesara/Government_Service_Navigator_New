import "@carbon/styles/css/styles.css";
import { useState, useEffect, useCallback } from "react";
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
  Tile,
} from "@carbon/react";
import {
  Analytics,
  Catalog,
  Categories,
  Checkmark,
  Close,
  Dashboard,
  Logout,
  Misuse,
  Notification,
  Renew,
  Rule,
  Security,
  Settings,
  UserMultiple,
  Wallet,
  Warning,
} from "@carbon/icons-react";
import {
  runAnomalyScan,
  getOpenAnomalyFlags,
  resolveAnomalyFlag,
  type AnomalyFlag,
} from "../Finance/analyticsApi";
import { API_BASE_URL } from "../utils/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AnomalyTypeColor = "red" | "purple" | "teal" | "blue" | "cool-gray";

function anomalyTypeTag(type: string): AnomalyTypeColor {
  const t = type.toLowerCase();
  if (t.includes("fraud") || t.includes("duplicate")) return "red";
  if (t.includes("overdue") || t.includes("late")) return "purple";
  if (t.includes("refund")) return "teal";
  if (t.includes("installment") || t.includes("plan")) return "blue";
  return "cool-gray";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAnomalyReview() {
  const overviewHref = getAdminOverviewHref(getStoredUser());

  // ── State ──────────────────────────────────────────────────────────────────
  const [flags, setFlags] = useState<AnomalyFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{ found: number } | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  // ── Logout ─────────────────────────────────────────────────────────────────
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

  // ── Fetch open flags ───────────────────────────────────────────────────────
  const fetchFlags = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const data = await getOpenAnomalyFlags();
      setFlags(data);
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to load open anomaly flags." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFlags();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchFlags]);

  // ── Run scan ───────────────────────────────────────────────────────────────
  async function handleScan() {
    setScanLoading(true);
    setScanResult(null);
    setBanner(null);
    try {
      const newFlags = await runAnomalyScan();
      setScanResult({ found: newFlags.length });
      // Merge new flags into the list (avoid duplicates by id)
      setFlags((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const fresh = newFlags.filter((f) => !existingIds.has(f.id));
        return [...fresh, ...prev];
      });
      setBanner({
        kind: "success",
        msg: newFlags.length > 0
          ? `Scan complete — ${newFlags.length} new anomaly flag${newFlags.length > 1 ? "s" : ""} created.`
          : "Scan complete — no new anomalies detected.",
      });
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Scan failed." });
    } finally {
      setScanLoading(false);
    }
  }

  // ── Resolve flag ───────────────────────────────────────────────────────────
  async function handleResolve(id: number, status: "Reviewed" | "Dismissed") {
    setResolvingId(id);
    setBanner(null);
    try {
      await resolveAnomalyFlag(id, status);
      // Remove resolved flag from the open list
      setFlags((prev) => prev.filter((f) => f.id !== id));
      setBanner({ kind: "success", msg: `Flag #${id} marked as ${status}.` });
    } catch (e: unknown) {
      setBanner({ kind: "error", msg: e instanceof Error ? e.message : "Failed to resolve flag." });
    } finally {
      setResolvingId(null);
    }
  }

  // ── Summary counts ─────────────────────────────────────────────────────────
  const typeGroups = flags.reduce<Record<string, number>>((acc, f) => {
    acc[f.anomalyType] = (acc[f.anomalyType] ?? 0) + 1;
    return acc;
  }, {});

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
                <Search size="sm" id="search-admin-ar" labelText="Search" placeholder="Search records…" />
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
                <SideNavLink renderIcon={Analytics} href="/admin/analytics">
                  Analytics
                </SideNavLink>
                <SideNavLink renderIcon={Warning} href="/admin/anomaly-review" isActive>
                  Anomaly Review
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
            {/* ── Page header ─────────────────────────────────────────────── */}
            <div
              style={{
                marginBottom: "1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
                  Anomaly Review Panel
                </h1>
                <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                  Detect and triage anomalous payment patterns. Run the rule-based
                  scanner to surface new flags, then mark each one as Reviewed or
                  Dismissed.
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Button
                  kind="ghost"
                  renderIcon={Renew}
                  onClick={fetchFlags}
                  disabled={loading || scanLoading}
                  size="md"
                >
                  Refresh
                </Button>
                <Button
                  renderIcon={Misuse}
                  onClick={handleScan}
                  disabled={scanLoading || loading}
                  size="md"
                >
                  {scanLoading ? "Scanning…" : "Run Scan"}
                </Button>
              </div>
            </div>

            {/* ── Scan result notice ───────────────────────────────────────── */}
            {scanLoading && (
              <InlineLoading
                description="Running anomaly detection scan…"
                style={{ marginBottom: "1rem" }}
              />
            )}

            {scanResult !== null && !scanLoading && (
              <Tile
                style={{
                  marginBottom: "1.5rem",
                  borderLeft: `4px solid ${scanResult.found > 0 ? "#da1e28" : "#24a148"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                {scanResult.found > 0 ? (
                  <Misuse size={20} style={{ color: "#da1e28", flexShrink: 0 }} />
                ) : (
                  <Checkmark size={20} style={{ color: "#24a148", flexShrink: 0 }} />
                )}
                <p style={{ fontSize: "0.9375rem", color: "#161616" }}>
                  {scanResult.found > 0 ? (
                    <>
                      <strong>{scanResult.found}</strong> new anomaly flag
                      {scanResult.found > 1 ? "s" : ""} detected and added to the open
                      list below.
                    </>
                  ) : (
                    "Scan complete — no new anomalies found."
                  )}
                </p>
              </Tile>
            )}

            {/* ── Banner ──────────────────────────────────────────────────── */}
            {banner && (
              <InlineNotification
                kind={banner.kind}
                title={banner.kind === "success" ? "Success" : "Error"}
                subtitle={banner.msg}
                style={{ marginBottom: "1rem" }}
                lowContrast
              />
            )}

            {/* ── Summary tiles ────────────────────────────────────────────── */}
            <Grid style={{ paddingLeft: 0, paddingRight: 0, marginBottom: "1.5rem" }}>
              <Column sm={2} md={2} lg={4} style={{ marginBottom: "1rem" }}>
                <Tile style={{ borderTop: "4px solid #da1e28" }}>
                  <p style={{ fontSize: "0.75rem", color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Open Flags
                  </p>
                  <p style={{ fontSize: "2rem", fontWeight: 600, color: "#161616", marginTop: "0.5rem" }}>
                    {loading ? "—" : flags.length}
                  </p>
                </Tile>
              </Column>
              {Object.entries(typeGroups).map(([type, count]) => (
                <Column sm={2} md={2} lg={4} key={type} style={{ marginBottom: "1rem" }}>
                  <Tile style={{ borderTop: "4px solid #6929c4" }}>
                    <p style={{ fontSize: "0.75rem", color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {type}
                    </p>
                    <p style={{ fontSize: "2rem", fontWeight: 600, color: "#161616", marginTop: "0.5rem" }}>
                      {count}
                    </p>
                  </Tile>
                </Column>
              ))}
            </Grid>

            {/* ── Open flags table ─────────────────────────────────────────── */}
            {loading ? (
              <InlineLoading description="Loading open anomaly flags…" />
            ) : (
              <TableContainer
                title="Open Anomaly Flags"
                description="Only unresolved (Open) flags are shown. Scan again to detect new ones."
              >
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>ID</TableHeader>
                      <TableHeader>Type</TableHeader>
                      <TableHeader>Description</TableHeader>
                      <TableHeader>Payment ID</TableHeader>
                      <TableHeader>Detected</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {flags.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} style={{ textAlign: "center", color: "#525252", padding: "2rem 1rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                            <Checkmark size={32} style={{ color: "#24a148" }} />
                            <p>No open anomaly flags. The system is clean.</p>
                            <p style={{ fontSize: "0.8125rem" }}>Run a scan to check for new issues.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      flags.map((flag) => {
                        const isResolving = resolvingId === flag.id;
                        return (
                          <TableRow key={flag.id}>
                            <TableCell>
                              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                                #{flag.id}
                              </span>
                            </TableCell>

                            <TableCell>
                              <Tag type={anomalyTypeTag(flag.anomalyType)}>
                                {flag.anomalyType}
                              </Tag>
                            </TableCell>

                            <TableCell style={{ maxWidth: "320px" }}>
                              <span
                                style={{
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                  fontSize: "0.875rem",
                                  color: "#161616",
                                }}
                                title={flag.description}
                              >
                                {flag.description}
                              </span>
                            </TableCell>

                            <TableCell>
                              {flag.paymentId != null ? (
                                <Tag type="cool-gray">Payment #{flag.paymentId}</Tag>
                              ) : (
                                <span style={{ color: "#6f6f6f" }}>—</span>
                              )}
                            </TableCell>

                            <TableCell style={{ whiteSpace: "nowrap" }}>
                              {fmtDateTime(flag.detectedDate)}
                            </TableCell>

                            <TableCell>
                              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap" }}>
                                <Button
                                  size="sm"
                                  kind="secondary"
                                  renderIcon={Checkmark}
                                  onClick={() => handleResolve(flag.id, "Reviewed")}
                                  disabled={isResolving || resolvingId !== null}
                                >
                                  {isResolving ? "…" : "Reviewed"}
                                </Button>
                                <Button
                                  size="sm"
                                  kind="ghost"
                                  renderIcon={Close}
                                  onClick={() => handleResolve(flag.id, "Dismissed")}
                                  disabled={isResolving || resolvingId !== null}
                                >
                                  {isResolving ? "…" : "Dismiss"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </main>
        </>
      )}
    />
  );
}
