import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the repo name for GitHub Pages project sites:
// https://kofifs.github.io/DND/
export default defineConfig({
  base: "/DND/",
  plugins: [react()],
});
