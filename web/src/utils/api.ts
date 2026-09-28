// Centralised fetch wrapper that attaches the JWT Bearer token stored by the
// login flow and throws a typed ApiError on non-2xx responses. Every function
// in the domain-specific API modules below should use `apiFetch` so the auth
// header is never forgotten.

// Backend origin from VITE_API_URL (see .env.example). Older pages still hardcode
// http://localhost:5119; new code should use apiFetch or API_BASE_URL instead.
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:5119";
const BASE_URL = API_BASE_URL;

// One page of a list endpoint called with ?page= (backend PagedResult<T>)
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Builds "?a=1&b=x" from the defined, non-empty values only
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("officerToken");
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base["Authorization"] = `Bearer ${token}`;
  return base;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const merged: RequestInit = {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  };

  const response = await fetch(`${BASE_URL}${path}`, merged);

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.text();
      if (body) message = body;
    } catch {
      // ignore parse errors — the status code is sufficient
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content — nothing to parse; callers that expect void type this as Promise<void>
  if (response.status === 204) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return void 0 as any;
  }

  return response.json();
}
