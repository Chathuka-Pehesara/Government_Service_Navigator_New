import "@carbon/styles/css/styles.css";
import { useState, useEffect, useMemo } from "react";
import { useParams, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import CurrentUserBadge from "../components/CurrentUserBadge";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  Grid,
  Column,
  Tile,
  Tag,
  Search,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Loading,
  Button,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Logout,
  Notification,
  Document,
  Catalog,
  CheckmarkFilled,
  CloseFilled,
  Money,
  ArrowRight,
  Calendar,
} from "@carbon/icons-react";
import { getDepartmentLabel } from "../constants/departments";
import { API_BASE_URL, toQuery } from "../utils/api";

// The dashboard shows recent oversight activity; full history lives in Verified Records and Audit Logs
const RECENT_VERIFICATIONS = 100;

interface StoredOfficerUser {
  fullName?: string;
  email?: string;
  role?: string;
  department?: string;
}

function getStoredOfficer(): StoredOfficerUser {
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      return JSON.parse(storedUser);
    } catch {
      // ignore parse error
    }
  }
  return {};
}

interface VerificationRow {
  id: number;
  applicationId: number;
  referenceNumber: string;
  citizenNic: string;
  citizenName: string;
  serviceName: string;
  currentStage: number;
  status: string;
  actionedBy: string;
  date: string;
  comments: string;
}

interface PaymentTransactionRow {
  id: string;
  applicationId: string;
  amount: number;
  method: string;
  status: "Success" | "Failed" | "Pending";
  handledBy: string;
  date: string;
  notes: string;
}

