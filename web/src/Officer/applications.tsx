import '@carbon/styles/css/styles.css';
import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
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
  Button,
  Search,
  Modal,
  InlineNotification,
  HeaderMenuButton
} from "@carbon/react";
import {
  Dashboard,
  Document,
  Time,
  User,
  Logout,
  Notification,
  Add,
  Edit,
  View,
  Download,
  TrashCan,
  CheckmarkOutline,
  DataStructured
} from "@carbon/icons-react";
import { API_BASE_URL } from "../utils/api";

const STATUS_OPTIONS: { value: string; label: string; bg: string; color: string }[] = [
  { value: "Active", label: "Active", bg: "#defbe6", color: "#0e6027" },
  { value: "Inactive", label: "Deactive", bg: "#e0e0e0", color: "#393939" },
  { value: "Draft", label: "Draft", bg: "#e8daff", color: "#6929c4" },
];

const getStatusStyle = (status: string) =>
  STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

const headers = [
  { key: "templateId", header: "Template ID" },
  { key: "formName", header: "Form Name / Title" },
  { key: "createdDate", header: "Created Date" },
  { key: "fieldsCount", header: "Fields" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions" },
];

interface FormField {
  label: string;
  type: string;
  isRequired: boolean;
  orderIndex: number;
}

interface TemplateRow {
  id: string;
  templateId: string;
  formName: string;
  rawFormName: string;
  subTitle?: string;
  lawText?: string;
  createdDate: string;
  fieldsCount: number;
  fields: FormField[];
  status: string;
}

export default function ApplicationsList() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<TemplateRow | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const token = localStorage.getItem("officerToken");
        const response = await fetch(`${API_BASE_URL}/api/templates/all`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          const formattedRows = data.map((t: {
            id: string;
            formName: string;
            subTitle?: string;
            lawText?: string;
            createdAt: string;
            fields?: FormField[];
            status?: string;
          }) => ({
            id: t.id,
            templateId: t.id.substring(0, 8).toUpperCase(),
            formName: t.formName + (t.subTitle ? ` - ${t.subTitle}` : ""),
            rawFormName: t.formName,
            subTitle: t.subTitle,
            lawText: t.lawText,
            createdDate: new Date(t.createdAt).toLocaleDateString(),
            fieldsCount: t.fields ? t.fields.length : 0,
            fields: t.fields || [],
            status: t.status || "Active"
          }));
          setRows(formattedRows);
        }
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };
    fetchTemplates();
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

  const handleStatusChange = async (id: string, nextStatus: string) => {
    setUpdatingStatusId(id);
    try {
      const token = localStorage.getItem("officerToken");
      const response = await fetch(`${API_BASE_URL}/api/templates/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (response.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)));
      } else {
        console.error("Failed to update status:", await response.text());
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDownload = (row: TemplateRow) => {
    const doc = new jsPDF();
    const marginX = 15;
    let y = 20;

    doc.setFontSize(16);
    doc.text(row.rawFormName || row.formName, marginX, y);
    y += 8;

    if (row.subTitle) {
      doc.setFontSize(11);
      doc.setTextColor(80);
      doc.text(row.subTitle, marginX, y);
      y += 8;
    }

    if (row.lawText) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      const lawLines = doc.splitTextToSize(`Legal Notice: ${row.lawText}`, 180);
      doc.text(lawLines, marginX, y);
      y += lawLines.length * 5 + 4;
    }

    doc.setDrawColor(200);
    doc.line(marginX, y, 195, y);
    y += 10;

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Form Fields", marginX, y);
    y += 8;

    doc.setFontSize(10);
    const sortedFields = [...(row.fields || [])].sort((a, b) => a.orderIndex - b.orderIndex);
    sortedFields.forEach((field, index: number) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      const requiredMark = field.isRequired ? " *" : "";
      doc.text(`${index + 1}. ${field.label}${requiredMark} (${field.type})`, marginX, y);
      y += 7;
    });

    doc.save(`${(row.rawFormName || "application").replace(/\s+/g, "_")}.pdf`);
  };

  const handleDeleteClick = (row: TemplateRow) => {
    setDeleteError(null);
    setDeleteTarget(row);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const token = localStorage.getItem("officerToken");
      const response = await fetch(`${API_BASE_URL}/api/templates/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setDeleteError("Failed to delete the template. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      setDeleteError("An error occurred while deleting the template.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <Header aria-label="Registry Portal System">
            <HeaderMenuButton
              aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
              isCollapsible
            />
            <HeaderName href="#" prefix="GSN">Registry Portal</HeaderName>

            <HeaderGlobalBar>
              <div className="w-[140px] sm:w-[280px]" style={{ marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
                 <Search size="sm" id="search-templates" labelText="Search" placeholder="Search Templates..." />
              </div>
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href="/officer/dashboard">Application Queue</SideNavLink>
                <SideNavLink renderIcon={CheckmarkOutline} href="/officer/bulk-verification">Bulk Verification</SideNavLink>
                <SideNavLink renderIcon={DataStructured} href="/officer/rejection-codes">Rejection Codes</SideNavLink>
                <SideNavLink renderIcon={Document} href="/officer/verified-records">Verified Records</SideNavLink>
                <SideNavLink renderIcon={Time} href="/officer/pending-reviews">Pending Reviews</SideNavLink>
                <SideNavLink renderIcon={User} href="/officer/profile">My Profile</SideNavLink>
                <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
                  <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>Sign Out</SideNavLink>
                </div>
              </SideNavItems>
            </SideNav>
          </Header>

          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>Created Applications & Templates</h1>
                <p style={{ color: '#525252', marginTop: '0.5rem' }}>Manage and review all customizable application forms created by officers.</p>
              </div>
              <Button renderIcon={Add} onClick={() => window.location.href = "/officer/Application_create/application_create"} style={{ backgroundColor: '#0f62fe' }}>
                Create New Template
              </Button>
            </div>

            <DataTable rows={rows} headers={headers}>
              {({ rows: displayRows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                <TableContainer title="Template Directory" description="List of all application templates available in the system.">
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
                      {displayRows.map((row) => {
                        const fullRow = rows.find((r) => r.id === row.id);
                        return (
                          <TableRow {...getRowProps({ row })} key={row.id}>
                            {row.cells.map((cell) => {
                              if (cell.info.header === 'status') {
                                 const statusStyle = getStatusStyle(cell.value);
                                 return (
                                   <TableCell key={cell.id}>
                                     <select
                                       value={cell.value}
                                       disabled={updatingStatusId === row.id}
                                       title="Click to change status"
                                       onChange={(e) => handleStatusChange(row.id, e.target.value)}
                                       style={{
                                         backgroundColor: statusStyle.bg,
                                         color: statusStyle.color,
                                         border: 'none',
                                         borderRadius: '999px',
                                         padding: '0.2rem 0.75rem',
                                         fontSize: '0.75rem',
                                         fontWeight: 600,
                                         cursor: updatingStatusId === row.id ? 'not-allowed' : 'pointer',
                                       }}
                                     >
                                       {STATUS_OPTIONS.map((opt) => (
                                         <option key={opt.value} value={opt.value}>
                                           {opt.label}
                                         </option>
                                       ))}
                                     </select>
                                     {updatingStatusId === row.id && (
                                       <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#525252' }}>
                                         Updating…
                                       </span>
                                     )}
                                   </TableCell>
                                 );
                              }
                              if (cell.info.header === 'actions') {
                                return (
                                  <TableCell key={cell.id} style={{ padding: '0.5rem' }}>
                                    <Button kind="ghost" size="sm" renderIcon={Edit} iconDescription="Edit" hasIconOnly onClick={() => window.location.href = `/officer/Application_create/application_create?id=${row.id}`} />
                                    <Button kind="ghost" size="sm" renderIcon={View} iconDescription="View Details" hasIconOnly onClick={() => { setSelectedApp(fullRow || null); setDetailsModalOpen(true); }} />
                                    <Button kind="ghost" size="sm" renderIcon={Download} iconDescription="Download" hasIconOnly onClick={() => fullRow && handleDownload(fullRow)} />
                                    <Button kind="ghost" size="sm" renderIcon={TrashCan} iconDescription="Delete" hasIconOnly onClick={() => fullRow && handleDeleteClick(fullRow)} />
                                  </TableCell>
                                );
                              }
                              return <TableCell key={cell.id}>{cell.value}</TableCell>;
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>

            <Modal
              open={!!deleteTarget}
              danger
              modalHeading="Delete template"
              primaryButtonText={isDeleting ? "Deleting…" : "Delete"}
              secondaryButtonText="Cancel"
              primaryButtonDisabled={isDeleting}
              onRequestClose={() => { if (!isDeleting) { setDeleteTarget(null); setDeleteError(null); } }}
              onRequestSubmit={handleConfirmDelete}
              onSecondarySubmit={() => { setDeleteTarget(null); setDeleteError(null); }}
            >
              {deleteError && (
                <InlineNotification
                  kind="error"
                  title="Error"
                  subtitle={deleteError}
                  lowContrast
                  hideCloseButton
                  style={{ marginBottom: '1rem' }}
                />
              )}
              <p>
                Are you sure you want to delete{" "}
                <strong>{deleteTarget?.rawFormName || deleteTarget?.formName}</strong>? This action cannot be undone.
              </p>
            </Modal>

            <Modal
              open={detailsModalOpen}
              passiveModal
              modalHeading="Application Template Details"
              onRequestClose={() => { setDetailsModalOpen(false); setSelectedApp(null); }}
            >
              {selectedApp && (
                <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e0e0e0' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 400 }}>{selectedApp.formName}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: '#525252' }}>Template ID</p>
                      <p style={{ fontWeight: 600 }}>{selectedApp.templateId}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: '#525252' }}>Created Date</p>
                      <p style={{ fontWeight: 600 }}>{selectedApp.createdDate}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: '#525252' }}>Status</p>
                      <p style={{ fontWeight: 600 }}>{selectedApp.status}</p>
                    </div>
                  </div>
                  
                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>Form Fields ({selectedApp.fieldsCount})</h4>
                  {selectedApp.fields && selectedApp.fields.length > 0 ? (
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '2rem' }}>
                      {selectedApp.fields.map((f, i) => (
                        <li key={i} style={{ marginBottom: '0.5rem' }}>
                          <strong>{f.label}</strong> <span style={{ color: '#525252' }}>({f.type}{f.isRequired ? ', required' : ''})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: '#525252', marginBottom: '2rem' }}>No fields defined.</p>
                  )}
                  
                  <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                    <Button onClick={() => window.location.href = `/officer/Application_create/application_create?id=${selectedApp.id}`}>
                      Edit in Builder
                    </Button>
                  </div>
                </div>
              )}
            </Modal>
          </main>
        </>
      )}
    />
  );
}

