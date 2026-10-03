export interface DepartmentOption {
  label: string;
  slug: string;
  // Service Catalog "Category" value handled by this department.
  category: string;
}

export const DEPARTMENTS: DepartmentOption[] = [
  { label: "Department of Immigration & Emigration", slug: "immigration", category: "Immigration" },
  { label: "Department of Motor Traffic", slug: "motor-traffic", category: "Transport" },
  { label: "Police Department", slug: "police", category: "Police" },
  { label: "Department of Registration of Persons", slug: "registration-of-persons", category: "Civil" },
  { label: "Divisional Secretariat", slug: "divisional-secretariat", category: "Public Administration" },
];

export const SERVICE_CATEGORIES = [
  "Personal & Family",
  "Transport & Travel",
  "Legal & Security",
  "Business & Trade",
  "Public & Community Services",
  "General",
] as const;

export type ServiceCategory = typeof SERVICE_CATEGORIES[number];

export const CATEGORY_PREFIX_MAP: Record<string, string> = {
  "Personal & Family": "PER",
  "Transport & Travel": "TRN",
  "Legal & Security": "LEG",
  "Business & Trade": "BIZ",
  "Public & Community Services": "PUB",
  "General": "GEN",
};

export function getDepartmentSlug(department: string): string | null {
  if (!department) return null;
  const normalized = department.trim().toLowerCase();
  const match = DEPARTMENTS.find((d) => d.label.toLowerCase() === normalized);
  if (match) return match.slug;
  const slugified = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slugified || null;
}

export function getDepartmentLabel(slug: string): string | null {
  if (!slug) return null;
  const match = DEPARTMENTS.find((d) => d.slug === slug.toLowerCase());
  if (match) return match.label;
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      const u = JSON.parse(storedUser);
      if (u.department && getDepartmentSlug(u.department) === slug.toLowerCase()) {
        return u.department;
      }
    } catch {
      // ignore
    }
  }
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function getCategoryForDepartment(department: string): string | null {
  const normalized = department.trim().toLowerCase();
  const match = DEPARTMENTS.find((d) => d.label.toLowerCase() === normalized);
  return match ? match.category : null;
}

export function getDepartmentForCategory(category: string): string | null {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("personal") || normalized.includes("family") || normalized === "civil") {
    return "Department of Registration of Persons";
  }
  if (normalized.includes("transport") || normalized === "transport") {
    return "Department of Motor Traffic";
  }
  if (normalized.includes("travel") || normalized === "immigration") {
    return "Department of Immigration & Emigration";
  }
  if (normalized.includes("legal") || normalized.includes("security") || normalized === "police") {
    return "Police Department";
  }
  if (normalized.includes("business") || normalized.includes("trade") || normalized.includes("public") || normalized.includes("community")) {
    return "Divisional Secretariat";
  }
  const match = DEPARTMENTS.find((d) => d.category.toLowerCase() === normalized);
  return match ? match.label : "Divisional Secretariat";
}
