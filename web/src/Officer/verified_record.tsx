import '@carbon/styles/css/styles.css';
import { readApiError, v } from '../utils/validation';
import { useState, useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, apiFetch, toQuery, type Paged } from '../utils/api';
import { queryKeys } from '../utils/queryClient';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderMenuButton,
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
  Pagination,
  Tag,
  Search,
  Button,
  Modal,
  Select,
  SelectItem,
  TextInput
} from "@carbon/react";
import {
  CheckmarkOutline,
  CloseOutline,
  Dashboard,
  DataStructured,
  Download,
  Document,
  Time,
  User,
  Logout,
  Notification,
  Security,
  Launch
} from '@carbon/icons-react';
import jsPDF from "jspdf";

// Table Data for Verified Records
const headers = [
  { key: "appId", header: "App ID" },
  { key: "citizen", header: "Citizen Name" },
  { key: "service", header: "Service Type" },
  { key: "dateVerified", header: "Date Verified" },
  { key: "status", header: "Status" },
  { key: "actions", header: "" },
];

interface TaskData {
  id: number;
  applicationId: number;
  createdDate: string;
  verifiedDate?: string;
  status: string;
  comments?: string;
  referenceNumber?: string;
  citizenName?: string | null;
  citizenNic?: string | null;
  serviceName?: string | null;
  department?: string | null;
  currentDepartment?: string | null;
  stageNumber?: number;
  [key: string]: unknown;
}

interface TaskDocument {
  id: number | string;
  fileName?: string;
  fieldLabel?: string;
  category?: string;
}

const statusTagType = (status: unknown): "green" | "red" | "warm-gray" | "blue" => {
  if (status === 'Approved') return 'green';
  if (status === 'Suspended') return 'warm-gray';
  if (status === 'Rejected') return 'red';
  return 'blue';
};

interface DataCell {
  info: { header: string };
  value: string;
}

interface VerifiedRecordRow {
  id: string;
  appId: string;
  citizen: string;
  service: string;
  dateVerified: string;
  rawDate?: string;
  status: string;
  comments: string;
  cells?: DataCell[];
  [key: string]: unknown;
}

interface TaskSummary {
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
  verified: number;
}

function isFileValue(val: unknown): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim().toLowerCase();
  return s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.png') || s.endsWith('.pdf') || s.endsWith('.webp');
}

function toRow(t: TaskData): VerifiedRecordRow {
  const rawDate = (t.verifiedDate || t.createdDate) as string;
  const parsedDate = new Date(rawDate);
  const formattedDate = !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : rawDate;
  const formattedTime = !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '';

  return {
    id: t.id.toString(),
    appId: t.referenceNumber ?? `APP-${t.applicationId}`,
    citizen: t.citizenName || t.citizenNic || 'Unknown citizen',
    service: t.serviceName ? `${t.serviceName}${t.stageNumber ? ` (Stage ${t.stageNumber})` : ''}` : 'General Service',
    dateVerified: formattedTime ? `${formattedDate}, ${formattedTime}` : formattedDate,
    rawDate: rawDate,
    status: t.status,
    comments: (t.comments as string) || ''
  };
}

