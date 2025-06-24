import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        secondary: "#43B9FB",
        black: "#121217",
        outline: {
          gray: "#8A8AA3",
        },
        lavender: {
          50: "#F6F6FE",
          100: "#ECECFD",
          200: "#D8D7FB",
          300: "#C2BFF8",
          400: "#A9A5F6",
          500: "#8B85F4",
          600: "#7C77DA",
          700: "#6C67BD",
          800: "#58549A",
          900: "#3E3B6D",
        },
        surface: {
          overlay: "#202020",
          canvas: "#141414",
        },
        accent: {
          gray: "#F7F7F8",
          red: "#F53D6B",
        },
        background: {
          accent: {
            red: "#FEF0F4",
          },
          neutral: "#F9FAFB",
        },
        border: {
          light: "#EBEBEF",
          input: "#D1D1DB",
        },
        text: {
          body: "#121217",
          secondary: "#6C6C89",
          accent: {
            red: "#D50B3E",
            gray: "#3F3F50",
          },
          disabled: "#A9A9BC",
          placeholder: "#A9A9BC",
        },
        input: {
          destructive: "#F53D6B",
          focus: "#141414",
        },
        icon: {
          outline: {
            secondary: "#8A8AA3",
            disabled: "#D1D1DB",
          },
        },
      },
      screens: {
        xsm: "375px",
        xmd: "425px",
      },
      keyframes: {
        "rocket-shake": {
          "0%, 100%": { transform: "translateY(0) rotate(-2deg)" },
          "20%": { transform: "translateY(-2px) rotate(2deg)" },
          "40%": { transform: "translateY(2px) rotate(-2deg)" },
          "60%": { transform: "translateY(-1px) rotate(1deg)" },
          "80%": { transform: "translateY(1px) rotate(-1deg)" },
        },
      },
      animation: {
        "rocket-shake": "rocket-shake 0.7s infinite",
      },
    },
  },
  plugins: [],
  darkMode: "class",
};

export default config;
