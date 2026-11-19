// Điểm vào của Cloudflare Worker.
// - Đường dẫn của nền tảng Base44 (/api/apps/**, /auth/**...) được chuyển tiếp sang Base44.
// - Mọi request còn lại do TanStack Start xử lý (SSR, server function, /api/vietqr-webhook).
// Handler của TanStack Start còn báo lỗi loader/beforeLoad của trang cho error-capture.
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { recordRouteError } from "@/lib/error-capture.server";
import { isPlatformPath, proxyToPlatform } from "@/lib/platform-proxy.server";

// Runs once the router has loaded the page.
const startHandler = createStartHandler((ctx) => {
  for (const match of ctx.router.state.matches) {
    if (match.status === "error") recordRouteError(ctx.request, match.error, match.routeId);
  }
  return defaultStreamHandler(ctx);
});

export default {
  fetch(request, env, ctx) {
    if (isPlatformPath(new URL(request.url).pathname)) return proxyToPlatform(request);
    return startHandler(request, env, ctx);
  },
};
