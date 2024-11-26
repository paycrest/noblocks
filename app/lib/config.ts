type Config = {
  env: string;
  mixpanelToken: string;
  hotjarSiteId: number;
};

const config: Config = {
  env: process.env.NODE_ENV || "development",
  mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "",
  hotjarSiteId: Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID || ""),
};

export default config;
