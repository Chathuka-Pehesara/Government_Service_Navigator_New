import '@carbon/styles/css/styles.css';
import { useState, useEffect } from "react";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref, canManageServices } from "../utils/currentUser";
import { getDepartmentSlug } from "../constants/departments";
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
  isActive: boolean;
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
  { key: "capacity", header: "Max Capacity" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions" },
];

export default function ManageCollectionSlots() {
  const [currentUser] = useState(getStoredUser);
  const isSysAdmin = canManageServices(currentUser);
  const deptSlug = currentUser?.department ? getDepartmentSlug(currentUser.department) : null;
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));

  const [slots, setSlots] = useState<CollectionSlot[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<CollectionSlot | null>(null);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Form State: Strictly typed as strings to prevent Carbon Select/TextInput crashes
  const [dayOfWeek, setDayOfWeek] = useState<string>("1");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [maxCapacity, setMaxCapacity] = useState<string>("5");
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    fetchSlots();
  }, []);

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
      if (text.includes("System.Runtime") || text.includes("Npgsql.") || text.length > 200) {
        return "An internal server error occurred (500). Please check backend logs.";
      }
      return text || defaultMessage;
    } catch {
      return defaultMessage;
    }
  };

  const fetchSlots = async () => {
    try {
      const res = await fetch("http://localhost:5119/api/admin/collection-slots", { headers: getHeaders() });
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

  const handleOpenModal = (slot?: CollectionSlot) => {
    setNotification(null);
    if (slot) {
      setEditingSlot(slot);
      setDayOfWeek(slot.dayOfWeek.toString());
      setStartTime(slot.startTime.substring(0, 5));
      setEndTime(slot.endTime.substring(0, 5));
      setMaxCapacity(slot.maxCapacity.toString());
      setIsActive(slot.isActive);
    } else {
      setEditingSlot(null);
      setDayOfWeek("1");
      setStartTime("09:00");
      setEndTime("17:00");
      setMaxCapacity("5");
      setIsActive(true);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const payload = {
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

      setNotification({ kind: "success", message: `Slot successfully ${editingSlot ? "updated" : "created"}.` });
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

  const rows = slots.map((s) => ({
    id: s.id.toString(),
    day: DAY_MAP[s.dayOfWeek],
    timeWindow: `${s.startTime.substring(0, 5)} - ${s.endTime.substring(0, 5)}`,
    capacity: s.maxCapacity.toString(),
    status: s.isActive ? "Active" : "Inactive",
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
              Registry Admin
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
            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>Collection Time Slots</h1>
                <p style={{ color: "#525252", marginTop: "0.5rem" }}>
                  Create and manage available time slots for citizens to collect their documents in person.
                </p>
              </div>
              <Button renderIcon={Add} onClick={() => handleOpenModal()}>
                New Time Slot
              </Button>
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
                            No time slots configured.
                          </TableCell>
                        </TableRow>
                      ) : (
                        tableRows.map((row) => (
                          <TableRow {...getRowProps({ row })} key={row.id}>
                            {row.cells.map((cell) => {
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
          </main>
          
          {/* Modal moved outside of <main> to prevent z-index clipping */}
          <Modal
            open={isModalOpen}
            modalHeading={editingSlot ? "Edit Time Slot" : "Create New Time Slot"}
            primaryButtonText={editingSlot ? "Save Changes" : "Create Slot"}
            secondaryButtonText="Cancel"
            onRequestSubmit={handleSave}
            onRequestClose={() => setIsModalOpen(false)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "1rem" }}>
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
                />
                <TextInput
                  id="end-time"
                  type="time"
                  labelText="End Time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>

              <TextInput
                id="max-capacity"
                type="number"
                min={1}
                labelText="Maximum Capacity"
                helperText="Number of citizens allowed to book this specific time window."
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
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
