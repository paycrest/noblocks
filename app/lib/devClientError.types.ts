/** Payload for POST /api/dev/client-error (development only). */

export type DevClientErrorPayload = {
  feature: string;
  step: string;
  error: {
    name?: string;
    message: string;
    shortMessage?: string;
    code?: string;
    stack?: string;
    details?: string;
    causes: string[];
  };
  context?: Record<string, string | number | boolean | null>;
};
