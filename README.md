# Kiro Edge Proxy 🚀

Kiro Edge Proxy là một Reverse Proxy siêu tốc dành cho AI, được thiết kế theo kiến trúc **Serverless/Edge** (chạy trên Cloudflare Workers hoặc Vercel Edge). Hệ thống giúp chuyển đổi các yêu cầu theo chuẩn OpenAI hoặc Anthropic Claude thành các yêu cầu tương thích với mạng lưới AWS Bedrock / Amazon Q (CodeWhisperer).

Được tái cấu trúc từ nền tảng Kiro-Go, Kiro Edge loại bỏ sự phụ thuộc vào Docker/VPS, mang lại tốc độ phản hồi tính bằng mili-giây và khả năng tự động mở rộng không giới hạn.

## ✨ Tính năng nổi bật

- **Tương thích hoàn hảo (100% Drop-in):** Hỗ trợ chuẩn API của OpenAI (`/v1/chat/completions`) và Claude (`/v1/messages`). Tích hợp thẳng vào các phần mềm chat như NextChat, Chatbox, Cursor mà không cần thay đổi.
- **Account Pool & Auto Failover:** Tự động xoay vòng tài khoản (Round-robin) để tránh nghẽn. Tự động chuyển tài khoản khi gặp lỗi *Rate limit (429)* và tự khóa (ban) khi tài khoản bị đình chỉ.
- **Vision (Multi-modal):** Hỗ trợ đầy đủ tính năng phân tích hình ảnh (Base64) của Claude 3.5 Sonnet và GPT-4o.
- **Tool Calling:** Tương thích chuẩn gọi hàm (Function Calling / Tool Use) và truyền Event Stream về máy trạm theo thời gian thực (Server-Sent Events).
- **In-Memory Caching & Circuit Breaker:** Sử dụng Cache cấp độ Edge giúp tiết kiệm truy vấn KV, kết hợp với Bộ ngắt mạch (Circuit Breaker) bảo vệ hệ thống khỏi sự cố sập dây chuyền.
- **Admin Dashboard:** Tích hợp giao diện quản lý trên web (`/admin`) cùng bộ API DevOps (`/metrics`, `/logs`, `/health`).

## 📂 Kiến trúc dự án (Clean Architecture)

Dự án tuân thủ mô hình Domain-Driven Design giúp dễ dàng bảo trì và mở rộng:

```text
src/
├── core/           # Nơi khởi tạo Hono app, Global Middlewares & Error Handling
├── middlewares/    # Custom Middlewares (như Rate Limiter)
├── modules/        # Chia theo chức năng:
│   ├── account/    # - Pool xoay vòng và Giao tiếp Cloudflare KV
│   ├── admin/      # - Admin API & Webhooks
│   └── chat/       # - Xử lý lõi Proxy, Translation và Streaming
├── utils/          # Tiện ích: Zod Validator, Logger
└── index.ts        # Entry point siêu nhẹ xuất khẩu Hono App
```

## 🚀 Hướng dẫn Triển khai (Deployment)

Dự án có thể chạy trên cả **Cloudflare Workers** (khuyên dùng) và **Vercel Edge Functions**.

### 1. Triển khai lên Cloudflare Workers

**Bước 1:** Cài đặt dependencies
```bash
npm install
```

**Bước 2:** Tạo Database KV cho Pool tài khoản
```bash
npx wrangler kv:namespace create "KIRO_KV"
```
*Sau khi chạy lệnh trên, copy chuỗi ID được cấp và dán vào file `wrangler.jsonc` tại mục `id`.*

**Bước 3:** Deploy
```bash
npm run deploy
```
*(Hoặc bạn có thể push code lên nhánh `main` của Github để hệ thống CI/CD tự động deploy).*

### 2. Triển khai lên Vercel Edge

Dự án đã được bọc sẵn Entry Point cho Vercel tại `api/index.ts`.

1. Đẩy mã nguồn này lên Github.
2. Đăng nhập vào [Vercel](https://vercel.com) và chọn **Import Project**.
3. Tại mục Environment Variables, thêm biến:
   - `ACCOUNTS_JSON`: Chứa mảng JSON danh sách cấu hình tài khoản AWS của bạn (Do Vercel không có KV nên sẽ đọc từ biến môi trường này).
4. Nhấn **Deploy** (Vercel sẽ tự nhận diện file `vercel.json` để cấu hình luồng chạy).

## ⚙️ Thiết lập Local Development

Nếu bạn muốn chạy thử nghiệm cục bộ trên máy tính:

```bash
# Cài đặt thư viện
npm install

# Tạo file biến môi trường (nếu cần)
echo "ACCOUNTS_JSON='[{\"id\":\"demo\",\"enabled\":true}]'" > .dev.vars

# Chạy server ở chế độ dev
npm run dev
```

Server sẽ khởi chạy tại: `http://localhost:8787`

## 🔒 Biến môi trường (Environment Variables)

| Biến | Nền tảng | Mô tả |
|------|----------|-------|
| `ACCOUNTS_JSON` | Vercel / Local | Chuỗi JSON chứa danh sách tài khoản nếu không dùng Cloudflare KV. |
| `ADMIN_PASSWORD` | Tất cả | Mật khẩu đăng nhập trang `/admin`. |

---
*Phát triển bởi đội ngũ Kiro.*
