import '@carbon/styles/css/styles.css';
import { useState, useEffect, useCallback } from 'react';
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
  Security
} from '@carbon/icons-react';

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

export default function VerifiedRecords() {
  const [rows, setRows] = useState<VerifiedRecordRow[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingRecord, setEditingRecord] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewingRecord, setViewingRecord] = useState<any>(null);
  const [editStatus, setEditStatus] = useState('Approved');
  const [editComments, setEditComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchVerifiedTasks = useCallback(async () => {
    const token = localStorage.getItem('officerToken');
    try {
      const response = await fetch(`http://localhost:5119/api/Verification/tasks/verified`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (response.ok) {
        const data = await response.json();

        // 1. Department match: strictly show records corresponding to this officer's department
        const officerUser = JSON.parse(localStorage.getItem('officerUser') || '{}');
        const officerDept = (officerUser.department || '').trim().toLowerCase();

        const deptFiltered = data.filter((t: TaskData) => {
          if (!officerDept) return true;
          const taskDept = ((t.department as string) || (t.currentDepartment as string) || '').trim().toLowerCase();
          if (!taskDept) return true;
          return taskDept === officerDept || taskDept.includes(officerDept) || officerDept.includes(taskDept);
        });

        // 2. Sort order: latest records first (descending by verifiedDate/createdDate, then id)
        deptFiltered.sort((a: TaskData, b: TaskData) => {
          const dateA = new Date((a.verifiedDate || a.createdDate) as string).getTime();
          const dateB = new Date((b.verifiedDate || b.createdDate) as string).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return Number(b.id) - Number(a.id);
        });

        const mappedRows = deptFiltered.map((t: TaskData) => {
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
        });
        setRows(mappedRows);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVerifiedTasks();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchVerifiedTasks]);

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsSaving(true);
    const token = localStorage.getItem('officerToken');
    try {
      const response = await fetch(`http://localhost:5119/api/Verification/tasks/${editingRecord.id}/decision`, {
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
        await fetchVerifiedTasks();
        setEditingRecord(null);
      } else {
        console.error('Failed to update');
      }
    } catch (e) {
      console.error(e);
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
    a.setAttribute('download', 'verified_records.csv');
    a.click();
  };
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
              const totalProcessed = rows.length;
              const totalApproved = rows.filter(r => r.status === 'Approved').length;
              const totalRejectedOrSuspended = rows.filter(r => r.status === 'Rejected' || r.status === 'Suspended').length;
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
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
                <TableContainer 
                  title="Record Archive" 
                  description="Complete history of all decisions made by you."
                >
                  <TableToolbar>
                    <TableToolbarContent>
                      <TableToolbarSearch 
                        onChange={onInputChange} 
                        persistent 
                        placeholder="Filter by App ID, Citizen, or Date..." 
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
                              let tagType: "green" | "red" | "warm-gray" | "blue" = "green";
                              if (s === 'Approved') tagType = 'green';
                              else if (s === 'Suspended') tagType = 'warm-gray';
                              else if (s === 'Rejected') tagType = 'red';
                              else tagType = 'blue';

                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={tagType}>
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
                <SelectItem value="Suspended" text="Suspended" />
                <SelectItem value="Rejected" text="Rejected" />
              </Select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <TextInput
                id="edit-comments"
                labelText="Comments/Reasons"
                value={editComments}
                onChange={(e) => setEditComments(e.target.value)}
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
              <div style={{ padding: '1rem 0', fontSize: '1rem', color: '#161616' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Citizen Name</span>
                    <p style={{ marginTop: '0.25rem', fontWeight: 600 }}>{viewingRecord.cells?.find((c: DataCell) => c.info.header === 'citizen')?.value}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Service Type</span>
                    <p style={{ marginTop: '0.25rem', fontWeight: 600 }}>{viewingRecord.cells?.find((c: DataCell) => c.info.header === 'service')?.value}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Date Verified</span>
                    <p style={{ marginTop: '0.25rem', fontWeight: 600 }}>{viewingRecord.cells?.find((c: DataCell) => c.info.header === 'dateVerified')?.value}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Decision Status</span>
                    <div style={{ marginTop: '0.25rem' }}>
                      {(() => {
                        const s = viewingRecord.cells?.find((c: DataCell) => c.info.header === 'status')?.value;
                        let tagType: "green" | "red" | "warm-gray" | "blue" = "green";
                        if (s === 'Approved') tagType = 'green';
                        else if (s === 'Suspended') tagType = 'warm-gray';
                        else if (s === 'Rejected') tagType = 'red';
                        else tagType = 'blue';
                        return <Tag type={tagType}>{s}</Tag>;
                      })()}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.32px' }}>Officer Comments</span>
                  <p style={{ marginTop: '0.5rem', fontStyle: viewingRecord.comments ? 'normal' : 'italic', color: viewingRecord.comments ? '#161616' : '#8d8d8d' }}>
                    {viewingRecord.comments || 'No additional comments provided during verification.'}
                  </p>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    />
  );
}