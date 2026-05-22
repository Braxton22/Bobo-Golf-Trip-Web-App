import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fairway: {
          50: "#f1f8f1",
          100: "#dcebdc",
          500: "#3d8a3d",
          700: "#256025",
          900: "#143614",
        },
        sand: { 100: "#fbf3df", 300: "#ecd9a0", 500: "#d4b25f" },
      },
    },
  },
  plugins: [],
};

export default config;
