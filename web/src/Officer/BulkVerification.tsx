import '@carbon/styles/css/styles.css';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  HeaderMenuButton,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableSelectAll,
  TableSelectRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  InlineNotification,
  Modal,
  Tag
} from "@carbon/react";
import {
  Dashboard,
  Document,
  Time,
  User,
  Logout,
  Notification,
  CheckmarkOutline,
  DataStructured,
  Security
} from "@carbon/icons-react";
import { API_BASE_URL } from "../utils/api";

interface VerificationTaskItem {
  id: number;
  applicationId: number;
  status: string;
  createdDate: string;
  [key: string]: unknown;
}

export default function BulkVerification() {
  const navigate = useNavigate();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [tasks, setTasks] = useState<VerificationTaskItem[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [notification, setNotification] = useState<{ kind: "success" | "error", message: string } | null>(null);

  const fetchPendingTasks = useCallback(async () => {
    // In a real scenario, this would fetch only tasks eligible for bulk approval
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/tasks/pending`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Filter to only pending/in-progress tasks for demonstration
        setTasks(data.filter((t: VerificationTaskItem) => t.status !== "Approved" && t.status !== "Rejected"));
      }
    } catch (err) {
      console.error("Failed to fetch tasks", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPendingTasks();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchPendingTasks]);

  const handleBulkApprove = async () => {
    setIsSubmitting(true);
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/tasks/bulk-verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          taskIds: selectedTaskIds,
          status: "Approved",
          comments: "Bulk Approved by Officer"
        })
      });

      if (response.ok) {
        setNotification({ kind: "success", message: `Successfully approved ${selectedTaskIds.length} applications.` });
        setSelectedTaskIds([]);
        fetchPendingTasks();
      } else {
        setNotification({ kind: "error", message: "Failed to process bulk approval." });
      }
    } catch {
      setNotification({ kind: "error", message: "An error occurred during bulk approval." });
    } finally {
      setIsSubmitting(false);
      setShowConfirmModal(false);
    }
  };

  const handleLogout = async () => {
    // Implement logout logic
    localStorage.removeItem("officerToken");
    localStorage.removeItem("officerUser");
    navigate("/officer/login");
  };

  const headers = [
    { key: "id", header: "Task ID" },
    { key: "applicationId", header: "Application ID" },
    { key: "serviceType", header: "Service Type" },
    { key: "complianceScore", header: "Compliance Score" },
    { key: "status", header: "Status" }
  ];

  return (
    <HeaderContainer
      render={() => (
        <>
          <Header aria-label="Registry Portal System">
            <HeaderMenuButton
              aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
              onClick={() => setIsSideNavExpanded(!isSideNavExpanded)}
              isActive={isSideNavExpanded}
              isCollapsible
            />
            <HeaderName href="#" prefix="GSN">
              Registry Portal
            </HeaderName>

            <HeaderGlobalBar>
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

                        <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href="/officer/dashboard" isActive={window.location.pathname.includes('dashboard')}>
                  Application Queue
                </SideNavLink>
                <SideNavLink renderIcon={CheckmarkOutline} href="/officer/bulk-verification" isActive={window.location.pathname.includes('bulk-verification')}>
                  Bulk Verification
                </SideNavLink>
                <SideNavLink renderIcon={DataStructured} href="/officer/rejection-codes" isActive={window.location.pathname.includes('rejection-codes')}>
                  Rejection Codes
                </SideNavLink>
                <SideNavLink renderIcon={Document} href="/officer/verified-records" isActive={window.location.pathname.includes('verified-records')}>
                  Verified Records
                </SideNavLink>
                <SideNavLink renderIcon={Time} href="/officer/pending-reviews" isActive={window.location.pathname.includes('pending-reviews')}>
                  Pending Reviews
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/officer/audit-logs" isActive={window.location.pathname.includes('audit-logs')}>
                  Audit Logs
                </SideNavLink>
                <SideNavLink renderIcon={User} href="/officer/profile" isActive={window.location.pathname.includes('profile')}>
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
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                Bulk Verification
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                Quickly approve multiple low-risk applications that have passed automated compliance checks.
              </p>
            </div>

            {notification && (
              <InlineNotification
                kind={notification.kind}
                title={notification.kind === 'success' ? 'Success' : 'Error'}
                subtitle={notification.message}
                onClose={() => setNotification(null)}
                style={{ marginBottom: '1rem' }}
              />
            )}

            <DataTable rows={tasks.map(t => ({...t, id: t.id.toString(), serviceType: "General Service", complianceScore: 98}))} headers={headers}>
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps, getSelectionProps, getToolbarProps, onInputChange, selectedRows }) => {
                return (
                  <TableContainer title="Eligible for Bulk Approval">
                    <TableToolbar {...getToolbarProps()}>
                      <TableToolbarContent>
                        <TableToolbarSearch onChange={onInputChange} persistent />
                        <Button 
                          onClick={() => {
                            setSelectedTaskIds(selectedRows.map(r => parseInt(r.id)));
                            setShowConfirmModal(true);
                          }} 
                          disabled={selectedRows.length === 0}
                          size="sm"
                        >
                          Approve Selected ({selectedRows.length})
                        </Button>
                      </TableToolbarContent>
                    </TableToolbar>
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          <TableSelectAll {...getSelectionProps()} />
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
                            <TableCell colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                              No applications available for bulk approval.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              <TableSelectRow {...getSelectionProps({ row })} />
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'complianceScore') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="green">{cell.value}% AI Confidence</Tag>
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
                  </TableContainer>
                );
              }}
            </DataTable>

            <Modal
              open={showConfirmModal}
              modalHeading="Confirm Bulk Approval"
              primaryButtonText="Approve All"
              secondaryButtonText="Cancel"
              primaryButtonDisabled={isSubmitting}
              onRequestSubmit={handleBulkApprove}
              onRequestClose={() => setShowConfirmModal(false)}
              danger={false}
            >
              <p style={{ marginBottom: '1rem' }}>
                You are about to approve <strong>{selectedTaskIds.length}</strong> applications simultaneously.
              </p>
              <p>
                By proceeding, you confirm that these applications meet the criteria for automated low-risk approval. This action will be permanently recorded in the audit log under your official ID.
              </p>
            </Modal>
          </main>
        </>
      )}
    />
  );
}




