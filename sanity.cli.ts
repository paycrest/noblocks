import { defineCliConfig } from "@sanity/cli";
import { serverConfig } from "./app/lib/config";

export default defineCliConfig({
  api: {
    projectId: serverConfig.projectId,
    dataset: serverConfig.dataset,
  },
  /**
   * Disable auto-updates to prevent version compatibility issues.
   * Learn more at https://www.sanity.io/docs/cli#auto-updates
   */
  autoUpdates: true,
});
