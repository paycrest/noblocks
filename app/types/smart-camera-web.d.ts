import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "smart-camera-web": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        "theme-color"?: string;
        "capture-id"?: boolean | string;
        "allow-legacy-selfie-fallback"?: boolean | string;
        "show-navigation"?: boolean | string;
        "hide-attribution"?: boolean | string;
        "disable-image-tests"?: boolean | string;
      };
    }
  }
}
