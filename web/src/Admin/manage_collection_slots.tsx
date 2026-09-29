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
  Tag,
  InlineNotification,
  Search,
} from "@carbon/react";
import {
  Dashboard,
  Calendar,
  Edit,
  TrashCan,
  Add,
  Time,
  Catalog,
  Rule,
  Categories,
  Document,
  Money,
  CheckmarkOutline,
  CloseOutline,
  Notification
} from "@carbon/icons-react";

interface DailySlot {
  slotId: number;
  departmentName: string;
  dayOfWeek: number;
  specificDate?: string;
  startTime: string;
  endTime: string;
  timeWindow: string;
  maxCapacity: number;
  bookedCount: number;
  remainingSpots: number;
  isRealtimeActive: boolean;
  isPast: boolean;
  status: "Active Now" | "Ended" | "Upcoming" | "Fully Booked" | "Open";
}

interface DaySchedule {
  date: string;
  dayOfWeek: number;
  dayName: string;
  formattedDate: string;
  shortDate: string;
  isToday: boolean;
  isHoliday: boolean;
  holidayId?: number;
  holidayReason?: string;
  totalCapacity: number;
  totalBooked: number;
  remainingSpots: number;
  slotsCount: number;
  slots: DailySlot[];
}

interface CollectionSlot {
  id: number;
  dayOfWeek: number;
  specificDate?: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  bookedCount?: number;
  remainingCapacity?: number;
  nextDate?: string;
  isActive: boolean;
  departmentName?: string;
  departmentId?: number;
}

interface BookingRecord {
  id: number;
  applicationCode: string;
  citizenNic: string;
  departmentName: string;
  serviceName: string;
  bookedDate: string;
  bookedSlotTime: string;
  status: string;
  confirmationCode: string;
  preferredTimes?: string;
  createdAt: string;
  isPast: boolean;
}

