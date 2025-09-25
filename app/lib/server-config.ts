// Server-only configuration
// This module should NEVER be imported in client-side code
// to prevent server secrets from leaking to the browser

export const getServerMixpanelToken = (): string => {
  return process.env.MIXPANEL_TOKEN || "";
};

export const getServerConfig = () => {
  return {
    mixpanelToken: getServerMixpanelToken(),
    // Add other server-only secrets here as needed
  };
};
