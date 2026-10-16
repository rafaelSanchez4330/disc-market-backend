#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y certbot python3-certbot-nginx
cp -n /etc/nginx/sites-available/disc-market /root/disc-market-nginx-before-https.conf
sed -i 's/server_name 217.15.168.151;/server_name vinylhrz.tech www.vinylhrz.tech;/' /etc/nginx/sites-available/disc-market
nginx -t
systemctl reload nginx
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d vinylhrz.tech -d www.vinylhrz.tech
cd /opt/disc-market/frontend
runuser -u discmarket -- env VITE_API_URL=/api VITE_UPLOADS_URL=https://vinylhrz.tech npm run build
cp -a dist/. /var/www/disc-market/
sed -i 's|^FRONTEND_URL=.*|FRONTEND_URL=https://vinylhrz.tech|' /opt/disc-market/backend/.env
systemctl restart disc-market
systemctl enable --now certbot.timer
nginx -t
certbot renew --dry-run --no-random-sleep-on-renew
