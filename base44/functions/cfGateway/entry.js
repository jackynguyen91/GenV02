// Cổng "service role" cho website chạy trên Cloudflare.
// Base44 chỉ cấp quyền service role cho backend function chạy trên Base44, nên Worker trên Cloudflare
// gọi function này (kèm mã bí mật GATEWAY_SECRET) để đọc/ghi dữ liệu bỏ qua RLS, gửi email và gọi AI.
// Chỉ cho phép đúng các entity và thao tác mà website cần.
import { createClientFromRequest } from "npm:@base44/sdk";
import { secrets } from "base44:runtime";

const ENTITIES = new Set(["ActivityLog", "BankSetting", "BlogCategory", "BlogPost", "Booking", "Customer", "Departure", "Destination", "MediaAsset", "Partner", "Passenger", "Payment", "ReportSetting", "Review", "Service", "ServiceRequest", "Setting", "Tour", "TourCost", "User"]);
const METHODS = new Set(["list", "filter", "get", "create", "bulkCreate", "update", "bulkUpdate", "delete", "count", "aggregate"]);
const INTEGRATIONS = new Set(["SendEmail", "InvokeLLM"]);

const json = (body, status = 200) => Response.json(body, { status });

// So sánh không lộ độ dài/thời gian.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed", status: 405 } }, 405);

  const expected = secrets.get("GATEWAY_SECRET");
  if (!expected || expected.length < 24) {
    return json({ error: { message: "GATEWAY_SECRET chưa được cấu hình (cần >= 24 ký tự).", status: 503 } }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Body không hợp lệ", status: 400 } }, 400);
  }
  if (!safeEqual(String(body?.secret ?? ""), expected)) {
    return json({ error: { message: "Unauthorized", status: 401 } }, 401);
  }

  const args = Array.isArray(body.args) ? body.args : [];
  try {
    const service = createClientFromRequest(req).asServiceRole;

    if (body.op === "entity") {
      if (!ENTITIES.has(body.entity) || !METHODS.has(body.method)) {
        return json({ error: { message: "Thao tác không được phép", status: 403 } }, 403);
      }
      const result = await service.entities[body.entity][body.method](...args);
      return json({ result: result ?? null });
    }

    if (body.op === "integration") {
      if (!INTEGRATIONS.has(body.name)) {
        return json({ error: { message: "Tích hợp không được phép", status: 403 } }, 403);
      }
      const result = await service.integrations.Core[body.name](...args);
      return json({ result: result ?? null });
    }

    return json({ error: { message: "op không hợp lệ", status: 400 } }, 400);
  } catch (error) {
    const status = Number(error?.status ?? error?.response?.status) || 500;
    return json({ error: { message: String(error?.message ?? "Gateway error"), status, data: error?.data ?? null } }, status);
  }
}