const DAY_MAP: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const templateHeaders = [
  { key: "day", header: "Day of Week" },
  { key: "timeWindow", header: "Working Time Window" },
  { key: "department", header: "Department" },
  { key: "capacity", header: "Max Capacity" },
  { key: "type", header: "Schedule Type" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions" },
];

const bookingHeaders = [
  { key: "confirmationCode", header: "Booking Ref" },
  { key: "bookedDate", header: "Appointment Date" },
  { key: "bookedSlotTime", header: "Time Window" },
  { key: "applicationCode", header: "Application Ref" },
  { key: "citizenNic", header: "Citizen NIC" },
  { key: "serviceName", header: "Service" },
  { key: "departmentName", header: "Department" },
  { key: "status", header: "Status" },
];

export default function ManageCollectionSlots() {
  const [currentUser] = useState(getStoredUser);
  const isDepartmentAdmin = isDeptAdmin(currentUser);
  const isSysAdmin = isSystemAdmin(currentUser);
  const deptSlug = currentUser?.department ? getDepartmentSlug(currentUser.department) : null;
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));

  // Department Filter
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>(
    isDepartmentAdmin && currentUser?.department ? currentUser.department : "All"
  );

  // Main Views: "daily" | "templates" | "bookings"
  const [activeView, setActiveView] = useState<"daily" | "templates" | "bookings">("daily");
  
  // Bookings sub-scope: "upcoming" | "past"
  const [bookingScope, setBookingScope] = useState<"upcoming" | "past">("upcoming");
  const [bookingSearch, setBookingSearch] = useState<string>("");

  // Daily Schedule state
  const [dailySchedule, setDailySchedule] = useState<DaySchedule[]>([]);
  const [scheduleDays, setScheduleDays] = useState<number>(14);
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "working" | "holidays">("all");
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);

  // Weekly templates & bookings
  const [slots, setSlots] = useState<CollectionSlot[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);

  // Notifications
  const [notification, setNotification] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Slot Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<CollectionSlot | null>(null);
  const [slotType, setSlotType] = useState<"recurring" | "specific">("recurring");
  const [specificDate, setSpecificDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [slotDepartment, setSlotDepartment] = useState<string>(
    currentUser?.department || DEPARTMENTS[0].label
  );
  const [dayOfWeek, setDayOfWeek] = useState<string>("1");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("12:00");
  const [maxCapacity, setMaxCapacity] = useState<string>("10");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [slotErrors, setSlotErrors] = useState<Partial<Record<"startTime" | "endTime" | "maxCapacity" | "specificDate", string>>>({});

  // Holiday Modal State
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState<boolean>(false);
  const [holidayDate, setHolidayDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [holidayReason, setHolidayReason] = useState<string>("Public Holiday");
  const [customHolidayReason, setCustomHolidayReason] = useState<string>("");
  const [holidayDepartment, setHolidayDepartment] = useState<string>(
    currentUser?.department || DEPARTMENTS[0].label
  );

  useEffect(() => {
    fetchDailySchedule();
    fetchSlots();
    fetchBookings();
  }, [selectedDeptFilter, scheduleDays]);

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
      return parseApiError(text, defaultMessage);
    } catch {
      return defaultMessage;
    }
  };

  const fetchDailySchedule = async () => {
    setLoadingSchedule(true);
    try {
      const deptQuery = isDepartmentAdmin && currentUser?.department
        ? `&department=${encodeURIComponent(currentUser.department)}`
        : selectedDeptFilter !== "All"
          ? `&department=${encodeURIComponent(selectedDeptFilter)}`
          : "";

      const res = await fetch(
        `http://localhost:5119/api/admin/collection-slots/daily-schedule?days=${scheduleDays}${deptQuery}`,
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setDailySchedule(data);
      }
    } catch (err: any) {
      console.error("Failed to load daily schedule", err);
    } finally {
      setLoadingSchedule(false);
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
      if (res.ok) {
        const data = await res.json();
        setSlots(data);
      }
    } catch (err: any) {
      console.error("Failed to load slots", err);
    }
  };

  const fetchBookings = async () => {
    try {
      const deptQuery = isDepartmentAdmin && currentUser?.department
        ? `&department=${encodeURIComponent(currentUser.department)}`
        : selectedDeptFilter !== "All"
          ? `&department=${encodeURIComponent(selectedDeptFilter)}`
          : "";

      const res = await fetch(`http://localhost:5119/api/admin/collection-slots/bookings?scope=all${deptQuery}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (err: any) {
      console.error("Failed to load collection bookings", err);
    }
  };

  const handleOpenSlotModal = (slot?: CollectionSlot, presetDate?: string) => {
    setNotification(null);
    if (slot) {
      setEditingSlot(slot);
      setSlotDepartment(slot.departmentName || currentUser?.department || DEPARTMENTS[0].label);
      setDayOfWeek(slot.dayOfWeek.toString());
      setStartTime(slot.startTime.substring(0, 5));
      setEndTime(slot.endTime.substring(0, 5));
      setMaxCapacity(slot.maxCapacity.toString());
      setIsActive(slot.isActive);
      if (slot.specificDate) {
        setSlotType("specific");
        setSpecificDate(slot.specificDate);
      } else {
        setSlotType("recurring");
      }
    } else {
      setEditingSlot(null);
      setSlotDepartment(
        isDepartmentAdmin && currentUser?.department
          ? currentUser.department
          : selectedDeptFilter !== "All"
            ? selectedDeptFilter
            : DEPARTMENTS[0].label
      );
      if (presetDate) {
        setSlotType("specific");
        setSpecificDate(presetDate);
        const parsed = new Date(presetDate);
        const dow = parsed.getDay() === 0 ? 7 : parsed.getDay();
        setDayOfWeek(dow.toString());
      } else {
        setSlotType("recurring");
        setDayOfWeek("1");
      }
      setStartTime("09:00");
      setEndTime("12:00");
      setMaxCapacity("10");
      setIsActive(true);
    }
    setSlotErrors({});
    setIsModalOpen(true);
  };

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

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
    }
    setSlotErrors(errors);
    return !hasErrors(errors);
  };

  const handleSaveSlot = async () => {
    if (!validateSlot()) return;
    const payload = {
      departmentName: slotDepartment,
      dayOfWeek: Number(dayOfWeek),
      specificDate: slotType === "specific" ? specificDate : null,
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
      fetchDailySchedule();
    } catch (err: any) {
      setNotification({ kind: "error", message: err.message });
    }
  };

  const handleDeleteSlot = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this time slot?")) return;
    try {
      const res = await fetch(`http://localhost:5119/api/admin/collection-slots/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await parseSafeError(res, "Failed to delete slot."));
      setNotification({ kind: "success", message: "Slot deleted successfully." });
      fetchSlots();
      fetchDailySchedule();
    } catch (err: any) {
      setNotification({ kind: "error", message: err.message });
    }
  };

  // Holiday Handling
  const handleOpenHolidayModal = (dateStr?: string) => {
    setNotification(null);
    setHolidayDepartment(
      isDepartmentAdmin && currentUser?.department
        ? currentUser.department
        : selectedDeptFilter !== "All"
          ? selectedDeptFilter
          : DEPARTMENTS[0].label
    );
    setHolidayDate(dateStr || new Date().toISOString().split("T")[0]);
    setHolidayReason("Public Holiday");
    setCustomHolidayReason("");
    setIsHolidayModalOpen(true);
  };

  const handleDeclareHoliday = async () => {
    const finalReason = holidayReason === "Other" 
      ? (customHolidayReason.trim() || "Special Closure") 
      : holidayReason;

    try {
      const res = await fetch("http://localhost:5119/api/admin/collection-slots/holidays", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          departmentName: holidayDepartment,
          holidayDate: holidayDate,
          reason: finalReason
        })
      });

      if (!res.ok) throw new Error(await parseSafeError(res, "Failed to declare holiday."));
      setNotification({ kind: "success", message: `Date ${holidayDate} declared as a holiday for ${holidayDepartment}.` });
      setIsHolidayModalOpen(false);
      fetchDailySchedule();
    } catch (err: any) {
      setNotification({ kind: "error", message: err.message });
    }
  };

  const handleRemoveHoliday = async (holidayId: number, dateStr: string) => {
    if (!window.confirm(`Are you sure you want to remove the holiday on ${dateStr} and resume counter slots?`)) return;
    try {
      const res = await fetch(`http://localhost:5119/api/admin/collection-slots/holidays/${holidayId}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      if (!res.ok) throw new Error(await parseSafeError(res, "Failed to remove holiday."));
      setNotification({ kind: "success", message: `Holiday on ${dateStr} removed. Regular counter slots resumed.` });
      fetchDailySchedule();
    } catch (err: any) {
      setNotification({ kind: "error", message: err.message });
    }
  };

  // Quick Time Range Presets
  const applyPresetTime = (start: string, end: string) => {
    setStartTime(start);
    setEndTime(end);
  };

  // Filtering Daily Schedule
  const filteredDailySchedule = dailySchedule.filter((day) => {
    if (scheduleFilter === "working") return !day.isHoliday;
    if (scheduleFilter === "holidays") return day.isHoliday;
    return true;
  });

  // Filtering Bookings (Upcoming vs Past)
  const filteredBookings = bookings
    .filter((b) => (bookingScope === "upcoming" ? !b.isPast : b.isPast))
    .filter((b) => {
      if (!bookingSearch.trim()) return true;
      const q = bookingSearch.toLowerCase();
      return (
        b.confirmationCode.toLowerCase().includes(q) ||
        b.citizenNic.toLowerCase().includes(q) ||
        b.applicationCode.toLowerCase().includes(q) ||
        b.serviceName.toLowerCase().includes(q) ||
        b.bookedDate.toLowerCase().includes(q)
      );
    });

  const todaySchedule = dailySchedule.find((d) => d.isToday);
  const activeNowSlot = todaySchedule?.slots.find((s) => s.isRealtimeActive);

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
                    <SideNavLink renderIcon={Document} href={`/admin/${deptSlug}/dashboard?view=verifications`}>
                      Department Verifications
                    </SideNavLink>
                    <SideNavLink renderIcon={Money} href={`/admin/${deptSlug}/dashboard?view=financial`}>
                      Financial Verifications
                    </SideNavLink>
                    <SideNavLink renderIcon={Calendar} href="/admin/collection-slots" isActive>
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
                    <SideNavLink renderIcon={Categories} href="/admin/services/config">
                      Service Configuration
                    </SideNavLink>
                    <SideNavLink renderIcon={Calendar} href="/admin/collection-slots" isActive>
                      Collection Slots
                    </SideNavLink>
                  </>
                )}
              </SideNavItems>
            </SideNav>
          </Header>

          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            {/* Header & Page Title */}
            <div style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h1 style={{ fontSize: "1.85rem", fontWeight: 600, color: "#161616", letterSpacing: "-0.5px" }}>
                  {isDepartmentAdmin && currentUser?.department ? `${currentUser.department} Collection Schedule` : "Collection Time Slots & Working Ranges"}
                </h1>
                <p style={{ color: "#525252", marginTop: "0.35rem", fontSize: "0.925rem" }}>
                  Real-time counter collection windows, working time ranges, live bookings taken, and declared holiday closures.
                </p>

                {/* Primary View Switcher */}
                <div style={{ display: "flex", gap: "8px", marginTop: "1rem" }}>
                  <Button
                    size="sm"
                    kind={activeView === "daily" ? "primary" : "tertiary"}
                    renderIcon={Calendar}
                    onClick={() => setActiveView("daily")}
                  >
                    Live Daily Timeline ({dailySchedule.length} Days)
                  </Button>
                  <Button
                    size="sm"
                    kind={activeView === "templates" ? "primary" : "tertiary"}
                    renderIcon={Time}
                    onClick={() => setActiveView("templates")}
                  >
                    Weekly Base Rules ({slots.length})
                  </Button>
                  <Button
                    size="sm"
                    kind={activeView === "bookings" ? "primary" : "tertiary"}
                    renderIcon={CheckmarkOutline}
                    onClick={() => {
                      setActiveView("bookings");
                      fetchBookings();
                    }}
                  >
                    Appointments & Records ({bookings.length})
                  </Button>
                </div>
              </div>

              {/* Action Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                {isSysAdmin && (
                  <div style={{ width: "240px" }}>
                    <Select
                      id="department-filter"
                      labelText="Filter Department"
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
                  <Tag type="blue" size="md" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", fontWeight: 600 }}>
                    Scope: {currentUser.department}
                  </Tag>
                )}

                <Button size="sm" kind="tertiary" renderIcon={Calendar} onClick={() => handleOpenHolidayModal()}>
                  Declare Holiday
                </Button>
                <Button size="sm" renderIcon={Add} onClick={() => handleOpenSlotModal()}>
                  New Time Slot
                </Button>
              </div>
            </div>

            {/* Notification Banner */}
            {notification && (
              <InlineNotification
                kind={notification.kind}
                title={notification.kind === "success" ? "Success" : "Error"}
                subtitle={notification.message}
                onClose={() => setNotification(null)}
                style={{ marginBottom: "1.25rem" }}
              />
            )}

            {/* Live Metrics Header Bar */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem"
            }}>
              {/* Today's Status Card */}
              <div style={{ background: "white", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e0e0e0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#525252", letterSpacing: "0.5px" }}>TODAY'S COUNTERS</span>
                  <Tag type={activeNowSlot ? "green" : (todaySchedule?.isHoliday ? "purple" : "blue")}>
                    {activeNowSlot ? "Active Session" : (todaySchedule?.isHoliday ? "Holiday" : "Open Today")}
                  </Tag>
                </div>
                <div style={{ marginTop: "0.5rem", fontSize: "1.35rem", fontWeight: 700, color: "#161616" }}>
                  {todaySchedule ? todaySchedule.shortDate : "Today"}
                </div>
                <div style={{ fontSize: "0.825rem", color: "#525252", marginTop: "0.25rem" }}>
                  {activeNowSlot 
                    ? `Current: ${activeNowSlot.timeWindow} (${activeNowSlot.remainingSpots} spots left)` 
                    : (todaySchedule?.isHoliday ? todaySchedule.holidayReason : `${todaySchedule?.remainingSpots ?? 0} slots remaining today`)}
                </div>
              </div>

              {/* Real-Time Slots Count */}
              <div style={{ background: "white", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e0e0e0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#525252", letterSpacing: "0.5px" }}>ACTIVE SCHEDULE WINDOW</span>
                <div style={{ marginTop: "0.5rem", fontSize: "1.35rem", fontWeight: 700, color: "#0f62fe" }}>
                  {scheduleDays} Days Forward
                </div>
                <div style={{ fontSize: "0.825rem", color: "#525252", marginTop: "0.25rem" }}>
                  Old dates automatically expire and drop
                </div>
              </div>

              {/* Upcoming Appointments */}
              <div style={{ background: "white", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e0e0e0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#525252", letterSpacing: "0.5px" }}>UPCOMING APPOINTMENTS</span>
                <div style={{ marginTop: "0.5rem", fontSize: "1.35rem", fontWeight: 700, color: "#198038" }}>
                  {bookings.filter(b => !b.isPast).length} Booked
                </div>
                <div style={{ fontSize: "0.825rem", color: "#525252", marginTop: "0.25rem" }}>
                  Scheduled by Agent 3 & Citizen Portal
                </div>
              </div>

              {/* Historical Archive Records */}
              <div style={{ background: "white", padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e0e0e0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#525252", letterSpacing: "0.5px" }}>PAST ARCHIVED RECORDS</span>
                <div style={{ marginTop: "0.5rem", fontSize: "1.35rem", fontWeight: 700, color: "#6f6f6f" }}>
                  {bookings.filter(b => b.isPast).length} Past Appointments
                </div>
                <div style={{ fontSize: "0.825rem", color: "#525252", marginTop: "0.25rem" }}>
                  Preserved historical audit records
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* VIEW 1: LIVE DAILY TIMELINE (Sorted, No Old Dates, Real-Time)  */}
            {/* ============================================================== */}
            {activeView === "daily" && (
              <div>
                {/* Timeline Toolbar */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                  background: "white",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid #e0e0e0"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#161616" }}>View Horizon:</span>
                    {[7, 14, 30].map((d) => (
                      <Button
                        key={d}
                        size="sm"
                        kind={scheduleDays === d ? "primary" : "ghost"}
                        onClick={() => setScheduleDays(d)}
                        style={{ minHeight: "32px", padding: "0 12px" }}
                      >
                        {d} Days
                      </Button>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#161616" }}>Filter:</span>
                    <Button
                      size="sm"
                      kind={scheduleFilter === "all" ? "primary" : "ghost"}
                      onClick={() => setScheduleFilter("all")}
                      style={{ minHeight: "32px", padding: "0 10px" }}
                    >
                      All ({dailySchedule.length})
                    </Button>
                    <Button
                      size="sm"
                      kind={scheduleFilter === "working" ? "primary" : "ghost"}
                      onClick={() => setScheduleFilter("working")}
                      style={{ minHeight: "32px", padding: "0 10px" }}
                    >
                      Working ({dailySchedule.filter(d => !d.isHoliday).length})
                    </Button>
                    <Button
                      size="sm"
                      kind={scheduleFilter === "holidays" ? "primary" : "ghost"}
                      onClick={() => setScheduleFilter("holidays")}
                      style={{ minHeight: "32px", padding: "0 10px" }}
                    >
                      Holidays ({dailySchedule.filter(d => d.isHoliday).length})
                    </Button>
                  </div>
                </div>

                {loadingSchedule ? (
                  <div style={{ textAlign: "center", padding: "3rem", background: "white", borderRadius: "10px" }}>
                    Loading real-time collection schedule...
                  </div>
                ) : filteredDailySchedule.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem", background: "white", borderRadius: "10px" }}>
                    No days found matching the selected filter.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {filteredDailySchedule.map((day) => {
                      const isSunday = day.dayOfWeek === 7;
                      return (
                        <div
                          key={day.date}
                          style={{
                            background: "white",
                            borderRadius: "12px",
                            border: day.isToday 
                              ? "2px solid #0f62fe" 
                              : (day.isHoliday ? "1px solid #d4bbff" : "1px solid #e0e0e0"),
                            boxShadow: day.isToday ? "0 4px 14px rgba(15, 98, 254, 0.12)" : "0 2px 6px rgba(0,0,0,0.03)",
                            overflow: "hidden"
                          }}
                        >
                          {/* Day Header */}
                          <div style={{
                            padding: "0.85rem 1.25rem",
                            background: day.isToday 
                              ? "#edf5ff" 
                              : (day.isHoliday ? "#f6f2ff" : "#fbfbfb"),
                            borderBottom: "1px solid #e0e0e0",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "0.75rem"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#161616" }}>
                                {day.formattedDate}
                              </span>

                              {day.isToday && (
                                <Tag type="blue" style={{ fontWeight: 700, fontSize: "0.75rem" }}>
                                  TODAY (LIVE)
                                </Tag>
                              )}

                              {day.isHoliday ? (
                                <Tag type="purple" style={{ fontWeight: 700, fontSize: "0.75rem" }}>
                                  HOLIDAY: {day.holidayReason || "Counters Closed"}
                                </Tag>
                              ) : (
                                <Tag type="green" style={{ fontSize: "0.75rem" }}>
                                  {day.slotsCount} Time Windows • {day.totalCapacity} Total Capacity
                                </Tag>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {!day.isHoliday && (
                                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: day.remainingSpots > 0 ? "#198038" : "#da1e28" }}>
                                  {day.totalBooked} booked • {day.remainingSpots} available
                                </span>
                              )}

                              {day.holidayId ? (
                                <Button
                                  size="sm"
                                  kind="ghost"
                                  renderIcon={CloseOutline}
                                  onClick={() => handleRemoveHoliday(day.holidayId!, day.formattedDate)}
                                  style={{ color: "#8a3ffc" }}
                                >
                                  Remove Holiday
                                </Button>
                              ) : !day.isHoliday && !isSunday ? (
                                <Button
                                  size="sm"
                                  kind="ghost"
                                  renderIcon={Calendar}
                                  onClick={() => handleOpenHolidayModal(day.date)}
                                >
                                  Mark as Holiday
                                </Button>
                              ) : null}

                              {!day.isHoliday && (
                                <Button
                                  size="sm"
                                  kind="ghost"
                                  renderIcon={Add}
                                  onClick={() => handleOpenSlotModal(undefined, day.date)}
                                >
                                  Add Slot for Date
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Day Slots List */}
                          <div style={{ padding: "1rem 1.25rem" }}>
                            {day.isHoliday ? (
                              <div style={{ padding: "1.5rem", textAlign: "center", color: "#6f6f6f" }}>
                                <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#8a3ffc" }}>
                                  Counter Collection Closed on {day.formattedDate}
                                </div>
                                <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                                  Reason: {day.holidayReason || "Official Government Holiday"}. No citizen collection appointments can be booked for this date.
                                </div>
                              </div>
                            ) : day.slots.length === 0 ? (
                              <div style={{ padding: "1.5rem", textAlign: "center", color: "#8d8d8d" }}>
                                <div>No specific collection slots configured for this day.</div>
                                <Button
                                  size="sm"
                                  kind="tertiary"
                                  renderIcon={Add}
                                  style={{ marginTop: "0.5rem" }}
                                  onClick={() => handleOpenSlotModal(undefined, day.date)}
                                >
                                  Configure Time Range for {day.shortDate}
                                </Button>
                              </div>
                            ) : (
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                                gap: "1rem"
                              }}>
                                {day.slots.map((s) => {
                                  const fillPercent = s.maxCapacity > 0 ? Math.min(100, Math.round((s.bookedCount / s.maxCapacity) * 100)) : 0;
                                  return (
                                    <div
                                      key={s.slotId}
                                      style={{
                                        border: s.isRealtimeActive 
                                          ? "2px solid #198038" 
                                          : (s.isPast ? "1px solid #e0e0e0" : "1px solid #d0d7de"),
                                        background: s.isRealtimeActive ? "#f6fdf9" : (s.isPast ? "#fafafa" : "white"),
                                        borderRadius: "10px",
                                        padding: "1rem",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "space-between",
                                        gap: "0.75rem",
                                        boxShadow: s.isRealtimeActive ? "0 4px 12px rgba(25, 128, 56, 0.15)" : "none"
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Time size={16} />
                                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#161616" }}>
                                              {s.timeWindow}
                                            </span>
                                          </div>

                                          <Tag
                                            type={
                                              s.isRealtimeActive 
                                                ? "green" 
                                                : (s.isPast ? "gray" : (s.remainingSpots === 0 ? "red" : "blue"))
                                            }
                                            style={{ fontWeight: 600, fontSize: "0.75rem" }}
                                          >
                                            {s.status}
                                          </Tag>
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "0.4rem" }}>
                                          <Tag type="teal" size="sm">{s.departmentName}</Tag>
                                          {s.specificDate && (
                                            <Tag type="purple" size="sm">Date-Specific Slot</Tag>
                                          )}
                                        </div>
                                      </div>

                                      {/* Capacity Progress Bar */}
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#525252", marginBottom: "4px" }}>
                                          <span><strong>{s.bookedCount}</strong> / {s.maxCapacity} Booked</span>
                                          <span style={{ fontWeight: 600, color: s.remainingSpots > 0 ? "#198038" : "#da1e28" }}>
                                            {s.remainingSpots} spots available
                                          </span>
                                        </div>
                                        <div style={{ width: "100%", height: "6px", background: "#e0e0e0", borderRadius: "3px", overflow: "hidden" }}>
                                          <div style={{
                                            width: `${fillPercent}%`,
                                            height: "100%",
                                            background: fillPercent >= 100 ? "#da1e28" : (fillPercent >= 75 ? "#f1c21b" : "#0f62fe"),
                                            transition: "width 0.3s ease"
                                          }} />
                                        </div>
                                      </div>

                                      {/* Slot Actions */}
                                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", borderTop: "1px solid #f0f0f0", paddingTop: "0.5rem" }}>
                                        <Button
                                          size="sm"
                                          kind="ghost"
                                          renderIcon={Edit}
                                          hasIconOnly
                                          iconDescription="Edit Slot"
                                          onClick={() => handleOpenSlotModal(slots.find(t => t.id === s.slotId))}
                                        />
                                        <Button
                                          size="sm"
                                          kind="danger--ghost"
                                          renderIcon={TrashCan}
                                          hasIconOnly
                                          iconDescription="Delete Slot"
                                          onClick={() => handleDeleteSlot(s.slotId)}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* VIEW 2: WEEKLY BASE RULES (Recurring Templates Mon - Sun)       */}
            {/* ============================================================== */}
            {activeView === "templates" && (
              <div>
                <div style={{ background: "white", padding: "1rem", borderRadius: "8px", border: "1px solid #e0e0e0", marginBottom: "1rem" }}>
                  <div style={{ fontWeight: 600, color: "#161616" }}>Weekly Recurring Schedule Rules</div>
                  <div style={{ fontSize: "0.85rem", color: "#525252" }}>
                    These slots automatically repeat every week for the department unless overridden by a date-specific slot or holiday closure.
                  </div>
                </div>

                <DataTable
                  rows={slots.map((s) => ({
                    id: s.id.toString(),
                    day: DAY_MAP[s.dayOfWeek] || "Day " + s.dayOfWeek,
                    timeWindow: `${s.startTime.substring(0, 5)} - ${s.endTime.substring(0, 5)}`,
                    department: s.departmentName || "General",
                    capacity: s.maxCapacity.toString(),
                    type: s.specificDate ? `Date: ${s.specificDate}` : "Weekly Recurring",
                    status: s.isActive ? "Active" : "Inactive",
                  }))}
                  headers={templateHeaders}
                >
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
                                No base weekly rules configured. Click "New Time Slot" to define one.
                              </TableCell>
                            </TableRow>
                          ) : (
                            tableRows.map((row) => (
                              <TableRow {...getRowProps({ row })} key={row.id}>
                                {row.cells.map((cell) => {
                                  if (cell.info.header === "department") {
                                    return (
                                      <TableCell key={cell.id}>
                                        <Tag type="teal">{cell.value}</Tag>
                                      </TableCell>
                                    );
                                  }
                                  if (cell.info.header === "status") {
                                    return (
                                      <TableCell key={cell.id}>
                                        <Tag type={cell.value === "Active" ? "green" : "red"}>{cell.value}</Tag>
                                      </TableCell>
                                    );
                                  }
                                  if (cell.info.header === "type") {
                                    return (
                                      <TableCell key={cell.id}>
                                        <Tag type={cell.value.includes("Date") ? "purple" : "blue"}>{cell.value}</Tag>
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
                                          onClick={() => handleOpenSlotModal(slots.find((s) => s.id.toString() === row.id))}
                                        />
                                        <Button
                                          size="sm"
                                          kind="danger--ghost"
                                          renderIcon={TrashCan}
                                          iconDescription="Delete"
                                          hasIconOnly
                                          onClick={() => handleDeleteSlot(Number(row.id))}
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
              </div>
            )}

            {/* ============================================================== */}
            {/* VIEW 3: APPOINTMENTS & HISTORICAL RECORDS                      */}
            {/* ============================================================== */}
            {activeView === "bookings" && (
              <div>
                {/* Bookings Sub-Tabs & Search */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1rem",
                  background: "white",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid #e0e0e0"
                }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      size="sm"
                      kind={bookingScope === "upcoming" ? "primary" : "ghost"}
                      onClick={() => setBookingScope("upcoming")}
                    >
                      Upcoming Appointments ({bookings.filter(b => !b.isPast).length})
                    </Button>
                    <Button
                      size="sm"
                      kind={bookingScope === "past" ? "primary" : "ghost"}
                      onClick={() => setBookingScope("past")}
                    >
                      Past Records History ({bookings.filter(b => b.isPast).length})
                    </Button>
                  </div>

                  <div style={{ width: "300px" }}>
                    <TextInput
                      id="search-bookings"
                      labelText=""
                      placeholder="Search NIC, Ref, or Service..."
                      value={bookingSearch}
                      onChange={(e) => setBookingSearch(e.target.value)}
                      size="sm"
                    />
                  </div>
                </div>

                <DataTable
                  rows={filteredBookings.map((b) => ({
                    id: b.id.toString(),
                    confirmationCode: b.confirmationCode || "SL-APT-0000",
                    bookedDate: b.bookedDate,
                    bookedSlotTime: b.bookedSlotTime || "Standard Slot",
                    applicationCode: b.applicationCode || "APP-0000",
                    citizenNic: b.citizenNic || "CITIZEN",
                    serviceName: b.serviceName || "Government Service",
                    departmentName: b.departmentName || "General",
                    status: b.isPast ? "Archived (Passed)" : b.status,
                  }))}
                  headers={bookingHeaders}
                >
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
                                {bookingScope === "upcoming" 
                                  ? "No upcoming citizen appointments scheduled." 
                                  : "No historical records found for this department."}
                              </TableCell>
                            </TableRow>
                          ) : (
                            tableRows.map((row) => (
                              <TableRow {...getRowProps({ row })} key={row.id}>
                                {row.cells.map((cell) => {
                                  if (cell.info.header === "confirmationCode") {
                                    return (
                                      <TableCell key={cell.id}>
                                        <Tag type="blue" style={{ fontWeight: 700 }}>{cell.value}</Tag>
                                      </TableCell>
                                    );
                                  }
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
                                        <Tag type={cell.value.includes("Archived") ? "gray" : "green"}>{cell.value}</Tag>
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
              </div>
            )}
          </main>

          {/* ============================================================== */}
          {/* MODAL: CREATE / EDIT TIME SLOT                                 */}
          {/* ============================================================== */}
          <Modal
            open={isModalOpen}
            modalHeading={editingSlot ? "Edit Counter Time Slot" : "Create New Counter Collection Slot"}
            primaryButtonText={editingSlot ? "Save Changes" : "Create Time Slot"}
            secondaryButtonText="Cancel"
            onRequestSubmit={handleSaveSlot}
            onRequestClose={() => setIsModalOpen(false)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "1rem" }}>
              {/* Slot Mode: Recurring vs Specific Date */}
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#525252", display: "block", marginBottom: "6px" }}>
                  Schedule Mode
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    size="sm"
                    kind={slotType === "recurring" ? "primary" : "tertiary"}
                    onClick={() => setSlotType("recurring")}
                    style={{ flex: 1 }}
                  >
                    Weekly Recurring (Every Week)
                  </Button>
                  <Button
                    size="sm"
                    kind={slotType === "specific" ? "primary" : "tertiary"}
                    onClick={() => setSlotType("specific")}
                    style={{ flex: 1 }}
                  >
                    Specific Date Override
                  </Button>
                </div>
              </div>

              {slotType === "specific" ? (
                <TextInput
                  id="specific-date"
                  type="date"
                  labelText="Specific Date"
                  value={specificDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  invalid={!!slotErrors.specificDate}
                  invalidText={slotErrors.specificDate}
                  helperText="This slot will only exist for this specific calendar date."
                />
              ) : (
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
              )}

              {/* Department */}
              {isDepartmentAdmin && currentUser?.department ? (
                <TextInput
                  id="department-readonly"
                  labelText="Department"
                  value={currentUser.department}
                  disabled
                />
              ) : (
                <Select
                  id="modal-dept-select"
                  labelText="Department"
                  value={slotDepartment}
                  onChange={(e) => setSlotDepartment(e.target.value)}
                >
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept.slug} value={dept.label} text={dept.label} />
                  ))}
                </Select>
              )}

              {/* Quick Preset Buttons */}
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#525252", display: "block", marginBottom: "6px" }}>
                  Quick Working Time Range Presets
                </label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <Button size="sm" kind="ghost" onClick={() => applyPresetTime("09:00", "12:00")}>
                    Morning (09:00 - 12:00)
                  </Button>
                  <Button size="sm" kind="ghost" onClick={() => applyPresetTime("13:00", "15:30")}>
                    Afternoon (13:00 - 15:30)
                  </Button>
                  <Button size="sm" kind="ghost" onClick={() => applyPresetTime("08:30", "16:30")}>
                    Full Day (08:30 - 16:30)
                  </Button>
                </div>
              </div>

              {/* Start & End Times */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <TextInput
                  id="start-time"
                  labelText="Start Time (HH:mm)"
                  placeholder="09:00"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  invalid={!!slotErrors.startTime}
                  invalidText={slotErrors.startTime}
                />
                <TextInput
                  id="end-time"
                  labelText="End Time (HH:mm)"
                  placeholder="12:00"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  invalid={!!slotErrors.endTime}
                  invalidText={slotErrors.endTime}
                />
              </div>

              {/* Max Capacity */}
              <TextInput
                id="max-capacity"
                labelText="Max Capacity (Bookings allowed for this window)"
                placeholder="10"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                invalid={!!slotErrors.maxCapacity}
                invalidText={slotErrors.maxCapacity}
                helperText="How many appointments counters can accept during this time window."
              />
            </div>
          </Modal>

          {/* ============================================================== */}
          {/* MODAL: DECLARE HOLIDAY / CLOSURE                               */}
          {/* ============================================================== */}
          <Modal
            open={isHolidayModalOpen}
            modalHeading="Declare Department Public Holiday / Closure"
            primaryButtonText="Declare Holiday"
            secondaryButtonText="Cancel"
            onRequestSubmit={handleDeclareHoliday}
            onRequestClose={() => setIsHolidayModalOpen(false)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "1rem" }}>
              <p style={{ fontSize: "0.875rem", color: "#525252" }}>
                Declaring a date as a holiday will close all collection counters for that day. Agent 3 will avoid scheduling any appointments on this date.
              </p>

              {isDepartmentAdmin && currentUser?.department ? (
                <TextInput
                  id="holiday-dept-readonly"
                  labelText="Department"
                  value={currentUser.department}
                  disabled
                />
              ) : (
                <Select
                  id="holiday-dept-select"
                  labelText="Department"
                  value={holidayDepartment}
                  onChange={(e) => setHolidayDepartment(e.target.value)}
                >
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept.slug} value={dept.label} text={dept.label} />
                  ))}
                </Select>
              )}

              <TextInput
                id="holiday-date"
                type="date"
                labelText="Holiday Date"
                value={holidayDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setHolidayDate(e.target.value)}
                helperText="Date on which counters will be closed."
              />

              <Select
                id="holiday-reason-select"
                labelText="Holiday Reason / Occasion"
                value={holidayReason}
                onChange={(e) => setHolidayReason(e.target.value)}
              >
                <SelectItem value="Full Moon Poya Day (Public Holiday)" text="Full Moon Poya Day (Public Holiday)" />
                <SelectItem value="Public & Bank Holiday" text="Public & Bank Holiday" />
                <SelectItem value="Mercantile Holiday" text="Mercantile Holiday" />
                <SelectItem value="National Independence Day" text="National Independence Day" />
                <SelectItem value="Sinhala & Tamil New Year Holiday" text="Sinhala & Tamil New Year Holiday" />
                <SelectItem value="Counter Maintenance & System Audit" text="Counter Maintenance & System Audit" />
                <SelectItem value="Other" text="Other (Custom Reason)" />
              </Select>

              {holidayReason === "Other" && (
                <TextInput
                  id="custom-holiday-reason"
                  labelText="Custom Reason Description"
                  placeholder="e.g. Special Department In-Service Training Day"
                  value={customHolidayReason}
                  onChange={(e) => setCustomHolidayReason(e.target.value)}
                />
              )}
            </div>
          </Modal>
        </>
      )}
    />
  );
}
