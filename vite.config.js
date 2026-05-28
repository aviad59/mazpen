import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["favicon.ico", "icons/*.png"],
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
                    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
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
