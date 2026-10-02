import { all, hasErrors, nicError, normalizePhone, parseApiError, readApiError, v, validateForm } from "../../web/src/utils/validation";

describe("nicError", () => {
  it.each(["881234567V", "881234567x", "200012345678", " 885234567v ", "200006012345"])("accepts %s", (nic) => {
    expect(nicError(nic)).toBeNull();
  });

  it.each([
    ["12345", "9 digits"],
    ["88123456V", "9 digits"],
    ["881234567A", "9 digits"],
    ["200036712345", "day number"],
    ["200000012345", "day number"],
    ["189912345678", "birth year"],
    ["199906012345", "29 February"],
  ])("rejects %s (%s)", (nic, fragment) => {
    expect(nicError(nic)).toContain(fragment);
  });

  it("rejects a birth year in the future", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(nicError(`${nextYear}00112345`)).toContain("birth year");
  });
});

describe("v.nic", () => {
  it("is required by default", () => {
    expect(v.nic()("")).toBe("NIC number is required.");
  });

  it("can be optional", () => {
    expect(v.nic(false)("  ")).toBeNull();
    expect(v.nic(false)("bad")).not.toBeNull();
  });
});

describe("v.email", () => {
  it.each(["name@example.com", "first.last+tag@sub.gov.lk"])("accepts %s", (email) => {
    expect(v.email()(email)).toBeNull();
  });

  it.each(["a@b", "no-at.com", "name@domain.c", "two@@example.com"])("rejects %s", (email) => {
    expect(v.email()(email)).not.toBeNull();
  });

  it("handles required and optional", () => {
    expect(v.email()("")).toBe("Email is required.");
    expect(v.email(false)("")).toBeNull();
  });
});

describe("v.phone", () => {
  it.each(["0771234567", "+94771234567", "0094771234567", "077-123 4567", "(077) 1234567"])("accepts %s", (phone) => {
    expect(v.phone()(phone)).toBeNull();
  });

  it.each(["0071234567", "077123456", "1919", "abc"])("rejects %s", (phone) => {
    expect(v.phone()(phone)).not.toBeNull();
  });

  it("accepts hotlines only when allowed", () => {
    expect(v.phone(true, true)("1919")).toBeNull();
    expect(v.phone(true, false)("1919")).not.toBeNull();
  });

  it("normalizePhone strips spaces, dashes and brackets", () => {
    expect(normalizePhone(" (077) 123-4567 ")).toBe("0771234567");
  });
});

describe("v.personName", () => {
  it.each(["Nimal Silva", "O'Brien-Perera", "K. M. Fernando", "නිමල් සිල්වා", "நிமல்"])("accepts %s", (name) => {
    expect(v.personName()(name)).toBeNull();
  });

  it.each(["N", "1Nimal", "Nimal <b>"])("rejects %s", (name) => {
    expect(v.personName("Full name")(name)).toContain("Full name");
  });
});

describe("v.strongPassword", () => {
  it.each([
    ["", "required"],
    ["Pa0rd", "at least 8"],
    ["password1", "uppercase"],
    ["PASSWORD1", "lowercase"],
    ["Password", "number"],
    ["Pass word1", "spaces"],
    ["Aa1" + "x".repeat(62), "at most 64"],
  ])("rejects %j (%s)", (pw, fragment) => {
    expect(v.strongPassword()(pw)).toContain(fragment);
  });

  it("accepts a strong password", () => {
    expect(v.strongPassword()("Passw0rd")).toBeNull();
  });

  it("login only checks presence and length", () => {
    expect(v.loginPassword()("weak")).toBeNull();
    expect(v.loginPassword()("")).toBe("Password is required.");
    expect(v.loginPassword()("x".repeat(129))).toContain("128");
  });
});

describe("v.text", () => {
  const rule = v.text("Reason", { min: 5, max: 20 });

  it("checks length after trimming", () => {
    expect(rule("  abc  ")).toContain("at least 5");
    expect(rule("x".repeat(21))).toContain("at most 20");
    expect(rule("  valid text  ")).toBeNull();
  });

  it("rejects HTML but not maths", () => {
    expect(rule("<b>bold</b>")).toContain("HTML");
    expect(rule("5 < 6 and 7 > 3")).toBeNull();
  });

  it("optional text may be empty", () => {
    expect(v.text("Notes", { required: false })("")).toBeNull();
    expect(v.text("Notes")("")).toBe("Notes is required.");
  });
});

