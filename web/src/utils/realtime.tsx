import { useEffect } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { API_BASE_URL } from "./api";
import { queryClient, queryKeys } from "./queryClient";

// Fired on window when the officer queue changes, for pages that fetch without useQuery
export const QUEUE_UPDATED_EVENT = "gsn:queue-updated";

// Coalesces bursts (a bulk verify changes many tasks) into one refetch
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Keeps officer screens live without polling. The backend hub sends "queueUpdated" to all staff
 * when tasks, submissions or payments change; this invalidates the cached task and audit-log
 * queries (only the page on screen is refetched) and notifies pages that fetch on their own.
 * Rendered once at the app root; does nothing until an officer is signed in.
 */
export function RealtimeBridge() {
  useEffect(() => {
    const token = localStorage.getItem("officerToken");
    if (!token) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
        queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs });
        window.dispatchEvent(new Event(QUEUE_UPDATED_EVENT));
      }, REFRESH_DEBOUNCE_MS);
    };

    const connection = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/applications`, {
        accessTokenFactory: () => localStorage.getItem("officerToken") ?? "",
        // The API allows any origin without credentials, so do not send cookies
        withCredentials: false,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on("queueUpdated", refresh);
    // Anything may have changed while disconnected
    connection.onreconnected(refresh);

    let stopped = false;
    connection.start().catch((error) => {
      if (!stopped) console.warn("Realtime connection failed; pages refresh on navigation instead", error);
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      connection.stop();
    };
  }, []);

  return null;
}
