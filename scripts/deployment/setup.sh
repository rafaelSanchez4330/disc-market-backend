#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
install -d /opt/disc-market /var/www/disc-market /var/lib/disc-market/uploads
if ! id discmarket >/dev/null 2>&1; then
  useradd --system --home /opt/disc-market --shell /usr/sbin/nologin discmarket
fi
cd /tmp
curl -fsSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
NODE_ARCHIVE=$(awk '$2 ~ /^node-v22.*-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
test -n "$NODE_ARCHIVE"
curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$NODE_ARCHIVE"
grep "  $NODE_ARCHIVE$" SHASUMS256.txt | sha256sum -c -
install -d /opt/node22
tar -xJf "$NODE_ARCHIVE" -C /opt/node22 --strip-components=1
ln -sf /opt/node22/bin/node /usr/local/bin/node
ln -sf /opt/node22/bin/npm /usr/local/bin/npm
ln -sf /opt/node22/bin/npx /usr/local/bin/npx
install -d /opt/disc-market/backend /opt/disc-market/frontend
tar -xzf /root/backend.tar.gz -C /opt/disc-market/backend
tar -xzf /root/frontend.tar.gz -C /opt/disc-market/frontend
chown -R discmarket:discmarket /opt/disc-market /var/lib/disc-market
chmod -R u+rwX /opt/disc-market
cd /opt/disc-market/backend
runuser -u discmarket -- npm ci --no-audit --no-fund
runuser -u discmarket -- npm run build
cd /opt/disc-market/frontend
runuser -u discmarket -- env VITE_API_URL=/api VITE_UPLOADS_URL=http://217.15.168.151 npm ci --no-audit --no-fund
runuser -u discmarket -- env VITE_API_URL=/api VITE_UPLOADS_URL=http://217.15.168.151 npm run build
cp -a dist/. /var/www/disc-market/
systemctl enable --now postgresql
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='discmarket'" | grep -q 1; then
  DB_PASSWORD=$(openssl rand -hex 32)
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE discmarket LOGIN PASSWORD '$DB_PASSWORD'"
  runuser -u postgres -- createdb -O discmarket disc_market_db
  JWT_SECRET=$(openssl rand -hex 48)
  umask 077
  cat > /opt/disc-market/backend/.env <<EOF
NODE_ENV=production
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USERNAME=discmarket
DB_PASSWORD=$DB_PASSWORD
DB_NAME=disc_market_db
JWT_SECRET=$JWT_SECRET
UPLOAD_DIR=/var/lib/disc-market/uploads
FRONTEND_URL=http://217.15.168.151
EOF
  chown discmarket:discmarket /opt/disc-market/backend/.env
fi
cd /opt/disc-market/backend
# Initialize only this new, empty database; normal startup never synchronizes schema.
if ! runuser -u postgres -- psql -d disc_market_db -tAc "SELECT to_regclass('public.products')" | grep -q products; then
  runuser -u discmarket -- env NODE_ENV=development node dist/seed/seed.js > /var/log/disc-market-initial-seed.log 2>&1
fi
cat > /etc/systemd/system/disc-market.service <<'EOF'
[Unit]
Description=Disc Market API
After=network.target postgresql.service
[Service]
User=discmarket
Group=discmarket
WorkingDirectory=/opt/disc-market/backend
EnvironmentFile=/opt/disc-market/backend/.env
ExecStart=/usr/local/bin/node dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/disc-market
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/nginx/sites-available/disc-market <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 217.15.168.151;
    root /var/www/disc-market;
    index index.html;
    client_max_body_size 100m;
    add_header X-Content-Type-Options nosniff always;
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ {
        alias /var/lib/disc-market/uploads/;
    }
    location / { try_files $uri $uri/ /index.html; }
}
EOF
if [ -L /etc/nginx/sites-enabled/default ]; then
  unlink /etc/nginx/sites-enabled/default
fi
ln -sf /etc/nginx/sites-available/disc-market /etc/nginx/sites-enabled/disc-market
nginx -t
systemctl daemon-reload
systemctl enable --now disc-market
systemctl reload nginx
install -d -m 700 /var/backups/disc-market
cat > /usr/local/sbin/disc-market-backup <<'EOF'
#!/bin/bash
set -euo pipefail
umask 077
backup_dir=/var/backups/disc-market/$(date -u +%Y-%m-%d)
mkdir -p "$backup_dir"
runuser -u postgres -- pg_dump -Fc disc_market_db > "$backup_dir/database.dump"
tar -czf "$backup_dir/uploads.tar.gz" -C /var/lib/disc-market uploads
EOF
chmod 700 /usr/local/sbin/disc-market-backup
printf '0 4 * * * root /usr/local/sbin/disc-market-backup\n' > /etc/cron.d/disc-market-backup
/usr/local/sbin/disc-market-backup
node --version
systemctl is-active disc-market nginx postgresql
