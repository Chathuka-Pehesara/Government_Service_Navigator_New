// Form field rules shared by the web forms. They mirror the backend (backend/src/Validation)
// and mobile/lib/utils/validators.dart - keep the three in step.
//
// Every rule returns an error message, or null when the value is valid. Optional fields pass
// when empty; pass `required: true` (the default for most rules) to make them mandatory.

export type Rule = (value: string) => string | null;

const isEmpty = (v: string | null | undefined) => v == null || v.trim() === "";

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE = /^(?:\+94|0094|0)[1-9][0-9]{8}$/;
const SHORT_CODE = /^1[0-9]{2,3}$/;
const NAME = /^\p{L}[\p{L}\p{M} .'-]{1,99}$/u;
const HTML = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

export const normalizePhone = (v: string) => v.trim().replace(/[\s\-()]/g, "");

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Sri Lankan NIC: old format 9 digits + V/X (e.g. 881234567V, year 19YY) or new format
 * 12 digits (e.g. 198812345678). The day-of-year digits are 001-366 for men and 501-866 for
 * women; day 060 (29 Feb) only exists in leap years.
 */
export function nicError(value: string): string | null {
  const v = value.trim().toUpperCase();
  let year: number;
  let day: number;
  if (/^[0-9]{9}[VX]$/.test(v)) {
    year = 1900 + Number(v.slice(0, 2));
    day = Number(v.slice(2, 5));
  } else if (/^[0-9]{12}$/.test(v)) {
    year = Number(v.slice(0, 4));
    day = Number(v.slice(4, 7));
  } else {
    return "NIC must be 9 digits followed by V or X (e.g. 881234567V) or 12 digits (e.g. 198812345678).";
  }
  if (day > 500) day -= 500;
  const today = new Date();
  if (year < 1900 || year > today.getFullYear()) return "NIC contains an invalid birth year.";
  if (day < 1 || day > 366) return "NIC contains an invalid birth day number.";
  if (day === 60 && !isLeap(year)) return "NIC contains 29 February for a year that is not a leap year.";
  // Day numbers always count 29 Feb, so walk a leap year then move to the real year
  const inLeap = new Date(2000, 0, day);
  const birth = new Date(year, inLeap.getMonth(), inLeap.getDate());
  if (birth > today) return "NIC contains a birth date in the future.";
  return null;
}

export const v = {
  required:
    (field: string): Rule =>
    (value) =>
      isEmpty(value) ? `${field} is required.` : null,

  nic:
    (required = true): Rule =>
    (value) =>
      isEmpty(value) ? (required ? "NIC number is required." : null) : nicError(value),

  email:
    (required = true): Rule =>
    (value) => {
      if (isEmpty(value)) return required ? "Email is required." : null;
      const t = value.trim();
      return t.length <= 254 && EMAIL.test(t) ? null : "Enter a valid email address, e.g. name@example.com.";
    },

  /** Sri Lankan number; allowShortCode also accepts hotlines such as 1919. */
  phone:
    (required = true, allowShortCode = false): Rule =>
    (value) => {
      if (isEmpty(value)) return required ? "Phone number is required." : null;
      const n = normalizePhone(value);
      return PHONE.test(n) || (allowShortCode && SHORT_CODE.test(n))
        ? null
        : "Enter a valid Sri Lankan phone number, e.g. 0771234567 or +94771234567.";
    },

  personName:
    (field = "Name", required = true): Rule =>
    (value) => {
      if (isEmpty(value)) return required ? `${field} is required.` : null;
      return NAME.test(value.trim())
        ? null
        : `${field} must be 2-100 characters and contain only letters, spaces, dots, apostrophes or hyphens.`;
    },

  /** New passwords: 8-64 characters with an uppercase letter, a lowercase letter and a number. */
  strongPassword: (): Rule => (value) => {
    if (!value) return "Password is required.";
    if (value.length < 8) return "Password must be at least 8 characters.";
    if (value.length > 64) return "Password must be at most 64 characters.";
    if (!/[A-Z]/.test(value)) return "Password must contain an uppercase letter.";
    if (!/[a-z]/.test(value)) return "Password must contain a lowercase letter.";
    if (!/[0-9]/.test(value)) return "Password must contain a number.";
    if (/\s/.test(value)) return "Password must not contain spaces.";
    return null;
  },

  /** Login only checks presence: older accounts may predate the strength rule. */
  loginPassword: (): Rule => (value) =>
    !value ? "Password is required." : value.length > 128 ? "Password must be at most 128 characters." : null,

  /** Free text with a length range and no HTML. */
  text:
    (field: string, opts: { min?: number; max?: number; required?: boolean } = {}): Rule =>
    (value) => {
      const { min = 0, max = 1000, required = true } = opts;
      if (isEmpty(value)) return required ? `${field} is required.` : null;
      const t = value.trim();
      if (t.length < min) return `${field} must be at least ${min} characters.`;
      if (t.length > max) return `${field} must be at most ${max} characters.`;
      if (HTML.test(t)) return `${field} must not contain HTML.`;
      return null;
    },

  /** LKR amount; allowZero for fees that may be free. */
  amount:
    (field = "Amount", opts: { required?: boolean; allowZero?: boolean; max?: number } = {}): Rule =>
    (value) => {
      const { required = true, allowZero = false, max = 10_000_000 } = opts;
      if (isEmpty(value)) return required ? `${field} is required.` : null;
      const t = value.trim().replace(/,/g, "");
      if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) return `${field} must be a number with at most 2 decimal places.`;
      const n = Number(t);
      if (allowZero ? n < 0 : n <= 0) return `${field} must be ${allowZero ? "0 or more" : "greater than 0"}.`;
      if (n > max) return `${field} must not exceed LKR ${max.toLocaleString()}.`;
      return null;
    },

  integer:
    (field: string, min: number, max: number, required = true): Rule =>
    (value) => {
      if (isEmpty(value)) return required ? `${field} is required.` : null;
      if (!/^-?[0-9]+$/.test(value.trim())) return `${field} must be a whole number.`;
      const n = Number(value);
      return n < min || n > max ? `${field} must be between ${min} and ${max}.` : null;
    },

  time:
    (field: string): Rule =>
    (value) =>
      isEmpty(value) ? `${field} is required.` : TIME.test(value.trim()) ? null : `${field} must be in 24-hour HH:mm format.`,

  url:
    (field = "Web address", required = false): Rule =>
    (value) => {
      if (isEmpty(value)) return required ? `${field} is required.` : null;
      try {
        const u = new URL(value.trim());
        return u.protocol === "http:" || u.protocol === "https:" ? null : `${field} must start with http:// or https://.`;
      } catch {
        return `${field} must be a valid address starting with http:// or https://.`;
      }
    },

  pattern:
    (re: RegExp, message: string, required = true, field = "This field"): Rule =>
    (value) =>
      isEmpty(value) ? (required ? `${field} is required.` : null) : re.test(value.trim()) ? null : message,
};

