# Hướng dẫn chạy GenTravel trên Cloudflare Workers (dữ liệu vẫn ở Base44)

> **App Base44 của bản này:** App ID `6afd64fe9b61ca64e1609eca` (đã điền sẵn trong `app.config.json`). Tên Worker mặc định: `gentravel`.

## 0. Tóm tắt thứ tự làm (đọc trước)

1. **Publish app trên Base44** (nút Publish ở góc trên bên phải trình soạn thảo). App chỉ xem trước có thể bị Base44 từ chối với thông báo "This app is not yet available".
2. **Đưa code lên GitHub** (xem mục 5), kết nối Cloudflare với repo đó, đặt **tên Worker = `gentravel`** (hoặc sửa `"name"` trong `wrangler.jsonc` cho trùng tên Worker của bạn).
3. Mở `https://<worker>.<tài-khoản>.workers.dev` → trang chủ phải hiện dữ liệu.
4. Mở `/api/diag` để kiểm tra kết nối Base44 và cổng `cfGateway`.
5. Làm mục 3 (cổng `cfGateway`) để **đặt tour, thanh toán, email, quản trị, gợi ý AI** hoạt động.


## 1. Kiến trúc sau khi chuyển

```
Trình duyệt ──► Cloudflare Worker (gentravel)
                 ├─ Trang web (SSR) + file tĩnh (dist/client)
                 ├─ Server function / webhook VietQR (/api/vietqr-webhook)
                 ├─ Reverse proxy: /api/apps/**, /auth/**, /api/app-logs/**, /ws-user-apps/**  ──► base44.app
                 └─ Đọc dữ liệu công khai & dữ liệu theo quyền người dùng ──► API Base44
                 └─ Thao tác "service role" (tạo booking, review, email...) ──► function cfGateway trên Base44
```

- **Frontend + SSR + server function** chạy trên Cloudflare.
- **Dữ liệu, tài khoản đăng nhập, upload ảnh, gửi email** vẫn nằm ở Base44 (không phải di chuyển dữ liệu).
- Base44 **không cấp quyền service role cho backend bên ngoài**, nên có thêm function `cfGateway`
  (thư mục `base44/functions/cfGateway`) chạy trên Base44, chỉ nhận lệnh khi có mã bí mật `GATEWAY_SECRET`.

## 2. Sửa lỗi "Thiếu App ID" (Something went wrong)

Lỗi `Chưa cấu hình App ID Base44` (hoặc bản cũ: `Thiếu VITE_BASE44_APP_ID`) nghĩa là website chưa biết nó phải đọc dữ liệu từ app Base44 nào.
Cách sửa **chỉ cần làm một lần**, không cần cấu hình biến môi trường trên Cloudflare:

1. **Lấy App ID** của app Base44: mở app trong trình soạn thảo Base44, nhìn thanh địa chỉ:
   `https://app.base44.com/apps/`**`0123456789abcdef01234567`**`/editor/...`
   Chuỗi **24 ký tự** (chỉ gồm 0-9 và a-f) nằm giữa `/apps/` và `/editor/` chính là App ID.
2. Mở file **`app.config.json`** ở thư mục gốc project và thay chữ `DAN_APP_ID_BASE44_VAO_DAY`:
   ```json
   {
     "base44AppId": "0123456789abcdef01234567"
   }
   ```
3. **Build và deploy lại** (mục 4 hoặc 5). App ID không phải bí mật (nó nằm trong code trình duyệt), nên có thể commit file này lên GitHub.

> Tên Worker trong `wrangler.jsonc` đang là `gentravel` (khớp với `<tên-worker>.<tài-khoản>.workers.dev`). Nếu Worker của bạn tên khác, sửa `"name"` cho **trùng đúng** tên Worker trên Cloudflare, nếu không Workers Builds sẽ báo lỗi.

