// Trên Base44 hosting, nền tảng tự phục vụ các đường dẫn của Base44 (API, trang MFA...) cùng domain với website.
// Trên Cloudflare, Worker chuyển tiếp (reverse proxy) các đường dẫn đó sang máy chủ Base44 để code frontend
// (serverUrl "" = cùng domain, đăng nhập MFA, upload ảnh...) chạy y như cũ mà không bị lỗi CORS.
import { getServerConfig } from "@/lib/base44-server.server";

// "/api/vietqr-webhook" là route của app nên KHÔNG nằm trong danh sách này.
const PLATFORM_PREFIXES = ["/api/apps/", "/api/app-logs/", "/ws-user-apps/", "/auth/"];

export const isPlatformPath = (pathname) => PLATFORM_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export function proxyToPlatform(request) {
  const url = new URL(request.url);
  const { serverUrl } = getServerConfig();
  const target = new URL(`${url.pathname}${url.search}`, serverUrl);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return fetch(new Request(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: "manual" }));
}
