import { Config } from "@/app/types";

const config: Config = {
  aggregatorUrl: process.env.NEXT_PUBLIC_AGGREGATOR_URL || "",
  paymasterApiKey: process.env.NEXT_PUBLIC_PAYMASTER_API_KEY || "",
  paymasterUrl: process.env.NEXT_PUBLIC_PAYMASTER_URL || "",
  bundlerUrl: process.env.NEXT_PUBLIC_BUNDLER_URL || "",
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
};

export default config;
