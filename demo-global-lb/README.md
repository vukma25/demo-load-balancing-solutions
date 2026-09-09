# Demo: Cân bằng tải toàn cầu (GTM) + K8s Autoscaling cho website game

## Kiến trúc
Client (IP giả lập) -> Global Router (Nginx + GeoIP2, HTTPS cổng 9443)
  -> HTTPS ingress-nginx NodePort (31306, SNI theo vùng)
    -> Ingress TLS termination + host rule (asia/europe)
      -> HTTP K8s Service (ClusterIP, Local LB / PLB)
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
minikube addons enable ingress
```
`metrics-server` BẮT BUỘC phải bật vì HPA cần nó để đọc chỉ số CPU của Pod.

Kiểm tra: `kubectl get nodes` phải thấy 1 node ở trạng thái Ready.

## TRIỂN KHAI

### Bước 1: Build image backend vào thẳng Minikube (không cần registry)
```
minikube image build -t game-server:latest ./backend-k8s
```

### Bước 2: Apply manifest K8s và tạo certificate cho Ingress

Apply manifest trước để tạo hai namespace và các tài nguyên backend:

```
kubectl apply -f k8s/asia.yaml
kubectl apply -f k8s/europe.yaml
```

Ingress terminate TLS bằng hai Secret dưới đây. Với demo local, có thể dùng
certificate tự ký có SAN cho cả hai hostname:

```
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout game-ingress.key -out game-ingress.crt \
  -subj "/CN=game.local" \
  -addext "subjectAltName=DNS:asia.game.local,DNS:europe.game.local"
kubectl create secret tls asia-game-tls -n asia-cluster \
  --cert=game-ingress.crt --key=game-ingress.key
kubectl create secret tls europe-game-tls -n europe-cluster \
  --cert=game-ingress.crt --key=game-ingress.key
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
Luồng HTTPS trực tiếp được kiểm tra qua `https://localhost:9443` (certificate
Global Router là certificate local nên curl cần `-k`). Luồng qua WAF dùng
`https://localhost:9444`; WAF giải mã để lọc rồi mã hóa lại tới Global Router.
Global Router sẽ mã hóa
lại request và gửi tới HTTPS NodePort `31306` của ingress-nginx; Ingress terminate
TLS rồi chuyển tiếp HTTP đến Service `ClusterIP`.

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
NODE_TLS_REJECT_UNAUTHORIZED=0 node loadtest-hourly.js https://localhost:9444 24 20 150
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