Sau bước này các trang công khai (trang chủ, tour, cẩm nang) đã hiện dữ liệu. Các chức năng **đặt tour, đánh giá, thanh toán VietQR, gửi email** cần thêm Bước 3 (`cfGateway`).

## 3. Cổng `cfGateway` trên Base44 (cho đặt tour, thanh toán, email)

**Làm ở đâu:** trong VS Code, mở **Terminal** (menu Terminal → New Terminal), đảm bảo dòng lệnh đang ở thư mục project, ví dụ `PS D:\WEB3>`.
Chạy từng lệnh dưới đây, mỗi lần một lệnh, nhấn Enter và chờ xong rồi mới chạy lệnh kế tiếp.

**Bước 3.1 – Tạo mã bí mật `GATEWAY_SECRET`** (40 ký tự). Trong PowerShell:
```powershell
-join ((1..40) | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] })
```
Terminal in ra một dòng như `3f9a0c...`. **Copy dòng đó và lưu vào Notepad**, bạn dùng đúng mã này ở Bước 3.4 và khi thêm vào Cloudflare.

**Bước 3.2 – Cài Base44 CLI và đăng nhập** (cần Node.js 20.19 trở lên, kiểm tra bằng `node -v`):
```powershell
npm install -g base44@latest
base44 login
```
`base44 login` hiện một đường link và một mã. Mở link trong trình duyệt, nhập mã, đăng nhập tài khoản Base44 đã tạo ra app.

**Bước 3.3 – Liên kết project với app Base44 hiện có:**
```powershell
base44 link
```
CLI hỏi chọn tạo mới hay liên kết với dự án đã có: chọn **liên kết với dự án đã có (existing)**, rồi chọn đúng app GenTravel (App ID `6afd64fe9b61ca64e1609eca`). Xong CLI tạo file `base44/.app.jsonc` (đừng commit file này lên GitHub).

**Bước 3.4 – Đặt secret cho Base44** (có dấu `=`, không có khoảng trắng quanh `=`, thay bằng mã ở Bước 3.1):
```powershell
base44 secrets set GATEWAY_SECRET=3f9a0c...dán-mã-của-bạn
```

**Bước 3.5 – Đưa function `cfGateway` lên Base44:**
```powershell
base44 functions deploy cfGateway
```
> Không chạy `base44 deploy` (không kèm `functions`), vì lệnh đó đẩy toàn bộ entity và site lên Base44.

Nếu bạn đã Publish app từ trình soạn thảo Base44, hãy **Publish lại một lần** để bản đã publish nhận secret mới.

**Bước 3.6 – Kiểm tra function** (PowerShell):
```powershell
Invoke-RestMethod -Method Post -Uri "https://base44.app/api/apps/6afd64fe9b61ca64e1609eca/functions/cfGateway" -ContentType "application/json" -Body '{"secret":"sai"}'
```
Kết quả đúng là báo lỗi **401 Unauthorized** (function đã chạy và đang chặn mã sai). Nếu báo 404: function chưa deploy hoặc gói Base44 chưa hỗ trợ Backend Functions.

**Bước 3.7 – Đặt cùng mã bí mật vào Cloudflare** (làm một trong hai cách):
- Trên web: Cloudflare → **Workers & Pages** → Worker của bạn (`gentravel`) → **Settings** → **Variables and Secrets** → **Add** → Type **Secret**, Variable name `GATEWAY_SECRET`, Value là mã ở Bước 3.1 → **Deploy**.
- Hoặc bằng lệnh trong thư mục project: `npx wrangler secret put GATEWAY_SECRET`, rồi dán mã khi được hỏi.

Sau đó mở `/api/diag` của website: dòng `cfGatewayDeployed` phải là 401 và `gatewaySecretSetOnCloudflare` là `true`.

## 4. Cách A – Deploy từ máy tính (nhanh nhất)

