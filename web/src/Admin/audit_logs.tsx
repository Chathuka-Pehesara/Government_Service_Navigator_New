import '@carbon/styles/css/styles.css'; // This fixes the unstyled layout![cite: 5]
import { useState, useEffect } from "react";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref, canManageServices } from "../utils/currentUser";
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
  Button,
  Tag,
  Search,
  Loading,
  Pagination,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Settings,
  Logout,
  Notification,
  Download,
  Catalog,
  Rule,
  Categories,
  Document,
  Money,
} from "@carbon/icons-react";
import { getDepartmentSlug } from "../constants/departments";

// Columns reflect only fields the backend AuditLog table actually stores.
// There's no IP address capture anywhere in this system, so that column was dropped
// rather than showing a fabricated value.
const headers = [
  { key: "time", header: "Timestamp" },
  { key: "officer", header: "Performed By" },
  { key: "action", header: "Event Action" },
  { key: "target", header: "Target ID" },
  { key: "status", header: "Status" },
];

interface AuditLogRow {
  id: string;
  time: string;
  officer: string;
  action: string;
  target: string;
  status: string;
}

// The Action text is the only signal we have for outcome - the AuditLog table has no
// dedicated status column, so this is derived, not fabricated.
function deriveStatus(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("reject")) return "Failed";
  if (normalized.includes("suspend") || normalized.includes("delete") || normalized.includes("revised")) return "Warning";
  return "Success";
}

export default function AuditLogs() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentUser] = useState(getStoredUser);
  const isSysAdmin = canManageServices(currentUser);
  const deptSlug = currentUser?.department ? getDepartmentSlug(currentUser.department) : null;
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const token = localStorage.getItem("officerToken");
        const response = await fetch("http://localhost:5119/api/verification/audit-logs/all", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data: { id: number; applicationId: number; action: string; performedBy: string; timestamp: string }[] = await response.json();
          setRows(
            data.map((log) => ({
              id: log.id.toString(),
              time: new Date(log.timestamp).toLocaleString(),
              officer: log.performedBy || "Unknown",
              action: log.action,
              target: `APP-${log.applicationId}`,
              status: deriveStatus(log.action),
            }))
          );
        } else {
          console.error("Failed to fetch audit logs");
        }
      } catch (error) {
        console.error("Error fetching audit logs:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAuditLogs();
  }, []);

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
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      localStorage.removeItem("officerToken");
      localStorage.removeItem("officerUser");
      window.location.href = "/officer/login";
    }
  };

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
                 <Search size="sm" id="search-records" labelText="Search" placeholder="Search records..." />
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

                {!isSysAdmin && deptSlug && (
                  <>
                    <SideNavLink
                      renderIcon={Document}
                      href={`/admin/${deptSlug}/dashboard?view=verifications`}
                    >
                      Department Verifications
                    </SideNavLink>
                    <SideNavLink
                      renderIcon={Money}
                      href={`/admin/${deptSlug}/dashboard?view=financial`}
                    >
                      Financial Verifications
                    </SideNavLink>
                  </>
                )}

                <SideNavLink renderIcon={Catalog} href="/admin/services">
                  {isSysAdmin ? "Service Catalog" : "Service Catalog (View)"}
                </SideNavLink>

                {isSysAdmin && (
                  <>
                    <SideNavLink renderIcon={Rule} href="/admin/services/rules">
                      Eligibility Rules
                    </SideNavLink>
                    <SideNavLink
                      renderIcon={Categories}
                      href="/admin/services/config"
                    >
                      Service Configuration
                    </SideNavLink>
                    <SideNavLink
                      renderIcon={Document}
                      href="/admin/services/builder"
                    >
                      Template Builder
                    </SideNavLink>
                    <SideNavLink
                      renderIcon={Rule}
                      href="/admin/services/simulator"
                    >
                      Eligibility Simulator
                    </SideNavLink>
                  </>
                )}

                {isSysAdmin && (
                  <SideNavLink
                    renderIcon={Categories}
                    href="/admin/departments"
                  >
                    Department Management
                  </SideNavLink>
                )}

                <SideNavLink
                  renderIcon={UserMultiple}
                  href="/admin/manage-officers"
                >
                  Manage Officers
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/admin/audit-logs" isActive>
                  Audit Logs
                </SideNavLink>
                {isSysAdmin && (
                  <SideNavLink
                    renderIcon={Settings}
                    href="/admin/system-settings"
                  >
                    System Settings
                  </SideNavLink>
                )}

                {/* Logout Button */}
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

          {/* Main Content[cite: 5] */}
          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                System Audit Logs
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                Immutable, timestamped record of all registry modifications, access attempts, and administrative actions.
              </p>
            </div>

            {/* Data Table with Toolbar */}
            {isLoading ? (
              <Loading description="Loading audit logs" withOverlay={false} />
            ) : (
              <DataTable rows={rows} headers={headers}>
                {({ rows, headers, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
                  <TableContainer>
                    <TableToolbar>
                      <TableToolbarContent>
                        <TableToolbarSearch
                          onChange={onInputChange}
                          persistent
                          placeholder="Filter by officer, action, or target..."
                        />
                        <Button
                          kind="ghost"
                          renderIcon={Download}
                          onClick={() => console.log('Exporting CSV...')}
                        >
                          Export CSV
                        </Button>
                      </TableToolbarContent>
                    </TableToolbar>

                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header) => (
                            <TableHeader {...getHeaderProps({ header })} key={header.key}>
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={headers.length} style={{ textAlign: 'center', padding: '2rem' }}>
                              No audit log entries recorded yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows
                            .slice((page - 1) * pageSize, page * pageSize)
                            .map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'status') {
                                  let tagType: "green" | "red" | "magenta" = "green";
                                  if (cell.value === "Failed") tagType = "red";
                                  if (cell.value === "Warning") tagType = "magenta";

                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type={tagType}>
                                        {cell.value}
                                      </Tag>
                                    </TableCell>
                                  );
                                }

                                // Render monospace font for Target IDs for better readability
                                if (cell.info.header === 'target') {
                                  return (
                                    <TableCell key={cell.id} style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                                      {cell.value}
                                    </TableCell>
                                  );
                                }

                                return <TableCell key={cell.id}>{cell.value}</TableCell>;
                              })}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <Pagination
                      backwardText="Previous page"
                      forwardText="Next page"
                      itemsPerPageText="Rows per page:"
                      page={page}
                      pageSize={pageSize}
                      pageSizes={[10, 20, 50]}
                      totalItems={rows.length}
                      onChange={({ page, pageSize }) => {
                        if (page) setPage(page);
                        if (pageSize) setPageSize(pageSize);
                      }}
                    />
                  </TableContainer>
                )}
              </DataTable>
            )}

          </main>
        </>
      )}
    />
  );
}