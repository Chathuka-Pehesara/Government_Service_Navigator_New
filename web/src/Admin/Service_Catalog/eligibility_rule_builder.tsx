import "@carbon/styles/css/styles.css";
import { useState, useEffect, useMemo } from "react";
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
  TrashCan,
  Document,
  Launch,
} from "@carbon/icons-react";
import { parseApiError } from "../../utils/validation";
import { rulesError } from "./serviceCatalogValidation";
import { API_BASE_URL } from "../../utils/api";
import { ServiceProcedurePickerModal } from "../../components/ServiceProcedurePickerModal";

interface Service {
  id: number;
  serviceId: string;
  name: string;
  category?: string;
  status?: string;
}

interface EligibilityRule {
  id: number;
  serviceProcedureId?: number;
  field: string;
  operator: string;
  value: string;
  isStrict?: boolean;
}

const PREDEFINED_FIELDS = [
  "Age",
  "Citizenship",
  "Income",
  "Employment",
  "Residency",
  "Medical Fitness",
  "Criminal Record",
  "Registration Record Status",
  "Marital Status",
  "Minimum Qualifications",
];

export default function EligibilityRuleBuilder() {
  const [currentUser] = useState(getStoredUser);
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));
  const isSysAdmin = canManageServices(currentUser);

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
          subtitle="Eligibility rules are managed centrally by System Administrators. Redirecting to your dashboard..."
          lowContrast
        />
      </div>
    );
  }

  return <EligibilityRuleBuilderContent />;
}

