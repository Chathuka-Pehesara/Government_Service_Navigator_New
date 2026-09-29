import '@carbon/styles/css/styles.css';
import { useState, useEffect } from "react";
import { QUEUE_UPDATED_EVENT } from "../utils/realtime";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
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
  Button,
  Loading,
  HeaderMenuButton,
  Modal,
  Select,
  SelectItem,
  TextArea,
  InlineNotification
} from "@carbon/react";
import {
  Dashboard,
  Document,
  Time,
  User,
  Logout,
  Notification,
  Warning,
  CheckmarkOutline,
  DataStructured,
  TrashCan,
  Security
} from "@carbon/icons-react";
import { API_BASE_URL } from "../utils/api";

const headers = [
  { key: "appId", header: "Application ID" },
  { key: "status", header: "Status" },
  { key: "time", header: "Submitted" },
  { key: "priority", header: "Priority" },
  { key: "actions", header: "" },
];

interface QueueRow {
  id: string;
  appId: string;
  status: string;
  time: string;
  priority: string;
}

interface OfficerStats {
  reviewedToday: number;
  reviewedYesterday: number;
  approvedThisMonth: number;
  approvalRate: number | null;
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function getStoredOfficerName(): string {
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser.fullName) return parsedUser.fullName;
      if (parsedUser.email) return parsedUser.email.split("@")[0];
    } catch {
      // Handle parse error silently
    }
  }
  return "Verifying Officer";
}

