import '@carbon/styles/css/styles.css';
import { useState, useEffect, useCallback } from "react";
import { hasErrors, parseApiError, v, validateForm } from "../utils/validation";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getAdminOverviewHref, canManageServices } from "../utils/currentUser";
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
  OverflowMenu,
  OverflowMenuItem,
  Loading,
  Modal,
  TextInput,
  PasswordInput,
  Select,
  SelectItem,
  Stack,
  InlineNotification,
  Pagination,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Settings,
  Logout,
  Notification,
  Add,
  Rule,
  Catalog,
  Categories,
  Document,
  Money,
} from "@carbon/icons-react";

// 1. Import Components
import EditOfficerModal from "./Manage_Officers/EditOfficerModel";
import ResetPasswordModal from "./Manage_Officers/ResetPasswordModel";
import SuspendAccountModal from "./Manage_Officers/SuspendAccountModel";
import { DEPARTMENTS, getDepartmentSlug } from "../constants/departments";

const headers = [
  { key: "name", header: "Officer Name" },
  { key: "email", header: "Official Email" },
  { key: "role", header: "Role / Designation" },
  { key: "department", header: "Department" },
  { key: "status", header: "Account Status" },
  { key: "actions", header: "" },
];

interface Officer {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
}

interface StoredOfficerUser {
  fullName?: string;
  email?: string;
  department?: string;
  role?: string;
}

function getStoredOfficerUser(): StoredOfficerUser {
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      return JSON.parse(storedUser);
    } catch {
      // ignore parse error
    }
  }
  return {};
}