function EligibilityRuleBuilderContent() {
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [currentUser] = useState(getStoredUser);
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));
  const deptAdminUser = isDeptAdmin(currentUser);
  const scopedCategory = deptAdminUser && currentUser?.department ? getCategoryForDepartment(currentUser.department) : null;

  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [rules, setRules] = useState<EligibilityRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    title: string;
    subtitle: string;
  } | null>(null);

    useEffect(() => {
    fetch(`${API_BASE_URL}/api/services`)
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


  useEffect(() => {
    if (!selectedServiceId) return;

    const loadRules = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/services/${selectedServiceId}`);
        const data = await res.json();
        setRules(data.eligibilityRules || []);
      } catch (error) {
        console.error("Error fetching rules for service:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadRules();
  }, [selectedServiceId]);

  const handleRuleChange = (id: number, key: string, val: string) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  const handleAddRule = () => {
    const tempId = Date.now();
    setRules([
      ...rules,
      {
        id: tempId,
        serviceProcedureId: parseInt(selectedServiceId),
        field: "Age",
        operator: ">=",
        value: "",
        isStrict: true,
      },
    ]);
  };

  const handleDeleteRule = (id: number) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    const problem = rulesError(rules.map((r) => ({ field: r.field, operator: r.operator, value: String(r.value ?? "") })));
    if (problem) {
      setNotification({ type: "error", title: "Check the rules", subtitle: problem });
      return;
    }
    try {
      const payload = rules.map((r) => ({
        serviceProcedureId: r.serviceProcedureId,
        field: r.field,
        operator: r.operator,
        value: r.value,
        isStrict: r.isStrict,
      }));

      const response = await fetch(
        `${API_BASE_URL}/api/services/${selectedServiceId}/eligibility-rules`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        const updatedService = await response.json();
        setRules(updatedService.eligibilityRules || []);
        setNotification({
          type: "success",
          title: "Success",
          subtitle: "Ruleset saved and persisted successfully!",
        });
      } else {
        setNotification({
          type: "error",
          title: "Error",
          subtitle: parseApiError(await response.text(), "Failed to save ruleset to database."),
        });
      }
    } catch (error) {
      console.error("Error saving ruleset:", error);
      setNotification({
        type: "error",
        title: "Server Error",
        subtitle: "Could not connect to backend server.",
      });
    }
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

  // Keep the selection inside the filtered list (adjusted during render, not in an effect)
  if (
    filteredProcedureOptions.length > 0 &&
    !filteredProcedureOptions.some((s) => s.id.toString() === selectedServiceId)
  ) {
    setSelectedServiceId(filteredProcedureOptions[0].id.toString());
  }

  const filteredRules = rules.filter(
    (r) =>
      r.field?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.operator?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.value?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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
              id="search-rules"
              labelText="Search"
              placeholder="Search rules..."
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

        <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
          <SideNavItems>
            <SideNavLink renderIcon={Dashboard} href={overviewHref}>
              Overview
            </SideNavLink>
            <SideNavLink renderIcon={Catalog} href="/admin/services">
              Service Catalog
            </SideNavLink>
            <SideNavLink
              renderIcon={Rule}
              href="/admin/services/rules"
              isActive
            >
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
            Eligibility Rule Builder
          </h1>
          <p style={{ color: "#525252", marginTop: "0.5rem" }}>
            Configure business logic and prerequisites for citizen eligibility.
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

        <Tile
          style={{
            width: "100%",
            marginBottom: "1.5rem",
            padding: "1.25rem 1.5rem",
            backgroundColor: "#ffffff",
            borderRadius: "4px",
            border: "1px solid #e0e0e0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#161616",
                  margin: 0,
                }}
              >
                Target Service Procedure
              </h2>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "#525252",
                  marginTop: "0.25rem",
                  marginBottom: 0,
                }}
              >
                Search procedures by keyword/ID or filter by category to manage eligibility criteria rulesets.
              </p>
            </div>
            {selectedService && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Tag type="blue" size="sm">
                  {selectedService.category || "General"}
                </Tag>
                <Tag type="cool-gray" size="sm">
                  {selectedService.serviceId}
                </Tag>
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr)) auto",
              gap: "1rem",
              alignItems: "flex-end",
            }}
          >
            {/* Search Input */}
            <div>
              <Search
                id="rules-procedure-search"
                labelText="Quick Filter"
                placeholder="Search by code or name..."
                size="md"
                value={serviceSearchQuery}
                onChange={(e) => setServiceSearchQuery(e.target.value)}
                onClear={() => setServiceSearchQuery("")}
              />
            </div>

            {/* Category Filter */}
            <div>
              <Select
                id="rules-procedure-category-filter"
                labelText="Filter by Category"
                size="md"
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

            {/* Filtered Dropdown */}
            <div>
              <Select
                id="target-service-select"
                labelText={`Target Procedure (${filteredProcedureOptions.length} available)`}
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

            {/* Browse All Catalog Modal Button */}
            <div>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={Launch}
                onClick={() => setIsPickerModalOpen(true)}
                style={{ width: "100%", whiteSpace: "nowrap" }}
              >
                Browse Catalog ({visibleServices.length})
              </Button>
            </div>
          </div>

          {/* Active Filter Bar & Reset */}
          {(serviceSearchQuery || selectedCategoryFilter !== "All") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "0.75rem",
                marginTop: "0.75rem",
                borderTop: "1px solid #f0f0f0",
                fontSize: "0.8125rem",
                color: "#525252",
              }}
            >
              <span>
                Showing <strong>{filteredProcedureOptions.length}</strong> of{" "}
                <strong>{visibleServices.length}</strong> procedures
                {serviceSearchQuery ? ` matching "${serviceSearchQuery}"` : ""}
                {selectedCategoryFilter !== "All"
                  ? ` in category "${selectedCategoryFilter}"`
                  : ""}
              </span>

              <Button
                kind="ghost"
                size="sm"
                onClick={() => {
                  setServiceSearchQuery("");
                  setSelectedCategoryFilter("All");
                }}
              >
                Reset Search & Filter
              </Button>
            </div>
          )}
        </Tile>

        {/* Modal for browsing & picking services from entire catalog */}
        <ServiceProcedurePickerModal
          isOpen={isPickerModalOpen}
          onClose={() => setIsPickerModalOpen(false)}
          services={visibleServices}
          selectedServiceId={selectedServiceId}
          onSelectService={(srv) => {
            setSelectedServiceId(srv.id.toString());
          }}
        />

        <Tile style={{ width: "100%" }}>
          <h3 style={{ marginBottom: "1.5rem", fontWeight: 500 }}>
            Active Ruleset
          </h3>

          {isLoading ? (
            <Loading description="Loading rules..." withOverlay={false} />
          ) : filteredRules.length === 0 ? (
            <p style={{ color: "#6f6f6f", padding: "1rem 0" }}>
              No eligibility rules configured for this service yet.
            </p>
          ) : (
            filteredRules.map((rule) => {
              const isCustom = !PREDEFINED_FIELDS.includes(rule.field);
              const selectValue = isCustom ? "__OTHER__" : rule.field;

              return (
                <Grid
                  key={rule.id}
                  style={{
                    marginBottom: "1.25rem",
                    alignItems: "flex-start",
                    paddingLeft: 0,
                    paddingRight: 0,
                  }}
                >
                  <Column sm={4} md={3} lg={4}>
                    <Select
                      id={`field-${rule.id}`}
                      labelText="Field"
                      value={selectValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__OTHER__") {
                          handleRuleChange(rule.id, "field", "");
                        } else {
                          handleRuleChange(rule.id, "field", val);
                        }
                      }}
                    >
                      {PREDEFINED_FIELDS.map((f) => (
                        <SelectItem key={f} value={f} text={f} />
                      ))}
                      <SelectItem
                        value="__OTHER__"
                        text="Other (Custom Field)..."
                      />
                    </Select>

                    {isCustom && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <TextInput
                          id={`custom-field-${rule.id}`}
                          labelText="Custom Field Name"
                          placeholder="e.g. Land Title, Medical Fitness..."
                          value={rule.field}
                          onChange={(e) =>
                            handleRuleChange(rule.id, "field", e.target.value)
                          }
                          invalid={rule.field.trim() === ""}
                          invalidText="Enter field name"
                        />
                      </div>
                    )}
                  </Column>
                  <Column sm={4} md={2} lg={3}>
                    <Select
                      id={`operator-${rule.id}`}
                      labelText="Operator"
                      value={rule.operator}
                      onChange={(e) =>
                        handleRuleChange(rule.id, "operator", e.target.value)
                      }
                    >
                      <SelectItem value=">=" text=">=" />
                      <SelectItem value="<=" text="<=" />
                      <SelectItem value="==" text="==" />
                      <SelectItem value="!=" text="!=" />
                    </Select>
                  </Column>
                  <Column sm={4} md={2} lg={4}>
                    <TextInput
                      id={`value-${rule.id}`}
                      labelText="Value"
                      value={rule.value}
                      onChange={(e) =>
                        handleRuleChange(rule.id, "value", e.target.value)
                      }
                    />
                  </Column>
                  <Column sm={4} md={1} lg={1} className="flex justify-end min-[66rem]:justify-start">
                    <Button
                      kind="danger--ghost"
                      renderIcon={TrashCan}
                      iconDescription="Remove"
                      hasIconOnly
                      onClick={() => handleDeleteRule(rule.id)}
                      style={{ marginTop: "1.5rem" }}
                    />
                  </Column>
                </Grid>
              );
            })
          )}

          <div
            className="flex flex-wrap"
            style={{
              gap: "1rem",
              marginTop: "2rem",
              borderTop: "1px solid #e0e0e0",
              paddingTop: "1.5rem",
            }}
          >
            <Button kind="secondary" onClick={handleAddRule}>
              + Add New Condition
            </Button>
            <Button kind="primary" onClick={handleSave}>
              Save Ruleset
            </Button>
          </div>
        </Tile>
      </main>
    </>
  );
}
