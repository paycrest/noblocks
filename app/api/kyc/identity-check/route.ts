import { NextRequest } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { handleOnrampIdentityCheck } from "@/app/lib/onramp-identity-check";

/** On-ramp identity check: confirms the user's BVN or NIN. See app/lib/onramp-identity-check.ts. */
export const POST = withRateLimit(async (request: NextRequest) => handleOnrampIdentityCheck(request));
