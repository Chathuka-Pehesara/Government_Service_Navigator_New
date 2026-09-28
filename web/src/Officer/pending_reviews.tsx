import '@carbon/styles/css/styles.css';
import { useState, useEffect, useCallback } from 'react';
import { QUEUE_UPDATED_EVENT } from '../utils/realtime';
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
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Search,
  Button,
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
  Hourglass,
  Email,
  Flag,
  CheckmarkOutline,
  DataStructured,
  TrashCan,
  Security
} from "@carbon/icons-react";

// Table Data for Pending Reviews
const headers = [
  { key: "appId", header: "App ID" },
  { key: "citizen", header: "Citizen Name" },
  { key: "service", header: "Service Type" },
  { key: "reason", header: "Pending Reason" },
  { key: "days", header: "Time Pending" },
  { key: "status", header: "Status" },
  { key: "actions", header: "" },
];



interface PendingTaskItem {
  id: number;
  applicationId: number;
  createdDate: string;
  status: string;
  referenceNumber?: string;
  citizenName?: string | null;
  citizenNic?: string | null;
  serviceName?: string | null;
  department?: string | null;
  currentDepartment?: string | null;
  [key: string]: unknown;
}

interface TableRowItem {
  id: string;
  appId: string;
  citizen: string;
  service: string;
  reason: string;
  days: string;
  status: string;
  rawCreatedDate?: string;
}

