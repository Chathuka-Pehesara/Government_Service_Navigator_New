import '@carbon/styles/css/styles.css';
import { useState } from "react";
import type { FormEvent } from "react";
import {
  TextInput,
  PasswordInput,
  Button,
  Checkbox,
  InlineNotification,
  Link,
  Stack
} from "@carbon/react";
import { getDepartmentSlug } from "./constants/departments";
import { hasErrors, v, validateForm } from "./utils/validation";

export default function OfficerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Presence only for the password: accounts created before the strength rule must still sign in
    const errors = validateForm({
      email: [email, v.email()],
      password: [password, v.loginPassword()],
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsLoading(true);
    try {
      // 1. Attempt Officer Login
      let response = await fetch("http://localhost:5119/api/auth/officer-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      let resData = await response.json();

      if (resData.success && resData.officer) {
        localStorage.setItem("officerToken", resData.token);
        localStorage.setItem("officerUser", JSON.stringify(resData.officer));
        
        // Check officer role / designation to route Department Admins and Finance
        // Officers to their own dashboards instead of the generic officer queue.
        const role = resData.officer.role || resData.officer.designation || "";
        const isDepartmentAdmin = role.toLowerCase().includes("admin") || role === "Department Admin";
        const isFinanceOfficer = role.toLowerCase() === "finance officer";

        if (isDepartmentAdmin) {
          const deptSlug = getDepartmentSlug(resData.officer.department || "");
          window.location.href = deptSlug ? `/admin/${deptSlug}/dashboard` : "/admin/dashboard";
        } else if (isFinanceOfficer) {
          window.location.href = "/finance/dashboard";
        } else {
          window.location.href = "/officer/dashboard";
        }
        return; 
      }

      // 2. Fallback to System Admin Login
      response = await fetch("http://localhost:5119/api/auth/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      resData = await response.json();

      if (resData.success && resData.admin) {
        localStorage.setItem("officerToken", resData.token);
        localStorage.setItem("officerUser", JSON.stringify(resData.admin));
        
        window.location.href = "/admin/dashboard"; 
        return; 
      }

      setError("Invalid official email or password.");
      
    } catch {
      setError("Could not connect to server. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row" style={{ minHeight: '100vh', backgroundColor: '#f4f4f4' }}>
      {/* Left Column: Form */}
      <div className="lg:flex-1" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1.25rem'
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
            <div style={{ 
              display: 'flex', 
              height: '40px', 
              width: '40px', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '50%', 
              border: '2px solid #161616', 
              fontWeight: 'bold',
              fontSize: '13px' 
            }}>
              GSN
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '16px', margin: 0 }}>Government Service Navigator</p>
              <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#525252', margin: 0 }}>Officer Portal</p>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#525252', marginBottom: '0.5rem' }}>
              Restricted Access
            </p>
            <h1 style={{ fontSize: '2rem', fontWeight: 400, margin: '0 0 0.5rem 0', color: '#161616' }}>
              Sign in to the Registry
            </h1>
            <p style={{ fontSize: '14px', color: '#525252' }}>
              For Verifying Officers, Department Admins, and System Admins only.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <Stack gap={6}>
              <TextInput
                id="email"
                type="email"
                labelText="Official Email"
                placeholder="official@gov.lk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                maxLength={254}
                invalid={!!fieldErrors.email}
                invalidText={fieldErrors.email}
              />

              <PasswordInput
                id="password"
                labelText="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                maxLength={128}
                invalid={!!fieldErrors.password}
                invalidText={fieldErrors.password}
              />

              {error && (
                <InlineNotification
                  kind="error"
                  title="Error:"
                  subtitle={error}
                  lowContrast
                  hideCloseButton
                  style={{ marginBottom: 0 }}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <Checkbox 
                  id="keep-signed-in" 
                  labelText="Keep me signed in" 
                />
                <Link href="#" size="sm">
                  Forgot password?
                </Link>
              </div>

              <Button 
                type="submit" 
                disabled={isLoading} 
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {isLoading ? "Verifying…" : "Sign In"}
              </Button>
            </Stack>
          </form>

          <p style={{ fontSize: '12px', lineHeight: 1.5, color: '#525252', marginTop: '3rem' }}>
            Access to this portal is logged and restricted to authorized government personnel. 
            Unauthorized use is a violation of the Computer Crimes Act.
          </p>
        </div>
      </div>

      {/* Right Column: Decorative Banner (hidden on small screens to prioritize the form) */}
      <div className="hidden lg:flex lg:flex-1" style={{
        backgroundColor: '#161616',
        color: '#f4f4f4',
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center',
        padding: '3rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle grid pattern background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 39px, #ffffff 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, #ffffff 40px)"
        }} />
        
        <div style={{ maxWidth: '400px', textAlign: 'center', zIndex: 1 }}>
          <div style={{ 
            display: 'flex', 
            height: '96px', 
            width: '96px', 
            alignItems: 'center', 
            justifyContent: 'center', 
            borderRadius: '50%', 
            border: '3px solid rgba(244,244,244,0.7)',
            margin: '0 auto 2rem auto'
          }}>
            <div style={{ 
              display: 'flex', 
              height: '64px', 
              width: '64px', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '50%', 
              border: '1px solid rgba(244,244,244,0.4)' 
            }}>
              <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '0.05em' }}>GSN</span>
            </div>
          </div>
          
          <h2 style={{ fontSize: '24px', fontWeight: 400, lineHeight: 1.4, marginBottom: '1rem' }}>
            Every application, reviewed with the same care as the citizen who submitted it.
          </h2>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#c6c6c6' }}>
            The Registry gives verifying officers a single, auditable queue — every decision timestamped, every reviewer accountable.
          </p>
        </div>
      </div>
    </div>
  );
}
