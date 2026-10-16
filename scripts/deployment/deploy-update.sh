#!/usr/bin/env bash
# Run as root after uploading /root/disc-market-{backend,frontend}.tar.gz,
# /root/disc-market-stripe.env and /root/disc-market-frontend.env (mode 600).
set -euo pipefail
release_id=$(date -u +%Y%m%dT%H%M%SZ)
release=/opt/disc-market/releases/$release_id
backup=/var/backups/disc-market/releases/$release_id
install -d -m 700 "$backup"
runuser -u postgres -- pg_dump -Fc disc_market_db > "$backup/database.dump"
tar -czf "$backup/uploads.tar.gz" -C /var/lib/disc-market uploads
tar -czf "$backup/backend.tar.gz" --exclude=node_modules -C /opt/disc-market/backend .
tar -czf "$backup/frontend.tar.gz" -C /var/www/disc-market .
cp /etc/nginx/sites-available/disc-market "$backup/nginx.conf"
runuser -u postgres -- psql -d disc_market_db -tAc 'SELECT count(*) FROM products; SELECT count(*) FROM users; SELECT count(*) FROM orders;' > "$backup/counts-before.txt"
install -d "$release/backend" "$release/frontend"
tar --warning=no-unknown-keyword -xzf /root/disc-market-backend.tar.gz -C "$release/backend"
tar --warning=no-unknown-keyword -xzf /root/disc-market-frontend.tar.gz -C "$release/frontend"
cp /opt/disc-market/backend/.env "$release/backend/.env"
python3 - "$release/backend/.env" <<'PY'
import pathlib, sys
target = pathlib.Path(sys.argv[1])
updates = dict(line.split('=',1) for line in pathlib.Path('/root/disc-market-stripe.env').read_text().splitlines() if '=' in line)
assert updates['STRIPE_SECRET_KEY'].startswith('sk_test_'), 'Only test mode is authorized'
lines = [line for line in target.read_text().splitlines() if line.split('=',1)[0] not in updates]
target.write_text('\n'.join(lines + [k+'='+v for k,v in updates.items()])+'\n')
PY
cp /root/disc-market-frontend.env "$release/frontend/.env.production"
chmod -R u+rwX "$release"
chmod 600 "$release/backend/.env" "$release/frontend/.env.production"
chown -R discmarket:discmarket "$release"
(cd "$release/backend" && runuser -u discmarket -- npm ci --no-audit --no-fund && runuser -u discmarket -- npm run build)
(cd "$release/frontend" && runuser -u discmarket -- npm ci --no-audit --no-fund && runuser -u discmarket -- npm run build)
chmod -R a+rX "$release/frontend/dist"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d disc_market_db < "$release/backend/scripts/deployment/stripe-schema.sql"
# Retain previous directories/links for rollback; never replace uploads or database.
previous_backend=/opt/disc-market/backend-before-$release_id
previous_frontend=/var/www/disc-market-before-$release_id
mv /opt/disc-market/backend "$previous_backend"
ln -s "$release/backend" /opt/disc-market/backend
mv /var/www/disc-market "$previous_frontend"
ln -s "$release/frontend/dist" /var/www/disc-market
rollback() {
  unlink /opt/disc-market/backend
  mv "$previous_backend" /opt/disc-market/backend
  unlink /var/www/disc-market
  mv "$previous_frontend" /var/www/disc-market
  systemctl restart disc-market
}
systemctl restart disc-market
healthy=false
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/api/health >/dev/null; then healthy=true; break; fi
  sleep 1
done
if [ "$healthy" != true ]; then rollback; exit 1; fi
if ! curl -fsS https://vinylhrz.tech/ >/dev/null; then rollback; exit 1; fi
runuser -u postgres -- psql -d disc_market_db -tAc 'SELECT count(*) FROM products; SELECT count(*) FROM users; SELECT count(*) FROM orders;' > "$backup/counts-after.txt"
diff "$backup/counts-before.txt" "$backup/counts-after.txt"
rm -f /root/disc-market-stripe.env /root/disc-market-frontend.env
printf 'Release: %s\nBackup: %s\nPrevious backend: %s\nPrevious frontend: %s\n' "$release" "$backup" "$previous_backend" "$previous_frontend"
