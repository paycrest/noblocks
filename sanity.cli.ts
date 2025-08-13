import { defineCliConfig } from "@sanity/cli";
import { serverConfig } from "./app/lib/config";

// Validate required configuration
if (!serverConfig.projectId || !serverConfig.dataset) {
  throw new Error(
    "Missing required Sanity configuration. Please ensure SANITY_STUDIO_PROJECT_ID and SANITY_STUDIO_DATASET environment variables are set.",
  );
}

export default defineCliConfig({
  api: {
    projectId: serverConfig.projectId,
    dataset: serverConfig.dataset,
  },
  /**
   * Enable auto-updates for studios.
   * Learn more at https://www.sanity.io/docs/cli#auto-updates
   */
  autoUpdates: true,
});