export function formatTimePending(dateStr: string): { display: string; detail: string; tagType: "cool-gray" | "warm-gray" | "red" } {
  if (!dateStr) return { display: "N/A", detail: "", tagType: "cool-gray" };
  const created = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - created.getTime();
  
  if (isNaN(diffMs) || diffMs < 0) {
    return { display: "Just now", detail: `Submitted: ${created.toLocaleString()}`, tagType: "cool-gray" };
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let display: string;
  let tagType: "cool-gray" | "warm-gray" | "red" = "cool-gray";

  if (diffMins < 1) {
    display = "< 1 min";
  } else if (diffMins < 60) {
    display = `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  } else if (diffHours < 24) {
    display = `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    tagType = diffHours >= 12 ? "warm-gray" : "cool-gray";
  } else {
    display = `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    tagType = diffDays >= 2 ? "red" : "warm-gray";
  }

  const detail = `Submitted: ${created.toLocaleString()}`;
  return { display, detail, tagType };
}

export default function PendingReviews() {
  const [rows, setRows] = useState<TableRowItem[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetTask, setTargetTask] = useState<TableRowItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("Not required for review");
  const [deleteNotes, setDeleteNotes] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; title: string; subtitle: string } | null>(null);

  const openDeleteModal = (row: TableRowItem) => {
    setTargetTask(row);
    setDeleteReason("Not required for review");
    setDeleteNotes("");
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!targetTask) return;
    setIsDeleting(true);
    const token = localStorage.getItem("officerToken");
    const fullReason = deleteNotes.trim() ? `${deleteReason}: ${deleteNotes.trim()}` : deleteReason;
    try {
      const response = await fetch(`http://localhost:5119/api/Verification/tasks/${targetTask.id}?reason=${encodeURIComponent(fullReason)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (response.ok) {
        setRows(prev => prev.filter(r => r.id !== targetTask.id));
        setDeleteModalOpen(false);
        setNotification({
          kind: "success",
          title: "Application Deleted & Audit Logged",
          subtitle: `Application ${targetTask.appId} was deleted from the review queue and recorded in the audit section.`
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

  const fetchPendingTasks = useCallback(async () => {
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`http://localhost:5119/api/Verification/tasks/pending`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (response.ok) {
        const data = await response.json();

        // 1. Department match: only show records belonging to this officer's department
        const officerUser = JSON.parse(localStorage.getItem("officerUser") || "{}");
        const officerDept = (officerUser.department || "").trim().toLowerCase();

        const deptFiltered = data.filter((t: PendingTaskItem) => {
          if (!officerDept) return true;
          const taskDept = ((t.department as string) || (t.currentDepartment as string) || "").trim().toLowerCase();
          if (!taskDept) return true;
          return taskDept === officerDept || taskDept.includes(officerDept) || officerDept.includes(taskDept);
        });

        // 2. Sort order: latest records first (descending by createdDate, then id)
        deptFiltered.sort((a: PendingTaskItem, b: PendingTaskItem) => {
          const timeA = new Date(a.createdDate).getTime();
          const timeB = new Date(b.createdDate).getTime();
          if (timeB !== timeA) return timeB - timeA;
          return Number(b.id) - Number(a.id);
        });

        const mappedRows = deptFiltered.map((t: PendingTaskItem) => {
          const timeInfo = formatTimePending(t.createdDate);
          return {
            id: t.id.toString(),
            appId: t.referenceNumber ?? `APP-${t.applicationId}`,
            citizen: t.citizenName || t.citizenNic || "Unknown citizen",
            service: t.serviceName || "Unknown service",
            reason: t.status === "Pending" ? "Awaiting Review" : t.status,
            days: timeInfo.display,
            status: t.status === "Pending" ? "Action Required" : t.status,
            rawCreatedDate: t.createdDate,
          };
        });
        setRows(mappedRows);
      }
    } catch (e) {
      console.error("Error fetching tasks", e);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPendingTasks();
    }, 0);
    // Live queue: the realtime bridge fires this when tasks change (no polling)
    window.addEventListener(QUEUE_UPDATED_EVENT, fetchPendingTasks);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(QUEUE_UPDATED_EVENT, fetchPendingTasks);
    };
  }, [fetchPendingTasks]);

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
                 <Search size="sm" id="search-global" labelText="Search" placeholder="Search NIC or Application ID..." />
              </div>
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href="/officer/dashboard">
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
                <SideNavLink renderIcon={Time} href="/officer/pending-reviews" isActive>
                  Pending Reviews
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/officer/audit-logs">
                  Audit Logs
                </SideNavLink>
                <SideNavLink renderIcon={User} href="/officer/profile">
                  My Profile
                </SideNavLink>
                
                {/* Logout Button */}
                <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
                  <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>
                    Sign Out
                  </SideNavLink>
                </div>
              </SideNavItems>
            </SideNav>
          </Header>

          {/* Main Content */}
          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>

            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                Pending Reviews
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                Manage stalled applications, follow up on missing documents, and clear blocked queues.
              </p>
            </div>

            {/* Stat Cards for Pending Context */}
            <Grid style={{ paddingLeft: 0, paddingRight: 0, marginBottom: '2rem' }}>
              <Column sm={4} md={4} lg={4}>
                <Tile>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Total Pending</p>
                    <Hourglass size={20} />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>45</h3>
                  <p style={{ color: '#525252', fontSize: '0.875rem', marginTop: '1rem' }}>Active on hold</p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile style={{ borderTop: '4px solid #8a3ffc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Awaiting Citizen</p>
                    <Email size={20} color="#8a3ffc" />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>12</h3>
                  <p style={{ color: '#8a3ffc', fontSize: '0.875rem', marginTop: '1rem' }}>Missing documents</p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile style={{ borderTop: '4px solid #da1e28' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>Action Required</p>
                    <Flag size={20} color="#da1e28" />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>5</h3>
                  <p style={{ color: '#da1e28', fontSize: '0.875rem', marginTop: '1rem' }}>Flagged issues</p>
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile style={{ borderTop: '4px solid #f1c21b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <p style={{ color: '#525252', fontSize: '0.875rem' }}>SLA Overdue</p>
                    <Warning size={20} color="#f1c21b" />
                  </div>
                  <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>2</h3>
                  <p style={{ color: '#f1c21b', fontSize: '0.875rem', marginTop: '1rem' }}>Exceeded target time</p>
                </Tile>
              </Column>
            </Grid>

            {/* Data Table for Pending Reviews */}
            <DataTable rows={rows} headers={headers}>
              {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
                <TableContainer 
                  title="Stalled Applications" 
                  description="Items that require manual intervention before they can be verified."
                >
                  <TableToolbar>
                    <TableToolbarContent>
                      <TableToolbarSearch 
                        onChange={onInputChange} 
                        persistent 
                        placeholder="Filter by App ID, Citizen, or Status..." 
                      />
                    </TableToolbarContent>
                  </TableToolbar>

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
                      {tableRows.map((row) => (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => {
                            
                            // Format Time Pending with clear badge and timestamp detail
                            if (cell.info.header === 'days') {
                              const tableRow = rows.find(r => r.id === row.id);
                              const timeInfo = formatTimePending(tableRow?.rawCreatedDate || '');
                              return (
                                <TableCell key={cell.id}>
                                  <div title={timeInfo.detail} style={{ display: 'inline-flex', flexDirection: 'column' }}>
                                    <Tag type={timeInfo.tagType} size="sm">
                                      {timeInfo.display}
                                    </Tag>
                                    {tableRow?.rawCreatedDate && (
                                      <span style={{ fontSize: '0.72rem', color: '#6f6f6f', marginTop: '2px' }}>
                                        {new Date(tableRow.rawCreatedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              );
                            }

                            // Format Status with Carbon Tags based on state severity
                            if (cell.info.header === 'status') {
                              let tagColor: 'blue' | 'purple' | 'red' | 'gray' = 'blue';
                              if (cell.value === 'Awaiting Citizen') tagColor = 'purple';
                              if (cell.value === 'Action Required') tagColor = 'red';
                              if (cell.value === 'External Block') tagColor = 'gray';

                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={tagColor}>
                                    {cell.value}
                                  </Tag>
                                </TableCell>
                              );
                            }
                            
                            // Dynamic Action Buttons
                            if (cell.info.header === 'actions') {
                              const status = row.cells.find(c => c.info.header === 'status')?.value;
                              const tableRow = rows.find(r => r.id === row.id);
                              
                              return (
                                <TableCell key={cell.id} style={{ padding: '0.5rem', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <Button 
                                      size="sm" 
                                      kind={status === 'Awaiting Citizen' ? "secondary" : "primary"}
                                      onClick={() => window.location.href = `/officer/verification-workspace/${row.id}`}
                                    >
                                      {status === 'Awaiting Citizen' ? "Send Reminder" : "Resume Review"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      kind="danger--ghost"
                                      renderIcon={TrashCan}
                                      hasIconOnly
                                      iconDescription="Delete application (not needed for review)"
                                      tooltipPosition="left"
                                      onClick={() => tableRow && openDeleteModal(tableRow)}
                                    />
                                  </div>
                                </TableCell>
                              );
                            }

                            return <TableCell key={cell.id}>{cell.value}</TableCell>;
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </TableContainer>
              )}
            </DataTable>

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
                Are you sure you want to delete application <strong>{targetTask?.appId}</strong> ({targetTask?.citizen})?
                This application will be removed from the verification review queue, and an official audit entry will record that you deleted it.
              </p>
              <Select
                id="delete-reason-select"
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
                id="delete-notes"
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