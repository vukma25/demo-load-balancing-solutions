# Demo thực nghiệm

Repo chứa phần thực nghiệm (Chương 3) của báo cáo **"Nghiên cứu triển khai giải pháp cân bằng tải đa lớp: kết hợp định tuyến toàn cầu và cân bằng tải cục bộ"**, gồm 2 kịch bản demo minh họa cho 2 lớp cân bằng tải Global và Local Load Balancing.

## Tải project về máy

```bash
git clone https://github.com/vukma25/demo-load-balancing-solutions.git
cd demo-load-balancing-solutions
```

## Kịch bản 1: Cân bằng tải cục bộ với HAProxy

Thư mục: [`haproxy-lb/`](./haproxy-lb)

Minh họa lớp **Local Load Balancing (PLB)** — dựng 3 backend server giống nhau, đặt
phía sau HAProxy chạy song song để so sánh trực tiếp: thuật toán cân bằng tải
(Round Robin, Least Connections, Source...), cơ chế health check/failover, và hiệu năng.

**Yêu cầu:** Docker Desktop.
**Thời gian setup:** khoảng 15-30 phút.

Hướng dẫn cài đặt [`haproxy-lb/README.md`](./haproxy-lb/README.md)

## Kịch bản 2: Cân bằng tải toàn cầu (GTM) kết hợp Kubernetes Autoscaling

Thư mục: [`demo-global-lb/`](./demo-global-lb)

Mô phỏng một website game trực tuyến có 2 cụm server đặt ở châu Á và châu Âu. Minh họa
đầy đủ mô hình 2 lớp:

- **Lớp Global (GTM)**: Nginx + module GeoIP2 tự động phát hiện quốc gia của người
  dùng (qua địa chỉ IP) và điều hướng đến đúng cụm khu vực.
- **Lớp Local (PLB)**: Kubernetes Service trong từng cụm tiếp tục phân phối đến các
  Pod xử lý cụ thể, với khả năng **tự động tăng/giảm số lượng Pod (HPA)** theo tải CPU
  thực tế.
- Kèm script mô phỏng traffic biến động theo giờ trong ngày.

**Yêu cầu:** NodeJS, Docker Desktop, Minikube, kubectl, tài khoản MaxMind để tải GeoIP nếu trong trường hợp không có file GeoLite2-Country.mmdb trong thư mục [`geo`](./demo-global-lb/global-router/geo)

Hướng dẫn cài đặt [`demo-global-lb/README.md`](./demo-global-lb/README.md)
