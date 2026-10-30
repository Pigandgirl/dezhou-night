import os
import json
import secrets
import sys
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parent.parent
HOST = os.environ.get('DEPLOY_HOST', '192.144.159.220')
PORT = int(os.environ.get('DEPLOY_PORT', '22'))
USER = os.environ.get('DEPLOY_USER', 'ubuntu')
PASSWORD = os.environ.get('DEPLOY_PASS')
REMOTE = '/opt/dezhounight'
VERSION = json.loads((ROOT / 'android' / 'version.json').read_text(encoding='utf-8-sig'))
APK_NAME = os.environ.get('APK_FILE') or f"DezhouNight-{VERSION['versionName']}.apk"
ADMIN_USER = os.environ.get('ADMIN_USER', 'admin')
LIB_FILES = ['poker.js', 'game-engine.js', 'rate-limit.js']


def run(client, command: str, quiet: bool = False) -> int:
    stdin, stdout, stderr = client.exec_command(command, timeout=180)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if out.strip() and not quiet:
        print(out.strip())
    if err.strip():
        print(err.strip(), file=sys.stderr)
    return code


def ensure_admin_env(client) -> None:
    """已有 admin.env 则保留；否则生成随机密码写入（600，ubuntu 可读）。"""
    if run(client, f'sudo test -f {REMOTE}/admin.env', quiet=True) == 0:
        print(f'admin.env 已存在，保留原配置（查看: sudo cat {REMOTE}/admin.env）')
        return
    password = os.environ.get('ADMIN_PASSWORD') or secrets.token_urlsafe(12)
    target = Path(os.environ.get('TEMP', '/tmp')) / 'dezhounight-admin.env'
    lines = [
        f'ADMIN_USER={ADMIN_USER}',
        f'ADMIN_PASSWORD={password}',
    ]
    origin = os.environ.get('PUBLIC_ORIGIN', '').strip()
    if origin:
        lines.append(f'PUBLIC_ORIGIN={origin}')
    target.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    sftp = client.open_sftp()
    try:
        sftp.put(str(target), f'{REMOTE}/admin.env.new')
    finally:
        sftp.close()
    target.unlink(missing_ok=True)
    run(
        client,
        f'sudo install -m 600 -o {USER} -g {USER} '
        f'{REMOTE}/admin.env.new {REMOTE}/admin.env && rm -f {REMOTE}/admin.env.new',
    )
    print('已生成后台管理员账号：')
    print(f'  ADMIN_USER={ADMIN_USER}')
    print(f'  ADMIN_PASSWORD={password}')



def _upload_voice_assets(sftp):
    """Upload external voice clips once; they are static and cacheable."""
    voice_dir = ROOT / 'dist' / 'voice'
    if not voice_dir.is_dir():
        return sftp
    try:
        sftp.stat(f'{REMOTE}/public/web/voice')
    except IOError:
        try:
            sftp.mkdir(f'{REMOTE}/public/web/voice')
        except IOError:
            pass
    for profile_dir in sorted(p for p in voice_dir.iterdir() if p.is_dir()):
        try:
            sftp.stat(f'{REMOTE}/public/web/voice/{profile_dir.name}')
        except IOError:
            try:
                sftp.mkdir(f'{REMOTE}/public/web/voice/{profile_dir.name}')
            except IOError:
                pass
        for clip in profile_dir.glob('*.mp3'):
            sftp.put(str(clip), f'{REMOTE}/public/web/voice/{profile_dir.name}/{clip.name}')
    return sftp


def main() -> int:
    if not PASSWORD:
        print('DEPLOY_PASS is required', file=sys.stderr)
        return 2

    apk_path = ROOT / 'android' / APK_NAME
    if not apk_path.is_file():
        print(f'APK not found: {apk_path}', file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        port=PORT,
        username=USER,
        password=PASSWORD,
        timeout=20,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        run(client, f'sudo mkdir -p {REMOTE}/shared {REMOTE}/public/apk {REMOTE}/public/app {REMOTE}/public/web {REMOTE}/public/web/icons {REMOTE}/public/admin {REMOTE}/lib')
        run(client, f'sudo chown -R {USER}:{USER} {REMOTE}')

        sftp = client.open_sftp()
        try:
            sftp.put(str(ROOT / 'server' / 'server.js'), f'{REMOTE}/server.js')
            for name in LIB_FILES:
                sftp.put(str(ROOT / 'server' / 'lib' / name), f'{REMOTE}/lib/{name}')
            sftp.put(str(ROOT / 'server' / 'shared' / 'achievements.json'), f'{REMOTE}/shared/achievements.json')
            sftp.put(str(ROOT / 'server' / 'tts-name.cjs'), f'{REMOTE}/tts-name.cjs')
            sftp.put(
                str(ROOT / 'server' / 'public' / 'app' / 'latest.json'),
                f'{REMOTE}/public/app/latest.json',
            )
            web_file = ROOT / 'server' / 'public' / 'web' / 'index.html'
            if web_file.is_file():
                sftp.put(str(web_file), f'{REMOTE}/public/web/index.html')
            sftp = _upload_voice_assets(sftp)
            for name in ('manifest.webmanifest', 'sw.js'):
                pwa_file = ROOT / 'server' / 'public' / 'web' / name
                if pwa_file.is_file():
                    sftp.put(str(pwa_file), f'{REMOTE}/public/web/{name}')
            icons_dir = ROOT / 'server' / 'public' / 'web' / 'icons'
            if icons_dir.is_dir():
                for icon in icons_dir.glob('*.png'):
                    sftp.put(str(icon), f'{REMOTE}/public/web/icons/{icon.name}')
            admin_file = ROOT / 'server' / 'public' / 'admin' / 'index.html'
            if admin_file.is_file():
                sftp.put(str(admin_file), f'{REMOTE}/public/admin/index.html')
            sftp.put(str(apk_path), f'{REMOTE}/public/apk/{APK_NAME}')
            sftp.put(str(ROOT / 'server' / 'dezhounight.service'), '/tmp/dezhounight.service')
        finally:
            sftp.close()

        ensure_admin_env(client)
        run(client, 'sudo mv /tmp/dezhounight.service /etc/systemd/system/dezhounight.service')
        run(client, 'sudo systemctl daemon-reload')
        run(client, 'sudo systemctl enable --now dezhounight')
        run(client, 'sudo systemctl restart dezhounight')
        code = run(
            client,
            'sleep 1; curl -sS -m 5 http://127.0.0.1:8080/api/health; '
            'echo; curl -sS -m 5 http://127.0.0.1:8080/api/app/latest; '
            'echo; curl -sS -m 5 -o /dev/null -w "admin=%{http_code}\\n" http://127.0.0.1:8080/admin; '
            'curl -sS -m 5 -o /dev/null -w "play=%{http_code}\\n" http://127.0.0.1:8080/play',
        )
        return code
    finally:
        client.close()


if __name__ == '__main__':
    raise SystemExit(main())
