import { defineCliConfig } from "@sanity/cli";
import { serverConfig } from "./app/lib/config";

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
