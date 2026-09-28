import "@carbon/styles/css/styles.css";
import { useState } from "react";
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
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
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
  Document,
  Activity,
  Catalog,
  Rule,
  Categories,
} from "@carbon/icons-react";

// Table Data
const headers = [
  { key: "officer", header: "Officer" },
  { key: "action", header: "Action" },
  { key: "target", header: "Target ID" },
  { key: "time", header: "Timestamp" },
  { key: "status", header: "Status" },
];

const rows = [
  {
    id: "1",
    officer: "Sarah Fernando",
    action: "Approved Application",
    target: "APP-8992",
    time: "2 mins ago",
    status: "Success",
  },
  {
    id: "2",
    officer: "Nuwan Perera",
    action: "Rejected Document",
    target: "DOC-1029",
    time: "15 mins ago",
    status: "Flagged",
  },
  {
    id: "3",
    officer: "System Auto-Sync",
    action: "Database Backup",
    target: "SYS-DB-01",
    time: "1 hour ago",
    status: "Success",
  },
];

function getStoredAdminName(): string {
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser.fullName) return parsedUser.fullName;
    } catch {
      // ignore parse error
    }
  }
  return "System Admin";
}

export default function AdminDashboard() {
  const [adminName] = useState(getStoredAdminName);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

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
      localStorage.removeItem("adminToken");
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
              <div
                className="flex items-center w-[120px] sm:w-[250px] mr-2 sm:mr-4"
              >
                <Search
                  size="sm"
                  id="search-records"
                  labelText="Search"
                  placeholder="Search records..."
                />
              </div>
              <CurrentUserBadge />
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href="#" isActive>
                  Overview
                </SideNavLink>

                {/* --- SUPUN'S ASSIGNED COMPONENTS --- */}
                <SideNavLink renderIcon={Catalog} href="/admin/services">
                  Service Catalog
                </SideNavLink>
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
                {/* ---------------------------------- */}

                <SideNavLink
                  renderIcon={Categories}
                  href="/admin/departments"
                >
                  Department Management
                </SideNavLink>

                <SideNavLink
                  renderIcon={UserMultiple}
                  href="/admin/manage-officers"
                >
                  Manage Officers
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/admin/audit-logs">
                  Audit Logs
                </SideNavLink>
                <SideNavLink
                  renderIcon={Settings}
                  href="/admin/system-settings"
                >
                  System Settings
                </SideNavLink>

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

          {/* Main Content */}
          <main
            className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64"
            style={{ backgroundColor: "#f4f4f4" }}
          >
            <div style={{ marginBottom: "2rem" }}>
              <h1
                style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}
              >
                Welcome back, {adminName}
              </h1>
              <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                Monitor system activity and manage registry officers across the
                platform.
              </p>
            </div>

            {/* Stat Cards mapped to Carbon Grid/Tiles */}
            <Grid
              style={{ paddingLeft: 0, paddingRight: 0, marginBottom: "2rem" }}
            >
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                    }}
                  >
                    <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                      Total Applications
                    </p>
                    <Document size={20} />
                  </div>
                  <h3
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 300,
                      margin: "0.5rem 0",
                    }}
                  >
                    12,845
                  </h3>
                  <p
                    style={{
                      color: "#24a148",
                      fontSize: "0.875rem",
                      marginTop: "1rem",
                    }}
                  >
                    +14% vs last week
                  </p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                    }}
                  >
                    <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                      Active Officers
                    </p>
                    <UserMultiple size={20} />
                  </div>
                  <h3
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 300,
                      margin: "0.5rem 0",
                    }}
                  >
                    342
                  </h3>
                  <p
                    style={{
                      color: "#24a148",
                      fontSize: "0.875rem",
                      marginTop: "1rem",
                    }}
                  >
                    +2% vs last week
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
                    <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                      Pending Reviews
                    </p>
                    <Activity size={20} color="#da1e28" />
                  </div>
                  <h3
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 300,
                      margin: "0.5rem 0",
                    }}
                  >
                    1,204
                  </h3>
                  <p
                    style={{
                      color: "#da1e28",
                      fontSize: "0.875rem",
                      marginTop: "1rem",
                    }}
                  >
                    -5% vs last week
                  </p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                    }}
                  >
                    <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                      System Health
                    </p>
                    <Security size={20} />
                  </div>
                  <h3
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 300,
                      margin: "0.5rem 0",
                    }}
                  >
                    99.9%
                  </h3>
                  <p
                    style={{
                      color: "#24a148",
                      fontSize: "0.875rem",
                      marginTop: "1rem",
                    }}
                  >
                    Stable vs last week
                  </p>
                </Tile>
              </Column>
            </Grid>

            {/* Data Table */}
            <DataTable rows={rows} headers={headers}>
              {({
                rows,
                headers,
                getTableProps,
                getHeaderProps,
                getRowProps,
              }) => (
                <TableContainer
                  title="Recent Officer Activity"
                  description="Live audit trail of registry modifications and approvals."
                >
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => (
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
                      {rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => {
                            if (cell.info.header === "status") {
                              return (
                                <TableCell key={cell.id}>
                                  <Tag
                                    type={
                                      cell.value === "Flagged" ? "red" : "green"
                                    }
                                  >
                                    {cell.value}
                                  </Tag>
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={cell.id}>{cell.value}</TableCell>
                            );
                          })}
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
                    totalItems={rows.length}
                    onChange={({ page, pageSize }) => {
                      if (page) setPage(page);
                      if (pageSize) setPageSize(pageSize);
                    }}
                  />
                </TableContainer>
              )}
            </DataTable>
          </main>
        </>
      )}
    />
  );
}