export default function ManageOfficers() {
  const [officerRows, setOfficerRows] = useState<Officer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // The signed-in officer/admin. Department Admins are scoped to their own department.
  const [currentUser] = useState(getStoredOfficerUser);
  const currentRole = currentUser.role || "";
  const isDepartmentAdmin = currentRole.toLowerCase().includes("admin") && !!currentUser.department;
  const scopedDepartment = currentUser.department || "";
  const overviewHref = getAdminOverviewHref(currentUser);
  const deptSlug = currentUser?.department ? getDepartmentSlug(currentUser.department) : null;
  const isSysAdmin = canManageServices(currentUser);

  // Add Officer Form State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"fullName" | "email" | "password" | "department" | "role", string>>>({});
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    department: isDepartmentAdmin ? scopedDepartment : "",
    role: "Verifying Officer"
  });

  // 2. State for the Action Modals
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [activeActionModal, setActiveActionModal] = useState<"edit" | "reset" | "suspend" | null>(null);

  const fetchOfficers = useCallback(async () => {
    try {
      const url = isDepartmentAdmin
        ? `http://localhost:5119/api/admin/officers?department=${encodeURIComponent(scopedDepartment)}`
        : "http://localhost:5119/api/admin/officers";
      const response = await fetch(url, {
        cache: "no-store"
      });
      if (response.ok) {
        const data = await response.json();
        // If Department Admin is viewing, exclude the Department Admin themselves from their subordinate directory!
        const filtered = isDepartmentAdmin
          ? data.filter((o: Officer) => o.email.toLowerCase() !== currentUser.email?.toLowerCase() && o.role !== "Department Admin")
          : data;
        setOfficerRows(filtered);
      } else {
        console.error("Failed to fetch officers");
      }
    } catch (error) {
      console.error("Error connecting to backend:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isDepartmentAdmin, scopedDepartment]);

  useEffect(() => {
    const run = async () => {
      await fetchOfficers();
    };
    run();
  }, [fetchOfficers]);

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

  const handleAddOfficer = async () => {
    setFormError(null);
    // Same rules as the backend's CreateOfficerRequest
    const errors = validateForm({
      fullName: [formData.fullName, v.personName("Full name")],
      email: [formData.email, v.email()],
      password: [formData.password, v.strongPassword()],
      department: [formData.department, v.required("Department")],
      role: [formData.role, v.required("Role")],
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("http://localhost:5119/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsAddModalOpen(false);
        setFormData({
          fullName: "",
          email: "",
          password: "",
          department: isDepartmentAdmin ? scopedDepartment : "",
          role: "Verifying Officer"
        });
        fetchOfficers();
      } else {
        const body = await response.text();
        try {
          setFieldErrors(JSON.parse(body)?.fields ?? {});
        } catch {
          // not JSON
        }
        setFormError(parseApiError(body, "Failed to add officer. Please check the details."));
      }
    } catch {
      setFormError("Network error. Could not connect to the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }) => (
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
                <Search size="sm" id="search-records-global" labelText="Search" placeholder="Search records..." />
              </div>
              <CurrentUserBadge />
              <HeaderGlobalAction aria-label="Notifications" onClick={() => { }}>
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
                  isActive
                >
                  Manage Officers
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/admin/audit-logs">
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
        )}
      />

      <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>

        <div style={{ marginBottom: '2rem' }}>
          {isDepartmentAdmin && (
            <Tag type="blue" style={{ marginBottom: '0.5rem' }}>
              {scopedDepartment}
            </Tag>
          )}
          <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
            Officer Directory
          </h1>
          <p style={{ color: '#525252', marginTop: '0.5rem' }}>
            {isDepartmentAdmin
              ? `Provision, modify, and manage access for officers in the ${scopedDepartment}.`
              : 'Provision, modify, and manage access for all government verifying officers.'}
          </p>
        </div>

        {isLoading ? (
          <Loading description="Loading data..." withOverlay={false} />
        ) : (
          <DataTable rows={officerRows} headers={headers}>
            {({ rows, headers, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
              <TableContainer>
                <TableToolbar>
                  <TableToolbarContent>
                    <TableToolbarSearch onChange={onInputChange} persistent />
                    <Button renderIcon={Add} onClick={() => setIsAddModalOpen(true)}>
                      Add Officer
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
                    {rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
                      <TableRow {...getRowProps({ row })} key={row.id}>
                        {row.cells.map((cell) => {
                          if (cell.info.header === 'status') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type={cell.value === 'Active' ? 'blue' : 'red'}>
                                  {cell.value}
                                </Tag>
                              </TableCell>
                            );
                          }

                          if (cell.info.header === 'actions') {
                            // 3. Find the original officer object based on the row ID
                            const currentOfficer = officerRows.find(o => o.id === row.id);

                            return (
                              <TableCell key={cell.id} style={{ padding: 0, width: '48px' }}>
                                <OverflowMenu flipped direction="bottom">
                                  <OverflowMenuItem
                                    itemText="Edit Profile"
                                    onClick={() => {
                                      setSelectedOfficer(currentOfficer ?? null);
                                      setActiveActionModal("edit");
                                    }}
                                  />
                                  <OverflowMenuItem
                                    itemText="Reset Password"
                                    onClick={() => {
                                      setSelectedOfficer(currentOfficer ?? null);
                                      setActiveActionModal("reset");
                                    }}
                                  />
                                  <OverflowMenuItem
                                    hasDivider
                                    isDelete={currentOfficer?.status !== "Suspended"}
                                    itemText={currentOfficer?.status === "Suspended" ? "Reactivate Account" : "Suspend Account"}
                                    onClick={() => {
                                      setSelectedOfficer(currentOfficer ?? null);
                                      setActiveActionModal("suspend");
                                    }}
                                  />
                                </OverflowMenu>
                              </TableCell>
                            );
                          }

                          return <TableCell key={cell.id}>{cell.value}</TableCell>;
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
        )}

        {/* Existing Add Officer Modal */}
        <Modal
          open={isAddModalOpen}
          onRequestClose={() => setIsAddModalOpen(false)}
          onRequestSubmit={handleAddOfficer}
          modalHeading="Add New Officer"
          primaryButtonText={isSubmitting ? "Saving..." : "Create Officer"}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={isSubmitting}
        >
          <p style={{ marginBottom: '1.5rem', color: '#525252' }}>
            Fill in the details below to provision a new verifying officer account.
          </p>

          {formError && (
            <InlineNotification
              kind="error"
              title="Error"
              subtitle={formError}
              lowContrast
              style={{ marginBottom: '1rem' }}
            />
          )}

          <Stack gap={5}>
            <TextInput
              id="fullName"
              labelText="Full Name"
              placeholder="e.g. Kasun Bandara"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              disabled={isSubmitting}
              maxLength={100}
              invalid={!!fieldErrors.fullName}
              invalidText={fieldErrors.fullName}
            />

            <TextInput
              id="email"
              type="email"
              labelText="Official Email"
              placeholder="officer@gov.lk"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={isSubmitting}
              maxLength={254}
              invalid={!!fieldErrors.email}
              invalidText={fieldErrors.email}
            />

            <PasswordInput
              id="password"
              labelText="Temporary Password"
              placeholder="Create a strong password"
              helperText="At least 8 characters with an uppercase letter, a lowercase letter and a number."
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              disabled={isSubmitting}
              maxLength={64}
              invalid={!!fieldErrors.password}
              invalidText={fieldErrors.password}
            />

            <Select
              id="department"
              labelText="Department"
              helperText={isDepartmentAdmin ? "Officers you create are added to your own department." : undefined}
              value={formData.department}
              onChange={(e) => {
                const nextDepartment = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  department: nextDepartment,
                }));
              }}
              disabled={isSubmitting || isDepartmentAdmin}
              invalid={!!fieldErrors.department}
              invalidText={fieldErrors.department}
            >
              <SelectItem value="" text="Choose a department" />
              {DEPARTMENTS.map((dept) => (
                <SelectItem key={dept.slug} value={dept.label} text={dept.label} />
              ))}
            </Select>

            <Select
              id="role"
              labelText="Role Designation"
              helperText={isDepartmentAdmin ? "Add Verifying Officers, Finance Officers, or Auditors to your department." : undefined}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              disabled={isSubmitting}
            >
              <SelectItem value="Verifying Officer" text="Verifying Officer" />
              <SelectItem value="Finance Officer" text="Finance Officer" />
              <SelectItem value="Auditor" text="Auditor" />
              {!isDepartmentAdmin && (
                <SelectItem value="Department Admin" text="Department Admin" />
              )}
            </Select>
          </Stack>
        </Modal>

        {/* 4. Render the Action Modals */}
        <EditOfficerModal
          isOpen={activeActionModal === "edit"}
          onClose={() => setActiveActionModal(null)}
          onSuccess={fetchOfficers}
          officer={selectedOfficer}
        />

        <ResetPasswordModal
          isOpen={activeActionModal === "reset"}
          onClose={() => setActiveActionModal(null)}
          officer={selectedOfficer}
        />

        <SuspendAccountModal
          isOpen={activeActionModal === "suspend"}
          onClose={() => setActiveActionModal(null)}
          onSuccess={fetchOfficers}
          officer={selectedOfficer}
        />

      </main>
    </>
  );
}