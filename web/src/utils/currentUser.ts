import { getDepartmentSlug } from "../constants/departments";

export interface StoredUser {
  fullName?: string;
  email?: string;
  role?: string;
  department?: string;
}

// The "officerUser" key holds whatever the login endpoint returned - an
// OfficerDto (fullName, department, role) or an AdminDto (email, role only,
// since System Admin accounts have no name in the database). Every page that
// shows "who am I logged in as" should go through this so the label is
// identical everywhere instead of each page inventing its own fallback text.
export function getStoredUser(): StoredUser | null {
  const stored = localStorage.getItem("officerUser");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function getDisplayName(user: StoredUser | null): string {
  if (!user) return "Unknown User";
  return user.fullName || user.email || "Unknown User";
}

// A Department Admin's "Overview" is their department dashboard
// (/admin/{deptSlug}/dashboard), not the System Admin's generic
// /admin/dashboard. Pages that link back to "Overview" must resolve this
// per-user instead of hardcoding /admin/dashboard, or a Department Admin
// gets dropped onto the wrong dashboard after visiting a shared admin page.
export function getAdminOverviewHref(user: StoredUser | null): string {
  const slug = user?.department ? getDepartmentSlug(user.department) : null;
  return slug ? `/admin/${slug}/dashboard` : "/admin/dashboard";
}

// ─── Centralised Role Helpers ────────────────────────────────────────────────
// All admin pages should import from here so role resolution is consistent.
//
// Role hierarchy (highest → lowest):
//   SystemAdmin  — full access: create/edit/delete services, configure stages,
//                  build templates, manage all officers, view all departments.
//   DepartmentAdmin — departmental scope only: manage their own officers,
//                  view the service catalog (read-only), view department
//                  analytics and rejection codes. CANNOT create/edit services
//                  or build form templates.
//   VerifyingOfficer / Auditor / FinanceOfficer — operational roles only.

/** True only for System Admin accounts (no department lock). */
export function isSystemAdmin(user: StoredUser | null): boolean {
  if (!user?.role) return false;
  const r = user.role.trim().toLowerCase();
  return r === "systemadmin" || r === "system admin" || r === "admin";
}

/** True only for Department Admin accounts (scoped to their department). */
export function isDeptAdmin(user: StoredUser | null): boolean {
  if (!user?.role || !user?.department) return false;
  const r = user.role.trim().toLowerCase();
  return r === "departmentadmin" || r === "department admin";
}

/**
 * Returns true when the user can manage services, define workflow stages,
 * and build/edit form templates.
 * Decision: SYSTEM ADMIN ONLY.
 */
export function canManageServices(user: StoredUser | null): boolean {
  return isSystemAdmin(user);
}

/**
 * Returns true when the user can manage officers.
 * System Admins → all departments.
 * Department Admins → own department only.
 */
export function canManageOfficers(user: StoredUser | null): boolean {
  return isSystemAdmin(user) || isDeptAdmin(user);
}

/**
 * Returns true when the user can register, edit, and manage departments.
 * Decision: SYSTEM ADMIN ONLY.
 */
export function canManageDepartments(user: StoredUser | null): boolean {
  return isSystemAdmin(user);
}