export default function OfficerDashboard() {
  const [officerName] = useState(getStoredOfficerName);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<OfficerStats | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetRow, setTargetRow] = useState<QueueRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("Not required for review");
  const [deleteNotes, setDeleteNotes] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; title: string; subtitle: string } | null>(null);

  const openDeleteModal = (row: QueueRow) => {
    setTargetRow(row);
    setDeleteReason("Not required for review");
    setDeleteNotes("");
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!targetRow) return;
    setIsDeleting(true);
    const token = localStorage.getItem("officerToken");
    const fullReason = deleteNotes.trim() ? `${deleteReason}: ${deleteNotes.trim()}` : deleteReason;
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/tasks/${targetRow.id}?reason=${encodeURIComponent(fullReason)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (response.ok) {
        setRows(prev => prev.filter(r => r.id !== targetRow.id));
        setDeleteModalOpen(false);
        setNotification({
          kind: "success",
          title: "Application Deleted & Audit Logged",
          subtitle: `Application ${targetRow.appId} was deleted from the queue and recorded in the audit section.`
        });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.message || "Failed to delete application.");
      }
    } catch (e) {
      console.error("Delete failed", e);
      alert("An error occurred while deleting the application.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("officerToken");
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const fetchQueue = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/verification/tasks/pending`, {
          headers: authHeaders,
        });
        if (response.ok) {
          const data: { id: number; applicationId: number; status: string; createdDate: string }[] = await response.json();
          setRows(
            data.map((task) => {
              const ageHours = (Date.now() - new Date(task.createdDate).getTime()) / 3_600_000;
              return {
                id: task.id.toString(),
                appId: `APP-${task.applicationId}`,
                status: task.status,
                time: formatRelativeTime(task.createdDate),
                priority: ageHours > 24 ? "High" : "Normal",
              };
            })
          );
        } else {
          console.error("Failed to fetch verification queue");
        }
      } catch (error) {
        console.error("Error fetching verification queue:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/verification/stats`, {
          headers: authHeaders,
        });
        if (response.ok) {
          const data = await response.json();
          setStats({
            reviewedToday: data.reviewedToday,
            reviewedYesterday: data.reviewedYesterday,
            approvedThisMonth: data.approvedThisMonth,
            approvalRate: data.approvalRate,
          });
        } else {
          console.error("Failed to fetch officer stats");
        }
      } catch (error) {
        console.error("Error fetching officer stats:", error);
      }
    };

    fetchQueue();
    fetchStats();

    // Live queue: the realtime bridge fires this when tasks change (no polling)
    const onQueueUpdated = () => {
      fetchQueue();
      fetchStats();
    };
    window.addEventListener(QUEUE_UPDATED_EVENT, onQueueUpdated);
    return () => window.removeEventListener(QUEUE_UPDATED_EVENT, onQueueUpdated);
  }, []);

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

  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const onClickSideNavExpand = () => setIsSideNavExpanded(prev => !prev);

  return (
    <>
      <Header aria-label="Registry Portal System">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
          onClick={onClickSideNavExpand}
          isActive={isSideNavExpanded}
          isCollapsible
        />
            <HeaderName href="#" prefix="GSN">
              Registry Portal
            </HeaderName>

            <HeaderGlobalBar>
              <div className="w-[140px] sm:w-[280px]" style={{ marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
                 <Search size="sm" id="search-queue" labelText="Search" placeholder="Search NIC or Application ID..." />
              </div>
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href="/officer/dashboard" isActive>
                  Application Queue
                </SideNavLink>
                                <SideNavLink renderIcon={CheckmarkOutline} href="/officer/bulk-verification">
                  Bulk Verification
                </SideNavLink>
                <SideNavLink renderIcon={DataStructured} href="/officer/rejection-codes">
                  Rejection Codes
                </SideNavLink>
                <SideNavLink renderIcon={Document} href="/officer/verified-records">
                  Verified Records
                </SideNavLink>
                <SideNavLink renderIcon={Time} href="/officer/pending-reviews">
                  Pending Reviews
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/officer/audit-logs">
                  Audit Logs
                </SideNavLink>
                <SideNavLink renderIcon={User} href="/officer/profile">
                  My Profile
                </SideNavLink>
                
                <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
                  <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>
                    Sign Out
                  </SideNavLink>
                </div>
              </SideNavItems>
            </SideNav>
          </Header>

          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                  Welcome back, {officerName}
                </h1>
                <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                  Review assigned citizen submissions and maintain accountable registry records.
                </p>
              </div>
            </div>

            <Grid style={{ paddingLeft: 0, paddingRight: 0, marginBottom: '2rem' }}>
              <Column sm={4} md={4} lg={4}>
                <Tile style={{ borderTop: '4px solid #da1e28' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Queue Pending</p>
                    <Warning size={20} color="#da1e28" />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>{rows.length}</h3>
                  <p style={{ color: '#da1e28', fontSize: '0.875rem', marginTop: '1rem' }}>Requires your review</p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Reviewed Today</p>
                    <CheckmarkOutline size={20} />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>
                    {stats ? stats.reviewedToday : '—'}
                  </h3>
                  <p style={{ color: '#525252', fontSize: '0.875rem', marginTop: '1rem' }}>
                    {stats
                      ? `${stats.reviewedToday - stats.reviewedYesterday >= 0 ? '+' : ''}${stats.reviewedToday - stats.reviewedYesterday} from yesterday`
                      : 'Loading…'}
                  </p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Approved Total</p>
                    <Document size={20} />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>
                    {stats ? stats.approvedThisMonth : '—'}
                  </h3>
                  <p style={{ color: '#525252', fontSize: '0.875rem', marginTop: '1rem' }}>This month</p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Approval Rate</p>
                    <User size={20} />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>
                    {stats && stats.approvalRate !== null ? `${stats.approvalRate}%` : '—'}
                  </h3>
                  <p style={{ color: '#525252', fontSize: '0.875rem', marginTop: '1rem' }}>
                    {stats && stats.approvalRate !== null ? 'Share of your decisions approved' : 'No decisions recorded yet'}
                  </p>
                </Tile>
              </Column>
            </Grid>

            {isLoading ? (
              <Loading description="Loading verification queue" withOverlay={false} />
            ) : (
              <DataTable rows={rows} headers={headers}>
                {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer
                    title="Active Verification Queue"
                    description="Pending verification tasks waiting for departmental review and timestamping."
                  >
                    <div style={{ overflowX: 'auto', width: '100%' }}>
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {tableHeaders.map((header) => (
                            <TableHeader {...getHeaderProps({ header })} key={header.key}>
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tableRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={tableHeaders.length} style={{ textAlign: 'center', padding: '2rem' }}>
                              No pending applications in the queue.
                            </TableCell>
                          </TableRow>
                        ) : (
                          tableRows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'status') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="blue">{cell.value}</Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === 'priority') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type={cell.value === 'High' ? 'red' : 'blue'}>
                                        {cell.value}
                                      </Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === 'actions') {
                                  const queueRow = rows.find(r => r.id === row.id);
                                  return (
                                    <TableCell key={cell.id} style={{ padding: '0.5rem', textAlign: 'right' }}>
                                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                        <Button
                                          size="sm"
                                          onClick={() => window.location.href = `/officer/verification-workspace/${row.id}`}
                                        >
                                          Review
                                        </Button>
                                        <Button
                                          size="sm"
                                          kind="danger--ghost"
                                          renderIcon={TrashCan}
                                          hasIconOnly
                                          iconDescription="Delete application (not needed for review)"
                                          tooltipPosition="left"
                                          onClick={() => queueRow && openDeleteModal(queueRow)}
                                        />
                                      </div>
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
                    </div>
                  </TableContainer>
                )}
              </DataTable>
            )}

            {/* Notification Banner */}
            {notification && (
              <div style={{ marginTop: '1.5rem' }}>
                <InlineNotification
                  kind={notification.kind}
                  title={notification.title}
                  subtitle={notification.subtitle}
                  onClose={() => setNotification(null)}
                />
              </div>
            )}

            {/* Delete Confirmation Modal */}
            <Modal
              open={deleteModalOpen}
              modalHeading="Delete Verification Application"
              primaryButtonText={isDeleting ? "Deleting..." : "Delete Application"}
              secondaryButtonText="Cancel"
              danger
              onRequestClose={() => setDeleteModalOpen(false)}
              onRequestSubmit={handleDeleteConfirm}
              primaryButtonDisabled={isDeleting}
            >
              <p style={{ marginBottom: '1rem', color: '#525252' }}>
                Are you sure you want to delete application <strong>{targetRow?.appId}</strong>?
                This application will be removed from your queue, and an official audit entry will record that you deleted it.
              </p>
              <Select
                id="dashboard-delete-reason-select"
                labelText="Reason for Deletion (Recorded in Audit Section)"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                style={{ marginBottom: '1rem' }}
              >
                <SelectItem value="Not required for review" text="Not required for review" />
                <SelectItem value="Duplicate application submitted" text="Duplicate application submitted" />
                <SelectItem value="Invalid or test application" text="Invalid or test application" />
                <SelectItem value="Citizen requested cancellation" text="Citizen requested cancellation" />
                <SelectItem value="Other (specified in notes)" text="Other (specified in notes)" />
              </Select>
              <TextArea
                id="dashboard-delete-notes"
                labelText="Officer Remarks / Justification (Logged to Audit Trail)"
                placeholder="Explain why this application does not need review..."
                rows={3}
                value={deleteNotes}
                onChange={(e) => setDeleteNotes(e.target.value)}
              />
            </Modal>

          </main>
    </>
  );
}

