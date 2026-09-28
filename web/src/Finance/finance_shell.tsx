import '@carbon/styles/css/styles.css';
import type { ReactNode } from "react";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Search,
  HeaderMenuButton,
} from "@carbon/react";
import { Wallet, Report, User, Logout, Notification, Receipt, Purchase } from "@carbon/icons-react";
import { getDisplayName, getStoredUser } from "../utils/currentUser";

interface FinanceShellProps {
  active: "dashboard" | "online" | "ledger" | "refunds" | "profile";
  children: ReactNode;
}

export default function FinanceShell({ active, children }: FinanceShellProps) {
  const user = getStoredUser();
  const officerName = getDisplayName(user);
  const officerDept = user?.department && user.department !== "Finance Department" ? user.department : "Department of Immigration & Emigration";

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
              Finance Office
            </HeaderName>

            <HeaderGlobalBar>
              <div className="w-[140px] sm:w-[280px]" style={{ marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
                <Search size="sm" id="search-finance" labelText="Search" placeholder="Search Application or User ID..." />
              </div>
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Wallet} href="/finance/dashboard" isActive={active === "dashboard"}>
                  Payment Verification
                </SideNavLink>
                <SideNavLink renderIcon={Purchase} href="/finance/online-payments" isActive={active === "online"}>
                  Online Payments
                </SideNavLink>
                <SideNavLink renderIcon={Report} href="/finance/ledger" isActive={active === "ledger"}>
                  Account Ledger
                </SideNavLink>
                <SideNavLink renderIcon={Receipt} href="/finance/refunds" isActive={active === "refunds"}>
                  Refund Requests
                </SideNavLink>
                <SideNavLink renderIcon={User} href="/finance/profile" isActive={active === "profile"}>
                  My Profile
                </SideNavLink>

                <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
                  <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>
                    Sign Out
                  </SideNavLink>
                </div>
              </SideNavItems>
            </SideNav>
          </Header>

          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            <div style={{ marginBottom: '0.5rem', color: '#525252', fontSize: '0.875rem' }}>
              Signed in as {officerName} &middot; {officerDept}
            </div>
            {children}
          </main>
        </>
      )}
    />
  );
}
