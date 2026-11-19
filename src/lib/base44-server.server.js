// Khách Base44 cho code chạy trên Cloudflare Worker (thay cho createClientFromRequest của nền tảng Base44).
//
// Trên Base44 hosting, nền tảng tự gắn các header Base44-App-Id / Base44-Service-Authorization vào mỗi request.
// Trên Cloudflare không có các header đó nên ta tự dựng client:
//  - user client: gọi API Base44 bằng token của người truy cập (RLS vẫn áp dụng như cũ).
//  - asServiceRole: Base44 không cấp service role cho backend ngoài nền tảng, nên mọi thao tác service role
//    đi qua backend function "cfGateway" (base44/functions/cfGateway) bằng mã bí mật GATEWAY_SECRET.
import { createClient } from "@base44/sdk";
import { env } from "cloudflare:workers";

const GATEWAY_FUNCTION = "cfGateway";
const DEFAULT_SERVER_URL = "https://base44.app";

export const getServerConfig = () => ({
  appId: import.meta.env.VITE_BASE44_APP_ID || env.BASE44_APP_ID || "",
  serverUrl: (env.BASE44_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/$/, ""),
});

const bearerFrom = (request) => {
  const value = request.headers.get("Authorization");
  return value && /^Bearer\s+\S+$/i.test(value) ? value.split(/\s+/)[1] : undefined;
};

const toError = (error) => {
  const payload = error?.data?.error ?? error?.response?.data?.error ?? null;
  const message = payload?.message ?? error?.data?.message ?? error?.message ?? "Gateway error";
  return Object.assign(new Error(message), {
    status: payload?.status ?? error?.status ?? error?.response?.status ?? 500,
    data: payload?.data ?? error?.data ?? null,
  });
};

function createServiceRole({ appId, serverUrl }) {
  const gateway = createClient({ appId, serverUrl, analytics: { enabled: false } });

  const call = async (payload) => {
    const secret = env.GATEWAY_SECRET;
    if (!secret) throw Object.assign(new Error("Thiếu GATEWAY_SECRET trên Cloudflare Worker."), { status: 500 });
    try {
      const response = await gateway.functions.invoke(GATEWAY_FUNCTION, { secret, ...payload });
      return response?.data?.result ?? null;
    } catch (error) {
      throw toError(error);
    }
  };

  // Proxy trả về hàm cho mọi tên thuộc tính, ngoại trừ "then"/symbol để await không bị nhầm là thenable.
  const methodsOf = (entity) =>
    new Proxy({}, {
      get: (_target, method) =>
        typeof method === "string" && method !== "then" ? (...args) => call({ op: "entity", entity, args, method }) : undefined,
    });

  return {
    entities: new Proxy({}, {
      get: (_target, entity) => (typeof entity === "string" && entity !== "then" ? methodsOf(entity) : undefined),
    }),
    integrations: {
      Core: new Proxy({}, {
        get: (_target, name) =>
          typeof name === "string" && name !== "then" ? (...args) => call({ op: "integration", name, args }) : undefined,
      }),
    },
  };
}

export function createWorkerClient(request) {
  const { appId, serverUrl } = getServerConfig();
  if (!appId) throw new Error("Chưa cấu hình App ID Base44: điền base44AppId trong app.config.json rồi build/deploy lại.");
  const client = createClient({ appId, serverUrl, token: bearerFrom(request), analytics: { enabled: false } });
  const serviceRole = createServiceRole({ appId, serverUrl });
  Object.defineProperty(client, "asServiceRole", { configurable: true, get: () => serviceRole });
  return client;
}
