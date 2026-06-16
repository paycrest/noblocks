import config from "./config";

/** Client feature flag: referral program. */
export function isReferralEnabled(): boolean {
  return config.referralEnabled;
}
