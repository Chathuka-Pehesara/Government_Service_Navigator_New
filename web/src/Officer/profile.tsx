import '@carbon/styles/css/styles.css';
import React, { useState } from "react";
import { v } from "../utils/validation";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderMenuButton,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Grid,
  Column,
  Tile,
  TextInput,
  PasswordInput,
  Button,
  Tag,
  Search,
  Stack,
  Form,
  FormGroup
} from "@carbon/react";
import {
  Dashboard,
  Document,
  Time,
  User,
  Logout,
  Notification,
  UserAvatar,
  Save,
  Security,
  CheckmarkOutline,
  DataStructured
} from '@carbon/icons-react';
import { API_BASE_URL } from "../utils/api";

function getStoredOfficerData() {
  const defaults = {
    fullName: "Verifying Officer",
    email: "officer@gov.lk",
    role: "Verifying Officer",
    department: "Department of Registration"
  };

  // Retrieve the officer details stored during login
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser);
      return {
        fullName: parsedUser.fullName || defaults.fullName,
        email: parsedUser.email || defaults.email,
        role: parsedUser.role || defaults.role,
        department: parsedUser.department || defaults.department
      };
    } catch {
      // Handle parse error silently
    }
  }
  return defaults;
}

export default function Profile() {
  const [officerData, setOfficerData] = useState(getStoredOfficerData);

  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string }>({});
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  // Same rule the backend uses for new passwords (StrongPassword)
  const handleUpdatePassword = () => {
    const errors = {
      current: currentPassword ? undefined : "Enter your current password.",
      next: v.strongPassword()(newPassword) ?? (newPassword === currentPassword ? "The new password must be different." : undefined),
    };
    setPasswordErrors(errors);
    setPasswordNotice(null);
    if (errors.current || errors.next) return;
    // There is no self-service endpoint yet; administrators reset officer passwords
    setPasswordNotice("Self-service password change is not connected yet. Ask your administrator to reset your password.");
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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const error = v.personName("Full name")(officerData.fullName);
    setNameError(error);
    if (error) return;
    setIsSaving(true);
    // Simulate API save delay
    setTimeout(() => {
      setIsSaving(false);
      alert("Profile successfully updated.");
    }, 1000);
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
              Registry Portal
            </HeaderName>

            <HeaderGlobalBar>
              <div className="w-[120px] sm:w-[200px] md:w-[280px]" style={{ marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
                 <Search size="sm" id="search-global" labelText="Search" placeholder="Search NIC or Application ID..." />
              </div>
              <HeaderGlobalAction aria-label="Notifications" onClick={() => {}}>
                <Notification size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
              <SideNavItems>
                <SideNavLink renderIcon={Dashboard} href="/officer/dashboard">
                  Application Queue
                </SideNavLink>
                                <SideNavLink renderIcon={CheckmarkOutline} href="/officer/bulk-verification">
                  Bulk Verification
                </SideNavLink>
                <SideNavLink renderIcon={DataStructured} href="/officer/rejection-codes">
                  Rejection Codes
                </SideNavLink>
                <SideNavLink renderIcon={Document} href="/officer/verified-records">
                  Verified Records
                </SideNavLink>
                <SideNavLink renderIcon={Time} href="/officer/pending-reviews">
                  Pending Reviews
                </SideNavLink>
                <SideNavLink renderIcon={Security} href="/officer/audit-logs">
                  Audit Logs
                </SideNavLink>
                {/* Active state moved to My Profile */}
                <SideNavLink renderIcon={User} href="/officer/profile" isActive>
                  My Profile
                </SideNavLink>
                
                {/* Logout Button */}
                <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
                  <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>
                    Sign Out
                  </SideNavLink>
                </div>
              </SideNavItems>
            </SideNav>
          </Header>

          {/* Main Content */}
          <main className="mt-12 min-h-screen p-4 sm:p-6 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
            
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                My Profile
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                Manage your personal information, departmental details, and security settings.
              </p>
            </div>

            <Grid style={{ paddingLeft: 0, paddingRight: 0 }}>
              
              {/* Left Column: Profile Summary */}
              <Column sm={4} md={3} lg={4} style={{ marginBottom: '1.5rem' }}>
                <Tile style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
                  <div style={{ 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '50%', 
                    width: '80px', 
                    height: '80px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginBottom: '1rem'
                  }}>
                    <UserAvatar size={40} color="#525252" />
                  </div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 400, marginBottom: '0.5rem' }}>
                    {officerData.fullName}
                  </h3>
                  <p style={{ color: '#525252', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    {officerData.email}
                  </p>
                  <Tag type="blue">{officerData.role}</Tag>
                  
                  <div style={{ width: '100%', borderTop: '1px solid #e0e0e0', margin: '1.5rem 0', paddingTop: '1.5rem', textAlign: 'left' }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#525252', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      Department
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#161616' }}>
                      {officerData.department}
                    </p>
                  </div>
                </Tile>
              </Column>

              {/* Right Column: Settings Forms */}
              <Column sm={4} md={5} lg={8}>
                
                {/* Personal Information Form */}
                <Tile style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 400 }}>
                    Personal Information
                  </h3>
                  <Form onSubmit={handleSaveProfile}>
                    <Stack gap={6}>
                      <FormGroup legendText="">
                        <TextInput
                          id="profile-name"
                          labelText="Full Name"
                          value={officerData.fullName}
                          onChange={(e) => setOfficerData({...officerData, fullName: e.target.value})}
                          maxLength={100}
                          invalid={!!nameError}
                          invalidText={nameError ?? undefined}
                        />
                      </FormGroup>
                      <FormGroup legendText="">
                        <TextInput
                          id="profile-email"
                          type="email"
                          labelText="Official Email Address"
                          value={officerData.email}
                          readOnly
                          helperText="Your official email cannot be changed without administrative approval."
                        />
                      </FormGroup>
                      <Button 
                        type="submit" 
                        renderIcon={Save} 
                        disabled={isSaving}
                        style={{ maxWidth: '200px' }}
                      >
                        {isSaving ? "Saving..." : "Save Profile"}
                      </Button>
                    </Stack>
                  </Form>
                </Tile>

                {/* Security Settings Form */}
                <Tile>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Security size={24} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 400 }}>
                      Security Settings
                    </h3>
                  </div>
                  <Form onSubmit={(e) => e.preventDefault()}>
                    <Stack gap={6}>
                      <FormGroup legendText="">
                        <PasswordInput
                          id="current-password"
                          labelText="Current Password"
                          placeholder="Enter your current password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          invalid={!!passwordErrors.current}
                          invalidText={passwordErrors.current}
                        />
                      </FormGroup>
                      <FormGroup legendText="">
                        <PasswordInput
                          id="new-password"
                          labelText="New Password"
                          placeholder="Enter a new password"
                          helperText="At least 8 characters with an uppercase letter, a lowercase letter and a number."
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          maxLength={64}
                          invalid={!!passwordErrors.next}
                          invalidText={passwordErrors.next}
                        />
                      </FormGroup>
                      <Button 
                        type="button" 
                        kind="secondary" onClick={handleUpdatePassword}
                        style={{ maxWidth: '200px' }}
                      >
                        Update Password
                      </Button>
                      {passwordNotice && (
                        <p style={{ fontSize: "0.875rem", color: "#0043ce", margin: 0 }}>{passwordNotice}</p>
                      )}
                    </Stack>
                  </Form>
                </Tile>

              </Column>
            </Grid>
          </main>
        </>
      )}
    />
  );
}

