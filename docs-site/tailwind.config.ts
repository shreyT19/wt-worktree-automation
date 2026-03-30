import type { Config } from "tailwindcss";
import { createPreset } from "fumadocs-ui/tailwind-plugin";

const config: Config = {
  content: [
    "./node_modules/fumadocs-ui/dist/**/*.js",
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
  ],
  presets: [createPreset()],
  theme: {
    extend: {},
  },
};

export default config;
