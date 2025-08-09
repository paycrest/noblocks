import { createClient } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { clientConfig } from "./config";

// Only create client if environment variables are set
export const client =
  clientConfig.projectId && clientConfig.dataset
    ? createClient(clientConfig)
    : null;

// Image URL builder
const builder = client ? imageUrlBuilder(client) : null;

// Helper function to get image URL
export function urlFor(source: SanityImageSource) {
  if (!builder) {
    console.warn("Sanity client not configured, cannot generate image URL");
    return null;
  }
  return builder.image(source).auto("format").fit("max");
}

export function urlForImage(source: SanityImageSource) {
  if (!builder) {
    console.warn("Sanity client not configured, cannot generate image URL");
    return null;
  }

  try {
    return builder.image(source).auto("format").fit("max").url();
  } catch (error) {
    console.error("Error generating image URL:", error);
    return null;
  }
}
