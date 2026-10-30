import os
import sys

import paramiko


def main() -> int:
    host = os.environ.get('DEPLOY_HOST', '192.144.159.220')
    port = int(os.environ.get('DEPLOY_PORT', '22'))
    user = os.environ.get('DEPLOY_USER', 'root')
    password = os.environ.get('DEPLOY_PASS')
    if not password:
        print('DEPLOY_PASS is required', file=sys.stderr)
        return 2

    command = sys.argv[1] if len(sys.argv) > 1 else 'uname -a'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            host,
            port=port,
            username=user,
            password=password,
            timeout=20,
            allow_agent=False,
            look_for_keys=False,
        )
        stdin, stdout, stderr = client.exec_command(command, timeout=120)
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        code = stdout.channel.recv_exit_status()
        if out:
            print(out)
        if err:
            print(err, file=sys.stderr)
        return code
    finally:
        client.close()


if __name__ == '__main__':
    raise SystemExit(main())
