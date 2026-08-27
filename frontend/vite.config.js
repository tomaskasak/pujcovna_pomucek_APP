import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Ve vývoji Vite dev server proxuje volání /api na backend (výchozí http://localhost:4000).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
