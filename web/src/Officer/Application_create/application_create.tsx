import '@carbon/styles/css/styles.css';
import { useState } from "react";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  HeaderMenuButton,
  InlineNotification,
  Button,
} from "@carbon/react";
import {
  Dashboard,
  Document,
  Time,
  User,
  Logout,
  Notification,
  Catalog,
  CheckmarkOutline,
  DataStructured,
  Rule,
  Categories,
  UserMultiple,
  Security,
  Settings,
} from '@carbon/icons-react';
import CurrentUserBadge from "../../components/CurrentUserBadge";
import TemplateBuilder from "./TemplateBuilder";
import { getStoredUser, getAdminOverviewHref, canManageServices } from "../../utils/currentUser";

export default function ApplicationCreate() {
  const [currentUser] = useState(getStoredUser);
  const isSysAdmin = canManageServices(currentUser);
  const overviewHref = getAdminOverviewHref(currentUser);
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);

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
      window.location.href = isSysAdmin ? "/admin/login" : "/officer/login";
    }
  };

  if (!isSysAdmin) {
    return (
      <HeaderContainer
        render={({ isSideNavExpanded: navExpanded, onClickSideNavExpand }) => (
          <>
            <Header aria-label="Registry Portal System">
              <HeaderMenuButton
                aria-label={navExpanded ? "Close menu" : "Open menu"}
                onClick={onClickSideNavExpand}
                isActive={navExpanded}
                isCollapsible
              />
              <HeaderName href="/officer/dashboard" prefix="GSN">Registry Portal</HeaderName>
              <HeaderGlobalBar>
                <CurrentUserBadge />
                <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                  <Notification size={20} />
                </HeaderGlobalAction>
              </HeaderGlobalBar>

              <SideNav aria-label="Side navigation" expanded={navExpanded}>
                <SideNavItems>
                  <SideNavLink renderIcon={Dashboard} href="/officer/dashboard">Application Queue</SideNavLink>
                  <SideNavLink renderIcon={CheckmarkOutline} href="/officer/bulk-verification">
                    Bulk Verification
                  </SideNavLink>
                  <SideNavLink renderIcon={DataStructured} href="/officer/rejection-codes">
                    Rejection Codes
                  </SideNavLink>
                  <SideNavLink renderIcon={Document} href="/officer/verified-records">Verified Records</SideNavLink>
                  <SideNavLink renderIcon={Time} href="/officer/pending-reviews">Pending Reviews</SideNavLink>
                  <SideNavLink renderIcon={User} href="/officer/profile">My Profile</SideNavLink>
                  <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
                    <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>Sign Out</SideNavLink>
                  </div>
                </SideNavItems>
              </SideNav>
            </Header>

            <main className="gsn-shell-main" style={{ padding: '2rem' }}>
              <InlineNotification
                kind="warning"
                title="Template Builder Restricted to System Administrators"
                subtitle="Form templates and multi-department workflow stages are configured centrally by System Administrators. Department staff and operational officers do not configure form templates."
                lowContrast
              />
              <div style={{ marginTop: '1.5rem' }}>
                <Button onClick={() => window.location.href = overviewHref}>
                  Return to Dashboard
                </Button>
              </div>
            </main>
          </>
        )}
      />
    );
  }

  return (
    <>
      <Header aria-label="Registry Admin System">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
          onClick={() => setIsSideNavExpanded((prev) => !prev)}
          isActive={isSideNavExpanded}
          isCollapsible
        />
        <HeaderName href="/admin" prefix="GSN">
          Registry Admin
        </HeaderName>
        <HeaderGlobalBar>
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
            <SideNavLink renderIcon={Dashboard} href="/admin">
              Overview
            </SideNavLink>
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
              isActive
            >
              Template Builder
            </SideNavLink>
            <SideNavLink
              renderIcon={Categories}
              href="/admin/departments"
            >
              Department Management
            </SideNavLink>
            <SideNavLink renderIcon={UserMultiple} href="/admin/manage-officers">
              Manage Officers
            </SideNavLink>
            <SideNavLink renderIcon={Security} href="/admin/audit-logs">
              Audit Logs
            </SideNavLink>
            <SideNavLink renderIcon={Settings} href="/admin/system-settings">
              System Settings
            </SideNavLink>
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

      <TemplateBuilder />
    </>
  );
}
