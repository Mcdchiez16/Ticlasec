import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      fontFamily: {
        heading:  ["var(--font-display)", "ui-sans-serif", "system-ui"],
        display:  ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans:     ["var(--font-body)", "ui-sans-serif", "system-ui"],
        body:     ["var(--font-body)", "ui-sans-serif", "system-ui"],
        mono:     ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
