import "@carbon/styles/css/styles.css";
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getAdminOverviewHref, getStoredUser, isSystemAdmin } from "../utils/currentUser";
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
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Tag,
  OverflowMenu,
  OverflowMenuItem,
  Loading,
  Modal,
  Select,
  SelectItem,
  InlineNotification,
  Tile,
  Grid,
  Column,
  Search,
  Pagination,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Settings,
  Logout,
  Notification,
  Add,
  Rule,
  Catalog,
  Categories,
  Renew,
  Launch,
  Edit,
  Information,
  Phone,
  Email,
  Document,
} from "@carbon/icons-react";

import RegisterDepartmentModal from "./Department_Management/RegisterDepartmentModal";
import { CATEGORIES } from "./Department_Management/categories";
import EditDepartmentModal from "./Department_Management/EditDepartmentModal";
import type { Department } from "./Department_Management/types";
import { API_BASE_URL } from "../utils/api";

export type { Department };

const headers = [
  { key: "logoAndName", header: "Department & Logo" },
  { key: "code", header: "Department ID" },
  { key: "category", header: "Category / Sector" },
  { key: "contact", header: "Official Contact" },
  { key: "officers", header: "Officers" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions" },
];

async function requestDepartments(): Promise<Department[]> {
  const res = await fetch(`${API_BASE_URL}/api/departments`);
  if (!res.ok) throw new Error("Failed to load departments.");
  return res.json();
}

const errorMessage = (err: unknown, fallback: string) =>
  (err instanceof Error && err.message) || fallback;

export default function DepartmentManagement() {
  const storedUser = getStoredUser();
  const sysAdmin = isSystemAdmin(storedUser);

  // Department Management is restricted to System Administrators only.
  if (storedUser && !sysAdmin) {
    return <Navigate to={getAdminOverviewHref(storedUser)} replace />;
  }

  return <DepartmentManagementContent />;
}

function DepartmentManagementContent() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Modal open states
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [viewingDept, setViewingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState<boolean>(false);

  const storedUser = getStoredUser();

  const handleLoadError = (err: unknown) => {
    console.error(err);
    setNotification({ type: "error", message: errorMessage(err, "Failed to load departments") });
  };

  // Fetch all departments
  const fetchDepartments = async () => {
    try {
      setIsLoading(true);
      setDepartments(await requestDepartments());
    } catch (err) {
      handleLoadError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load (isLoading already starts as true)
  useEffect(() => {
    requestDepartments()
      .then(setDepartments)
      .catch(handleLoadError)
      .finally(() => setIsLoading(false));
  }, []);

  // Toggle Status
  const handleToggleStatus = async (dept: Department) => {
    try {
      const newStatus = dept.status === "Active" ? "Inactive" : "Active";
      if (newStatus === "Active" && !dept.hasRequiredOfficers) {
        setNotification({
          type: "error",
          message: `Cannot activate '${dept.name}'. A department requires at least one Verifying Officer and one Finance Officer assigned before activation (Currently assigned: ${dept.verifyingOfficerCount ?? 0} Verifying, ${dept.financeOfficerCount ?? 0} Finance).`,
        });
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/departments/${dept.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change department status.");

      setNotification({
        type: "success",
        message: `Department '${dept.name}' is now ${newStatus}.`,
      });
      fetchDepartments();
    } catch (err) {
      setNotification({ type: "error", message: errorMessage(err, "Failed to change status") });
    }
  };

  // Delete Department
  const handleDeleteSubmit = async () => {
    if (!deletingDept) return;
    try {
      setIsDeleteSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/departments/${deletingDept.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete department.");
      }
      setNotification({ type: "success", message: `Department '${deletingDept.name}' deleted successfully.` });
      setDeletingDept(null);
      fetchDepartments();
    } catch (err) {
      setNotification({ type: "error", message: errorMessage(err, "Failed to delete department.") });
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

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
      localStorage.removeItem("adminToken");
      window.location.href = "/officer/login";
    }
  };

  // Filtered rows
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const filteredDepartments = departments.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.departmentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.category && d.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.contactNumber && d.contactNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.email && d.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === "All" || d.category === categoryFilter;
    const matchesStatus = statusFilter === "All" || d.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Reset page when filters change (adjusted during render, not in an effect)
  const filterKey = `${searchTerm}|${categoryFilter}|${statusFilter}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // KPI Metrics
  const totalCount = departments.length;
  const activeCount = departments.filter((d) => d.status === "Active").length;
  const totalOfficers = departments.reduce((acc, curr) => acc + (curr.officerCount || 0), 0);

  return (
    <>
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
                <CurrentUserBadge />
                <HeaderGlobalAction aria-label="Notifications" onClick={() => { }}>
                  <Notification size={20} />
                </HeaderGlobalAction>
              </HeaderGlobalBar>

              <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
                <SideNavItems>
                  <SideNavLink renderIcon={Dashboard} href={getAdminOverviewHref(storedUser)}>
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
                  <SideNavLink renderIcon={Document} href="/admin/services/builder">
                    Template Builder
                  </SideNavLink>
                  <SideNavLink renderIcon={Rule} href="/admin/services/simulator">
                    Eligibility Simulator
                  </SideNavLink>

                  <SideNavLink renderIcon={Categories} href="/admin/departments" isActive>
                    Department Management
                  </SideNavLink>

                  <SideNavLink renderIcon={UserMultiple} href="/admin/manage-officers">
                    Manage Officers
                  </SideNavLink>
                  <SideNavLink renderIcon={Security} href="/admin/audit-logs">
                    Audit Logs
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

            {/* Main Content */}
            <main
              className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64"
              style={{ backgroundColor: "#f4f4f4" }}
            >
              {/* Page Header */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <h1
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 600,
                        color: "#161616",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Department Management
                    </h1>
                    <p style={{ color: "#525252", fontSize: "0.925rem" }}>
                      Register and govern state departments, auto-generate official Department IDs, manage logos, and configure contact channels.
                    </p>
                  </div>
                  <Button
                    renderIcon={Add}
                    onClick={() => setIsRegisterOpen(true)}
                    kind="primary"
                    size="md"
                  >
                    Register Department
                  </Button>
                </div>
              </div>

              {/* Notification alert */}
              {notification && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <InlineNotification
                    kind={notification.type}
                    title={notification.type === "success" ? "Success" : "Error"}
                    subtitle={notification.message}
                    onClose={() => setNotification(null)}
                  />
                </div>
              )}

              {/* KPI Metric Tiles */}
              <Grid fullWidth style={{ marginBottom: "1.5rem", padding: 0 }}>
                <Column sm={4} md={2} lg={4}>
                  <Tile
                    style={{
                      backgroundColor: "#ffffff",
                      borderLeft: "4px solid #0f62fe",
                      minHeight: "100px",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ color: "#525252", fontSize: "0.85rem", fontWeight: 500 }}>
                      Total Registered
                    </div>
                    <div
                      style={{
                        fontSize: "2rem",
                        fontWeight: 700,
                        color: "#161616",
                        marginTop: "0.25rem",
                      }}
                    >
                      {totalCount}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#8d8d8d", marginTop: "0.25rem" }}>
                      Government Authorities
                    </div>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile
                    style={{
                      backgroundColor: "#ffffff",
                      borderLeft: "4px solid #24a148",
                      minHeight: "100px",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ color: "#525252", fontSize: "0.85rem", fontWeight: 500 }}>
                      Active Departments
                    </div>
                    <div
                      style={{
                        fontSize: "2rem",
                        fontWeight: 700,
                        color: "#24a148",
                        marginTop: "0.25rem",
                      }}
                    >
                      {activeCount}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#8d8d8d", marginTop: "0.25rem" }}>
                      Accepting Workflow Routing
                    </div>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile
                    style={{
                      backgroundColor: "#ffffff",
                      borderLeft: "4px solid #8a3ffc",
                      minHeight: "100px",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ color: "#525252", fontSize: "0.85rem", fontWeight: 500 }}>
                      Assigned Officers
                    </div>
                    <div
                      style={{
                        fontSize: "2rem",
                        fontWeight: 700,
                        color: "#8a3ffc",
                        marginTop: "0.25rem",
                      }}
                    >
                      {totalOfficers}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#8d8d8d", marginTop: "0.25rem" }}>
                      Verification Personnel
                    </div>
                  </Tile>
                </Column>
                <Column sm={4} md={2} lg={4}>
                  <Tile
                    style={{
                      backgroundColor: "#ffffff",
                      borderLeft: "4px solid #1192e8",
                      minHeight: "100px",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ color: "#525252", fontSize: "0.85rem", fontWeight: 500 }}>
                      Auto-Generator
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 700,
                        color: "#1192e8",
                        marginTop: "0.25rem",
                      }}
                    >
                      DEP-{String(totalCount + 1).padStart(3, "0")}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#8d8d8d", marginTop: "0.25rem" }}>
                      Sequential Generator Active
                    </div>
                  </Tile>
                </Column>
              </Grid>

              {/* Department Table Card */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                <TableContainer
                  title="Registered State Departments"
                  description="Authoritative registry of participating government departments in Sri Lanka"
                >
                  {/* Highly Responsive & Clear Filter Control Bar */}
                  <div
                    style={{
                      backgroundColor: "#ffffff",
                      padding: "1rem 1.25rem",
                      borderBottom: "1px solid #e0e0e0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.875rem",
                    }}
                  >
                    {/* Top Row: Search and Status Quick-Filter Pills */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "1rem",
                      }}
                    >
                      {/* Search Bar with generous responsive width */}
                      <div style={{ flex: "1 1 280px", maxWidth: "460px" }}>
                        <Search
                          size="md"
                          id="search-departments"
                          labelText="Search registry"
                          placeholder="Search by name, ID (DEP-XXX), phone, or email..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onClear={() => setSearchTerm("")}
                        />
                      </div>

                      {/* Clear Quick Status Pills */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.825rem", fontWeight: 600, color: "#525252", marginRight: "0.25rem" }}>
                          Status:
                        </span>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("All")}
                          style={{
                            padding: "0.35rem 0.85rem",
                            borderRadius: "16px",
                            border: statusFilter === "All" ? "2px solid #0f62fe" : "1px solid #d0d0d0",
                            backgroundColor: statusFilter === "All" ? "#edf5ff" : "#ffffff",
                            color: statusFilter === "All" ? "#0043ce" : "#525252",
                            fontWeight: statusFilter === "All" ? 700 : 500,
                            fontSize: "0.825rem",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          All ({totalCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("Active")}
                          style={{
                            padding: "0.35rem 0.85rem",
                            borderRadius: "16px",
                            border: statusFilter === "Active" ? "2px solid #24a148" : "1px solid #d0d0d0",
                            backgroundColor: statusFilter === "Active" ? "#defbe6" : "#ffffff",
                            color: statusFilter === "Active" ? "#0e6027" : "#525252",
                            fontWeight: statusFilter === "Active" ? 700 : 500,
                            fontSize: "0.825rem",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          Active ({activeCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("Inactive")}
                          style={{
                            padding: "0.35rem 0.85rem",
                            borderRadius: "16px",
                            border: statusFilter === "Inactive" ? "2px solid #da1e28" : "1px solid #d0d0d0",
                            backgroundColor: statusFilter === "Inactive" ? "#fff1f1" : "#ffffff",
                            color: statusFilter === "Inactive" ? "#a2191f" : "#525252",
                            fontWeight: statusFilter === "Inactive" ? 700 : 500,
                            fontSize: "0.825rem",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          Inactive ({totalCount - activeCount})
                        </button>
                      </div>
                    </div>

                    {/* Bottom Row: Sector / Category Dropdown with Full Label and Results Summary */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "1rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid #f0f0f0",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                        <label
                          htmlFor="filter-category"
                          style={{ fontSize: "0.825rem", fontWeight: 600, color: "#161616", whiteSpace: "nowrap" }}
                        >
                          Sector / Category:
                        </label>
                        <div style={{ width: "260px", minWidth: "220px" }}>
                          <Select
                            id="filter-category"
                            labelText=""
                            hideLabel
                            size="md"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                          >
                            <SelectItem value="All" text="All Sectors & Categories" />
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat} text={cat} />
                            ))}
                          </Select>
                        </div>

                        {(categoryFilter !== "All" || statusFilter !== "All" || searchTerm.trim()) && (
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => {
                              setSearchTerm("");
                              setCategoryFilter("All");
                              setStatusFilter("All");
                            }}
                            style={{ color: "#da1e28", fontWeight: 600 }}
                          >
                            Reset Filters
                          </Button>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "0.825rem", color: "#6f6f6f" }}>
                          Showing <strong>{filteredDepartments.length}</strong> of <strong>{totalCount}</strong> departments
                        </span>
                        <Button
                          kind="ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={Renew}
                          iconDescription="Refresh List"
                          onClick={fetchDepartments}
                        />
                      </div>
                    </div>
                  </div>

                  {isLoading ? (
                    <div style={{ padding: "4rem", display: "flex", justifyContent: "center" }}>
                      <Loading withOverlay={false} description="Loading department records..." />
                    </div>
                  ) : filteredDepartments.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "#6f6f6f" }}>
                      <Information
                        size={32}
                        style={{ margin: "0 auto 0.75rem auto", display: "block", fill: "#8d8d8d" }}
                      />
                      <p style={{ fontWeight: 600, fontSize: "1rem" }}>
                        No departments match the specified criteria.
                      </p>
                      <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                        Try adjusting your search terms or registering a new department.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => (
                              <TableHeader key={header.key}>{header.header}</TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredDepartments
                            .slice((page - 1) * pageSize, page * pageSize)
                            .map((dept) => (
                              <TableRow key={dept.id}>
                                {/* Logo and Name */}
                                <TableCell>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
                                    <div
                                      style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "6px",
                                        backgroundColor: "#f4f4f4",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        overflow: "hidden",
                                        flexShrink: 0,
                                        border: "1px solid #e0e0e0",
                                      }}
                                    >
                                      {dept.logoUrl ? (
                                        <img
                                          src={dept.logoUrl}
                                          alt={dept.name}
                                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        <div
                                          style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f62fe" }}
                                        >
                                          {dept.name.substring(0, 2).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <div
                                        style={{ fontWeight: 600, color: "#161616", fontSize: "0.925rem" }}
                                      >
                                        {dept.name}
                                      </div>
                                      {dept.description && (
                                        <div
                                          style={{
                                            fontSize: "0.78rem",
                                            color: "#6f6f6f",
                                            maxWidth: "260px",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                          title={dept.description}
                                        >
                                          {dept.description}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>

                                {/* Department ID Code */}
                                <TableCell>
                                  <Tag type="blue" style={{ fontWeight: 600, letterSpacing: "0.5px" }}>
                                    {dept.departmentCode}
                                  </Tag>
                                </TableCell>

                                {/* Category */}
                                <TableCell>
                                  <Tag type="purple">{dept.category || "General"}</Tag>
                                </TableCell>

                                {/* Contact Info */}
                                <TableCell>
                                  <div style={{ fontSize: "0.825rem", lineHeight: "1.4" }}>
                                    {dept.contactNumber ? (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.35rem",
                                          color: "#161616",
                                        }}
                                      >
                                        <Phone size={14} style={{ fill: "#0f62fe" }} />
                                        <span>{dept.contactNumber}</span>
                                      </div>
                                    ) : (
                                      <span style={{ color: "#a8a8a8" }}>No phone</span>
                                    )}
                                    {dept.email && (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.35rem",
                                          color: "#525252",
                                          marginTop: "2px",
                                        }}
                                      >
                                        <Email size={14} style={{ fill: "#8d8d8d" }} />
                                        <span style={{ fontSize: "0.775rem" }}>{dept.email}</span>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>

                                {/* Officers */}
                                <TableCell>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap" }}>
                                      <Tag type={dept.verifyingOfficerCount ? "teal" : "gray"} size="sm">
                                        {dept.verifyingOfficerCount ?? 0} Verifying
                                      </Tag>
                                      <Tag type={dept.financeOfficerCount ? "purple" : "gray"} size="sm">
                                        {dept.financeOfficerCount ?? 0} Finance
                                      </Tag>
                                    </div>
                                    {!dept.hasRequiredOfficers && (
                                      <span style={{ fontSize: "0.68rem", color: "#da1e28", fontWeight: 600 }}>
                                        ⚠ Needs both roles
                                      </span>
                                    )}
                                  </div>
                                </TableCell>

                                {/* Status */}
                                <TableCell>
                                  <Tag type={dept.status === "Active" ? "green" : "red"}>
                                    {dept.status}
                                  </Tag>
                                </TableCell>

                                {/* Actions */}
                                <TableCell>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                    <Button
                                      hasIconOnly
                                      renderIcon={Information}
                                      iconDescription="View Details"
                                      kind="ghost"
                                      size="sm"
                                      onClick={() => setViewingDept(dept)}
                                    />
                                    <Button
                                      hasIconOnly
                                      renderIcon={Edit}
                                      iconDescription="Edit Department"
                                      kind="ghost"
                                      size="sm"
                                      onClick={() => setEditingDept(dept)}
                                    />
                                    <OverflowMenu flipped size="sm">
                                      <OverflowMenuItem
                                        itemText={
                                          dept.status === "Active"
                                            ? "Deactivate Department"
                                            : "Activate Department"
                                        }
                                        onClick={() => handleToggleStatus(dept)}
                                      />
                                      {dept.website && (
                                        <OverflowMenuItem
                                          itemText="Visit Department Portal"
                                          onClick={() => window.open(dept.website, "_blank")}
                                        />
                                      )}
                                      <OverflowMenuItem
                                        hasDivider
                                        isDelete
                                        itemText="Delete Department"
                                        onClick={() => setDeletingDept(dept)}
                                      />
                                    </OverflowMenu>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                      <Pagination
                        backwardText="Previous page"
                        forwardText="Next page"
                        itemsPerPageText="Rows per page:"
                        page={page}
                        pageSize={pageSize}
                        pageSizes={[10, 20, 50]}
                        totalItems={filteredDepartments.length}
                        onChange={({ page, pageSize }) => {
                          if (page) setPage(page);
                          if (pageSize) setPageSize(pageSize);
                        }}
                      />
                    </>
                  )}
                </TableContainer>
              </div>
            </main>
          </>
        )}
      />

      {/* ================= REGISTER MODAL (ISOLATED COMPONENT) ================= */}
      <RegisterDepartmentModal
        open={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={(created) => {
          setIsRegisterOpen(false);
          setNotification({
            type: "success",
            message: `Department '${created.name}' (${created.departmentCode}) registered successfully!`,
          });
          fetchDepartments();
        }}
      />

      {/* ================= EDIT MODAL (ISOLATED COMPONENT) ================= */}
      <EditDepartmentModal
        open={!!editingDept}
        department={editingDept}
        onClose={() => setEditingDept(null)}
        onSuccess={(updated) => {
          setEditingDept(null);
          setNotification({
            type: "success",
            message: `Department '${updated.name}' updated successfully.`,
          });
          fetchDepartments();
        }}
      />

      {/* ================= VIEW DEPARTMENT MODAL ================= */}
      <Modal
        open={!!viewingDept}
        modalHeading={viewingDept?.name || "Department Details"}
        modalLabel={`Department Profile: ${viewingDept?.departmentCode || ""}`}
        passiveModal
        onRequestClose={() => setViewingDept(null)}
        size="md"
      >
        {viewingDept && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.25rem",
                padding: "1rem",
                backgroundColor: "#f4f4f4",
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dcdcdc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {viewingDept.logoUrl ? (
                  <img
                    src={viewingDept.logoUrl}
                    alt={viewingDept.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "#0f62fe" }}>
                    {viewingDept.name.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#161616" }}>
                  {viewingDept.name}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem" }}>
                  <Tag type="blue">{viewingDept.departmentCode}</Tag>
                  <Tag type="purple">{viewingDept.category || "General"}</Tag>
                  <Tag type={viewingDept.status === "Active" ? "green" : "red"}>{viewingDept.status}</Tag>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.9rem" }}>
              <div>
                <div style={{ color: "#6f6f6f", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Contact Mobile / Phone
                </div>
                <div style={{ color: "#161616", fontWeight: 500, marginTop: "2px" }}>
                  {viewingDept.contactNumber || "Not provided"}
                </div>
              </div>

              <div>
                <div style={{ color: "#6f6f6f", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Official Email
                </div>
                <div style={{ color: "#161616", fontWeight: 500, marginTop: "2px" }}>
                  {viewingDept.email ? (
                    <a href={`mailto:${viewingDept.email}`} style={{ color: "#0f62fe", textDecoration: "none" }}>
                      {viewingDept.email}
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </div>
              </div>

              <div>
                <div style={{ color: "#6f6f6f", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Official Portal
                </div>
                <div style={{ marginTop: "2px" }}>
                  {viewingDept.website ? (
                    <a
                      href={viewingDept.website}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0f62fe", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      {viewingDept.website} <Launch size={14} />
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </div>
              </div>

              <div>
                <div style={{ color: "#6f6f6f", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Assigned Officers
                </div>
                <div style={{ color: "#161616", fontWeight: 500, marginTop: "2px" }}>
                  {viewingDept.officerCount ?? 0} active personnel
                </div>
              </div>
            </div>

            {viewingDept.address && (
              <div>
                <div style={{ color: "#6f6f6f", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Head Office Address
                </div>
                <div style={{ color: "#161616", marginTop: "2px", fontSize: "0.875rem" }}>
                  {viewingDept.address}
                </div>
              </div>
            )}

            {viewingDept.description && (
              <div>
                <div style={{ color: "#6f6f6f", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Mandate & Scope
                </div>
                <div style={{ color: "#393939", marginTop: "2px", fontSize: "0.875rem", lineHeight: 1.5 }}>
                  {viewingDept.description}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ================= DELETE CONFIRMATION MODAL ================= */}
      <Modal
        open={!!deletingDept}
        modalHeading="Delete Department"
        danger
        primaryButtonText={isDeleteSubmitting ? "Deleting..." : "Delete Department"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={isDeleteSubmitting}
        onRequestClose={() => setDeletingDept(null)}
        onRequestSubmit={handleDeleteSubmit}
        size="sm"
      >
        <p style={{ marginBottom: "1rem" }}>
          Are you sure you want to permanently delete <strong>{deletingDept?.name}</strong> (
          {deletingDept?.departmentCode})?
        </p>
        {deletingDept?.officerCount && deletingDept.officerCount > 0 ? (
          <InlineNotification
            kind="warning"
            title="Active Officers Warning"
            subtitle={`This department currently has ${deletingDept.officerCount} officer(s) assigned. Deleting is prevented. Deactivate it instead.`}
          />
        ) : (
          <p style={{ color: "#da1e28", fontSize: "0.85rem" }}>
            This action cannot be undone. All stage references and catalog associations may be affected.
          </p>
        )}
      </Modal>
    </>
  );
}