```bash
npm install
npx wrangler login
npm run deploy
npx wrangler secret put GATEWAY_SECRET     # dán mã bí mật ở mục 3, nhấn Enter
```
`npm run deploy` = build + đưa lên Cloudflare; kết quả in ra địa chỉ `https://gentravel.<tài-khoản>.workers.dev`.

## 5. Cách B – Tự động deploy từ GitHub (Workers Builds)

1. Đảm bảo `app.config.json` đã có App ID và đã commit; **không** commit `node_modules`, `dist`, `.env`.
2. Cloudflare → **Workers & Pages** → chọn Worker `gentravel` → **Settings** → **Builds** → kết nối repository GitHub.
3. Điền:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** thư mục chứa `package.json` (nếu project nằm trong thư mục con, ví dụ `gentravel`).
4. **Settings → Variables and Secrets → Add**: Type **Secret**, Name `GATEWAY_SECRET`, Value là mã ở Bước 3.
5. Mỗi lần `git push` Cloudflare tự build và deploy lại. Xem lỗi build ở tab **Builds**.

## 6. Tên miền riêng

Cloudflare → Workers & Pages → `gentravel` → Settings → Domains & Routes → Add → Custom domain
(domain phải nằm trên Cloudflare DNS). Sau đó thêm domain này vào danh sách domain được phép của app trong Base44
(nếu đăng nhập Google/MFA báo lỗi redirect – xem mục 8).

## 7. Kiểm tra sau deploy

| Kiểm tra | Cách làm | Kết quả đúng |
| --- | --- | --- |
| Trang chủ có tour | Mở `/` và `/tours` | Hiện danh sách tour từ Base44 |
| Đặt tour (service role) | Đặt thử 1 tour ở trang chi tiết | Hiện mã `BK-xxxx`, đơn xuất hiện trong Base44 và admin, có email xác nhận |
| Đăng nhập | `/login` bằng tài khoản admin | Vào được `/admin` |
| Upload ảnh tour | Admin → Tour → ảnh | Upload thành công |
| Webhook VietQR | Admin → Cài đặt thanh toán, dùng URL `https://<domain>/api/vietqr-webhook` kèm token | `curl` GET trả `{"ok":true,...}` |

Xem log thời gian thực: `npx wrangler tail`.

### Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| "Chưa cấu hình App ID Base44" | Chưa điền `app.config.json` hoặc chưa build/deploy lại sau khi điền (mục 2) |
| Trang hiện nhưng không có tour | App ID sai, hoặc entity `Tour` trên Base44 chưa cho phép đọc công khai |
| Đặt tour báo lỗi / "Thiếu GATEWAY_SECRET" | Chưa chạy `wrangler secret put GATEWAY_SECRET` hoặc mã khác với bên Base44 |
| Đặt tour báo 401 | Mã `GATEWAY_SECRET` ở Cloudflare khác mã trên Base44, đặt lại cho trùng ở cả hai nơi |
| Đặt tour báo 404 | Chưa `base44 functions deploy cfGateway` |
| Lỗi 1102 (Worker exceeded CPU) | Gói Free giới hạn 10 ms CPU, nâng lên Workers Paid |

### Lỗi "This app is not yet available. Please check back later."

Thông báo này do **chính Base44 trả về**: website trên Cloudflare đã gọi đúng địa chỉ, nhưng Base44 từ chối vì app chưa sẵn sàng phục vụ bên ngoài.

1. Sau khi deploy bản mới, mở `https://<worker>.<tài-khoản>.workers.dev/api/diag`. Trang này cho biết Base44 trả lời gì cho Worker:
   - `readTours.status = 200` và có dữ liệu → Worker đọc được Base44, tải lại trang chủ.
   - `readTours.body` chứa "not yet available" → làm bước 2.
   - `cfGatewayDeployed.status = 401` → cổng `cfGateway` đã sẵn sàng; `404` → chưa `base44 functions deploy cfGateway`.
