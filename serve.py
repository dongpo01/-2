# -*- coding: utf-8 -*-
"""谈吐 · 本地服务

用法：
    python3 serve.py            普通 HTTP（本机可用；手机能看界面，但录音会被浏览器拦住）
    python3 serve.py --https    自签 HTTPS（手机连同一 Wi-Fi 可录音，首次需信任证书）

浏览器规定：除 localhost 外，必须 HTTPS 才允许调用麦克风。
"""
import http.server
import socketserver
import ssl
import socket
import subprocess
import sys
import os
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def ensure_cert(ip):
    cert, key = 'cert.pem', 'key.pem'
    if os.path.exists(cert) and os.path.exists(key):
        return cert, key
    try:
        subprocess.check_call([
            'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', key, '-out', cert, '-days', '365',
            '-subj', '/CN=tantou.local',
            '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:%s' % ip,
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return cert, key
    except Exception:
        print('未能生成证书：这台机器没有 openssl。')
        print('手机录音请改用静态托管（见 README「放到手机上」）。')
        sys.exit(1)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    use_https = '--https' in sys.argv
    port = 8443 if use_https else 8000
    ip = lan_ip()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('0.0.0.0', port), Handler) as httpd:
        if use_https:
            cert, key = ensure_cert(ip)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(cert, key)
            httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
            print('HTTPS 已启动')
            print('  本机：https://localhost:%d' % port)
            print('  手机：https://%s:%d   （同一 Wi-Fi；首次会警告证书不安全，选“继续访问”）' % (ip, port))
            webbrowser.open('https://localhost:%d' % port)
        else:
            print('HTTP 已启动（手机能看，但不能录音）')
            print('  本机：http://localhost:%d' % port)
            print('  手机：http://%s:%d' % (ip, port))
            webbrowser.open('http://localhost:%d' % port)
        print('按 Ctrl+C 结束')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
