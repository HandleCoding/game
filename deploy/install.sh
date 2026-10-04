#!/usr/bin/env bash
set -euo pipefail
cd /opt/pair-play
if ! id pairplay >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/pair-play --shell /usr/sbin/nologin pairplay
fi
install -d -o pairplay -g pairplay -m 700 /var/lib/pair-play
install -o root -g root -m 644 deploy/pair-play.service /etc/systemd/system/pair-play.service
systemctl daemon-reload
systemctl enable --now pair-play
curl --fail --silent --retry 5 --retry-connrefused --retry-delay 1 http://127.0.0.1:3210/healthz

stamp=$(date +%Y%m%d-%H%M%S)
backup="/etc/caddy/Caddyfile.before-pair-play-$stamp"
candidate="/etc/caddy/Caddyfile.pair-play-$stamp"
cp -a /etc/caddy/Caddyfile "$backup"
cp -a /etc/caddy/Caddyfile "$candidate"
if ! grep -q '^game\.aicoding\.ltd[[:space:]]*{' "$candidate"; then
  cat >> "$candidate" <<'CADDY'

game.aicoding.ltd {
  encode gzip
  reverse_proxy 127.0.0.1:3210 {
    header_up X-Real-IP {remote_host}
  }
}
CADDY
fi
caddy fmt --overwrite "$candidate"
caddy validate --config "$candidate" --adapter caddyfile
cp -a "$candidate" /etc/caddy/Caddyfile
if ! systemctl reload caddy; then
  cp -a "$backup" /etc/caddy/Caddyfile
  systemctl reload caddy
  exit 1
fi
printf '\nCaddy backup: %s\n' "$backup"
systemctl is-active pair-play caddy
