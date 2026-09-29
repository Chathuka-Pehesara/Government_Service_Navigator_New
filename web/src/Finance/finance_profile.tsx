import { useState } from "react";
import { v } from "../utils/validation";
import type { FormEvent } from "react";
import {
  Grid,
  Column,
  Tile,
  TextInput,
  PasswordInput,
  Button,
  Tag,
  Stack,
  Form,
  FormGroup,
} from "@carbon/react";
import { UserAvatar, Save, Security } from "@carbon/icons-react";
import FinanceShell from "./finance_shell";

function getStoredOfficerData() {
  const defaults = {
    fullName: "Finance Officer",
    email: "finance@gov.lk",
    role: "Finance Officer",
    department: "Department of Immigration & Emigration",
  };

  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser);
      return {
        fullName: parsedUser.fullName || defaults.fullName,
        email: parsedUser.email || defaults.email,
        role: parsedUser.role || defaults.role,
        department: parsedUser.department || defaults.department,
      };
    } catch {
      // Handle parse error silently
    }
  }
  return defaults;
}

export default function FinanceProfile() {
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

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault();
    const error = v.personName("Full name")(officerData.fullName);
    setNameError(error);
    if (error) return;
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert("Profile successfully updated.");
    }, 1000);
  };

  return (
    <FinanceShell active="profile">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>My Profile</h1>
        <p style={{ color: '#525252', marginTop: '0.5rem' }}>
          Manage your personal information, departmental details, and security settings.
        </p>
      </div>

      <Grid style={{ paddingLeft: 0, paddingRight: 0 }}>
        <Column sm={4} md={3} lg={4} style={{ marginBottom: '1.5rem' }}>
          <Tile style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
            <div
              style={{
                backgroundColor: '#e0e0e0',
                borderRadius: '50%',
                width: '80px',
                height: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}
            >
              <UserAvatar size={40} color="#525252" />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 400, marginBottom: '0.5rem' }}>{officerData.fullName}</h3>
            <p style={{ color: '#525252', fontSize: '0.875rem', marginBottom: '1rem' }}>{officerData.email}</p>
            <Tag type="blue">{officerData.role}</Tag>

            <div style={{ width: '100%', borderTop: '1px solid #e0e0e0', margin: '1.5rem 0', paddingTop: '1.5rem', textAlign: 'left' }}>
              <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#525252', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Department
              </p>
              <p style={{ fontSize: '0.875rem', color: '#161616' }}>{officerData.department}</p>
            </div>
          </Tile>
        </Column>

        <Column sm={4} md={5} lg={8}>
          <Tile style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 400 }}>Personal Information</h3>
            <Form onSubmit={handleSaveProfile}>
              <Stack gap={6}>
                <FormGroup legendText="">
                  <TextInput
                    id="profile-name"
                    labelText="Full Name"
                    value={officerData.fullName}
                    onChange={(e) => setOfficerData({ ...officerData, fullName: e.target.value })}
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
                <Button type="submit" renderIcon={Save} disabled={isSaving} style={{ maxWidth: '200px' }}>
                  {isSaving ? "Saving..." : "Save Profile"}
                </Button>
              </Stack>
            </Form>
          </Tile>

          <Tile>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <Security size={24} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 400 }}>Security Settings</h3>
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
                <Button type="button" kind="secondary" onClick={handleUpdatePassword} style={{ maxWidth: '200px' }}>
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
    </FinanceShell>
  );
}
