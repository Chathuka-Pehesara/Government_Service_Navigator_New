import '@carbon/styles/css/styles.css'; 
import { useState } from "react";
import CurrentUserBadge from "../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref, canManageServices } from "../utils/currentUser";
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
  Grid,
  Column,
  Tile,
  FormGroup,
  Toggle,
  NumberInput,
  Select,
  SelectItem,
  Button,
  Stack,
  Search,
  InlineNotification,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Settings,
  Logout,
  Notification,
  Save,
  Catalog,
  Rule,
  Categories,
  Document,
} from "@carbon/icons-react";
import { API_BASE_URL } from "../utils/api";

export default function SystemSettings() {
  const [currentUser] = useState(getStoredUser);
  const isSysAdmin = canManageServices(currentUser);
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));
  const [isSaving, setIsSaving] = useState(false);

  if (!isSysAdmin) {
    return (
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }) => (
          <>
            <Header aria-label="GSN System Settings">
              <HeaderMenuButton
                aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
                onClick={onClickSideNavExpand}
                isActive={isSideNavExpanded}
                aria-expanded={isSideNavExpanded}
              />
              <HeaderName href={overviewHref} prefix="GSN">
                Registry Admin
              </HeaderName>
              <HeaderGlobalBar>
                <CurrentUserBadge />
              </HeaderGlobalBar>
            </Header>
            <main
              className="mt-12 min-h-screen p-8 flex flex-col items-center justify-center"
              style={{ backgroundColor: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}
            >
              <div style={{ maxWidth: "620px", width: "100%" }}>
                <InlineNotification
                  kind="error"
                  title="Access Denied: System Administrator Only"
                  subtitle="System Settings is restricted to Central System Administrators. Department Administrators and operational officers do not have permission to view or modify platform-wide settings."
                  lowContrast
                  hideCloseButton
                />
                <div style={{ marginTop: "1.5rem" }}>
                  <Button onClick={() => window.location.href = overviewHref}>
                    Return to Department Dashboard
                  </Button>
                </div>
              </div>
            </main>
          </>
        )}
      />
    );
  }

  // Example Setting States
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [enforce2FA, setEnforce2FA] = useState(true);

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

  const handleSaveSettings = () => {
    setIsSaving(true);
    // Simulate API save delay
    setTimeout(() => {
      setIsSaving(false);
      alert("System settings successfully updated.");
    }, 1000);
  };

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
                 <Search size="sm" id="search-settings" labelText="Search" placeholder="Search settings..." />
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

                {/* --- SUPUN'S ASSIGNED COMPONENTS --- */}
                <SideNavLink renderIcon={Catalog} href="/admin/services">
                  Service Catalog
                </SideNavLink>
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
                <SideNavLink
                  renderIcon={Settings}
                  href="/admin/system-settings"
                  isActive
                >
                  System Settings
                </SideNavLink>

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

          {/* Main Content */}
          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>

            <div className="flex flex-wrap gap-4" style={{ marginBottom: '2rem', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                  System Settings
                </h1>
                <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                  Configure global registry parameters, security policies, and maintenance windows.
                </p>
              </div>
              <Button 
                renderIcon={Save} 
                onClick={handleSaveSettings}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <Grid style={{ paddingLeft: 0, paddingRight: 0 }}>
              {/* Security Policies */}
              <Column sm={4} md={8} lg={8} style={{ marginBottom: '1.5rem' }}>
                <Tile>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 400 }}>Security & Access</h3>
                  <Stack gap={6}>
                    <Toggle 
                      id="enforce-2fa" 
                      labelText="Two-Factor Authentication (2FA)"
                      labelA="Optional"
                      labelB="Enforced"
                      toggled={enforce2FA}
                      onToggle={(checked) => setEnforce2FA(checked)}
                    />
                    
                    <FormGroup legendText="">
                      <NumberInput
                        id="session-timeout"
                        label="Idle Session Timeout (Minutes)"
                        min={5}
                        max={120}
                        value={30}
                        helperText="Officers will be automatically logged out after this period of inactivity."
                        invalidText="Must be between 5 and 120 minutes."
                      />
                    </FormGroup>

                    <FormGroup legendText="">
                      <NumberInput
                        id="max-login-attempts"
                        label="Maximum Failed Login Attempts"
                        min={3}
                        max={10}
                        value={5}
                        helperText="Account locks automatically after reaching this threshold."
                      />
                    </FormGroup>
                  </Stack>
                </Tile>
              </Column>

              {/* Maintenance & Core Systems */}
              <Column sm={4} md={8} lg={8} style={{ marginBottom: '1.5rem' }}>
                <Tile>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 400 }}>Core Infrastructure</h3>
                  <Stack gap={6}>
                    <Toggle 
                      id="maintenance-mode" 
                      labelText="System Maintenance Mode"
                      labelA="Off"
                      labelB="On"
                      toggled={maintenanceMode}
                      onToggle={(checked) => setMaintenanceMode(checked)}
                    />
                    <p style={{ fontSize: '12px', color: '#da1e28', marginTop: '-1rem', marginBottom: '1rem' }}>
                      Warning: Turning this on will lock out all Verifying Officers and Citizens. Only System Admins will have access.
                    </p>

                    <FormGroup legendText="">
                      <Select
                        id="backup-frequency"
                        defaultValue="daily"
                        labelText="Database Backup Frequency"
                        helperText="Determines how often the automated system state is snapshotted."
                      >
                        <SelectItem value="hourly" text="Hourly" />
                        <SelectItem value="daily" text="Daily (Midnight)" />
                        <SelectItem value="weekly" text="Weekly (Sunday)" />
                      </Select>
                    </FormGroup>
                    
                    <FormGroup legendText="">
                      <Select
                        id="log-retention"
                        defaultValue="90"
                        labelText="Audit Log Retention Period"
                      >
                        <SelectItem value="30" text="30 Days" />
                        <SelectItem value="90" text="90 Days" />
                        <SelectItem value="365" text="1 Year" />
                        <SelectItem value="indefinite" text="Indefinite" />
                      </Select>
                    </FormGroup>
                  </Stack>
                </Tile>
              </Column>
            </Grid>

          </main>
        </>
      )}
    />
  );
}