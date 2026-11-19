// Trang chẩn đoán kết nối Worker -> Base44 (mở /api/diag). Không trả bí mật, chỉ trạng thái.
import { env } from "cloudflare:workers";
import { getServerConfig } from "@/lib/base44-server.server";

async function probe(url, init) {
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    return { status: response.status, body: text.slice(0, 300) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

export async function runDiagnostics() {
  const { appId, serverUrl } = getServerConfig();
  const base = `${serverUrl}/api/apps/${appId}`;
  return {
    appId,
    serverUrl,
    appIdLooksValid: /^[a-f0-9]{24}$/i.test(appId),
    gatewaySecretSetOnCloudflare: Boolean(env.GATEWAY_SECRET),
    // 200 + dữ liệu = Worker đọc được Base44.
    readTours: await probe(`${base}/entities/Tour/v2/list?limit=1`),
    // 401 = cfGateway đã deploy và đang chặn mã sai (đúng). 404 = chưa deploy cfGateway.
    cfGatewayDeployed: await probe(`${base}/functions/cfGateway`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "diagnostic" }),
    }),
  };
}
