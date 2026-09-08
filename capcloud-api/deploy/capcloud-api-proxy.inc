limit_except GET HEAD { deny all; }
limit_req zone=capcloud_api_requests burst=30 nodelay;
limit_req_status 429;
limit_conn capcloud_api_connections 16;
limit_conn_status 429;

proxy_http_version 1.1;
proxy_set_header Host 127.0.0.1:5189;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Connection "";
proxy_connect_timeout 5s;
proxy_read_timeout 110s;
proxy_send_timeout 30s;
proxy_max_temp_file_size 0;

add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header X-Robots-Tag "noindex, nofollow" always;
