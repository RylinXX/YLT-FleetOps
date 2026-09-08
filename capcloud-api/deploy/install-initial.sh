#!/usr/bin/env bash
set -euo pipefail

stage=/opt/capcloud-api/staging/20260906T082322Z
release=/opt/capcloud-api/releases/20260906T082322Z
site_config=/www/server/panel/vhost/nginx/ylt.etgq.com.conf
backup=/opt/capcloud-api/backups/ylt.etgq.com.conf.20260906T082322Z
nginx=/www/server/nginx/sbin/nginx
expected_config=df5f77d9dd8aa01dfd34e08c1b68febfe6eeb252c6aa1636f972c2083396c09b
expected_runtime=2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2

test "$(id -u)" = 0
test ! -e /opt/capcloud-api/current
test ! -e /etc/systemd/system/capcloud-api.service
test ! -e /www/server/panel/vhost/nginx/capcloud-api-limits.conf
test ! -e /www/server/panel/vhost/nginx/extension/capcloud-api-location.inc
test "$(sha256sum "$site_config" | cut -d ' ' -f 1)" = "$expected_config"
test "$(sha256sum "$stage/node-v24.20.0-linux-x64.tar.xz" | cut -d ' ' -f 1)" = "$expected_runtime"
"$nginx" -t

install -d -m 0755 /opt/capcloud-api/releases "$release"
install -d -m 0700 /opt/capcloud-api/backups
cp -p "$site_config" "$backup"
tar -xJf "$stage/node-v24.20.0-linux-x64.tar.xz" -C /opt/capcloud-api --no-same-owner
ln -s node-v24.20.0-linux-x64 /opt/capcloud-api/runtime
tar -xzf "$stage/site.tar.gz" -C "$release" --no-same-owner
chmod -R u=rwX,go=rX "$release"
ln -s releases/20260906T082322Z /opt/capcloud-api/current
cd "$release"
/opt/capcloud-api/runtime/bin/node --test tests/*.test.mjs

install -m 0644 "$stage/capcloud-api.service" /etc/systemd/system/capcloud-api.service
systemd-analyze verify /etc/systemd/system/capcloud-api.service
systemctl daemon-reload
systemctl enable --now capcloud-api.service
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 http://127.0.0.1:5189/api/health

# Publish the route only after the isolated service is healthy.
test "$(sha256sum "$site_config" | cut -d ' ' -f 1)" = "$expected_config"
install -m 0644 "$stage/capcloud-api-limits.conf" /www/server/panel/vhost/nginx/capcloud-api-limits.conf
install -m 0644 "$stage/capcloud-api-location.inc" /www/server/panel/vhost/nginx/extension/capcloud-api-location.inc
install -m 0644 "$stage/capcloud-api-proxy.inc" /www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc
install -m 0600 "$stage/ylt.etgq.com.conf" "$site_config"
if "$nginx" -t; then
    "$nginx" -s reload
else
    cp -p "$backup" "$site_config"
    mv /www/server/panel/vhost/nginx/capcloud-api-limits.conf "$stage/capcloud-api-limits.conf.disabled"
    mv /www/server/panel/vhost/nginx/extension/capcloud-api-location.inc "$stage/capcloud-api-location.inc.disabled"
    "$nginx" -t
    exit 1
fi
systemctl is-active capcloud-api.service
systemctl is-enabled capcloud-api.service
