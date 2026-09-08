location = /API {
    return 308 /api/$is_args$args;
}

location ^~ /API/ {
    rewrite ^/API/(.*)$ /api/$1 permanent;
}

location = /api {
    return 308 /api/$is_args$args;
}

location = /api/ {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/;
}

# Do not claim /api/*: the parent site already uses that namespace.
location ^~ /api/api/ {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/api/;
}

location ^~ /api/assets/ {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/assets/;
}

location ^~ /api/exports/ {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/exports/;
}

location = /api/index.html {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/index.html;
}

location = /api/lab.html {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/lab.html;
}

location = /api/favicon.svg {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/favicon.svg;
}

location = /api/source-menu.png {
    include /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc;
    proxy_pass http://127.0.0.1:5189/source-menu.png;
}
