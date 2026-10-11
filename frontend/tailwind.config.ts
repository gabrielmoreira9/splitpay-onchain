import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14211f",
        teal: "#0e766e",
        mint: "#d8f3e8",
        sand: "#f7f8f3",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(20, 33, 31, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
