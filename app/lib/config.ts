type Config = {
  mixpanelToken: string;
  env: string;
};

const config: Config = {
  mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "",
  env: process.env.NODE_ENV || "development",
};

export default config;