describe("v.amount", () => {
  it.each(["1", "0.01", "1,250.50", "10000000"])("accepts %s", (amount) => {
    expect(v.amount()(amount)).toBeNull();
  });

  it.each([
    ["0", "greater than 0"],
    ["-5", "at most 2 decimal"],
    ["1.005", "at most 2 decimal"],
    ["abc", "at most 2 decimal"],
    ["10000000.01", "must not exceed"],
  ])("rejects %s", (amount, fragment) => {
    expect(v.amount()(amount)).toContain(fragment);
  });

  it("allows zero when asked", () => {
    expect(v.amount("Fee", { allowZero: true })("0")).toBeNull();
  });

  it("respects a custom maximum", () => {
    expect(v.amount("Fee", { max: 100 })("101")).toContain("must not exceed");
  });
});

describe("v.integer, v.time, v.url, v.pattern, v.required", () => {
  it("integer", () => {
    const rule = v.integer("Stages", 1, 50);
    expect(rule("1")).toBeNull();
    expect(rule("51")).toContain("between 1 and 50");
    expect(rule("1.5")).toContain("whole number");
    expect(v.integer("Stages", 1, 50, false)("")).toBeNull();
  });

  it.each([
    ["09:00", true],
    ["23:59:59", true],
    ["24:00", false],
    ["9:00", false],
  ])("time %s", (time, ok) => {
    expect(v.time("Start")(time) === null).toBe(ok);
  });

  it.each([
    ["https://gov.lk", true],
    ["http://example.com/x?y=1", true],
    ["ftp://example.com", false],
    ["example.com", false],
    ["javascript:alert(1)", false],
  ])("url %s", (url, ok) => {
    expect(v.url()(url) === null).toBe(ok);
  });

  it("url is optional by default", () => {
    expect(v.url()("")).toBeNull();
    expect(v.url("Site", true)("")).toBe("Site is required.");
  });

  it("pattern", () => {
    const rule = v.pattern(/^[A-Z]{3}$/, "Three capitals.");
    expect(rule("ABC")).toBeNull();
    expect(rule("abc")).toBe("Three capitals.");
  });

  it("required", () => {
    expect(v.required("Name")("  ")).toBe("Name is required.");
    expect(v.required("Name")("x")).toBeNull();
  });
});

describe("all / validateForm / hasErrors", () => {
  it("all returns the first failing rule", () => {
    const rule = all(v.required("Phone"), v.phone());
    expect(rule("")).toBe("Phone is required.");
    expect(rule("123")).toContain("valid Sri Lankan phone");
    expect(rule("0771234567")).toBeNull();
  });

  it("validateForm only reports failing fields and stringifies values", () => {
    const errors = validateForm({
      name: ["Nimal Silva", v.personName()],
      age: [12, v.integer("Age", 16, 125)],
      email: [null, v.email(false)],
    });

    expect(errors).toEqual({ age: "Age must be between 16 and 125." });
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors({})).toBe(false);
  });
});

describe("parseApiError", () => {
  it.each([
    ['{"message":"Nope"}', "Nope"],
    ['{"errors":["A.","B."]}', "A. B."],
    ['{"title":"Bad","errors":{"Email":["Invalid email."],"Name":["Too short."]}}', "Invalid email. Too short."],
    ['{"title":"Bad request"}', "Bad request"],
    ['"plain json string"', "plain json string"],
    ["Plain text body", "Plain text body"],
  ])("reads %s", (body, expected) => {
    expect(parseApiError(body, "fallback")).toBe(expected);
  });

  it("falls back for empty bodies, unknown JSON and huge HTML pages", () => {
    expect(parseApiError("", "fallback")).toBe("fallback");
    expect(parseApiError("{}", "fallback")).toBe("fallback");
    expect(parseApiError("<html>" + "x".repeat(400), "fallback")).toBe("fallback");
  });

  it("readApiError reads the response body", async () => {
    const res = new Response('{"message":"Server says no"}', { status: 400 });
    expect(await readApiError(res)).toBe("Server says no");
  });

  it("readApiError falls back to the status", async () => {
    expect(await readApiError(new Response("", { status: 502 }))).toBe("Request failed (502).");
  });
});