export default function VerifiedRecords() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingRecord, setEditingRecord] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewingRecord, setViewingRecord] = useState<any>(null);
  // Detail fetched for a specific record id; anything else counts as still loading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fetchedDetail, setFetchedDetail] = useState<{ id: unknown; data: any } | null>(null);
  const viewingId = viewingRecord?.id;
  const currentDetail = viewingId && fetchedDetail?.id === viewingId ? fetchedDetail : null;
  const viewingDetail = currentDetail?.data ?? null;
  const loadingDetail = !!viewingId && !currentDetail;
  const [previewLoadingDocId, setPreviewLoadingDocId] = useState<string | number | null>(null);

  const handleViewDocument = async (docId: string | number) => {
    try {
      setPreviewLoadingDocId(docId);
      const token = localStorage.getItem('officerToken');
      const response = await fetch(`${API_BASE_URL}/api/Verification/documents/${docId}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
    } catch (e) {
      console.error('Failed to preview document', e);
      alert('Could not preview document. Please ensure you are logged in as an officer.');
    } finally {
      setPreviewLoadingDocId(null);
    }
  };

  const [editStatus, setEditStatus] = useState('Approved');
  const [editComments, setEditComments] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!viewingId) return;
    let isMounted = true;
    const token = localStorage.getItem('officerToken');
    fetch(`${API_BASE_URL}/api/Verification/tasks/${viewingId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
      .then(res => res.ok ? res.json() : null)
      .catch(err => {
        console.error('Failed to load task details', err);
        return null;
      })
      .then(data => {
        if (isMounted) setFetchedDetail({ id: viewingId, data });
      });

    return () => { isMounted = false; };
  }, [viewingId]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText.trim());

  // One page at a time, newest first; the server scopes it to the officer's department
  const { data: tasksPage } = useQuery({
    queryKey: [...queryKeys.tasks, 'verified', { page, pageSize, search }],
    queryFn: () => apiFetch<Paged<TaskData>>(`/api/verification/tasks/verified${toQuery({ page, pageSize, search })}`),
    placeholderData: keepPreviousData,
  });
  const rows: VerifiedRecordRow[] = (tasksPage?.items ?? []).map(toRow);

  // Stat cards come from server-side counts, not from downloading every record
  const { data: summary } = useQuery({
    queryKey: [...queryKeys.tasks, 'summary'],
    queryFn: () => apiFetch<TaskSummary>('/api/verification/tasks/summary'),
  });

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    // Same rules as the backend's VerificationDecisionRequest: the citizen must be told what to fix
    const needsReason = editStatus === 'Rejected' || editStatus === 'Revised';
    const error = v.text('Comments', { min: needsReason ? 5 : 0, max: 2000, required: needsReason })(editComments);
    setEditError(error);
    if (error) return;
    setIsSaving(true);
    const token = localStorage.getItem('officerToken');
    try {
      const response = await fetch(`${API_BASE_URL}/api/Verification/tasks/${editingRecord.id}/decision`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          Status: editStatus,
          Comments: editComments
        })
      });
      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
        setEditingRecord(null);
      } else {
        setEditError(await readApiError(response, 'Failed to update the decision.'));
      }
    } catch (e) {
      console.error(e);
      setEditError('Could not connect to the server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    if (rows.length === 0) return;
    const csvRows = [];
    const csvHeaders = ['App ID', 'Citizen Name', 'Service Type', 'Date Verified', 'Status'];
    csvRows.push(csvHeaders.join(','));
    
    for (const row of rows) {
      csvRows.push([
        row.appId,
        row.citizen,
        row.service,
        row.dateVerified,
        row.status
      ].join(','));
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `verified_records_page_${page}.csv`);
    a.click();
  };

  const exportDossierPdf = (rec: any, det: any) => {
    if (!rec) return;
    const doc = new jsPDF();
    const marginX = 15;
    let y = 18;

    doc.setFillColor(15, 98, 254);
    doc.rect(0, 0, 210, 8, 'F');

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 22, 22);
    doc.text('Government Service Navigator - Verified Record Dossier', marginX, y);
    y += 6;

    const appId = rec.cells?.find((c: DataCell) => c.info.header === 'appId')?.value || rec.appId || 'APP';
    const citizen = det?.task?.citizenName || rec.cells?.find((c: DataCell) => c.info.header === 'citizen')?.value || rec.citizen;
    const nic = det?.task?.citizenNic || '—';
    const service = rec.cells?.find((c: DataCell) => c.info.header === 'service')?.value || rec.service;
    const status = rec.cells?.find((c: DataCell) => c.info.header === 'status')?.value || rec.status;
    const reviewDate = det?.task?.verifiedDate ? new Date(det.task.verifiedDate).toLocaleString() : rec.dateVerified;
    const comments = det?.task?.comments || rec.comments || 'No comments provided.';

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(82, 82, 82);
    doc.text(`Official Historical Record & Audit Archive | Generated: ${new Date().toLocaleString()}`, marginX, y);
    y += 6;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, y, 195, y);
    y += 8;

    // Summary Box
    doc.setFillColor(244, 244, 244);
    doc.rect(marginX, y, 180, 42, 'F');
    doc.rect(marginX, y, 180, 42, 'S');

    doc.setFontSize(9);
    doc.setTextColor(22, 22, 22);

    doc.setFont('helvetica', 'bold');
    doc.text('Application Ref:', marginX + 4, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(appId, marginX + 38, y + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('Citizen NIC:', marginX + 96, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(nic, marginX + 124, y + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('Citizen Name:', marginX + 4, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.text(citizen, marginX + 38, y + 17);

    doc.setFont('helvetica', 'bold');
    doc.text('Determination:', marginX + 96, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.text(status, marginX + 124, y + 17);

    doc.setFont('helvetica', 'bold');
    doc.text('Service Type:', marginX + 4, y + 26);
    doc.setFont('helvetica', 'normal');
    doc.text(service.length > 30 ? service.substring(0, 27) + '...' : service, marginX + 38, y + 26);

    doc.setFont('helvetica', 'bold');
    doc.text('Review Date:', marginX + 96, y + 26);
    doc.setFont('helvetica', 'normal');
    doc.text(reviewDate, marginX + 124, y + 26);

    doc.setFont('helvetica', 'bold');
    doc.text('Officer Remarks:', marginX + 4, y + 35);
    doc.setFont('helvetica', 'normal');
    doc.text(comments.length > 70 ? comments.substring(0, 67) + '...' : comments, marginX + 38, y + 35);

    y += 50;

    // Attached Documents
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Submitted Evidentiary & Verification Documents', marginX, y);
    y += 6;

    const docs = det?.documents || [];
    if (docs.length === 0) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.text('No file attachments found for this record.', marginX, y);
      y += 8;
    } else {
      doc.setFontSize(8.5);
      for (const d of docs) {
        if (y > 270) { doc.addPage(); y = 20; }
        const label = `• ${d.fieldLabel || d.fileName}:`;
        const val = `${d.fileName} (${d.category || 'attachment'})`;
        if (label.length > 25) {
          doc.setFont('helvetica', 'bold');
          doc.text(label, marginX + 4, y);
          y += 4.5;
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(val, 125);
          doc.text(lines, marginX + 8, y);
          y += (lines.length * 4.5) + 1.5;
        } else {
          doc.setFont('helvetica', 'bold');
          doc.text(label, marginX + 4, y);
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(val, 125);
          doc.text(lines, marginX + 60, y);
          y += Math.max(5.5, (lines.length * 4.5) + 1.5);
        }
      }
      y += 4;
    }

    // Citizen Form Responses
    if (det?.answers && Object.keys(det.answers).length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Citizen Form Responses', marginX, y);
      y += 6;

      doc.setFontSize(8.5);
      for (const [k, v] of Object.entries(det.answers)) {
        if (y > 270) { doc.addPage(); y = 20; }
        const label = `${k}:`;
        const sv = String(v || '-');
        if (label.length > 25) {
          doc.setFont('helvetica', 'bold');
          doc.text(label, marginX + 4, y);
          y += 4.5;
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(sv, 125);
          doc.text(lines, marginX + 8, y);
          y += (lines.length * 4.5) + 1.5;
        } else {
          doc.setFont('helvetica', 'bold');
          doc.text(label, marginX + 4, y);
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(sv, 125);
          doc.text(lines, marginX + 60, y);
          y += Math.max(5.5, (lines.length * 4.5) + 1.5);
        }
      }
    }

    doc.save(`GSN_Verified_Record_${appId.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
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
      window.location.href = "/officer/login"; //[cite: 6]
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
            <HeaderName href="#" prefix="GSN">
              Registry Portal
            </HeaderName>

            <HeaderGlobalBar>
              <div className="w-[120px] sm:w-[200px] md:w-[280px]" style={{ marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
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
                {/* Active state moved to Verified Records[cite: 6] */}
                <SideNavLink renderIcon={Document} href="/officer/verified-records" isActive>
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
          <main className="mt-12 min-h-screen p-4 sm:p-6 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                Verified Records
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                Search and review historically processed applications and official decisions.
              </p>
            </div>

            {/* Stat Cards for Historical Context[cite: 6] */}
            {(() => {
              const totalProcessed = summary?.verified ?? 0;
              const totalApproved = summary?.approved ?? 0;
              const totalRejectedOrSuspended = (summary?.rejected ?? 0) + (summary?.suspended ?? 0);
              const approvalRate = totalProcessed > 0 ? Math.round((totalApproved / totalProcessed) * 100) : 100;
              const rejectionRate = totalProcessed > 0 ? Math.round((totalRejectedOrSuspended / totalProcessed) * 100) : 0;
              return (
                <Grid style={{ paddingLeft: 0, paddingRight: 0, marginBottom: '2rem' }}>
                  <Column sm={4} md={4} lg={4}>
                    <Tile>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <p style={{ color: '#525252', fontSize: '0.875rem' }}>Total Processed</p>
                        <Document size={20} />
                      </div>
                      <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>{totalProcessed}</h3>
                      <p style={{ color: '#525252', fontSize: '0.875rem', marginTop: '1rem' }}>Active records</p>
                    </Tile>
                  </Column>
                  <Column sm={4} md={4} lg={4}>
                    <Tile style={{ borderTop: '4px solid #24a148' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <p style={{ color: '#525252', fontSize: '0.875rem' }}>Total Approved</p>
                        <CheckmarkOutline size={20} color="#24a148" />
                      </div>
                      <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>{totalApproved}</h3>
                      <p style={{ color: '#24a148', fontSize: '0.875rem', marginTop: '1rem' }}>{approvalRate}% approval rate</p>
                    </Tile>
                  </Column>
                  <Column sm={4} md={4} lg={4}>
                    <Tile style={{ borderTop: '4px solid #da1e28' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <p style={{ color: '#525252', fontSize: '0.875rem' }}>Suspended / Rejected</p>
                        <CloseOutline size={20} color="#da1e28" />
                      </div>
                      <h3 style={{ fontSize: '2.5rem', fontWeight: 300, margin: '0.5rem 0' }}>{totalRejectedOrSuspended}</h3>
                      <p style={{ color: '#da1e28', fontSize: '0.875rem', marginTop: '1rem' }}>{rejectionRate}% flagged rate</p>
                    </Tile>
                  </Column>
                </Grid>
              );
            })()}

            {/* Data Table for Verified Records[cite: 6] */}
            <DataTable rows={rows} headers={headers}>
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                <TableContainer 
                  title="Record Archive" 
                  description="Complete history of all decisions made by you."
                >
                  <TableToolbar>
                    <TableToolbarContent>
                      <TableToolbarSearch
                        onChange={(e) => {
                          setSearchText(typeof e === 'string' ? e : e?.target?.value ?? '');
                          setPage(1);
                        }}
                        persistent
                        placeholder="Search by App ID or NIC..."
                      />
                      <Button 
                        kind="ghost" 
                        renderIcon={Download} 
                        onClick={handleExport}
                      >
                        Export
                      </Button>
                    </TableToolbarContent>
                  </TableToolbar>

                  <div className="overflow-x-auto">
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
                      {rows.map((row) => (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => {
                            
                            // Format Date Verified with clock icon and clear typography
                            if (cell.info.header === 'dateVerified') {
                              return (
                                <TableCell key={cell.id}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Time size={14} style={{ fill: '#0f62fe', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#161616' }}>
                                      {cell.value}
                                    </span>
                                  </div>
                                </TableCell>
                              );
                            }

                            // Format Status with Carbon Tags[cite: 6]
                            if (cell.info.header === 'status') {
                              const s = cell.value;

                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={statusTagType(s)}>
                                    {s}
                                  </Tag>
                                </TableCell>
                              );
                            }
                            
                            // Format the actions column with a View button and Edit button
                            if (cell.info.header === 'actions') {
                              return (
                                <TableCell key={cell.id} style={{ padding: '0.5rem', textAlign: 'right' }}>
                                  <Button 
                                    size="sm" 
                                    kind="primary"
                                    onClick={() => {
                                      setEditingRecord(row);
                                      setEditStatus(row.cells.find((c: DataCell) => c.info.header === 'status')?.value || 'Approved');
                                      setEditError(null);
                                      setEditComments((row as unknown as VerifiedRecordRow).comments || '');
                                    }}
                                    style={{ marginRight: '0.5rem' }}
                                  >
                                    Edit
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    kind="ghost"
                                    onClick={() => setViewingRecord(row)}
                                  >
                                    View Record
                                  </Button>
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
                  <Pagination
                    page={page}
                    pageSize={pageSize}
                    pageSizes={[10, 25, 50, 100]}
                    totalItems={tasksPage?.total ?? 0}
                    onChange={({ page: nextPage, pageSize: nextSize }: { page: number; pageSize: number }) => {
                      setPage(nextPage);
                      setPageSize(nextSize);
                    }}
                  />
                </TableContainer>
              )}
            </DataTable>

          </main>

          {/* Edit Record Modal */}
          <Modal
            open={!!editingRecord}
            onRequestClose={() => setEditingRecord(null)}
            onRequestSubmit={handleSaveEdit}
            modalHeading={`Edit Decision: ${editingRecord?.cells?.find((c: DataCell) => c.info.header === 'appId')?.value}`}
            primaryButtonText={isSaving ? "Saving..." : "Save Changes"}
            secondaryButtonText="Cancel"
            primaryButtonDisabled={isSaving}
          >
            <div style={{ marginBottom: '1rem' }}>
              <Select
                id="edit-status"
                labelText="Decision Status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <SelectItem value="Approved" text="Approved" />
                <SelectItem value="Revised" text="Revision Requested" />
                <SelectItem value="Rejected" text="Rejected" />
              </Select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <TextInput
                id="edit-comments"
                labelText="Comments/Reasons"
                helperText="Required when rejecting or requesting a revision."
                value={editComments}
                onChange={(e) => setEditComments(e.target.value)}
                maxLength={2000}
                invalid={!!editError}
                invalidText={editError ?? undefined}
              />
            </div>
          </Modal>

          {/* View Record Modal */}
          <Modal
            open={!!viewingRecord}
            onRequestClose={() => setViewingRecord(null)}
            passiveModal
            modalHeading={`Application Details: ${viewingRecord?.cells?.find((c: DataCell) => c.info.header === 'appId')?.value}`}
          >
            {viewingRecord && (
              <div style={{ padding: '1rem 0', fontSize: '1rem', color: '#161616', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Citizen Name</span>
                    <p style={{ marginTop: '0.25rem', fontWeight: 600 }}>{viewingDetail?.task?.citizenName || viewingRecord.cells?.find((c: DataCell) => c.info.header === 'citizen')?.value}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Citizen NIC</span>
                    <p style={{ marginTop: '0.25rem', fontWeight: 600 }}>{viewingDetail?.task?.citizenNic || '—'}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Service Type</span>
                    <p style={{ marginTop: '0.25rem', fontWeight: 600 }}>{viewingRecord.cells?.find((c: DataCell) => c.info.header === 'service')?.value}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Decision Status</span>
                    <div style={{ marginTop: '0.25rem' }}>
                      {(() => {
                        const s = viewingRecord.cells?.find((c: DataCell) => c.info.header === 'status')?.value;
                        return <Tag type={statusTagType(s)}>{s}</Tag>;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Officer Comments */}
                <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px', fontWeight: 700 }}>
                      Officer Determination Comments
                    </span>
                    {(viewingDetail?.task?.verifiedDate || viewingRecord.dateVerified) && (
                      <span style={{ fontSize: '0.75rem', color: '#525252' }}>
                        Reviewed: {viewingDetail?.task?.verifiedDate ? new Date(viewingDetail.task.verifiedDate).toLocaleString() : viewingRecord.dateVerified}
                      </span>
                    )}
                  </div>
                  <p style={{ marginTop: '0.5rem', fontStyle: (viewingDetail?.task?.comments || viewingRecord.comments) ? 'normal' : 'italic', color: (viewingDetail?.task?.comments || viewingRecord.comments) ? '#161616' : '#8d8d8d', backgroundColor: '#f4f4f4', padding: '0.75rem', borderRadius: '4px' }}>
                    {viewingDetail?.task?.comments || viewingRecord.comments || 'No additional comments provided during verification.'}
                  </p>
                </div>

                {/* Submitted Documents & Evidentiary Attachments */}
                <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '1rem' }}>
                  {(() => {
                    const currentDocs = viewingDetail?.documents ?? [];
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px', fontWeight: 700 }}>
                            Stage Evidentiary & Payment Documents
                          </span>
                          <Tag type="cool-gray" size="sm">{currentDocs.length} Attached</Tag>
                        </div>
                        {loadingDetail ? (
                          <p style={{ fontSize: '0.875rem', color: '#525252' }}>Loading attachments...</p>
                        ) : currentDocs.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {currentDocs.map((doc: TaskDocument) => (
                              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: '#fafafa' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <Document size={18} style={{ color: '#0f62fe' }} />
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{doc.fileName}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#525252', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                                      <span>Label: <strong>{doc.fieldLabel || 'General Upload'}</strong></span>
                                      <Tag type={doc.category === 'payment' ? 'teal' : doc.category === 'stage' ? 'blue' : 'cool-gray'} size="sm">
                                        {doc.category === 'payment' ? 'Payment Slip' : doc.category === 'stage' ? 'Evidentiary Document' : 'Supporting Document'}
                                      </Tag>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <Button
                                    size="sm"
                                    kind="ghost"
                                    renderIcon={Launch}
                                    disabled={previewLoadingDocId === doc.id}
                                    onClick={() => handleViewDocument(doc.id)}
                                  >
                                    {previewLoadingDocId === doc.id ? 'Loading...' : 'View'}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.875rem', color: '#8d8d8d', fontStyle: 'italic' }}>No document attachments recorded for this stage.</p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Submitted Form Answers */}
                {viewingDetail?.answers && Object.keys(viewingDetail.answers).length > 0 && (
                  <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px', fontWeight: 700, display: 'block', marginBottom: '0.75rem' }}>
                      Citizen Form Responses
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      {Object.entries(viewingDetail.answers).map(([key, val]) => {
                        const strVal = String(val || '—');
                        const isFile = isFileValue(strVal);

                        return (
                          <div key={key} style={{ padding: '0.625rem', backgroundColor: '#f4f4f4', borderRadius: '4px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#525252', textTransform: 'uppercase', fontWeight: 600 }}>{key}</div>
                            {isFile ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.25rem', overflow: 'hidden' }}>
                                <Document size={16} style={{ color: '#0f62fe', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={strVal}>
                                  {strVal}
                                </span>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: '0.25rem' }}>{strVal}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={Document}
                    onClick={() => exportDossierPdf(viewingRecord, viewingDetail)}
                  >
                    Export PDF
                  </Button>
                  <Button
                    kind="tertiary"
                    size="md"
                    onClick={() => setViewingRecord(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    />
  );
}