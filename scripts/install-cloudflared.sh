#!/bin/bash
set -x
echo "start $(date)"
rm -f /tmp/cloudflared /usr/local/bin/cloudflared
curl -L --retry 3 --connect-timeout 15 --max-time 900 -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
echo "curl=$? size=$(stat -c%s /tmp/cloudflared 2>/dev/null || echo 0)"
install -m755 /tmp/cloudflared /usr/local/bin/cloudflared
/usr/local/bin/cloudflared --version
echo "done $(date)"
