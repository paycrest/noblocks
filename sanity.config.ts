import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./studio/types";
import { serverConfig } from "./app/lib/config";

export default defineConfig({
  name: "default",
  title: "Noblocks Blog",

  projectId: serverConfig.projectId,
  dataset: serverConfig.dataset,

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },

  // API configuration
  api: {
    cors: {
      credentials: "include",
    },
  },

  // Studio configuration
  studio: {
    components: {
      // Customize studio components if needed
    },
  },
});
