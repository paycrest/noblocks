// Server-side analytics exports only
// These are safe to use in server components and Edge runtime

// Re-export only server-safe analytics helpers
export {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
  trackTransactionEvent,
  trackServerEvent,
} from "@/app/lib/server-analytics";
