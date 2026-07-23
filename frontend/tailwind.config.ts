import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "rose-ground-dark": "#170610",
        "rose-surface-dark": "#27101C",
        "rose-tint-dark": "#3D1828",
        "rose-rim-dark": "#5C2038",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", '"Times New Roman"', "Times", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
