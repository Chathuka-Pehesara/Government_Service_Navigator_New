import { buildLedger } from "../../web/src/Finance/ledger";
import type { Payment } from "../../web/src/Finance/financeData";
import { formatCurrency, formatDate, formatDateTime } from "../../web/src/Finance/format";

let nextId = 1;
function payment(overrides: Partial<Payment>): Payment {
  return {
    id: nextId++,
    applicationId: "APP-1",
    userId: "",
    method: "BankDeposit",
    amount: 1000,
    status: "Verified",
    submittedAt: "2026-06-01T00:00:00",
    verifiedAt: "2026-06-10T10:00:00",
    ...overrides,
  };
}

const ref = new Date(2026, 5, 15, 12, 0, 0); // Monday 15 June 2026, local time

describe("buildLedger", () => {
  it.each([
    ["daily", 14],
    ["weekly", 12],
    ["monthly", 12],
    ["yearly", 5],
  ] as const)("%s ledger has %i buckets, oldest first", (period, count) => {
    const entries = buildLedger([], period, ref);

    expect(entries).toHaveLength(count);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].start.getTime()).toBeGreaterThan(entries[i - 1].start.getTime());
    }
    expect(entries.every((e) => e.total === 0 && e.count === 0)).toBe(true);
  });

  it("books only verified payments, by verification date", () => {
    const entries = buildLedger(
      [
        payment({ amount: 1000, verifiedAt: "2026-06-10T10:00:00" }),
        payment({ amount: 500, status: "Pending", verifiedAt: undefined }),
        payment({ amount: 700, status: "Rejected", verifiedAt: "2026-06-10T10:00:00" }),
        payment({ amount: 300, status: "Verified", verifiedAt: undefined }),
      ],
      "monthly",
      ref
    );

    const june = entries[entries.length - 1];
    expect(june.count).toBe(1);
    expect(june.total).toBe(1000);
  });

  it("splits totals by payment method", () => {
    const entries = buildLedger(
      [
        payment({ method: "BankDeposit", amount: 1000 }),
        payment({ method: "OnlinePay", amount: 250 }),
        payment({ method: "OnlinePay", amount: 250 }),
        payment({ method: "OnlineBankTransfer", amount: 75 }),
      ],
      "yearly",
      ref
    );

    const year = entries[entries.length - 1];
    expect(year.label).toBe("2026");
    expect(year.bankDepositTotal).toBe(1000);
    expect(year.onlinePayTotal).toBe(500);
    expect(year.onlineBankTransferTotal).toBe(75);
    expect(year.total).toBe(1575);
    expect(year.count).toBe(4);
  });

  it("puts a payment in the right day, including the last moment of the day", () => {
    const entries = buildLedger(
      [payment({ verifiedAt: new Date(2026, 5, 14, 23, 59, 59).toISOString() })],
      "daily",
      ref
    );

    expect(entries[entries.length - 2].count).toBe(1); // 14 June
    expect(entries[entries.length - 1].count).toBe(0); // 15 June
  });

  it("weeks start on Monday", () => {
    const entries = buildLedger([], "weekly", ref);

    expect(entries.every((e) => e.start.getDay() === 1)).toBe(true);
    expect(entries[entries.length - 1].start.getDate()).toBe(15);
  });

  it("ignores payments outside the window", () => {
    const entries = buildLedger([payment({ verifiedAt: "2019-01-01T00:00:00" })], "yearly", ref);

    expect(entries.reduce((acc, e) => acc + e.count, 0)).toBe(0);
  });
});

describe("format", () => {
  it("formats rupees with two decimals", () => {
    expect(formatCurrency(1234.5)).toMatch(/^Rs\. 1.?234.50$/);
    expect(formatCurrency(0)).toMatch(/^Rs\. 0.00$/);
  });

  it("shows a dash for missing dates", () => {
    expect(formatDate(undefined)).toBe("-");
    expect(formatDateTime("")).toBe("-");
  });

  it("formats real dates", () => {
    expect(formatDate("2026-06-15T10:00:00")).toContain("2026");
    expect(formatDateTime("2026-06-15T10:00:00")).toContain("2026");
  });
});
