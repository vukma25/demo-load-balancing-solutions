# Demo: Cân bằng tải toàn cầu (GTM) + K8s Autoscaling cho website game

## Kiến trúc
Client (IP giả lập) -> Global Router (Nginx + GeoIP2, cổng 9000)
  -> ánh xạ quốc gia -> khu vực (asia/europe)
  -> Minikube NodePort (30080 = Asia, 30081 = Europe)
    -> K8s Service (đóng vai trò Local LB / PLB, kube-proxy tự chia traffic)
      -> Pod backend (tự scale 1-5 theo CPU, nhờ HPA)

## CHUẨN BỊ

### 1. Cài đặt công cụ
- Docker Desktop
- Minikube: https://minikube.sigs.k8s.io/docs/start/
- kubectl: https://kubernetes.io/docs/tasks/tools/ (kiểm tra bằng `kubectl version --client`)

### 2. Tải file GeoLite2-Country.mmdb
1. Đăng ký tài khoản miễn phí tại: https://www.maxmind.com/en/geolite2/signup
2. Vào trang "Manage License Keys" tạo license key miễn phí
3. Tải file "GeoLite2-Country" (định dạng .mmdb) từ trang "Download Files"
4. Giải nén, copy file `GeoLite2-Country.mmdb` vào thư mục `demo-global-lb/global-router/geo/` của project này

### 3. Khởi động Minikube
```
minikube start --driver=docker
minikube addons enable metrics-server
```
`metrics-server` BẮT BUỘC phải bật vì HPA cần nó để đọc chỉ số CPU của Pod.

Kiểm tra: `kubectl get nodes` phải thấy 1 node ở trạng thái Ready.

## TRIỂN KHAI

### Bước 1: Build image backend vào thẳng Minikube (không cần registry)
```
minikube image build -t game-server:latest ./backend-k8s
```

### Bước 2: Apply manifest K8s cho cả 2 cụm
```
kubectl apply -f k8s/asia.yaml
kubectl apply -f k8s/europe.yaml
```

Kiểm tra:
```
kubectl get pods -A
kubectl get hpa -A
```
Bạn phải thấy namespace `asia-cluster` và `europe-cluster`, mỗi cụm có 1 Pod đang Running và 1 HPA.

### Bước 3: Chạy Global Router
```
docker compose -f docker-compose-global.yml up -d --build
```
Kiểm tra: mở http://localhost:9000/router-health phải trả về "global router is up".

Nếu lỗi "network minikube not found": chạy `docker network ls | grep minikube` để xem tên network thật, sửa lại giá trị `name:` trong `docker-compose-global.yml` cho khớp.

### Bước 4: Test định tuyến thủ công trước khi chạy mô phỏng
```
curl -H "X-Forwarded-For: 202.54.1.5" http://localhost:9000 -v
```
Xem header trả về: `X-Detected-Country: IN` và `X-Routed-Region: asia` -> đúng nghĩa là định tuyến hoạt động.

```
curl -H "X-Forwarded-For: 81.2.69.142" http://localhost:9000 -v
```
Phải thấy `X-Detected-Country: GB` và `X-Routed-Region: europe`.

## CHẠY MÔ PHỎNG TRAFFIC THEO GIỜ

Mở 2 terminal:

**Terminal 1** - theo dõi K8s scale theo thời gian thực:
```
kubectl get hpa -A -w
```
(hoặc `kubectl get pods -A -w` để thấy Pod mới được tạo/xoá)

**Terminal 2** - chạy script mô phỏng:
```
node loadtest-hourly.js http://localhost:9000 24 20 150
```
(24 giờ mô phỏng, mỗi giờ = 20 giây thật -> tổng ~8 phút, mỗi giờ gửi tối đa 150 request vào giờ cao điểm)

Quan sát ở Terminal 1: vào các "giờ cao điểm" mô phỏng (buổi tối theo giờ địa phương từng khu vực),
số REPLICAS của HPA sẽ tăng lên; khi traffic giảm, sau khoảng 30 giây ổn định (đã cấu hình
`stabilizationWindowSeconds: 30` trong hpa.yaml), số Pod sẽ giảm trở lại.

Đây chính là bằng chứng thực nghiệm cho khả năng tự động mở rộng cần cho báo cáo

## DỌN DẸP SAU KHI XONG
```
docker compose -f docker-compose-global.yml down
kubectl delete -f k8s/asia.yaml
kubectl delete -f k8s/europe.yaml
minikube stop
```
