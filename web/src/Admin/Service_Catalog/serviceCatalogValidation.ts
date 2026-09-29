// Same rules as the backend's ServiceCatalogValidator (backend/src/Validation). Each function
// returns the first problem, or null when the data is valid.
import { v } from "../../utils/validation";

export const SERVICE_STATUSES = ["Draft", "Active", "Retired"];
export const RULE_OPERATORS = [">=", "<=", "==", "!="];

export function serviceError(s: { serviceId: string; name: string; category: string; status: string; totalStages: number }): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/.test((s.serviceId || "").trim())) {
    return "Service code must be 2-30 letters, numbers or dashes, e.g. GSN-SRV-001.";
  }
  return (
    v.text("Procedure name", { min: 3, max: 200 })(s.name) ??
    v.text("Category", { max: 100 })(s.category) ??
    (SERVICE_STATUSES.includes(s.status) ? null : "Status must be Draft, Active or Retired.") ??
    v.integer("Total stages", 1, 50)(String(s.totalStages))
  );
}

export function rulesError(rules: { field: string; operator: string; value: string }[]): string | null {
  if (rules.length > 100) return "A service can have at most 100 eligibility rules.";
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const n = i + 1;
    if (!r.field?.trim() || r.field.length > 100) return `Rule ${n}: choose the field to check.`;
    if (!RULE_OPERATORS.includes(r.operator)) return `Rule ${n}: operator must be >=, <=, == or !=.`;
    const value = String(r.value ?? "").trim();
    if (!value || value.length > 200) return `Rule ${n}: value is required and must be at most 200 characters.`;
    if (r.field.toLowerCase() === "age" && v.integer("Age", 0, 120)(value)) return `Rule ${n}: age must be a whole number between 0 and 120.`;
    if (r.field.toLowerCase().includes("income") && !(Number(value) >= 0)) return `Rule ${n}: income must be a number of 0 or more.`;
  }
  return null;
}

export function documentError(doc: { documentName: string; description?: string }, existingNames: string[]): string | null {
  const nameError = v.text("Document name", { max: 200 })(doc.documentName);
  if (nameError) return nameError;
  if (existingNames.some((n) => n.trim().toLowerCase() === doc.documentName.trim().toLowerCase())) {
    return "This document is already listed for the service.";
  }
  return v.text("Description", { max: 1000, required: false })(doc.description ?? "");
}

export function feeError(fee: { feeType: string; amount: number | string }): string | null {
  return (
    v.text("Fee type", { max: 100 })(fee.feeType) ??
    // A fee of 0 is allowed (free service)
    v.amount("Amount", { allowZero: true })(String(fee.amount))
  );
}
