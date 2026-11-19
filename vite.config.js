import { readFileSync } from "node:fs";
import base44 from "@base44/vite-plugin";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Every runtime dependency is bundled at startup, for the browser and the SSR worker: one first imported
// mid-session makes Vite re-bundle, and a page rendered meanwhile on the server loads a second React.
// Not listed: React itself, the TanStack Start/Router framework (its plugin bundles it) and build-time plugins.
const NOT_PREBUNDLED = new Set(["react", "react-dom", "@base44/vite-plugin", "@tanstack/react-start", "@tanstack/react-router", "@tanstack/react-router-ssr-query", "tailwindcss-animate"]);
const { dependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// The SDK's realtime transports: not direct dependencies, but app code importing one would otherwise be a new one.
const SDK_TRANSPORTS = ["partysocket", "socket.io-client"];
const PREBUNDLE = [...Object.keys(dependencies).filter((name) => !NOT_PREBUNDLED.has(name)), ...SDK_TRANSPORTS];
// In dev the browser otherwise fetches the router as ~100 separate files after the load event, delaying hydration
// by seconds behind the preview proxy. Browser only, and every browser entry point of the router, so one copy loads
// (templates/tests/tanstack-dev-router checks it).
const BROWSER_PREBUNDLE = [
  "@tanstack/react-router", "@tanstack/react-router/ssr/client", "@tanstack/router-core", "@tanstack/router-core/isServer",
  "@tanstack/router-core/ssr/client",
  "@tanstack/router-core/scroll-restoration-script", "@tanstack/history", "@tanstack/start-fn-stubs",
  "seroval", "seroval-plugins/web", "cookie-es",
];

const BASE44_EDITOR = process.env.BASE44_EDITOR === "1";

// App ID của Base44 (không phải bí mật, nó nằm trong bundle trình duyệt). Lấy từ biến môi trường VITE_BASE44_APP_ID
// nếu có, nếu không thì đọc từ app.config.json để build trên Cloudflare không cần cấu hình biến nào.
const { base44AppId } = JSON.parse(readFileSync(new URL("./app.config.json", import.meta.url), "utf8"));
if (!process.env.VITE_BASE44_APP_ID && /^[a-f0-9]{24}$/i.test(base44AppId)) process.env.VITE_BASE44_APP_ID = base44AppId;
if (!/^[a-f0-9]{24}$/i.test(process.env.VITE_BASE44_APP_ID || "")) {
  console.warn("\n[gentravel] CHƯA có App ID Base44 hợp lệ. Mở app.config.json và điền base44AppId (24 ký tự a-f, 0-9).\n");
}

export default defineConfig({
  optimizeDeps: { include: [...PREBUNDLE, ...BROWSER_PREBUNDLE] },
  environments: {
    ssr: {
      optimizeDeps: { include: PREBUNDLE },
      // Source maps for the Worker only, never served: they let Base44 point an error's stack at the app's own
      // files. Without the sources, so the app's code isn't copied into them. The browser build gets none.
      build: { sourcemap: true, rolldownOptions: { output: { sourcemapExcludeSources: true } } },
    },
  },
  plugins: [
    // Các hook của trình soạn thảo Base44 (preview bridge, analytics, visual edit) chỉ cần khi chỉnh sửa trong Base44.
    // Trên Cloudflare tắt hết; đặt BASE44_EDITOR=1 khi build nếu muốn bật lại.
    base44({
      hmrNotifier: BASE44_EDITOR,
      navigationNotifier: BASE44_EDITOR,
      analyticsTracker: BASE44_EDITOR,
      visualEditAgent: BASE44_EDITOR,
    }),
    // No inspector: a restarted dev server would race the old one for port 9229 and crash.
    cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: false }),
    tanstackStart({ srcDirectory: "src" }),
    react(),
  ],
});
