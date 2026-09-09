
FROM nginx:1.26.3-alpine3.20 as builder
RUN apk add --no-cache build-base pcre-dev zlib-dev libmaxminddb-dev git
RUN git clone --depth 1 --branch master https://github.com/leev/ngx_http_geoip2_module.git /tmp/geoip2
RUN wget http://nginx.org/download/nginx-1.26.3.tar.gz -O /tmp/nginx.tar.gz && \
    tar -xzf /tmp/nginx.tar.gz -C /tmp
RUN cd /tmp/nginx-1.26.3 && \
    ./configure --with-compat --add-dynamic-module=/tmp/geoip2 && \
    make modules

FROM nginx:1.26.3-alpine3.20
RUN apk add --no-cache libmaxminddb
COPY --from=builder /tmp/nginx-1.26.3/objs/ngx_http_geoip2_module.so /etc/nginx/modules/
