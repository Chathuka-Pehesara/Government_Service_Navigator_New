import { QueryClient } from "@tanstack/react-query";

// Shared cache for every GET made through useQuery. Data is reused across pages for a minute
// instead of being refetched on every navigation; realtime pushes (see realtime.tsx) invalidate
// the affected keys when something actually changes.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Query key roots, so pages and the realtime bridge agree on what to invalidate
export const queryKeys = {
  tasks: ["tasks"] as const,
  auditLogs: ["audit-logs"] as const,
};
