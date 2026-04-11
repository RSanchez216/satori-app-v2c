import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* Base surfaces */
        "bg-base":     "#080d14",
        "bg-surface":  "#0d1117",
        "bg-elevated": "#111827",
        "bg-card":     "#111820",
        "bg-hover":    "#161e28",
        /* Borders */
        "border-subtle":  "#1e2530",
        "border-default": "#243040",
        /* Accent */
        accent: {
          DEFAULT: "#3ecfcf",
          dim:     "rgba(62,207,207,0.12)",
          glow:    "rgba(62,207,207,0.25)",
        },
        /* Text */
        "text-primary":   "#e6edf3",
        "text-secondary": "#8d96a0",
        "text-muted":     "#3a4555",
        /* Severity */
        severity: {
          critical: "#f85149",
          high:     "#e3b341",
          medium:   "#3ecfcf",
          low:      "#56d364",
        },
        "kb-purple": "#b392f0",
      },
      borderColor: {
        DEFAULT: "#1e2530",
      },
      boxShadow: {
        "card":        "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        "card-hover":  "0 4px 16px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)",
        "accent-glow": "0 0 20px rgba(62,207,207,0.2)",
      },
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
      },
    },
  },
  plugins: [],
};
export default config;
