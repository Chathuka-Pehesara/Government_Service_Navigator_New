import '@carbon/styles/css/styles.css';
import { useState, useEffect } from "react";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref, isDeptAdmin, isSystemAdmin } from "../utils/currentUser";
import { getDepartmentSlug, DEPARTMENTS } from "../constants/departments";
import { hasErrors, parseApiError, v, validateForm } from "../utils/validation";
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
  Button,
  Modal,
  Select,
  SelectItem,
  TextInput,
  Toggle,
  Tag,
  InlineNotification,
  Search
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
  Document,
  Money,
  Calendar,
  Edit,
  TrashCan,
  Add
} from "@carbon/icons-react";

interface CollectionSlot {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  bookedCount?: number;
  remainingCapacity?: number;
  // yyyy-MM-dd the counts are for: the next time this weekday comes round
  nextDate?: string;
  isActive: boolean;
  departmentName?: string;
  departmentId?: number;
}

const DAY_MAP: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const headers = [
  { key: "day", header: "Day of Week" },
  { key: "timeWindow", header: "Time Window" },
  { key: "department", header: "Department" },
  { key: "capacity", header: "Max Capacity" },
  { key: "booked", header: "Booked (next date)" },
  { key: "remaining", header: "Remaining" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions" },
];

const bookingHeaders = [
  { key: "confirmationCode", header: "Booking Ref" },
  { key: "applicationCode", header: "Application Ref" },
  { key: "citizenNic", header: "Citizen NIC" },
  { key: "serviceName", header: "Service" },
  { key: "departmentName", header: "Department" },
  { key: "bookedSlotTime", header: "Booked Date & Time" },
  { key: "preferredTimes", header: "Citizen Input (Free Style)" },
  { key: "status", header: "Status" },
];

export default function ManageCollectionSlots() {
  const [currentUser] = useState(getStoredUser);
  const isDepartmentAdmin = isDeptAdmin(currentUser);
  const isSysAdmin = isSystemAdmin(currentUser);
  const deptSlug = currentUser?.department ? getDepartmentSlug(currentUser.department) : null;
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));

  // If department admin, lock to their department. If system admin, default to "All" or their choice.
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>(
    isDepartmentAdmin && currentUser?.department ? currentUser.department : "All"
  );

  const [activeView, setActiveView] = useState<"slots" | "bookings">("slots");
  const [slots, setSlots] = useState<CollectionSlot[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<CollectionSlot | null>(null);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Form State: Strictly typed as strings to prevent Carbon Select/TextInput crashes
  const [slotDepartment, setSlotDepartment] = useState<string>(
    currentUser?.department || DEPARTMENTS[0].label
  );
  const [dayOfWeek, setDayOfWeek] = useState<string>("1");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("11:30");
  const [maxCapacity, setMaxCapacity] = useState<string>("15");
  const [slotErrors, setSlotErrors] = useState<Partial<Record<"startTime" | "endTime" | "maxCapacity", string>>>({});
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    fetchSlots();
    fetchBookings();
  }, [selectedDeptFilter]);

  const getHeaders = () => {
    const token = localStorage.getItem("officerToken"); 
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const parseSafeError = async (res: Response, defaultMessage: string) => {
    try {
      const text = await res.text();
      if (text.includes("System.Runtime") || text.includes("Npgsql.")) {
        return "An internal server error occurred (500). Please check backend logs.";
      }
      return parseApiError(text, defaultMessage);
    } catch {
      return defaultMessage;
    }
  };

  const fetchSlots = async () => {
    try {
      const deptQuery = isDepartmentAdmin && currentUser?.department
        ? `?department=${encodeURIComponent(currentUser.department)}`
        : selectedDeptFilter !== "All"
          ? `?department=${encodeURIComponent(selectedDeptFilter)}`
          : "";

      const res = await fetch(`http://localhost:5119/api/admin/collection-slots${deptQuery}`, { headers: getHeaders() });
      if (!res.ok) {
        throw new Error(await parseSafeError(res, "Failed to load collection slots."));
      }
      const data = await res.json();
      setSlots(data);
    } catch (err: any) {
      console.error(err);
      setNotification({ kind: "error", message: err.message });
    }
  };

  const fetchBookings = async () => {
    try {
      const deptQuery = isDepartmentAdmin && currentUser?.department
        ? `?department=${encodeURIComponent(currentUser.department)}`
        : selectedDeptFilter !== "All"
          ? `?department=${encodeURIComponent(selectedDeptFilter)}`
          : "";

      const res = await fetch(`http://localhost:5119/api/admin/collection-slots/bookings${deptQuery}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (err: any) {
      console.error("Failed to load collection bookings", err);
    }
  };

  const handleOpenModal = (slot?: CollectionSlot) => {
    setNotification(null);
    if (slot) {
      setEditingSlot(slot);
      setSlotDepartment(slot.departmentName || currentUser?.department || DEPARTMENTS[0].label);
      setDayOfWeek(slot.dayOfWeek.toString());
      setStartTime(slot.startTime.substring(0, 5));
      setEndTime(slot.endTime.substring(0, 5));
      setMaxCapacity(slot.maxCapacity.toString());
      setIsActive(slot.isActive);
    } else {
      setEditingSlot(null);
      setSlotDepartment(
        isDepartmentAdmin && currentUser?.department
          ? currentUser.department
          : selectedDeptFilter !== "All"
            ? selectedDeptFilter
            : DEPARTMENTS[0].label
      );
      setDayOfWeek("1");
      setStartTime("09:00");
      setEndTime("11:30");
      setMaxCapacity("15");
      setIsActive(true);
    }
    setSlotErrors({});
    setIsModalOpen(true);
  };

  // "HH:mm" -> minutes since midnight
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  // Same rules as the backend's CollectionTimeSlotDto, plus the overlap check it makes on save
  const validateSlot = () => {
    const errors = validateForm({
      startTime: [startTime, v.time("Start time")],
      endTime: [endTime, v.time("End time")],
      maxCapacity: [maxCapacity, v.integer("Capacity", 1, 500)],
    });
    if (!errors.startTime && !errors.endTime) {
      const start = toMinutes(startTime);
      const end = toMinutes(endTime);
      if (end <= start) errors.endTime = "End time must be after the start time.";
      else if (end - start < 15) errors.endTime = "A slot must be at least 15 minutes long.";
      else if (start < 6 * 60 || end > 20 * 60) errors.startTime = "Slots must be between 06:00 and 20:00.";
      else {
        const clash = slots.find(
          (s) =>
            s.id !== editingSlot?.id &&
            s.dayOfWeek === Number(dayOfWeek) &&
            (s.departmentName || "").toLowerCase() === slotDepartment.toLowerCase() &&
            toMinutes(s.startTime.substring(0, 5)) < end &&
            toMinutes(s.endTime.substring(0, 5)) > start
        );
        if (clash) {
          errors.startTime = `Overlaps the existing ${clash.startTime.substring(0, 5)} - ${clash.endTime.substring(0, 5)} slot on this day.`;
        }
      }
    }
    setSlotErrors(errors);
    return !hasErrors(errors);
  };

  const handleSave = async () => {
    if (!validateSlot()) return;
    const payload = {
      departmentName: slotDepartment,
      dayOfWeek: Number(dayOfWeek),
      startTime: `${startTime}:00`,
      endTime: `${endTime}:00`,
      maxCapacity: Number(maxCapacity),
      isActive,
    };

    try {
      const url = editingSlot 
        ? `http://localhost:5119/api/admin/collection-slots/${editingSlot.id}` 
        : "http://localhost:5119/api/admin/collection-slots";
      const method = editingSlot ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseSafeError(res, "Failed to save slot."));
      }

      setNotification({ kind: "success", message: `Slot successfully ${editingSlot ? "updated" : "created"} for ${slotDepartment}.` });
      setIsModalOpen(false);
      fetchSlots();
    } catch (err: any) {
      setNotification({ kind: "error", message: err.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this time slot?")) return;
    
    try {
      const res = await fetch(`http://localhost:5119/api/admin/collection-slots/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) {
        throw new Error(await parseSafeError(res, "Failed to delete slot."));
      }
      
      setNotification({ kind: "success", message: "Slot deleted successfully." });
      fetchSlots();
    } catch (err: any) {
      setNotification({ kind: "error", message: err.message });
    }
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
      window.location.href = "/officer/login";
    }
  };

  const rows = slots.map((s) => {
    const booked = s.bookedCount ?? 0;
    const remaining = s.remainingCapacity !== undefined ? s.remainingCapacity : Math.max(0, s.maxCapacity - booked);
    return {
      id: s.id.toString(),
      day: DAY_MAP[s.dayOfWeek],
      timeWindow: `${s.startTime.substring(0, 5)} - ${s.endTime.substring(0, 5)}`,
      department: s.departmentName || "General",
      capacity: s.maxCapacity.toString(),
      booked: s.nextDate
        ? `${booked} / ${s.maxCapacity} on ${new Date(`${s.nextDate}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
        : `${booked} / ${s.maxCapacity}`,
      remaining: remaining.toString(),
      status: s.isActive ? "Active" : "Inactive",
    };
  });

  const bookingRows = bookings.map((b, idx) => ({
    id: b.id ? b.id.toString() : idx.toString(),
    confirmationCode: b.confirmationCode || "SL-APT-0000",
    applicationCode: b.applicationCode || "APP-0000",
    citizenNic: b.citizenNic || "CITIZEN",
    serviceName: b.serviceName || "Government Service",
    departmentName: b.departmentName || "General",
    bookedSlotTime: b.bookedSlotTime || "Confirmed Slot",
    preferredTimes: b.preferredTimes || "Natural Language Request",
    status: b.status || "Confirmed",
  }));

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
              {isDepartmentAdmin && currentUser?.department ? `${currentUser.department} Admin` : "Registry Admin"}
            </HeaderName>

            <HeaderGlobalBar>
              <div className="flex items-center w-[120px] sm:w-[250px] mr-2 sm:mr-4">
                 <Search size="sm" id="search-records" labelText="Search" placeholder="Search records..." />
              </div>
              <CurrentUserBadge />
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
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
                    <SideNavLink 
                      renderIcon={Calendar} 
                      href="/admin/collection-slots" 
                      isActive
                    >
                      Collection Slots
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
                    <SideNavLink 
                      renderIcon={Calendar} 
                      href="/admin/collection-slots" 
                      isActive
                    >
                      Collection Slots
                    </SideNavLink>
                    <SideNavLink
                      renderIcon={Categories}
                      href="/admin/departments"
                    >
                      Department Management
                    </SideNavLink>
                  </>
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
                {isSysAdmin && (
                  <SideNavLink
                    renderIcon={Settings}
                    href="/admin/system-settings"
                  >
                    System Settings
                  </SideNavLink>
                )}

                <div style={{ marginTop: "auto", borderTop: "1px solid #393939" }}>
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

          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
                  {activeView === "slots" 
                    ? (isDepartmentAdmin && currentUser?.department ? `${currentUser.department} Collection Slots` : "Collection Time Slots")
                    : (isDepartmentAdmin && currentUser?.department ? `${currentUser.department} Received Appointments (Agent 3)` : "Booked Appointments Received (Agent 3)")
                  }
                </h1>
                <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                  {activeView === "slots"
                    ? "Manage unique departmental counter collection slots, capacities, and live bookings scheduled by Agent 3."
                    : "Live collection appointments scheduled by Agent 3 for collection desks upon completing procedural stages."}
                </p>

                {/* View Toggles */}
                <div style={{ display: "flex", gap: "10px", marginTop: "1rem" }}>
                  <Button
                    size="sm"
                    kind={activeView === "slots" ? "primary" : "tertiary"}
                    onClick={() => setActiveView("slots")}
                  >
                    Manage Slots ({slots.length})
                  </Button>
                  <Button
                    size="sm"
                    kind={activeView === "bookings" ? "primary" : "tertiary"}
                    onClick={() => {
                      setActiveView("bookings");
                      fetchBookings();
                    }}
                  >
                    Appointments Received ({bookings.length})
                  </Button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {/* Department Filter for System Admins */}
                {isSysAdmin && (
                  <div style={{ width: "260px" }}>
                    <Select
                      id="department-filter"
                      labelText="Filter by Department"
                      size="sm"
                      value={selectedDeptFilter}
                      onChange={(e) => setSelectedDeptFilter(e.target.value)}
                    >
                      <SelectItem value="All" text="All Departments" />
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept.slug} value={dept.label} text={dept.label} />
                      ))}
                    </Select>
                  </div>
                )}

                {isDepartmentAdmin && currentUser?.department && (
                  <Tag type="blue" size="md" style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                    Department Scope: {currentUser.department}
                  </Tag>
                )}

                {activeView === "slots" && (
                  <Button renderIcon={Add} onClick={() => handleOpenModal()}>
                    New Time Slot
                  </Button>
                )}
              </div>
            </div>

            {notification && (
              <InlineNotification
                kind={notification.kind}
                title={notification.kind === "success" ? "Success" : "Error"}
                subtitle={notification.message}
                onClose={() => setNotification(null)}
                style={{ marginBottom: "1rem" }}
              />
            )}

            {activeView === "slots" ? (
              <DataTable rows={rows} headers={headers}>
                {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer>
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
                            <TableCell colSpan={tableHeaders.length} style={{ textAlign: "center", padding: "2rem" }}>
                              No time slots configured for this department. Click "New Time Slot" to create one.
                            </TableCell>
                          </TableRow>
                        ) : (
                          tableRows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => {
                                if (cell.info.header === "department") {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="teal" style={{ fontWeight: 500 }}>{cell.value}</Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === "remaining") {
                                  const rem = parseInt(cell.value, 10);
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type={rem > 0 ? "green" : "red"}>
                                        {rem > 0 ? `${rem} spots available` : "Full"}
                                      </Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === "status") {
                                  const isActive = cell.value === "Active";
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type={isActive ? "green" : "red"}>{cell.value}</Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === "actions") {
                                  return (
                                    <TableCell key={cell.id} style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                                      <Button
                                        size="sm"
                                        kind="ghost"
                                        renderIcon={Edit}
                                        iconDescription="Edit"
                                        hasIconOnly
                                        onClick={() => handleOpenModal(slots.find((s) => s.id.toString() === row.id))}
                                      />
                                      <Button
                                        size="sm"
                                        kind="danger--ghost"
                                        renderIcon={TrashCan}
                                        iconDescription="Delete"
                                        hasIconOnly
                                        onClick={() => handleDelete(Number(row.id))}
                                      />
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
                )}
              </DataTable>
            ) : (
              <DataTable rows={bookingRows} headers={bookingHeaders}>
                {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
                  <TableContainer>
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
                            <TableCell colSpan={tableHeaders.length} style={{ textAlign: "center", padding: "2rem" }}>
                              No appointments received yet for this department.
                            </TableCell>
                          </TableRow>
                        ) : (
                          tableRows.map((row) => (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => {
                                if (cell.info.header === "departmentName") {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="teal">{cell.value}</Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === "status") {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="green">{cell.value}</Tag>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === "confirmationCode") {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="blue" style={{ fontWeight: 600 }}>{cell.value}</Tag>
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
                )}
              </DataTable>
            )}
          </main>
          
          {/* Modal moved outside of <main> to prevent z-index clipping */}
          <Modal
            open={isModalOpen}
            modalHeading={editingSlot ? "Edit Collection Slot" : "Create New Department Collection Slot"}
            primaryButtonText={editingSlot ? "Save Changes" : "Create Slot"}
            secondaryButtonText="Cancel"
            onRequestSubmit={handleSave}
            onRequestClose={() => setIsModalOpen(false)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "1rem" }}>
              {isDepartmentAdmin && currentUser?.department ? (
                <TextInput
                  id="department-readonly"
                  labelText="Department"
                  value={currentUser.department}
                  disabled
                  helperText="Department admins manage collection slots for their assigned department only."
                />
              ) : (
                <Select
                  id="modal-dept-select"
                  labelText="Assign to Department"
                  value={slotDepartment}
                  onChange={(e) => setSlotDepartment(e.target.value)}
                >
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept.slug} value={dept.label} text={dept.label} />
                  ))}
                </Select>
              )}

              <Select
                id="day-select"
                labelText="Day of Week"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              >
                {Object.entries(DAY_MAP).map(([val, label]) => (
                  <SelectItem key={val} value={val} text={label} />
                ))}
              </Select>

              <div style={{ display: "flex", gap: "1rem" }}>
                <TextInput
                  id="start-time"
                  type="time"
                  labelText="Start Time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ flex: 1 }}
                  invalid={!!slotErrors.startTime}
                  invalidText={slotErrors.startTime}
                />
                <TextInput
                  id="end-time"
                  type="time"
                  labelText="End Time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ flex: 1 }}
                  invalid={!!slotErrors.endTime}
                  invalidText={slotErrors.endTime}
                />
              </div>

              <TextInput
                id="max-capacity"
                type="number"
                min={1}
                max={500}
                labelText="Maximum Counter Capacity"
                helperText="Maximum number of citizen collection appointments permitted for this counter slot (1-500)."
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                invalid={!!slotErrors.maxCapacity}
                invalidText={slotErrors.maxCapacity}
              />

              <Toggle
                id="is-active"
                labelText="Slot Status"
                labelA="Inactive"
                labelB="Active"
                toggled={isActive}
                onToggle={(val) => setIsActive(val)}
              />
            </div>
          </Modal>
        </>
      )}
    />
  );
}
