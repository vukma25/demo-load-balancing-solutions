# Demo: Cân bằng tải cục bộ (Local/PLB) với HAProxy

## Giới thiệu

Đây là demo thực nghiệm minh họa lớp **cân bằng tải cục bộ (Local Load Balancing / PLB)**
trình bày trong báo cáo **"Nghiên cứu triển khai giải pháp cân bằng tải đa lớp: kết hợp định tuyến toàn cầu và cân bằng tải cục bộ"**.

Demo dựng 3 backend server giống nhau, đặt phía sau **HAProxy** 
(cổng `8081`, kèm Stats Dashboard ở cổng `8404`) — load balancer chuyên biệt

## Cấu trúc thư mục

```
haproxy-lb/
├── docker-compose.yml     # Định nghĩa 3 backend + HAProxy
├── loadtest.js            # Script giả lập tải, đo hiệu năng và phân phối traffic
├── backend/
│   └── server.js          # Backend Node.js đơn giản, trả về "Server ID: X"
└── haproxy/
    └── haproxy.cfg         # Cấu hình HAProxy (thuật toán đã comment sẵn để dễ đổi)
```

## Yêu cầu môi trường

- Docker Desktop đã cài đặt và **đang chạy** (kiểm tra bằng `docker version`, phần
  `Server` phải hiển thị thông tin, không báo lỗi kết nối)
- Node.js (tùy chọn — chỉ cần nếu muốn chạy `loadtest.js` trực tiếp trên máy thay vì qua
  container, xem mục "Đo hiệu năng" bên dưới)

## Cách chạy

### 1. Khởi động toàn bộ hệ thống

```bash
cd haproxy-lb
docker compose up -d
```

Kiểm tra tất cả container đã chạy:

```bash
docker compose ps
```

Phải thấy 4 container ở trạng thái `running`: `backend1`, `backend2`, `backend3`, `haproxy-lb`.

### 3. Xem HAProxy Stats Dashboard

Mở trình duyệt: [http://localhost:8404/stats](http://localhost:8404/stats)

Đây là bảng giám sát trực quan có sẵn của HAProxy — hiển thị trạng thái từng backend,
số kết nối, tổng request đã xử lý.

## Đổi thuật toán cân bằng tải

Mở `haproxy/haproxy.cfg`, đổi dòng `balance roundrobin` thành thuật toán khác
(`leastconn`, `source`, `uri`...), sau đó:

```bash
docker compose restart haproxy-lb
```

## Test cơ chế Health Check / Failover

Giả lập một backend bị sập:

```bash
docker stop backend2
```

Mở lại Stats Dashboard, `backend2` sẽ chuyển sang màu đỏ (DOWN) gần
  như ngay lập tức nhờ cơ chế active health check.

Khôi phục lại:

```bash
docker start backend2
```

## Đo hiệu năng bằng loadtest.js

```bash
node loadtest.js http://localhost:8081 1000 20
```

Tham số theo thứ tự: URL, tổng số request, số request đồng thời.

Nếu máy chưa cài Node.js, chạy qua container có sẵn:

```bash
docker run --rm -v "${PWD}:/app" -w /app node:20-alpine node loadtest.js http://host.docker.internal:8080 1000 20
```

Script sẽ in ra: tổng thời gian, requests/giây (RPS), độ trễ trung bình, và **tỷ lệ phần
trăm traffic mỗi Server ID nhận được**.

## Dọn dẹp

```bash
docker compose down
```

Lệnh này dừng và xoá toàn bộ container (không ảnh hưởng đến code/config). Chạy lại
`docker compose up -d` bất cứ lúc nào để khởi động lại từ đầu.
