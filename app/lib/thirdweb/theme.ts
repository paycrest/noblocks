import { lightTheme, darkTheme } from "thirdweb/react";

// Light theme configuration
export const customLightTheme = lightTheme({
  colors: {
    modalBg: "#FFFFFF",
    modalOverlayBg: "rgba(0, 0, 0, 0.3)",
    primaryText: "#121217", // text-body
    secondaryText: "#6C6C89", // text-secondary
    primaryButtonBg: "#8B85F4", // lavender-500
    primaryButtonText: "#FFFFFF",
    secondaryButtonBg: "#F7F7F8", // accent-gray
    secondaryButtonText: "#121217",
    secondaryButtonHoverBg: "#ECECFD", // lavender-100
    connectedButtonBg: "#F7F7F8", // accent-gray
    connectedButtonBgHover: "#ECECFD", // lavender-100
    borderColor: "#EBEBEF", // border-light
    separatorLine: "#EBEBEF", // border-light
    accentText: "#8B85F4", // lavender-500
    accentButtonBg: "#F7F7F8", // accent-gray
    accentButtonText: "#121217",
    danger: "#F53D6B", // accent-red
    success: "#39C65D",
    inputAutofillBg: "#F9FAFB", // background-neutral
    scrollbarBg: "#F7F7F8", // accent-gray
    secondaryIconColor: "#8A8AA3", // icon-outline-secondary
    secondaryIconHoverBg: "#ECECFD", // lavender-100
    secondaryIconHoverColor: "#8B85F4", // lavender-500
    selectedTextBg: "#ECECFD", // lavender-100
    selectedTextColor: "#8B85F4", // lavender-500
    skeletonBg: "#F7F7F8", // accent-gray
    tertiaryBg: "#F9FAFB", // background-neutral
    tooltipBg: "#121217",
    tooltipText: "#FFFFFF",
  },
  fontFamily: "Inter, system-ui, sans-serif",
});

// Dark theme configuration
export const customDarkTheme = darkTheme({
  colors: {
    modalBg: "#202020", // surface-overlay
    modalOverlayBg: "rgba(0, 0, 0, 0.5)",
    primaryText: "#FFFFFF",
    secondaryText: "rgba(255, 255, 255, 0.5)", // text-white/50
    primaryButtonBg: "#8B85F4", // lavender-500
    primaryButtonText: "#FFFFFF",
    secondaryButtonBg: "rgba(255, 255, 255, 0.1)", // bg-white/10
    secondaryButtonText: "#FFFFFF",
    secondaryButtonHoverBg: "rgba(139, 133, 244, 0.2)", // lavender-500/20
    connectedButtonBg: "rgba(255, 255, 255, 0.1)", // bg-white/10
    connectedButtonBgHover: "rgba(139, 133, 244, 0.2)", // lavender-500/20
    borderColor: "rgba(255, 255, 255, 0.05)", // border-white/5
    separatorLine: "rgba(255, 255, 255, 0.05)", // border-white/5
    accentText: "#8B85F4", // lavender-500
    accentButtonBg: "rgba(255, 255, 255, 0.1)", // bg-white/10
    accentButtonText: "#FFFFFF",
    danger: "#F53D6B", // accent-red
    success: "#39C65D",
    inputAutofillBg: "rgba(255, 255, 255, 0.05)", // bg-white/5
    scrollbarBg: "rgba(255, 255, 255, 0.1)", // bg-white/10
    secondaryIconColor: "rgba(255, 255, 255, 0.5)", // text-white/50
    secondaryIconHoverBg: "rgba(139, 133, 244, 0.2)", // lavender-500/20
    secondaryIconHoverColor: "#8B85F4", // lavender-500
    selectedTextBg: "rgba(139, 133, 244, 0.2)", // lavender-500/20
    selectedTextColor: "#8B85F4", // lavender-500
    skeletonBg: "rgba(255, 255, 255, 0.1)", // bg-white/10
    tertiaryBg: "rgba(255, 255, 255, 0.05)", // bg-white/5
    tooltipBg: "#202020", // surface-overlay
    tooltipText: "#FFFFFF",
  },
  fontFamily: "Inter, system-ui, sans-serif",
});
