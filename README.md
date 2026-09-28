# Chọn Ảnh — Preview & duyệt ảnh

Website cho phép quản trị viên tạo album, kết nối thư mục Google Drive, đồng bộ danh sách ảnh; người dùng xem, chọn, ghi chú và xác nhận ảnh; quản trị viên xem kết quả và xuất Excel.

## 1. Phân tích yêu cầu

- **Luồng chính:** tạo album → cấu hình nguồn Drive → đồng bộ → người dùng xem và chọn → ghi chú → xem lại → xác nhận → quản trị viên xem và xuất kết quả.
- **Ưu tiên trải nghiệm:** thao tác chọn ngay trên card và trong cửa sổ ảnh; cập nhật số ảnh đã chọn mà không tải lại trang; tìm kiếm/lọc; giao diện desktop, tablet và mobile.
- **Quy tắc:** min/max có thể cấu hình theo album; không cho chọn vượt max hoặc xác nhận dưới min; ghi chú và sửa sau xác nhận có thể bật/tắt.
- **An toàn:** xác thực và phân quyền được kiểm tra ở API; khóa Drive ở máy chủ; ảnh Drive được tải qua API máy chủ.
- **Hiệu năng:** API trả tối đa 30 ảnh mỗi lần; ảnh nhỏ trong gallery, ảnh đầy đủ khi mở preview; ảnh tải lười.

## 2. Kiến trúc

```text
Trình duyệt (Next.js/React)
        │
        ├── Gallery, preview, chọn ảnh, ghi chú
        └── Quản trị album, kết quả, Excel
        │
Next.js API (Cloudflare Worker)
        ├── Xác thực ChatGPT và kiểm tra vai trò ADMIN/USER
        ├── Quy tắc album và lựa chọn
        ├── Google Drive API (khóa chỉ ở máy chủ)
        └── Cloudflare D1 (album, ảnh, phiên, ghi chú, lịch sử)
```

Ứng dụng dùng TypeScript, Next.js/Vinext, CSS responsive và D1. D1 là SQLite được nền tảng hosting cung cấp; nếu chuyển sang PostgreSQL, có thể thay tầng truy cập trong `lib/server.ts` và schema mà không phải thay UI. `lib/drive.ts` cô lập kết nối Drive. `services/api.ts` cô lập các lệnh gọi API phía trình duyệt. Trạng thái phiên là chuỗi nên có thể mở rộng thêm `REVIEWING`, `APPROVED`, `REJECTED`.

## 3. Cơ sở dữ liệu

Schema nguồn nằm ở `db/schema.ts`, migration ở `drizzle/`.

| Bảng | Nội dung chính |
| --- | --- |
| `users` | Người dùng, email, vai trò `ADMIN`/`USER` |
| `albums` | Tên, mô tả, thư mục Drive, min/max, ghi chú, sửa sau xác nhận, ngày, trạng thái |
| `images` | ID file Drive, tên, MIME, URL thumbnail/preview, trạng thái ảnh |
| `selection_sessions` | Một phiên mỗi người dùng và album, `DRAFT`/`SUBMITTED`, thời điểm xác nhận |
| `image_selections` | Trạng thái chọn, ghi chú, thời điểm chọn của từng ảnh |
| `audit_events` | Lịch sử tạo/sửa album, đồng bộ, chọn, ghi chú và xác nhận |

Các khóa ngoại và chỉ mục hỗ trợ truy vấn theo album, ảnh, phiên và người dùng. Ảnh không còn trong Drive được đánh dấu `MISSING`; lịch sử lựa chọn vẫn được giữ lại.

## 4. Sitemap

| URL | Màn hình |
| --- | --- |
| `/login` | Đăng nhập nếu chưa có phiên |
| `/albums` | Album đang mở |
| `/albums/[id]` | Gallery, tìm kiếm, lọc và preview |
| `/albums/[id]/selected` | Danh sách ảnh đã chọn |
| `/admin` | Dashboard |
| `/admin/albums` | Danh sách album |
| `/admin/albums/create` | Tạo album |
| `/admin/albums/[id]` | Sửa album và đồng bộ Drive |
| `/admin/albums/[id]/results` | Kết quả của album |
| `/admin/results` | Kết quả tất cả album và xuất Excel |
| `/admin/results/[id]` | Chi tiết lựa chọn |
| `/admin/users` | Danh sách người dùng |
| `/admin/settings` | Trạng thái kết nối và quyền truy cập |

