import "@carbon/styles/css/styles.css";
import { useState, useEffect } from "react";
import CurrentUserBadge from "../../components/CurrentUserBadge";
import { getAdminOverviewHref, getStoredUser, canManageServices, isDeptAdmin } from "../../utils/currentUser";
import {
  Header,
  HeaderName,
  HeaderMenuButton,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Search,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  Button,
  Loading,
  Modal,
  TextInput,
  Select,
  SelectItem,
  Pagination,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Settings,
  Logout,
  Notification,
  Catalog,
  Rule,
  Categories,
  TrashCan,
  Edit,
  Document,
  Money,
} from "@carbon/icons-react";
import { DEPARTMENTS, getCategoryForDepartment, getDepartmentSlug } from "../../constants/departments";

const headers = [
  { key: "serviceId", header: "Service ID" },
  { key: "name", header: "Procedure Name" },
  { key: "category", header: "Category" },
  { key: "workflow", header: "Workflow & Stages" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions" },
];

interface ServiceRecord {
  id: string;
  serviceId: string;
  name: string;
  category: string;
  status: string;
  totalStages?: number;
  workflowDepartments?: string[] | string;
  workflow?: string;
}

export default function ServiceCatalogManager() {
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Use centralised role helpers from utils/currentUser.
  // canManageServices → System Admin only: create/edit/delete services & templates.
  // isDeptAdmin → Department Admin: read-only catalog, manage own officers only.
  const [currentUser] = useState(() => getStoredUser() ?? {});
  const canWrite = canManageServices(currentUser);          // System Admin only
  const deptAdmin = isDeptAdmin(currentUser);                // Department Admin
  const scopedCategory = deptAdmin && currentUser.department
    ? getCategoryForDepartment(currentUser.department)
    : null;
  const deptSlug = currentUser?.department ? getDepartmentSlug(currentUser.department) : null;
  const overviewHref = getAdminOverviewHref(currentUser);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentServiceId, setCurrentServiceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    serviceId: string;
    name: string;
    category: string;
    status: string;
    totalStages: number;
    workflowDepartments: string[];
  }>({
    serviceId: "",
    name: "",
    category: scopedCategory ?? "Commerce",
    status: "Draft",
    totalStages: 1,
    workflowDepartments: [currentUser.department || "Civil Department"],
  });

  const fetchServices = () => {
    fetch("http://localhost:5119/api/services")
      .then((res) => res.json())
      .then((data) => {
        const formattedData = data.map(
          (item: Omit<ServiceRecord, "id"> & { id: number; totalStages?: number; workflowDepartments?: string[] | string }) => {
            let depts: string[] = [];
            if (Array.isArray(item.workflowDepartments)) {
              depts = item.workflowDepartments;
            } else if (typeof item.workflowDepartments === "string") {
              try {
                depts = JSON.parse(item.workflowDepartments);
              } catch (_) {}
            }
            const stages = item.totalStages && item.totalStages > 0 ? item.totalStages : 1;
            return {
              ...item,
              id: item.id.toString(),
              totalStages: stages,
              workflowDepartments: depts,
              workflow: `${stages} Stage${stages > 1 ? "s" : ""}`,
            };
          },
        );
        setServices(formattedData);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching services:", error);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const generateNextServiceId = () => {
    const maxNumber = services.reduce((max, service) => {
      const match = service.serviceId?.match(/GSN-SRV-(\d+)$/i);
      const num = match ? parseInt(match[1], 10) : 0;
      return num > max ? num : max;
    }, 0);
    const nextNumber = maxNumber + 1;
    return `GSN-SRV-${String(nextNumber).padStart(3, "0")}`;
  };

  const openCreateModal = () => {
    if (!canWrite) return; // guard
    setIsEditMode(false);
    setCurrentServiceId(null);
    const defaultDept = currentUser.department || "Civil Department";
    setFormData({
      serviceId: generateNextServiceId(),
      name: "",
      category: scopedCategory ?? "Commerce",
      status: "Draft",
      totalStages: 1,
      workflowDepartments: [defaultDept],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (service: ServiceRecord) => {
    setIsEditMode(true);
    setCurrentServiceId(service.id);
    let parsedDepts: string[] = [];
    if (Array.isArray(service.workflowDepartments)) {
      parsedDepts = service.workflowDepartments;
    } else if (typeof service.workflowDepartments === "string") {
      try {
        parsedDepts = JSON.parse(service.workflowDepartments);
      } catch (_) {}
    }
    const stages = service.totalStages && service.totalStages > 0 ? service.totalStages : 1;
    if (parsedDepts.length === 0) {
      parsedDepts = [currentUser.department || "Civil Department"];
    }
    while (parsedDepts.length < stages) {
      parsedDepts.push("Civil Department");
    }

    setFormData({
      serviceId: service.serviceId,
      name: service.name,
      category: service.category,
      status: service.status,
      totalStages: stages,
      workflowDepartments: parsedDepts.slice(0, stages),
    });
    setIsModalOpen(true);
  };

  const handleSaveService = async () => {
    setSaveError(null);
    if (!formData.name.trim()) {
      setSaveError("Procedure Name is required.");
      return;
    }
    try {
      const method = isEditMode ? "PUT" : "POST";
      const endpoint = isEditMode
        ? `http://localhost:5119/api/services/${currentServiceId}`
        : "http://localhost:5119/api/services";

      // WorkflowDepartments is stored as a JSON string in the backend model,
      // so serialize the array before sending.
      const payload = {
        ...(isEditMode ? { id: parseInt(currentServiceId!) } : {}),
        serviceId: formData.serviceId,
        name: formData.name,
        category: formData.category,
        status: formData.status,
        totalStages: formData.totalStages,
        workflowDepartments: JSON.stringify(formData.workflowDepartments),
        eligibilityRules: [],
        documentRequirements: [],
        feeSchedules: [],
      };

      const response = await fetch(endpoint, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        fetchServices();
        setIsModalOpen(false);
        setSaveError(null);
      } else {
        const errText = await response.text();
        setSaveError(`Failed to save service. Server responded: ${response.status}. ${errText}`);
      }
    } catch (error) {
      console.error("Error saving service:", error);
      setSaveError("Network error – could not reach the server. Is the backend running?");
    }
  };

  const handleDeleteService = async (id: string) => {
    if (
      !window.confirm("Are you sure you want to delete this service procedure?")
    ) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5119/api/services/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Immediately update local state to filter out the retired/deleted service
        setServices((prev) => prev.filter((s) => s.id !== id));
      } else {
        console.error("Failed to delete service");
      }
    } catch (error) {
      console.error("Error deleting service:", error);
    }
  };

  // Filter out retired services so they don't clutter the active catalog view, plus apply search query.
  // Department Admins see only services scoped to their department category (read-only).
  const filteredServices = services
    .filter((service) => service.status !== "Retired")
    .filter((service) => !deptAdmin || !scopedCategory || service.category === scopedCategory)
    .filter(
      (service) =>
        service.serviceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.category?.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const pagedServices = filteredServices.slice((page - 1) * pageSize, page * pageSize);

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
    <>
      <Header aria-label="Registry Admin System">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
          onClick={() => setIsSideNavExpanded((prev) => !prev)}
          isActive={isSideNavExpanded}
          isCollapsible
        />
        <HeaderName href="#" prefix="GSN">
          Registry Admin
        </HeaderName>
        <HeaderGlobalBar>
          <div
            className="w-[120px] sm:w-[200px] lg:w-[250px]"
            style={{
              marginRight: "1rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size="sm"
              id="search-services"
              labelText="Search"
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
            />
          </div>
          <CurrentUserBadge />
          <HeaderGlobalAction aria-label="Notifications">
            <Notification size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>

        <SideNav
          aria-label="Side navigation"
          expanded={isSideNavExpanded}
          onOverlayClick={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <SideNavLink renderIcon={Dashboard} href={overviewHref}>
              Overview
            </SideNavLink>

            {deptAdmin && deptSlug && (
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

            <SideNavLink renderIcon={Catalog} href="/admin/services" isActive>
              {canWrite ? "Service Catalog" : "Service Catalog (View)"}
            </SideNavLink>

            {canWrite && (
              <>
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
              </>
            )}

            {canWrite && (
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
            <SideNavLink renderIcon={Security} href="/admin/audit-logs">
              Audit Logs
            </SideNavLink>
            {canWrite && (
              <SideNavLink renderIcon={Settings} href="/admin/system-settings">
                System Settings
              </SideNavLink>
            )}
            <div style={{ marginTop: "auto", borderTop: "1px solid #393939" }}>
              <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>
                Sign Out
              </SideNavLink>
            </div>
          </SideNavItems>
        </SideNav>
      </Header>

      <main
        className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64"
        style={{
          backgroundColor: "#f4f4f4",
        }}
      >
        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          style={{
            marginBottom: "2rem",
          }}
        >
          <div>
            {deptAdmin && (
              <Tag type="blue" style={{ marginBottom: "0.5rem" }}>
                {currentUser.department}
              </Tag>
            )}
            <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
              Service Catalog
            </h1>
            <p style={{ color: "#525252", marginTop: "0.5rem" }}>
              {deptAdmin
                ? `Viewing services for the ${currentUser.department}. Service creation and configuration is managed by the System Administrator.`
                : "Create and manage departmental procedures and registry services."}
            </p>
            {deptAdmin && (
              <div style={{
                marginTop: "0.75rem",
                padding: "0.625rem 1rem",
                backgroundColor: "#edf5ff",
                border: "1px solid #a6c8ff",
                borderLeft: "4px solid #0f62fe",
                fontSize: "0.8125rem",
                color: "#0043ce",
                borderRadius: "2px"
              }}>
                🔒 Read-only view. Only System Administrators can create, edit, or configure services and form templates.
              </div>
            )}
          </div>
          {canWrite && (
            <Button size="md" onClick={openCreateModal}>
              + New Service
            </Button>
          )}
        </div>

        <Modal
          open={isModalOpen}
          modalHeading={isEditMode ? "Edit Service" : "Create New Service"}
          primaryButtonText={isEditMode ? "Save Changes" : "Create"}
          secondaryButtonText="Cancel"
          onRequestClose={() => setIsModalOpen(false)}
          onRequestSubmit={handleSaveService}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              paddingTop: "1rem",
            }}
          >
            <TextInput
              id="serviceId"
              labelText="Service ID"
              helperText="Auto-generated based on existing services."
              value={formData.serviceId}
              readOnly
            />
            <TextInput
              id="name"
              labelText="Procedure Name"
              placeholder="e.g., Vehicle Registration"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
            <Select
              id="category"
              labelText="Category"
              helperText="Select the service category."
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            >
              {DEPARTMENTS.map((dept) => (
                <SelectItem key={dept.category} value={dept.category} text={dept.category} />
              ))}
            </Select>
            {saveError && (
              <div style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fff1f1',
                border: '1px solid #da1e28',
                borderLeft: '4px solid #da1e28',
                color: '#da1e28',
                fontSize: '0.875rem',
                marginTop: '0.5rem'
              }}>
                ⚠ {saveError}
              </div>
            )}
            <Select
              id="status"
              labelText="Status"
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
            >
              <SelectItem value="Draft" text="Draft" />
              <SelectItem value="Active" text="Active" />
              <SelectItem value="Retired" text="Retired" />
            </Select>
          </div>
        </Modal>

        {isLoading ? (
          <Loading description="Loading services" withOverlay={false} />
        ) : (
          <DataTable rows={pagedServices} headers={headers}>
            {({
              rows,
              headers,
              getTableProps,
              getHeaderProps,
              getRowProps,
            }) => (
              <TableContainer
                title="Active Services"
                description="Procedures available for citizen submissions."
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
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={headers.length}
                          style={{ textAlign: "center", padding: "2rem" }}
                        >
                          No matching services found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => {
                            if (cell.info.header === "status") {
                              return (
                                <TableCell key={cell.id}>
                                  <Tag
                                    type={
                                      cell.value === "Active"
                                        ? "green"
                                        : cell.value === "Draft"
                                          ? "blue"
                                          : "gray"
                                    }
                                  >
                                    {cell.value}
                                  </Tag>
                                </TableCell>
                              );
                            }
                            if (cell.info.header === "actions") {
                              return (
                                <TableCell key={cell.id}>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "0.5rem",
                                      alignItems: "center",
                                    }}
                                  >
                                    {canWrite ? (
                                      <>
                                        <Button
                                          size="sm"
                                          kind="tertiary"
                                          renderIcon={Edit}
                                          iconDescription="Edit"
                                          hasIconOnly
                                          onClick={() => {
                                            const serviceToEdit = services.find(
                                              (s) => s.id === row.id,
                                            );
                                            if (serviceToEdit)
                                              openEditModal(serviceToEdit);
                                          }}
                                        />
                                        <Button
                                          size="sm"
                                          kind="danger--ghost"
                                          renderIcon={TrashCan}
                                          iconDescription="Delete"
                                          hasIconOnly
                                          onClick={() =>
                                            handleDeleteService(row.id)
                                          }
                                        />
                                      </>
                                    ) : (
                                      <span style={{ fontSize: "0.75rem", color: "#8d8d8d", fontStyle: "italic" }}>
                                        View only
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={cell.id}>{cell.value}</TableCell>
                            );
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
                  totalItems={filteredServices.length}
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
  );
}