2. **Publish app trong Base44** (nút **Publish** ở góc trên bên phải trình soạn thảo, bước nhấn Publish lần đầu và chờ báo thành công). Một app mới chỉ chạy ở chế độ xem trước (`/editor/preview`) thường chưa phục vụ API công khai.
3. Kiểm tra đúng app: App ID trong `app.config.json` phải trùng App ID trong URL của chính app đã Publish.
4. Dán thử vào trình duyệt (thay App ID): `https://base44.app/api/apps/<APP_ID>/entities/Tour/v2/list?limit=1`. Nếu trình duyệt cũng nhận thông báo "not yet available" thì lỗi nằm hoàn toàn ở phía Base44 (chưa publish, app bị tạm dừng hoặc hết hạn gói), không phải do Cloudflare.

## 8. Những điều cần biết / có thể phải xử lý

1. **Phụ thuộc Base44**: dữ liệu, đăng nhập, email vẫn do Base44 cung cấp. Nếu ngừng gói/xoá app Base44 thì website mất dữ liệu.
2. **Đăng nhập Google/Microsoft và MFA**: luồng này do máy chủ Base44 điều hướng và quay về `from_url`. Đã proxy `/auth/**` và
   `/api/apps/**` để chạy cùng domain, nhưng cần **thử thật** trên domain mới; nếu Base44 chặn domain lạ, liên hệ hỗ trợ Base44
   để thêm domain vào danh sách cho phép. Đăng nhập email + mật khẩu không bị ảnh hưởng.
3. **Giới hạn CPU gói Free của Workers (10 ms/request)**: trang render phía server có thể vượt và báo lỗi 1102. Khi gặp, nâng lên
   Workers Paid (5 USD/tháng, 30 giây CPU). Dung lượng bundle hiện ~1,25 MB gzip, nằm trong giới hạn 3 MB của gói Free.
4. **Độ trễ**: mỗi lần render Worker gọi API Base44 nên chậm hơn D1 nội bộ. Có thể cache các trang công khai bằng
   `Cache-Control: public, s-maxage=...` trong `headers()` của route (xem `AGENTS.md`).
5. **Bảo mật**: `GATEWAY_SECRET` chỉ nằm ở secret của Base44 và Cloudflare, không đưa vào `VITE_*`, không commit.
   Function `cfGateway` chỉ cho phép 20 entity của app, các thao tác đọc/ghi dữ liệu, gửi email và gọi AI (InvokeLLM).
   Đổi secret: đặt lại ở cả hai nơi (`base44 secrets set` + `wrangler secret put`).
6. File `public/gentravel-source.zip` trong bản gốc đã bị xoá để không vô tình công khai mã nguồn trên website.
7. Các gói AI (`@tanstack/ai*`) và `ai.server.js` đã gỡ vì không được dùng và gây lỗi `npm install` (xung đột peer dependency).

## 9. Các file đã thay đổi

| File | Việc |
| --- | --- |
| `src/lib/base44-server.server.js` (mới) | Dựng client Base44 trong Worker và `asServiceRole` đi qua cổng |
| `src/lib/platform-proxy.server.js` (mới) | Reverse proxy đường dẫn nền tảng Base44 |
| `src/server.js` | Điểm vào Worker: proxy + TanStack Start |
| `src/routes/api/diag.js`, `src/lib/diag.server.js` (mới) | Trang chẩn đoán kết nối `/api/diag` |
| `src/lib/auth-middleware.js` | Dùng `createWorkerClient` thay `createClientFromRequest` |
| `base44/functions/cfGateway/*` (mới) | Function service role chạy trên Base44 |
| `vite.config.js` | Tắt hook trình soạn thảo Base44 (bật lại bằng `BASE44_EDITOR=1`) |
| `app.config.json` (mới) | Nơi điền App ID Base44 |
| `wrangler.jsonc`, `.env.example`, `package.json` | Cấu hình Cloudflare (tên Worker `gentravel`), script `deploy`, gỡ gói AI |