/** Runs rules in order and returns the first error. */
export const all =
  (...rules: Rule[]): Rule =>
  (value) => {
    for (const rule of rules) {
      const e = rule(value);
      if (e) return e;
    }
    return null;
  };

/**
 * Validates a whole form: { field: [value, rule] } -> { field: error } for the failing fields.
 * An empty result means the form is valid.
 */
export function validateForm<K extends string>(
  fields: Record<K, [string | number | null | undefined, Rule]>
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const key of Object.keys(fields) as K[]) {
    const [value, rule] = fields[key];
    const e = rule(value == null ? "" : String(value));
    if (e) errors[key] = e;
  }
  return errors;
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;

/**
 * Readable message from a failed response. The backend answers validation failures with
 * { message, errors, fields }; older endpoints send plain text or ProblemDetails.
 */
export async function readApiError(res: Response, fallback = `Request failed (${res.status}).`): Promise<string> {
  try {
    return parseApiError(await res.text(), fallback);
  } catch {
    return fallback;
  }
}

export function parseApiError(body: string, fallback: string): string {
  if (!body) return fallback;
  try {
    const data = JSON.parse(body);
    if (typeof data === "string") return data;
    if (data?.message) return String(data.message);
    if (Array.isArray(data?.errors) && data.errors.length) return data.errors.join(" ");
    // ASP.NET ProblemDetails: { title, errors: { Field: ["msg"] } }
    if (data?.errors && typeof data.errors === "object") {
      const msgs = Object.values(data.errors as Record<string, string[]>).flat();
      if (msgs.length) return msgs.join(" ");
    }
    if (data?.title) return String(data.title);
    return fallback;
  } catch {
    return body.length > 300 ? fallback : body;
  }
}
