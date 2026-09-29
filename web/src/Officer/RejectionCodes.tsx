import '@carbon/styles/css/styles.css';
import { hasErrors, readApiError, v, validateForm } from '../utils/validation';
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
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  InlineNotification,
  Modal,
  TextInput
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
  Add,
  Edit,
  TrashCan,
  Security
} from "@carbon/icons-react";
import { API_BASE_URL } from "../utils/api";

interface RejectionCodeItem {
  id: number;
  code: string;
  description: string;
  [key: string]: unknown;
}

export default function RejectionCodes() {
  const navigate = useNavigate();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [codes, setCodes] = useState<RejectionCodeItem[]>([]);
  const [notification, setNotification] = useState<{ kind: "success" | "error", message: string } | null>(null);
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Form State
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ code: '', description: '' });
  const [formErrors, setFormErrors] = useState<Partial<Record<'code' | 'description', string>>>({});

  // Same rules as the backend (VerificationController.RejectionReasonProblems)
  const validateCode = () => {
    const errors = validateForm({
      code: [formData.code, v.pattern(/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/, 'Code must be 2-20 letters, numbers or dashes, e.g. ERR-101.', true, 'Code')],
      description: [formData.description, v.text('Description', { min: 3, max: 300 })],
    });
    setFormErrors(errors);
    return !hasErrors(errors);
  };

  const fetchCodes = useCallback(async () => {
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/rejection-reasons`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (response.ok) {
        const data = await response.json();
        setCodes(data);
      }
    } catch (err) {
      console.error("Failed to fetch rejection codes", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCodes();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCodes]);

  const handleCreate = async () => {
    if (!validateCode()) return;
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/rejection-reasons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setNotification({ kind: "success", message: "Rejection code created successfully." });
        setIsCreateModalOpen(false);
        setFormData({ code: '', description: '' });
        fetchCodes();
      } else {
        setNotification({ kind: "error", message: await readApiError(response, "Failed to create rejection code.") });
      }
    } catch {
      setNotification({ kind: "error", message: "An error occurred." });
    }
  };

  const handleUpdate = async () => {
    if (!selectedId) return;
    if (!validateCode()) return;
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/rejection-reasons/${selectedId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setNotification({ kind: "success", message: "Rejection code updated successfully." });
        setIsEditModalOpen(false);
        fetchCodes();
      } else {
        setNotification({ kind: "error", message: await readApiError(response, "Failed to update rejection code.") });
      }
    } catch {
      setNotification({ kind: "error", message: "An error occurred." });
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const token = localStorage.getItem("officerToken");
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/rejection-reasons/${selectedId}`, {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });

      if (response.ok) {
        setNotification({ kind: "success", message: "Rejection code deleted successfully." });
        setIsDeleteModalOpen(false);
        fetchCodes();
      } else {
        setNotification({ kind: "error", message: "Failed to delete rejection code." });
      }
    } catch {
      setNotification({ kind: "error", message: "An error occurred." });
    }
  };

  const openEditModal = (codeItem: RejectionCodeItem) => {
    setSelectedId(codeItem.id);
    setFormData({ code: codeItem.code, description: codeItem.description });
    setFormErrors({}); setIsEditModalOpen(true);
  };

  const openDeleteModal = (id: number) => {
    setSelectedId(id);
    setIsDeleteModalOpen(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("officerToken");
    localStorage.removeItem("officerUser");
    navigate("/officer/login");
  };

  const headers = [
    { key: "id", header: "ID" },
    { key: "code", header: "Code" },
    { key: "description", header: "Description" },
    { key: "actions", header: "Actions" }
  ];

  return (
    <>
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
                Rejection Code Dictionary
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                Manage standard system rejection reasons (CRUD operations) for Verification Officers.
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

            <DataTable rows={codes.map(c => ({ ...c, id: c.id.toString() }))} headers={headers}>
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps, onInputChange }) => {
                return (
                  <TableContainer title="Standard Rejection Reasons">
                    <TableToolbar>
                      <TableToolbarContent>
                        <TableToolbarSearch onChange={onInputChange} persistent />
                        <Button 
                          onClick={() => {
                            setFormData({ code: '', description: '' });
                            setFormErrors({}); setIsCreateModalOpen(true);
                          }} 
                          size="sm"
                          renderIcon={Add}
                        >
                          Create New Code
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
                            <TableCell colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                              No rejection codes found. Create one to get started.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'actions') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <Button 
                                          kind="ghost" 
                                          size="sm" 
                                          hasIconOnly 
                                          renderIcon={Edit} 
                                          iconDescription="Edit Code"
                                          onClick={() => {
                                            const codeItem = codes.find(c => c.id.toString() === row.id);
                                            if (codeItem) openEditModal(codeItem);
                                          }}
                                        />
                                        <Button 
                                          kind="danger--ghost" 
                                          size="sm" 
                                          hasIconOnly 
                                          renderIcon={TrashCan} 
                                          iconDescription="Delete Code"
                                          onClick={() => openDeleteModal(parseInt(row.id))}
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
                  </TableContainer>
                );
              }}
            </DataTable>

          </main>
        </>
      )}
    />

    {/* CREATE MODAL */}
    <Modal
      open={isCreateModalOpen}
      modalHeading="Create Rejection Code"
      primaryButtonText="Create Code"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleCreate}
      onRequestClose={() => setIsCreateModalOpen(false)}
    >
      <div style={{ marginBottom: '1rem' }}>
        <TextInput
          id="create-code"
          labelText="Code (e.g. ERR-101)"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          style={{ marginBottom: '1rem' }}
          maxLength={20}
          invalid={!!formErrors.code}
          invalidText={formErrors.code}
        />
        <TextInput
          id="create-desc"
          labelText="Description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          maxLength={300}
          invalid={!!formErrors.description}
          invalidText={formErrors.description}
        />
      </div>
    </Modal>

    {/* EDIT MODAL */}
    <Modal
      open={isEditModalOpen}
      modalHeading="Edit Rejection Code"
      primaryButtonText="Save Changes"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleUpdate}
      onRequestClose={() => setIsEditModalOpen(false)}
    >
      <div style={{ marginBottom: '1rem' }}>
        <TextInput
          id="edit-code"
          labelText="Code (e.g. ERR-101)"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          style={{ marginBottom: '1rem' }}
          maxLength={20}
          invalid={!!formErrors.code}
          invalidText={formErrors.code}
        />
        <TextInput
          id="edit-desc"
          labelText="Description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          maxLength={300}
          invalid={!!formErrors.description}
          invalidText={formErrors.description}
        />
      </div>
    </Modal>

    {/* DELETE MODAL */}
    <Modal
      open={isDeleteModalOpen}
      modalHeading="Confirm Deletion"
      primaryButtonText="Delete Permanently"
      secondaryButtonText="Cancel"
      danger={true}
      onRequestSubmit={handleDelete}
      onRequestClose={() => setIsDeleteModalOpen(false)}
    >
      <p>Are you sure you want to permanently delete this rejection code? This action cannot be undone.</p>
    </Modal>
  </>
  );
}



