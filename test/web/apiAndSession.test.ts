import { API_BASE_URL, ApiError, apiFetch, toQuery } from "../../web/src/utils/api";
import {
  canManageDepartments,
  canManageOfficers,
  canManageServices,
  getAdminOverviewHref,
  getDisplayName,
  getStoredUser,
  isDeptAdmin,
  isSystemAdmin,
} from "../../web/src/utils/currentUser";

// A minimal localStorage for the node test environment
function installLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, val: string) => void store.set(k, val),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("toQuery", () => {
  it("keeps only defined, non-empty values", () => {
    expect(toQuery({ page: 2, pageSize: 25, search: "", status: undefined, dept: null })).toBe("?page=2&pageSize=25");
  });

  it("encodes values", () => {
    expect(toQuery({ search: "APP 12&x" })).toBe("?search=APP+12%26x");
  });

  it("is empty when nothing is set", () => {
    expect(toQuery({})).toBe("");
  });

  it("keeps zero", () => {
    expect(toQuery({ page: 0 })).toBe("?page=0");
  });
});

describe("apiFetch", () => {
  it("uses the configured base URL and sends the officer token", async () => {
    installLocalStorage({ officerToken: "abc" });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiFetch<{ ok: boolean }>("/api/things");

    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/things");
    expect(API_BASE_URL).toBe("http://api.test");
    expect(init.headers.Authorization).toBe("Bearer abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends no Authorization header when signed out", async () => {
    installLocalStorage();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/things");

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("returns undefined for 204 No Content", async () => {
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    expect(await apiFetch("/api/things/1")).toBeUndefined();
  });

  it("throws an ApiError with the message, body and field errors", async () => {
    installLocalStorage();
    const body = '{"message":"Validation failed","fields":{"Email":"Enter a valid email."}}';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 400 })));

    const error = await apiFetch("/api/things").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Validation failed");
    expect(error.body).toBe(body);
    expect(error.fields).toEqual({ Email: "Enter a valid email." });
  });

  it("falls back to the HTTP status when the body says nothing", async () => {
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

    await expect(apiFetch("/api/things")).rejects.toMatchObject({ status: 500, message: "HTTP 500" });
  });
});

describe("current user", () => {
  it("reads the stored officer and tolerates bad JSON", () => {
    installLocalStorage({ officerUser: '{"fullName":"Kamala","role":"Verifying Officer"}' });
    expect(getStoredUser()).toEqual({ fullName: "Kamala", role: "Verifying Officer" });

    installLocalStorage({ officerUser: "{not json" });
    expect(getStoredUser()).toBeNull();

    installLocalStorage();
    expect(getStoredUser()).toBeNull();
  });

  it("display name prefers the full name, then the email", () => {
    expect(getDisplayName({ fullName: "Kamala", email: "k@gov.lk" })).toBe("Kamala");
    expect(getDisplayName({ email: "admin@gov.lk" })).toBe("admin@gov.lk");
    expect(getDisplayName(null)).toBe("Unknown User");
  });

  it.each(["System Admin", "systemadmin", "Admin", " admin "])("%s is a system admin", (role) => {
    const user = { role };
    expect(isSystemAdmin(user)).toBe(true);
    expect(canManageServices(user)).toBe(true);
    expect(canManageDepartments(user)).toBe(true);
    expect(canManageOfficers(user)).toBe(true);
  });

  it("a department admin manages officers but not services or departments", () => {
    const user = { role: "Department Admin", department: "Police Department" };
    expect(isDeptAdmin(user)).toBe(true);
    expect(isSystemAdmin(user)).toBe(false);
    expect(canManageOfficers(user)).toBe(true);
    expect(canManageServices(user)).toBe(false);
    expect(canManageDepartments(user)).toBe(false);
  });

  it("a department admin without a department is not treated as one", () => {
    expect(isDeptAdmin({ role: "Department Admin" })).toBe(false);
  });

  it.each(["Verifying Officer", "Finance Officer", "Auditor", ""])("%j has no admin rights", (role) => {
    const user = { role, department: "Police Department" };
    expect(canManageOfficers(user)).toBe(false);
    expect(canManageServices(user)).toBe(false);
  });

  it("overview link goes to the department dashboard when there is one", () => {
    expect(getAdminOverviewHref({ department: "Police Department" })).toBe("/admin/police/dashboard");
    expect(getAdminOverviewHref({ department: "Unknown Dept" })).toBe("/admin/dashboard");
    expect(getAdminOverviewHref(null)).toBe("/admin/dashboard");
  });
});