## 5. UI/UX

Gallery có 4 cột trên desktop, 3 cột trên tablet và 2 cột trên mobile. Ảnh được chọn có viền, dấu tick và nhãn chữ. Preview hỗ trợ ảnh trước/sau, phóng to/thu nhỏ, vừa màn hình, toàn màn hình, chọn/bỏ chọn và ghi chú. Phím tắt: `←`, `→`, `Space`, `Esc`. Giao diện có skeleton, ảnh lỗi, danh sách rỗng và thông báo lỗi có cách thử lại.

## 6. Chạy tại máy

Yêu cầu Node.js 22.13+ hoặc 24+.

```bash
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_military_next_avengers.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_gigantic_miss_america.sql
npm run dev
```

Trong chế độ chạy thử tại máy, mở `/signin-with-chatgpt?return_to=/albums` để dùng đăng nhập giả lập của máy phát triển. Người dùng đầu tiên được cấp vai trò quản trị viên. Hệ thống không tự tạo album hoặc ảnh; tạo album trong trang quản trị rồi đồng bộ Drive.

## 7. Kết nối Google Drive

Trang **Cấu hình** chỉ hiển thị trạng thái kết nối. Để cấu hình khi chạy tại máy:

1. Tạo dự án trong Google Cloud và bật **Google Drive API**.
2. Sao chép `.dev.vars.example` thành `.dev.vars` trong thư mục gốc, rồi chọn **một** phương thức dưới đây.
3. Điền giá trị thật vào `.dev.vars`, khởi động lại `npm run dev`, rồi tải lại trang `/admin/settings`. File `.dev.vars` được Git bỏ qua.

| Biến môi trường | Cách dùng |
| --- | --- |
| `DRIVE_API_KEY` | Thư mục công khai: trong Google Drive, đặt quyền **Bất kỳ ai có đường liên kết → Người xem**. Tạo API key trong Google Cloud → **APIs & Services → Credentials** và giới hạn key cho Google Drive API. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Thư mục riêng tư: tạo service account và khóa JSON trong Google Cloud → **IAM & Admin → Service Accounts**. Lấy `client_email` và `private_key` từ JSON, đưa vào hai biến; chia sẻ thư mục Drive cho email service account với quyền Người xem. Giữ các ký tự `\n` trong giá trị khóa. |

Sau đó mở `/admin/albums/create`, nhập URL dạng `https://drive.google.com/drive/folders/...`, lưu album và bấm **Đồng bộ Google Drive**. Đồng bộ thêm ảnh mới, cập nhật ảnh thay đổi, đánh dấu ảnh không còn tồn tại và ghi thời điểm đồng bộ. Ảnh thực không được lưu hàng loạt trên máy chủ; chỉ metadata nằm trong cơ sở dữ liệu. File `.jpg`, `.jpeg`, `.png`, `.webp` được chấp nhận.

Khi triển khai, đặt các giá trị trên thành **secret** của Worker hoặc trong cấu hình bí mật của nền tảng hosting; file `.dev.vars` chỉ dùng tại máy.

## 8. Kiểm tra

- Không có dữ liệu album hoặc ảnh mẫu trong mã nguồn.

## 9. Cấu trúc chính

```text
app/                 Trang, CSS và API routes
components/          Giao diện gallery, preview và quản trị
services/api.ts      Các lệnh gọi API phía trình duyệt
lib/server.ts        Xác thực, quyền và quy tắc lựa chọn
lib/drive.ts         Kết nối Google Drive
lib/xlsx.ts          Xuất Excel
db/schema.ts         Schema dữ liệu
drizzle/             Migration SQL
types/               Kiểu dữ liệu dùng chung
```
