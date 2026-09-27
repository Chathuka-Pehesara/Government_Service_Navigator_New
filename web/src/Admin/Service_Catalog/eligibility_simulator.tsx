import "@carbon/styles/css/styles.css";
import React, { useState, useEffect, useMemo } from "react";
import CurrentUserBadge from "../../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref, isDeptAdmin, canManageServices } from "../../utils/currentUser";
import { getCategoryForDepartment } from "../../constants/departments";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  Search,
  Select,
  SelectItem,
  TextInput,
  Button,
  Tile,
  Grid,
  Column,
  Loading,
  InlineNotification,
  Tag,
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
  CheckmarkFilled,
  WarningFilled,
  Document,
} from "@carbon/icons-react";

interface Service {
  id: number;
  serviceId: string;
  name: string;
  category?: string;
  status?: string;
}

interface EvaluationResult {
  isEligible: boolean;
  matchPercentage: number;
  missingCriteria: string[];
}

export default function EligibilitySimulator() {
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [currentUser] = useState(getStoredUser);
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));
  const deptAdminUser = isDeptAdmin(currentUser);
  const isSysAdmin = canManageServices(currentUser);
  const scopedCategory = deptAdminUser && currentUser?.department ? getCategoryForDepartment(currentUser.department) : null;

  useEffect(() => {
    if (!isSysAdmin) {
      window.location.replace(overviewHref);
    }
  }, [isSysAdmin, overviewHref]);

  if (!isSysAdmin) {
    return (
      <div style={{ padding: "3rem", display: "flex", justifyContent: "center" }}>
        <InlineNotification
          kind="error"
          title="Access Restricted"
          subtitle="Eligibility simulation is managed centrally by System Administrators. Redirecting to your dashboard..."
          lowContrast
        />
      </div>
    );
  }
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState<string>("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("All");

  // Citizen profile test input state
  const [profile, setProfile] = useState({
    age: "20",
    citizenship: "Sri Lankan",
  });

  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    title: string;
    subtitle: string;
  } | null>(null);

  // 1. Fetch services on mount to populate the procedure dropdown
   useEffect(() => {
    fetch("http://localhost:5119/api/services")
      .then((res) => res.json())
      .then((data) => {
        const activeServices = data.filter((srv: Service) => srv.status === "Active");
        setServices(activeServices);
        const scopedServices = activeServices.filter(
          (srv: Service) => !deptAdminUser || !scopedCategory || srv.category === scopedCategory
        );
        if (scopedServices.length > 0) {
          setSelectedServiceId(scopedServices[0].id.toString());
        }
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching services:", error);
        setIsLoading(false);
      });
  }, [deptAdminUser, scopedCategory]);


  // 2. Call POST /api/services/eligibility-score
  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId) return;

    setIsEvaluating(true);
    setEvaluationResult(null);

    const payload = {
      serviceId: parseInt(selectedServiceId),
      citizenProfile: {
        age: parseInt(profile.age) || 0,
        citizenship: profile.citizenship,
      },
    };

    try {
      const response = await fetch(
        "http://localhost:5119/api/services/eligibility-score",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        const result = await response.json();
        setEvaluationResult(result);
        setNotification({
          type: "success",
          title: "Evaluation Complete",
          subtitle: `Match calculated successfully at ${result.matchPercentage}%`,
        });
      } else {
        setNotification({
          type: "error",
          title: "Evaluation Failed",
          subtitle: "Could not evaluate citizen profile against service rules.",
        });
      }
    } catch (error) {
      console.error("Error evaluating eligibility score:", error);
      setNotification({
        type: "error",
        title: "Server Error",
        subtitle: "Could not connect to backend server.",
      });
    } finally {
      setIsEvaluating(false);
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

  const visibleServices = services.filter(
    (srv) => !deptAdminUser || !scopedCategory || srv.category === scopedCategory
  );

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    visibleServices.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [visibleServices]);

  const filteredProcedureOptions = useMemo(() => {
    let list = visibleServices;
    if (selectedCategoryFilter !== "All") {
      list = list.filter((s) => s.category === selectedCategoryFilter);
    }
    if (serviceSearchQuery.trim()) {
      const q = serviceSearchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.serviceId.toLowerCase().includes(q) ||
          (s.category && s.category.toLowerCase().includes(q))
      );
    }
    return list;
  }, [visibleServices, selectedCategoryFilter, serviceSearchQuery]);

  const selectedService = useMemo(() => {
    return services.find((s) => s.id.toString() === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  useEffect(() => {
    if (filteredProcedureOptions.length > 0) {
      const isCurrentInFiltered = filteredProcedureOptions.some(
        (s) => s.id.toString() === selectedServiceId
      );
      if (!isCurrentInFiltered) {
        setSelectedServiceId(filteredProcedureOptions[0].id.toString());
      }
    }
  }, [filteredProcedureOptions, selectedServiceId]);

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
            className="w-[120px] sm:w-[250px]"
            style={{
              marginRight: "1rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size="sm"
              id="search-simulator"
              labelText="Search"
              placeholder="Search records..."
            />
          </div>
          <CurrentUserBadge />
          <HeaderGlobalAction aria-label="Notifications">
            <Notification size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>

        <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
          <SideNavItems>
            <SideNavLink renderIcon={Dashboard} href={overviewHref}>
              Overview
            </SideNavLink>
            <SideNavLink renderIcon={Catalog} href="/admin/services">
              Service Catalog
            </SideNavLink>
            <SideNavLink renderIcon={Rule} href="/admin/services/rules">
              Eligibility Rules
            </SideNavLink>
            <SideNavLink renderIcon={Categories} href="/admin/services/config">
              Service Configuration
            </SideNavLink>
            <SideNavLink renderIcon={Document} href="/admin/services/builder">
              Template Builder
            </SideNavLink>
            <SideNavLink
              renderIcon={Rule}
              href="/admin/services/simulator"
              isActive
            >
              Eligibility Simulator
            </SideNavLink>
            <SideNavLink
              renderIcon={Categories}
              href="/admin/departments"
            >
              Department Management
            </SideNavLink>
            <SideNavLink
              renderIcon={UserMultiple}
              href="/admin/manage-officers"
            >
              Manage Officers
            </SideNavLink>
            <SideNavLink renderIcon={Security} href="/admin/audit-logs">
              Audit Logs
            </SideNavLink>
            <SideNavLink renderIcon={Settings} href="/admin/system-settings">
              System Settings
            </SideNavLink>
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
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
            Eligibility Score Simulator
          </h1>
          <p style={{ color: "#525252", marginTop: "0.5rem" }}>
            Test citizen profiles against service prerequisites and business
            rules.
          </p>
        </div>

        {notification && (
          <div style={{ marginBottom: "1.5rem", width: "100%" }}>
            <InlineNotification
              kind={notification.type}
              title={notification.title}
              subtitle={notification.subtitle}
              onClose={() => setNotification(null)}
            />
          </div>
        )}

        <Grid style={{ width: "100%", paddingLeft: 0, paddingRight: 0 }}>
          {/* Form Column */}
          <Column sm={4} md={8} lg={8} style={{ paddingLeft: 0 }}>
            <Tile style={{ padding: "2rem", height: "100%", width: "100%" }}>
              <h3 style={{ marginBottom: "1.5rem", fontWeight: 500 }}>
                Test Profile Parameters
              </h3>

              {isLoading ? (
                <Loading
                  description="Loading services..."
                  withOverlay={false}
                />
              ) : (
                <form
                  onSubmit={handleEvaluate}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                  }}
                >
                  {/* Target Procedure Selector Box */}
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#f9f9f9",
                      borderRadius: "4px",
                      border: "1px solid #e0e0e0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "#161616",
                        }}
                      >
                        Target Service Procedure
                      </label>
                      {selectedService && (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Tag type="blue" size="sm">
                            {selectedService.category || "General"}
                          </Tag>
                          <Tag type="cool-gray" size="sm">
                            {selectedService.serviceId}
                          </Tag>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <Search
                        id="simulator-search-input"
                        labelText="Search Procedures"
                        placeholder="Search by code or name..."
                        size="sm"
                        value={serviceSearchQuery}
                        onChange={(e) => setServiceSearchQuery(e.target.value)}
                        onClear={() => setServiceSearchQuery("")}
                      />
                      <Select
                        id="simulator-category-filter"
                        labelText="Filter by Category"
                        size="sm"
                        value={selectedCategoryFilter}
                        onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      >
                        <SelectItem
                          value="All"
                          text={`All Categories (${visibleServices.length})`}
                        />
                        {availableCategories.map((cat) => (
                          <SelectItem
                            key={cat}
                            value={cat}
                            text={`${cat} (${visibleServices.filter((s) => s.category === cat).length})`}
                          />
                        ))}
                      </Select>
                    </div>

                    <Select
                      id="simulator-service-select"
                      labelText={`Select Procedure (${filteredProcedureOptions.length} available)`}
                      size="md"
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      disabled={filteredProcedureOptions.length === 0}
                    >
                      {filteredProcedureOptions.length === 0 ? (
                        <SelectItem value="" text="No matching procedures found" />
                      ) : (
                        filteredProcedureOptions.map((srv) => (
                          <SelectItem
                            key={srv.id}
                            value={srv.id.toString()}
                            text={`${srv.serviceId} - ${srv.name}${srv.category ? ` (${srv.category})` : ""}`}
                          />
                        ))
                      )}
                    </Select>
                  </div>

                  <TextInput
                    id="citizen-age"
                    labelText="Citizen Age"
                    type="number"
                    value={profile.age}
                    onChange={(e) =>
                      setProfile({ ...profile, age: e.target.value })
                    }
                  />

                  <TextInput
                    id="citizen-citizenship"
                    labelText="Citizenship"
                    value={profile.citizenship}
                    onChange={(e) =>
                      setProfile({ ...profile, citizenship: e.target.value })
                    }
                  />

                  <Button
                    type="submit"
                    kind="primary"
                    style={{ marginTop: "1rem", width: "100%" }}
                  >
                    {isEvaluating
                      ? "Evaluating..."
                      : "Run Eligibility Simulation"}
                  </Button>
                </form>
              )}
            </Tile>
          </Column>

          {/* Results Column */}
          <Column sm={4} md={8} lg={8} style={{ paddingRight: 0 }}>
            <Tile
              style={{
                padding: "2rem",
                height: "100%",
                width: "100%",
                backgroundColor: "#ffffff",
              }}
            >
              <h3 style={{ marginBottom: "1.5rem", fontWeight: 500 }}>
                Evaluation Results
              </h3>

              {!evaluationResult ? (
                <div
                  style={{
                    color: "#6f6f6f",
                    padding: "3rem 0",
                    textAlign: "center",
                  }}
                >
                  <p>
                    Run a simulation to view match percentage and requirement
                    breakdown.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                  }}
                >
                  <div
                    className="flex-wrap"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "1rem",
                      backgroundColor: "#f4f4f4",
                      borderLeft: `4px solid ${evaluationResult.isEligible ? "#24a148" : "#da1e28"}`,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          color: "#525252",
                          display: "block",
                        }}
                      >
                        Overall Status
                      </span>
                      <span
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 600,
                          color: "#161616",
                        }}
                      >
                        {evaluationResult.isEligible
                          ? "Eligible for Service"
                          : "Not Eligible"}
                      </span>
                    </div>
                    <Tag type={evaluationResult.isEligible ? "green" : "red"}>
                      {evaluationResult.matchPercentage}% Match
                    </Tag>
                  </div>

                  <div>
                    <h4
                      style={{
                        fontSize: "1rem",
                        fontWeight: 500,
                        marginBottom: "0.75rem",
                      }}
                    >
                      Missing Criteria & Failed Rules:
                    </h4>
                    {evaluationResult.missingCriteria.length === 0 ? (
                      <p
                        style={{
                          color: "#24a148",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <CheckmarkFilled size={16} /> All prerequisites passed
                        successfully.
                      </p>
                    ) : (
                      <ul
                        style={{
                          listStyleType: "none",
                          padding: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        {evaluationResult.missingCriteria.map(
                          (crit: string, idx: number) => (
                            <li
                              key={idx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                color: "#da1e28",
                                backgroundColor: "#fff1f1",
                                padding: "0.75rem",
                                fontSize: "0.875rem",
                              }}
                            >
                              <WarningFilled size={16} /> {crit}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </Tile>
          </Column>
        </Grid>
      </main>
    </>
  );
}
