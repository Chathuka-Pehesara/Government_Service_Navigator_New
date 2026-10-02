import {
  CATEGORY_PREFIX_MAP,
  DEPARTMENTS,
  SERVICE_CATEGORIES,
  getCategoryForDepartment,
  getDepartmentForCategory,
  getDepartmentLabel,
  getDepartmentSlug,
} from "../../web/src/constants/departments";
import { documentError, feeError, rulesError, serviceError } from "../../web/src/Admin/Service_Catalog/serviceCatalogValidation";
import { MAX_LOGO_BYTES, logoFileError, validateDepartment } from "../../web/src/Admin/Department_Management/departmentValidation";

describe("departments", () => {
  it("every thematic category has a service-code prefix", () => {
    for (const category of SERVICE_CATEGORIES) {
      expect(CATEGORY_PREFIX_MAP[category]).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("slugs and labels round-trip", () => {
    for (const d of DEPARTMENTS) {
      expect(getDepartmentLabel(getDepartmentSlug(d.label)!)).toBe(d.label);
    }
  });

  it("lookups ignore case and surrounding spaces", () => {
    expect(getDepartmentSlug("  police department ")).toBe("police");
    expect(getDepartmentLabel("POLICE")).toBe("Police Department");
    expect(getCategoryForDepartment("Police Department")).toBe("Police");
  });

  it("unknown names give null", () => {
    expect(getDepartmentSlug("Ministry of Magic")).toBeNull();
    expect(getDepartmentLabel("nowhere")).toBeNull();
    expect(getCategoryForDepartment("Ministry of Magic")).toBeNull();
  });

  it.each([
    ["Personal & Family", "Department of Registration of Persons"],
    ["Civil", "Department of Registration of Persons"],
    ["Transport & Travel", "Department of Motor Traffic"],
    ["Transport", "Department of Motor Traffic"],
    ["Immigration", "Department of Immigration & Emigration"],
    ["Legal & Security", "Police Department"],
    ["Police", "Police Department"],
    ["Business & Trade", "Divisional Secretariat"],
    ["Public & Community Services", "Divisional Secretariat"],
    ["Public Administration", "Divisional Secretariat"],
    ["Something new", "Divisional Secretariat"],
  ])("category %s routes to %s", (category, department) => {
    expect(getDepartmentForCategory(category)).toBe(department);
  });

  // Department admins are scoped by DEPARTMENTS[].category, but services are stored under the
  // thematic categories, so a department admin's scope matches none of them (docs/api.md, known gap).
  it.fails("department-admin scope matches the thematic service categories (known gap)", () => {
    for (const d of DEPARTMENTS) {
      expect(SERVICE_CATEGORIES as readonly string[]).toContain(getCategoryForDepartment(d.label));
    }
  });
});

describe("serviceError", () => {
  const valid = { serviceId: "GSN-SRV-001", name: "Passport Renewal", category: "Transport & Travel", status: "Active", totalStages: 1 };

  it("accepts a valid service", () => {
    expect(serviceError(valid)).toBeNull();
  });

  it.each([
    [{ serviceId: "A" }, "Service code"],
    [{ serviceId: "-GSN" }, "Service code"],
    [{ name: "ab" }, "at least 3"],
    [{ category: "" }, "Category is required"],
    [{ status: "Archived" }, "Draft, Active or Retired"],
    [{ totalStages: 0 }, "between 1 and 50"],
    [{ totalStages: 51 }, "between 1 and 50"],
  ])("reports %j", (change, fragment) => {
    expect(serviceError({ ...valid, ...change })).toContain(fragment);
  });
});

describe("rulesError", () => {
  it("accepts valid rules and an empty list", () => {
    expect(rulesError([])).toBeNull();
    expect(rulesError([{ field: "Age", operator: ">=", value: "18" }, { field: "Annual Income", operator: "<=", value: "0" }])).toBeNull();
  });

  it.each([
    [{ field: "", operator: "==", value: "x" }, "Rule 1: choose the field"],
    [{ field: "Age", operator: "~", value: "18" }, "Rule 1: operator"],
    [{ field: "Age", operator: ">=", value: "" }, "Rule 1: value is required"],
    [{ field: "Age", operator: ">=", value: "abc" }, "Rule 1: age"],
    [{ field: "age", operator: ">=", value: "121" }, "Rule 1: age"],
    [{ field: "Monthly income", operator: ">=", value: "-1" }, "Rule 1: income"],
  ])("reports %j", (rule, fragment) => {
    expect(rulesError([rule])).toContain(fragment);
  });

  it("numbers the failing rule", () => {
    expect(rulesError([{ field: "Age", operator: ">=", value: "18" }, { field: "", operator: ">=", value: "1" }])).toMatch(/^Rule 2/);
  });

  it("caps the list at 100 rules", () => {
    const rules = Array.from({ length: 101 }, () => ({ field: "Age", operator: ">=", value: "18" }));
    expect(rulesError(rules)).toContain("at most 100");
  });
});

describe("documentError and feeError", () => {
  it("rejects a document already listed, ignoring case and spaces", () => {
    expect(documentError({ documentName: " birth certificate " }, ["Birth Certificate"])).toContain("already listed");
    expect(documentError({ documentName: "Birth Certificate" }, ["NIC"])).toBeNull();
  });

  it("limits the description", () => {
    expect(documentError({ documentName: "NIC", description: "x".repeat(1001) }, [])).toContain("at most 1000");
  });

  it("allows a free service but not a negative fee", () => {
    expect(feeError({ feeType: "Processing", amount: 0 })).toBeNull();
    expect(feeError({ feeType: "Processing", amount: "1500.50" })).toBeNull();
    expect(feeError({ feeType: "Processing", amount: -1 })).not.toBeNull();
    expect(feeError({ feeType: "", amount: 10 })).toContain("Fee type");
  });
});

describe("department form", () => {
  const valid = {
    name: "Department of Motor Traffic",
    logoUrl: "",
    contactNumber: "0112345678",
    email: "",
    website: "",
    address: "",
    description: "",
  };

  it("accepts a minimal valid department", () => {
    expect(validateDepartment(valid)).toEqual({});
  });

  it("accepts an uploaded logo or a web address, and hotline numbers", () => {
    expect(validateDepartment({ ...valid, logoUrl: "data:image/png;base64,AAAA", contactNumber: "1919" })).toEqual({});
    expect(validateDepartment({ ...valid, logoUrl: "https://cdn.gov.lk/logo.png" })).toEqual({});
  });

  it("reports each invalid field", () => {
    const errors = validateDepartment({
      ...valid,
      name: "ab",
      logoUrl: "not a url",
      contactNumber: "",
      email: "bad",
      website: "ftp://x",
    });

    expect(Object.keys(errors).sort()).toEqual(["contactNumber", "email", "logoUrl", "name", "website"]);
  });

  it("checks logo files by type and size", () => {
    expect(logoFileError(new File(["x"], "logo.png", { type: "image/png" }))).toBeNull();
    expect(logoFileError(new File(["x"], "logo.svg", { type: "image/svg+xml" }))).toContain("PNG, JPEG, GIF or WebP");
    const big = new File([new Uint8Array(MAX_LOGO_BYTES + 1)], "big.png", { type: "image/png" });
    expect(logoFileError(big)).toContain("2MB");
  });
});