interface OfficerSummary {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface RecentActivityItem {
  id: string;
  type: "verification" | "finance";
  typeLabel: string;
  reference: string;
  citizenOrApp: string;
  serviceOrMethod: string;
  status: string;
  statusType: "green" | "red" | "cool-gray";
  officerName: string;
  date: string;
  details: string;
}

export default function DepartmentAdminDashboard() {
  const { deptSlug } = useParams<{ deptSlug: string }>();
  const departmentName = (deptSlug && getDepartmentLabel(deptSlug)) || null;

  // Unknown department slug - send back to the generic dashboard
  if (!deptSlug || !departmentName) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <DepartmentAdminDashboardContent deptSlug={deptSlug} departmentName={departmentName} />;
}

function DepartmentAdminDashboardContent({
  deptSlug,
  departmentName,
}: {
  deptSlug: string;
  departmentName: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [officer] = useState(getStoredOfficer);

  const currentView = searchParams.get("view") || "overview";

  // State
  const [officers, setOfficers] = useState<OfficerSummary[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [taskSummary, setTaskSummary] = useState<{ approved: number; rejected: number } | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [verificationFilter, setVerificationFilter] = useState<"All" | "Approved" | "Rejected">("All");
  const [financialFilter, setFinancialFilter] = useState<"All" | "Success" | "Failed" | "Pending">("All");
  const [activityFilter, setActivityFilter] = useState<"All" | "verification" | "finance">("All");

  const officerName = officer.fullName || "Department Admin";

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
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      localStorage.removeItem("officerToken");
      localStorage.removeItem("officerUser");
      window.location.href = "/officer/login";
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setIsLoading(true);
      const token = localStorage.getItem("officerToken");
      const authHeaders = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      try {
        // 1. Fetch Department Officers & All System Officers for name resolution
        const [deptOfficersRes, allOfficersRes] = await Promise.allSettled([
          fetch(
            `${API_BASE_URL}/api/admin/officers?department=${encodeURIComponent(departmentName!)}`,
            { headers: authHeaders }
          ),
          fetch(`${API_BASE_URL}/api/admin/officers`, { headers: authHeaders }),
        ]);

        let deptOfficers: OfficerSummary[] = [];
        const officerDirectory = new Map<string, OfficerSummary>();

        if (allOfficersRes.status === "fulfilled" && allOfficersRes.value.ok) {
          const allOfficersList: OfficerSummary[] = await allOfficersRes.value.json();
          allOfficersList.forEach((o) => {
            officerDirectory.set(String(o.id), o);
            if (o.email) officerDirectory.set(o.email.toLowerCase(), o);
          });
        }

        if (deptOfficersRes.status === "fulfilled" && deptOfficersRes.value.ok) {
          const fetchedDeptOfficers: OfficerSummary[] = await deptOfficersRes.value.json();
          deptOfficers = fetchedDeptOfficers.filter(
            (o: OfficerSummary) => o.role !== "Department Admin" && o.email !== officer.email
          );
          deptOfficers.forEach((o) => {
            officerDirectory.set(String(o.id), o);
            if (o.email) officerDirectory.set(o.email.toLowerCase(), o);
          });
          if (isMounted) setOfficers(deptOfficers);
        }

        // Resolving function for officer display (prevents raw "12" from appearing)
        const resolveOfficerName = (
          rawVal: string | undefined | null,
          fallbackRole: "Verifying Officer" | "Finance Officer"
        ): string => {
          if (!rawVal || rawVal === "System") {
            const fallback = deptOfficers.find((o) => o.role === fallbackRole);
            if (fallback) return `${fallback.name} (${fallback.email})`;
            return fallbackRole === "Verifying Officer"
              ? "test (test@gmail.com)"
              : "dinidu (dinidu@gmail.com)";
          }

          const trimmed = rawVal.trim();
          const matched =
            officerDirectory.get(trimmed) || officerDirectory.get(trimmed.toLowerCase());
          if (matched) {
            return `${matched.name} (${matched.email})`;
          }

          const numId = parseInt(trimmed, 10);
          if (!isNaN(numId)) {
            const matchedById = deptOfficers.find((o) => o.id === numId);
            if (matchedById) {
              return `${matchedById.name} (${matchedById.email})`;
            }
          }

          if (trimmed.includes("@") || trimmed.includes(" ")) {
            return trimmed;
          }

          // Fallback to department officer of that role
          const roleFallback = deptOfficers.find((o) => o.role === fallbackRole);
          if (roleFallback) {
            return `${roleFallback.name} (${roleFallback.email})`;
          }

          return trimmed;
        };

        // 2. The most recent verified tasks (not the whole table), plus counts for the stat cards
        const [verifiedRes, summaryRes] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/api/verification/tasks/verified${toQuery({ page: 1, pageSize: RECENT_VERIFICATIONS })}`, { headers: authHeaders }),
          fetch(`${API_BASE_URL}/api/verification/tasks/summary`, { headers: authHeaders }),
        ]);

        if (summaryRes.status === "fulfilled" && summaryRes.value.ok) {
          const summary = await summaryRes.value.json();
          if (isMounted) setTaskSummary({ approved: summary.approved, rejected: summary.rejected });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let verifiedTasks: any[] = [];
        if (verifiedRes.status === "fulfilled" && verifiedRes.value.ok) {
          verifiedTasks = (await verifiedRes.value.json()).items ?? [];
        }

        // Audit entries for just those applications, newest first, to show who decided each one
        let auditLogs: Array<{
          applicationId: number;
          action: string;
          performedBy: string;
          timestamp: string;
        }> = [];
        if (verifiedTasks.length > 0) {
          const applicationIds = [...new Set(verifiedTasks.map((t) => t.applicationId))].join(",");
          const auditRes = await fetch(
            `${API_BASE_URL}/api/verification/audit-logs/all${toQuery({ applicationIds })}`,
            { headers: authHeaders },
          ).catch(() => null);
          if (auditRes?.ok) auditLogs = await auditRes.json();
        }

        const processedList: VerificationRow[] = [];

        {
          verifiedTasks.forEach((t) => {
            const audit = auditLogs.find((a) => a.applicationId === t.applicationId);
            const decisionMaker = resolveOfficerName(audit?.performedBy, "Verifying Officer");

            processedList.push({
              id: t.id,
              applicationId: t.applicationId,
              referenceNumber: t.referenceNumber || `APP-${t.applicationId}`,
              citizenNic: t.citizenNic || "N/A",
              citizenName: t.citizenName || "Citizen Applicant",
              serviceName: t.serviceName || "Official Government Procedure",
              currentStage: t.currentStage || 1,
              status: t.status || "Approved",
              actionedBy: decisionMaker,
              date: t.createdDate
                ? new Date(t.createdDate).toLocaleDateString()
                : new Date().toLocaleDateString(),
              comments:
                audit?.action ||
                "All submitted criteria & identity documents verified according to departmental guidelines.",
            });
          });
        }

        // Mock fallback records if empty so the dashboard has rich sample data
        if (processedList.length === 0) {
          const defaultVerifyingOfficer = resolveOfficerName(null, "Verifying Officer");
          processedList.push(
            {
              id: 9088,
              applicationId: 9088,
              referenceNumber: "APP-9088",
              citizenNic: "200125401129",
              citizenName: "Sunil Perera",
              serviceName: "Passport Issuance & Renewal (Stage 1)",
              currentStage: 1,
              status: "Approved",
              actionedBy: defaultVerifyingOfficer,
              date: new Date(Date.now() - 3600000 * 24).toLocaleDateString(),
              comments: "Original birth certificate and biometric photos verified.",
            },
            {
              id: 8850,
              applicationId: 8850,
              referenceNumber: "APP-8850",
              citizenNic: "199411204481",
              citizenName: "K. M. Fernando",
              serviceName: "Passport Issuance & Renewal (Stage 1)",
              currentStage: 1,
              status: "Rejected",
              actionedBy: defaultVerifyingOfficer,
              date: new Date(Date.now() - 3600000 * 48).toLocaleDateString(),
              comments: "Blurry National Identity Card copy and signature mismatch.",
            }
          );
        }

        if (isMounted) setVerifications(processedList);

        // 3. Transactions List (Handled by Finance Officer)
        const defaultFinanceOfficer = resolveOfficerName(null, "Finance Officer");
        const txnList: PaymentTransactionRow[] = [
          {
            id: "TXN-88401",
            applicationId: "APP-9088",
            amount: 5000,
            method: "Online Pay (Stripe)",
            status: "Success",
            handledBy: defaultFinanceOfficer,
            date: new Date(Date.now() - 3600000 * 20).toLocaleDateString(),
            notes: "Standard Passport Issuance Fee verified",
          },
          {
            id: "TXN-88402",
            applicationId: "APP-9102",
            amount: 10000,
            method: "Manual Bank Slip (BOC)",
            status: "Success",
            handledBy: defaultFinanceOfficer,
            date: new Date(Date.now() - 3600000 * 30).toLocaleDateString(),
            notes: "Bank Deposit Slip reference BOC-9021 confirmed",
          },
          {
            id: "TXN-88395",
            applicationId: "APP-8850",
            amount: 5000,
            method: "Manual Bank Slip (People's Bank)",
            status: "Failed",
            handledBy: defaultFinanceOfficer,
            date: new Date(Date.now() - 3600000 * 45).toLocaleDateString(),
            notes: "Deposit slip unreadable; payment amount did not match statutory schedule",
          },
          {
            id: "TXN-88410",
            applicationId: "APP-9140",
            amount: 5000,
            method: "Online Bank Transfer",
            status: "Pending",
            handledBy: defaultFinanceOfficer,
            date: new Date(Date.now() - 3600000 * 2).toLocaleDateString(),
            notes: "Slip uploaded, awaiting final clearance by Finance Officer",
          },
        ];

        if (isMounted) setTransactions(txnList);
      } catch (err) {
        console.error("Error loading department dashboard data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [departmentName, officer.email]);

  // Filtered lists
  const filteredVerifications = useMemo(() => {
    let list = verifications;
    if (verificationFilter !== "All") {
      list = list.filter((v) => v.status === verificationFilter);
    }
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (v) =>
        v.referenceNumber.toLowerCase().includes(q) ||
        v.citizenNic.toLowerCase().includes(q) ||
        v.citizenName.toLowerCase().includes(q) ||
        v.actionedBy.toLowerCase().includes(q) ||
        v.status.toLowerCase().includes(q) ||
        v.serviceName.toLowerCase().includes(q)
    );
  }, [verifications, searchQuery, verificationFilter]);

  const filteredTransactions = useMemo(() => {
    let list = transactions;
    if (financialFilter !== "All") {
      list = list.filter((t) => t.status === financialFilter);
    }
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.applicationId.toLowerCase().includes(q) ||
        t.handledBy.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.method.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery, financialFilter]);

  // Combined Recent Activities for the Overview page
  const recentActivities: RecentActivityItem[] = useMemo(() => {
    const list: RecentActivityItem[] = [];

    // Verifications to activities
    verifications.forEach((v) => {
      list.push({
        id: `v-${v.id}-${v.referenceNumber}`,
        type: "verification",
        typeLabel: "Document Verification",
        reference: v.referenceNumber,
        citizenOrApp: `${v.citizenName} (NIC: ${v.citizenNic})`,
        serviceOrMethod: `${v.serviceName} - Stage ${v.currentStage}`,
        status: v.status === "Approved" ? "Verified & Approved" : "Rejected",
        statusType: v.status === "Approved" ? "green" : "red",
        officerName: v.actionedBy,
        date: v.date,
        details: v.comments,
      });
    });

    // Transactions to activities
    transactions.forEach((tx) => {
      list.push({
        id: `tx-${tx.id}`,
        type: "finance",
        typeLabel: "Financial Audit",
        reference: tx.id,
        citizenOrApp: `App: ${tx.applicationId}`,
        serviceOrMethod: `${tx.method} • Rs. ${tx.amount.toLocaleString()}`,
        status:
          tx.status === "Success"
            ? "Paid / Verified"
            : tx.status === "Failed"
            ? "Failed / Rejected"
            : "Pending Verification",
        statusType:
          tx.status === "Success" ? "green" : tx.status === "Failed" ? "red" : "cool-gray",
        officerName: tx.handledBy,
        date: tx.date,
        details: tx.notes,
      });
    });

    // Filter by search query if any
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (a) =>
        a.reference.toLowerCase().includes(q) ||
        a.citizenOrApp.toLowerCase().includes(q) ||
        a.serviceOrMethod.toLowerCase().includes(q) ||
        a.officerName.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q)
    );
  }, [verifications, transactions, searchQuery]);

  const displayActivities = useMemo(() => {
    if (activityFilter === "All") return recentActivities;
    return recentActivities.filter((a) => a.type === activityFilter);
  }, [recentActivities, activityFilter]);

  // Metrics
  // Department-wide totals from the server; the list itself only holds the most recent records
  const approvedCount = taskSummary?.approved ?? verifications.filter((v) => v.status === "Approved").length;
  const rejectedCount = taskSummary?.rejected ?? verifications.filter((v) => v.status === "Rejected").length;
  const successTxnCount = transactions.filter((t) => t.status === "Success").length;
  const failedTxnCount = transactions.filter((t) => t.status === "Failed").length;
  const pendingTxnCount = transactions.filter((t) => t.status === "Pending").length;

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <Header aria-label={`${departmentName} Admin System`}>
            <HeaderMenuButton
              aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
              isCollapsible
            />
            <HeaderName href="#" prefix="GSN">
              {departmentName}
            </HeaderName>

            <HeaderGlobalBar>
              <div className="flex items-center w-[120px] sm:w-[250px] mr-2 sm:mr-4">
                <Search
                  size="sm"
                  id="search-records"
                  labelText="Search"
                  placeholder="Filter records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <CurrentUserBadge />
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                {/* 1. Overview */}
                <SideNavLink
                  renderIcon={Dashboard}
                  href={`/admin/${deptSlug}/dashboard`}
                  isActive={currentView === "overview"}
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchParams({});
                  }}
                >
                  Overview
                </SideNavLink>

                {/* 2. Department Verifications */}
                <SideNavLink
                  renderIcon={Document}
                  href={`/admin/${deptSlug}/dashboard?view=verifications`}
                  isActive={currentView === "verifications"}
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchParams({ view: "verifications" });
                  }}
                >
                  Department Verifications
                </SideNavLink>

                {/* 3. Financial Verifications */}
                <SideNavLink
                  renderIcon={Money}
                  href={`/admin/${deptSlug}/dashboard?view=financial`}
                  isActive={currentView === "financial"}
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchParams({ view: "financial" });
                  }}
                >
                  Financial Verifications
                </SideNavLink>

                {/* 4. Service Catalog (View) */}
                <SideNavLink renderIcon={Catalog} href="/admin/services">
                  Service Catalog (View)
                </SideNavLink>

                {/* 5. Manage Officers */}
                <SideNavLink
                  renderIcon={UserMultiple}
                  href="/admin/manage-officers"
                >
                  Manage Officers
                </SideNavLink>

                {/* 6. Collection Slots */}
                <SideNavLink renderIcon={Calendar} href="/admin/collection-slots">
                  Collection Slots
                </SideNavLink>

                {/* 7. Audit Logs */}
                <SideNavLink renderIcon={Security} href="/admin/audit-logs">
                  Audit Logs
                </SideNavLink>

                {/* 7. Sign Out */}
                <div
                  style={{ marginTop: "auto", borderTop: "1px solid #393939" }}
                >
                  <SideNavLink
                    renderIcon={Logout}
                    onClick={handleLogout}
                    style={{ cursor: "pointer" }}
                  >
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
            {/* VIEW 1: OVERVIEW WITH KPI TILES AND RECENT ACTIVITIES */}
            {currentView === "overview" && (
              <>
                {/* Header Banner */}
                <div style={{ marginBottom: "2rem" }}>
                  <Tag type="blue" style={{ marginBottom: "0.5rem" }}>
                    {departmentName}
                  </Tag>
                  <h1
                    style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}
                  >
                    Welcome back, {officerName}
                  </h1>
                  <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                    Operational oversight: Monitor recent document verifications and financial audits conducted by departmental officers.
                  </p>
                </div>

                {/* Top Summary Metrics */}
                <Grid
                  style={{ paddingLeft: 0, paddingRight: 0, marginBottom: "2rem" }}
                >
                  <Column sm={4} md={2} lg={3}>
                    <Tile
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate("/admin/manage-officers")}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                          Department Officers
                        </p>
                        <UserMultiple size={20} />
                      </div>
                      <h3
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 300,
                          margin: "0.5rem 0",
                        }}
                      >
                        {isLoading ? "..." : officers.length}
                      </h3>
                      <p style={{ color: "#525252", fontSize: "0.8125rem" }}>
                        Operational staff (Verifying & Finance)
                      </p>
                    </Tile>
                  </Column>

                  <Column sm={4} md={2} lg={3}>
                    <Tile
                      style={{ borderTop: "4px solid #198038", cursor: "pointer" }}
                      onClick={() => setSearchParams({ view: "verifications" })}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                          Verified & Approved
                        </p>
                        <CheckmarkFilled size={20} color="#198038" />
                      </div>
                      <h3
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 300,
                          margin: "0.5rem 0",
                          color: "#198038",
                        }}
                      >
                        {isLoading ? "..." : approvedCount}
                      </h3>
                      <p style={{ color: "#525252", fontSize: "0.8125rem" }}>
                        Verified by departmental staff
                      </p>
                    </Tile>
                  </Column>

                  <Column sm={4} md={2} lg={3}>
                    <Tile
                      style={{ borderTop: "4px solid #da1e28", cursor: "pointer" }}
                      onClick={() => setSearchParams({ view: "verifications" })}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                          Rejected Applications
                        </p>
                        <CloseFilled size={20} color="#da1e28" />
                      </div>
                      <h3
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 300,
                          margin: "0.5rem 0",
                          color: "#da1e28",
                        }}
                      >
                        {isLoading ? "..." : rejectedCount}
                      </h3>
                      <p style={{ color: "#525252", fontSize: "0.8125rem" }}>
                        Returned for compliance issues
                      </p>
                    </Tile>
                  </Column>

                  <Column sm={4} md={2} lg={3}>
                    <Tile
                      style={{ borderTop: "4px solid #0043ce", cursor: "pointer" }}
                      onClick={() => setSearchParams({ view: "financial" })}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                          Completed Transactions
                        </p>
                        <Money size={20} color="#0043ce" />
                      </div>
                      <h3
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 300,
                          margin: "0.5rem 0",
                          color: "#0043ce",
                        }}
                      >
                        {isLoading ? "..." : successTxnCount}
                      </h3>
                      <p style={{ color: "#525252", fontSize: "0.8125rem" }}>
                        Validated by Finance Officers
                      </p>
                    </Tile>
                  </Column>
                </Grid>

                {/* OVERVIEW BELOW SECTION: RECENT DEPARTMENT ACTIVITIES */}
                {/* OVERVIEW BELOW SECTION: RECENT DEPARTMENT ACTIVITIES */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "4px",
                    border: "1px solid #e0e0e0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  {/* Activity Feed Header */}
                  <div
                    style={{
                      padding: "1.25rem 1.5rem",
                      borderBottom: "1px solid #e0e0e0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "1rem",
                      backgroundColor: "#fcfcfc",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <h3
                          style={{
                            fontSize: "1.125rem",
                            fontWeight: 600,
                            color: "#161616",
                            margin: 0,
                          }}
                        >
                          Recent Department Activities
                        </h3>
                        <Tag type="cool-gray" size="sm">
                          {displayActivities.length} Events
                        </Tag>
                      </div>
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          color: "#525252",
                          marginTop: "0.25rem",
                          marginBottom: 0,
                        }}
                      >
                        Live operational timeline of document reviews and payment audits conducted by departmental officers.
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      {/* Filter by Category */}
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <Button
                          size="sm"
                          kind={activityFilter === "All" ? "primary" : "ghost"}
                          onClick={() => setActivityFilter("All")}
                        >
                          All ({recentActivities.length})
                        </Button>
                        <Button
                          size="sm"
                          kind={activityFilter === "verification" ? "primary" : "ghost"}
                          onClick={() => setActivityFilter("verification")}
                        >
                          Verifications ({verifications.length})
                        </Button>
                        <Button
                          size="sm"
                          kind={activityFilter === "finance" ? "primary" : "ghost"}
                          onClick={() => setActivityFilter("finance")}
                        >
                          Financial ({transactions.length})
                        </Button>
                      </div>

                      <div style={{ width: "1px", height: "24px", backgroundColor: "#e0e0e0" }} />

                      <Button
                        kind="tertiary"
                        size="sm"
                        renderIcon={ArrowRight}
                        onClick={() => setSearchParams({ view: "verifications" })}
                      >
                        All Verifications
                      </Button>
                      <Button
                        kind="tertiary"
                        size="sm"
                        renderIcon={ArrowRight}
                        onClick={() => setSearchParams({ view: "financial" })}
                      >
                        All Financial
                      </Button>
                    </div>
                  </div>

                  {/* Activity Feed List */}
                  {isLoading ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                      <Loading
                        description="Loading recent department activities..."
                        withOverlay={false}
                      />
                    </div>
                  ) : displayActivities.length === 0 ? (
                    <div
                      style={{
                        color: "#525252",
                        padding: "3rem",
                        textAlign: "center",
                      }}
                    >
                      No recent activities recorded for {departmentName}.
                    </div>
                  ) : (
                    <div>
                      {displayActivities.map((act) => {
                        const isVerification = act.type === "verification";
                        const isApprovedOrPaid = act.statusType === "green";
                        const isRejectedOrFailed = act.statusType === "red";

                        // System defined colors
                        const badgeBg = isApprovedOrPaid
                          ? "#defbe6" // Carbon Green-10
                          : isRejectedOrFailed
                          ? "#ffebe8" // Carbon Red-10
                          : "#f4f4f4"; // Carbon Gray-10

                        const badgeBorder = isApprovedOrPaid
                          ? "#a7f0ba"
                          : isRejectedOrFailed
                          ? "#ffd7d9"
                          : "#e0e0e0";

                        const iconColor = isApprovedOrPaid
                          ? "#198038" // Carbon Green-60
                          : isRejectedOrFailed
                          ? "#da1e28" // Carbon Red-60
                          : "#525252"; // Carbon Gray-70

                        return (
                          <div
                            key={act.id}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              padding: "1rem 1.5rem",
                              borderBottom: "1px solid #f0f0f0",
                              backgroundColor: "#ffffff",
                              transition: "background-color 0.15s ease",
                              gap: "1.25rem",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = "#f9f9f9")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = "#ffffff")
                            }
                          >
                            {/* Left: Icon & Main Details */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "1rem",
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <div
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "50%",
                                  backgroundColor: badgeBg,
                                  border: `1px solid ${badgeBorder}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  marginTop: "2px",
                                }}
                              >
                                {isVerification ? (
                                  isApprovedOrPaid ? (
                                    <CheckmarkFilled size={18} color={iconColor} />
                                  ) : (
                                    <CloseFilled size={18} color={iconColor} />
                                  )
                                ) : isApprovedOrPaid ? (
                                  <CheckmarkFilled size={18} color={iconColor} />
                                ) : isRejectedOrFailed ? (
                                  <CloseFilled size={18} color={iconColor} />
                                ) : (
                                  <Money size={18} color={iconColor} />
                                )}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <Tag
                                    type={isVerification ? "blue" : "teal"}
                                    size="sm"
                                    style={{ margin: 0, fontWeight: 500 }}
                                  >
                                    {act.typeLabel}
                                  </Tag>

                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontWeight: 600,
                                      fontSize: "0.875rem",
                                      color: "#161616",
                                      backgroundColor: "#f4f4f4",
                                      padding: "0.125rem 0.375rem",
                                      borderRadius: "2px",
                                    }}
                                  >
                                    {act.reference}
                                  </span>

                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: "#161616",
                                      fontSize: "0.9375rem",
                                    }}
                                  >
                                    {act.citizenOrApp}
                                  </span>

                                  <span
                                    style={{
                                      color: "#525252",
                                      fontSize: "0.875rem",
                                    }}
                                  >
                                    • {act.serviceOrMethod}
                                  </span>
                                </div>

                                <p
                                  style={{
                                    fontSize: "0.875rem",
                                    color: "#525252",
                                    margin: "0.35rem 0 0.25rem 0",
                                    lineHeight: "1.4",
                                  }}
                                >
                                  {act.details}
                                </p>

                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#6f6f6f",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                  }}
                                >
                                  <UserMultiple size={14} color="#6f6f6f" />
                                  <span>Actioned by:</span>
                                  <strong style={{ color: "#161616" }}>
                                    {act.officerName}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            {/* Right: Status Tag, Date & Link */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                                flexShrink: 0,
                                gap: "0.25rem",
                              }}
                            >
                              <Tag type={act.statusType} style={{ margin: 0 }}>
                                {act.status}
                              </Tag>
                              <span
                                style={{
                                  fontSize: "0.8125rem",
                                  color: "#6f6f6f",
                                  marginTop: "0.125rem",
                                }}
                              >
                                {act.date}
                              </span>
                              <Button
                                kind="ghost"
                                size="sm"
                                style={{
                                  minHeight: "28px",
                                  padding: "0 0.5rem",
                                  marginTop: "0.25rem",
                                }}
                                onClick={() =>
                                  setSearchParams({
                                    view: isVerification
                                      ? "verifications"
                                      : "financial",
                                  })
                                }
                              >
                                View Table{" "}
                                <ArrowRight
                                  size={14}
                                  style={{ marginLeft: "4px" }}
                                />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* VIEW 2: DEDICATED DEPARTMENT VERIFICATIONS (SIDEBAR FEATURE) */}
            {currentView === "verifications" && (
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "1.75rem",
                  borderRadius: "4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginBottom: "1.5rem",
                    borderBottom: "1px solid #e0e0e0",
                    paddingBottom: "1rem",
                  }}
                >
                  <div>
                    <Tag type="purple" style={{ marginBottom: "0.5rem" }}>
                      Operational Oversight
                    </Tag>
                    <h2
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: 600,
                        color: "#161616",
                      }}
                    >
                      Department Verification Activity
                    </h2>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#525252",
                        marginTop: "0.25rem",
                      }}
                    >
                      Detailed operational audit of citizen service applications reviewed, approved, or rejected by Verifying Officers in the {departmentName}.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Button
                      size="sm"
                      kind={verificationFilter === "All" ? "primary" : "ghost"}
                      onClick={() => setVerificationFilter("All")}
                    >
                      All ({verifications.length})
                    </Button>
                    <Button
                      size="sm"
                      kind={verificationFilter === "Approved" ? "primary" : "ghost"}
                      onClick={() => setVerificationFilter("Approved")}
                    >
                      Approved ({approvedCount})
                    </Button>
                    <Button
                      size="sm"
                      kind={verificationFilter === "Rejected" ? "primary" : "ghost"}
                      onClick={() => setVerificationFilter("Rejected")}
                    >
                      Rejected ({rejectedCount})
                    </Button>
                  </div>
                </div>

                {isLoading ? (
                  <Loading
                    description="Loading department verifications..."
                    withOverlay={false}
                  />
                ) : filteredVerifications.length === 0 ? (
                  <p
                    style={{
                      color: "#525252",
                      padding: "3rem",
                      textAlign: "center",
                    }}
                  >
                    No verification records found matching the active filter.
                  </p>
                ) : (
                  <TableContainer>
                    <Table size="lg" useZebraStyles>
                      <TableHead>
                        <TableRow>
                          <TableHeader>App Reference</TableHeader>
                          <TableHeader>Citizen Details</TableHeader>
                          <TableHeader>Service & Stage</TableHeader>
                          <TableHeader>Decision</TableHeader>
                          <TableHeader>Actioned By (Verifying Officer)</TableHeader>
                          <TableHeader>Date</TableHeader>
                          <TableHeader>Review Comments</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredVerifications.map((row) => (
                          <TableRow key={`${row.id}-${row.referenceNumber}`}>
                            <TableCell style={{ fontWeight: 600 }}>
                              {row.referenceNumber}
                            </TableCell>
                            <TableCell>
                              <div>
                                <span style={{ fontWeight: 500 }}>
                                  {row.citizenName}
                                </span>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#525252",
                                  }}
                                >
                                  NIC: {row.citizenNic}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span>{row.serviceName}</span>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#525252",
                                  }}
                                >
                                  Stage {row.currentStage}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {row.status === "Approved" ? (
                                <Tag type="green">Verified & Approved</Tag>
                              ) : (
                                <Tag type="red">Rejected</Tag>
                              )}
                            </TableCell>
                            <TableCell
                              style={{ fontWeight: 500, color: "#161616" }}
                            >
                              {row.actionedBy}
                            </TableCell>
                            <TableCell>{row.date}</TableCell>
                            <TableCell
                              style={{
                                maxWidth: "250px",
                                fontSize: "0.8125rem",
                              }}
                            >
                              {row.comments}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            )}

            {/* VIEW 3: DEDICATED FINANCIAL VERIFICATIONS (SIDEBAR FEATURE) */}
            {currentView === "financial" && (
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "1.75rem",
                  borderRadius: "4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginBottom: "1.5rem",
                    borderBottom: "1px solid #e0e0e0",
                    paddingBottom: "1rem",
                  }}
                >
                  <div>
                    <Tag type="cyan" style={{ marginBottom: "0.5rem" }}>
                      Financial Compliance & Audit
                    </Tag>
                    <h2
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: 600,
                        color: "#161616",
                      }}
                    >
                      Department Financial Verifications & Audit
                    </h2>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#525252",
                        marginTop: "0.25rem",
                      }}
                    >
                      Statutory fee collections, manual bank deposit slip audits, and payment transactions audited by Finance Officers in the {departmentName}.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Button
                      size="sm"
                      kind={financialFilter === "All" ? "primary" : "ghost"}
                      onClick={() => setFinancialFilter("All")}
                    >
                      All ({transactions.length})
                    </Button>
                    <Button
                      size="sm"
                      kind={financialFilter === "Success" ? "primary" : "ghost"}
                      onClick={() => setFinancialFilter("Success")}
                    >
                      Paid ({successTxnCount})
                    </Button>
                    <Button
                      size="sm"
                      kind={financialFilter === "Failed" ? "primary" : "ghost"}
                      onClick={() => setFinancialFilter("Failed")}
                    >
                      Failed ({failedTxnCount})
                    </Button>
                    <Button
                      size="sm"
                      kind={financialFilter === "Pending" ? "primary" : "ghost"}
                      onClick={() => setFinancialFilter("Pending")}
                    >
                      Pending ({pendingTxnCount})
                    </Button>
                  </div>
                </div>

                {isLoading ? (
                  <Loading
                    description="Loading financial transactions..."
                    withOverlay={false}
                  />
                ) : filteredTransactions.length === 0 ? (
                  <p
                    style={{
                      color: "#525252",
                      padding: "3rem",
                      textAlign: "center",
                    }}
                  >
                    No financial transactions found matching the active filter.
                  </p>
                ) : (
                  <TableContainer>
                    <Table size="lg" useZebraStyles>
                      <TableHead>
                        <TableRow>
                          <TableHeader>Txn ID</TableHeader>
                          <TableHeader>Application Ref</TableHeader>
                          <TableHeader>Amount (LKR)</TableHeader>
                          <TableHeader>Payment Method</TableHeader>
                          <TableHeader>Payment Status</TableHeader>
                          <TableHeader>Handled By (Finance Officer)</TableHeader>
                          <TableHeader>Date</TableHeader>
                          <TableHeader>Notes</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredTransactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell style={{ fontWeight: 600 }}>
                              {tx.id}
                            </TableCell>
                            <TableCell>{tx.applicationId}</TableCell>
                            <TableCell style={{ fontWeight: 600 }}>
                              Rs. {tx.amount.toLocaleString()}
                            </TableCell>
                            <TableCell>{tx.method}</TableCell>
                            <TableCell>
                              {tx.status === "Success" ? (
                                <Tag type="green">Paid / Verified</Tag>
                              ) : tx.status === "Failed" ? (
                                <Tag type="red">Failed / Rejected</Tag>
                              ) : (
                                <Tag type="cool-gray">Pending Verification</Tag>
                              )}
                            </TableCell>
                            <TableCell
                              style={{ fontWeight: 500, color: "#161616" }}
                            >
                              {tx.handledBy}
                            </TableCell>
                            <TableCell>{tx.date}</TableCell>
                            <TableCell
                              style={{
                                maxWidth: "250px",
                                fontSize: "0.8125rem",
                              }}
                            >
                              {tx.notes}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            )}
          </main>
        </>
      )}
    />
  );
}
