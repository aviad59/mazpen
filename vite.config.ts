import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.jpg"],
      manifest: {
        name: "מצפן — מעקב דיונים",
        short_name: "מצפן",
        description: "מעקב דיונים מבצעי",
        theme_color: "#1e40af",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        lang: "he",
        dir: "rtl",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.jpg", sizes: "192x192", type: "image/jpeg" },
          { src: "/icons/icon-512.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,jpg,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: { cacheName: "supabase-cache", networkTimeoutSeconds: 10 },
          },
        ],
      },
      // Custom service worker for push notifications
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        request: fileURLToPath(new URL("request.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
