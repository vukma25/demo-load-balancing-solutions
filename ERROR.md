# Troubleshooting Log

## 1. HTTPS request sent to an HTTP WAF port

### Symptom

```text
curl -k -H "X-Forwarded-For: 202.54.1.5" https://localhost:9082 -v
schannel: ... SEC_E_INVALID_TOKEN
curl: (35) ...
```

### Cause

Port `9082` in `demo-global-lb/docker-compose-global.yml` maps to WAF port `8080`, which is configured as HTTP. The TLS client tried to perform a TLS handshake against an HTTP listener.

### Correct commands

Global Router directly over HTTPS:

```powershell
curl.exe -k -H "X-Forwarded-For: 202.54.1.5" -i https://localhost:9443/
```

Global WAF entrypoint over HTTP. The WAF then proxies HTTPS to Global Router internally:

```powershell
curl.exe -H "X-Forwarded-For: 202.54.1.5" -i http://localhost:9082/
```

HAProxy demo:

```powershell
curl.exe -i http://localhost:8082/
curl.exe -k -i https://localhost:8444/
```

## 2. Ingress addon enable timed out

### Symptom

```text
MK_ADDON_ENABLE: enable failed
waiting for app.kubernetes.io/name=ingress-nginx pods
context deadline exceeded
```

### Cause

The ingress controller was waiting for the admission TLS Secret while its images were still being pulled. The controller pod stayed in `ContainerCreating` because `ingress-nginx-admission` did not exist yet. The first controller image pull also took several minutes.

### Fix

After the admission jobs completed, recreate the controller pod:

```powershell
kubectl get secret ingress-nginx-admission -n ingress-nginx
kubectl delete pod -n ingress-nginx -l app.kubernetes.io/component=controller
kubectl get pods -n ingress-nginx -w
```

The controller eventually became `Ready`.

## 3. Wrong Ingress HTTPS NodePort

### Symptom

Global Router could not connect to the expected Ingress HTTPS port.

### Cause

The configured value `30443` was only an assumption. Minikube assigned the ingress-nginx Service HTTPS NodePort dynamically.

### Fix

Read the actual port:

```powershell
kubectl get svc ingress-nginx-controller -n ingress-nginx
```

The current cluster assigned:

```text
HTTP  31078
HTTPS 31306
```

The Global Router was updated to use `minikube:31306`.

## 4. OpenSSL subject error on Windows/MSYS2

### Symptom

```text
req: ... This name is not in that format: 'C:/Program Files/Git/CN=game.local'
error: Cannot read file game-ingress.crt
```

### Cause

MSYS2/Git Bash converted the OpenSSL subject value beginning with `/` into a Windows path. Because OpenSSL failed, the certificate file was never created and `kubectl` could not read it.

### Fix

In PowerShell, disable MSYS path conversion before running OpenSSL:

```powershell
$env:MSYS_NO_PATHCONV='1'
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout game-ingress.key `
  -out game-ingress.crt `
  -subj '/CN=game.local' `
  -addext 'subjectAltName=DNS:asia.game.local,DNS:europe.game.local'
```

Create the Secrets after the certificate files exist:

```powershell
kubectl create secret tls asia-game-tls -n asia-cluster `
  --cert=game-ingress.crt --key=game-ingress.key
kubectl create secret tls europe-game-tls -n europe-cluster `
  --cert=game-ingress.crt --key=game-ingress.key
```

## 5. WAF still used the old HTTP backend

### Symptom

The Compose file contained:

```yaml
BACKEND=https://global-router:443
```

but the running WAF still showed:

```text
BACKEND=http://global-router:80
```

### Cause

The running container was created before the Compose change. Editing the Compose file does not automatically recreate an existing container.

### Fix

```powershell
docker compose -f demo-global-lb/docker-compose-global.yml `
  up -d --force-recreate waf
```

Verify the running configuration:

```powershell
docker inspect waf-global --format '{{range .Config.Env}}{{println .}}{{end}}' |
  Select-String '^BACKEND='
docker exec waf-global sh -c "grep proxy_pass /etc/nginx/includes/proxy_backend.conf"
```

Expected value:

```text
https://global-router:443
```

## 6. GeoIP returned `XX` after WAF forwarding

### Symptom

Requests through WAF returned:

```text
HTTP/1.1 403 Forbidden
X-Detected-Country: XX
Access denied: country not allowed
```

### Cause

WAF appended its own address to the forwarded header. The Global Router received a chain such as:

```text
202.54.1.5, 192.168.49.4
```

GeoIP2 could not parse the entire chain as one IP address.

### Fix

Global Router now extracts the first client IP from `X-Forwarded-For` and uses it for GeoIP and rate limiting. The WAF continues forwarding the complete header chain.

Successful verification:

```text
202.54.1.5 -> IN -> asia -> HTTP 200
81.2.69.142 -> GB -> europe -> HTTP 200
```

## 7. Current verified flow

```text
Client
  -> HTTP WAF public port 9082
  -> HTTPS Global Router port 443 inside Docker
  -> HTTPS ingress-nginx NodePort 31306
  -> Ingress TLS termination
  -> HTTP ClusterIP Service
  -> Backend Pod
```

For direct Global Router HTTPS testing, use host port `9443`:

```powershell
curl.exe -k -H "X-Forwarded-For: 202.54.1.5" -i https://localhost:9443/
```

For WAF testing, use HTTP on host port `9082`:

```powershell
curl.exe -H "X-Forwarded-For: 202.54.1.5" -i http://localhost:9082/
```

## Port reference

| Component | Protocol | Host port | Container/service port |
|---|---:|---:|---:|
| Global Router | HTTP | 9000 | 80 |
| Global Router | HTTPS | 9443 | 443 |
| Global WAF | HTTP | 9082 | 8080 |
| ingress-nginx | HTTP | NodePort 31078 | 80 |
| ingress-nginx | HTTPS | NodePort 31306 | 443 |
| HAProxy demo | HTTP | 8081 | 80 |
| HAProxy demo | HTTPS | 8444 | 443 |
| HAProxy WAF | HTTP | 8082 | 8080 |
