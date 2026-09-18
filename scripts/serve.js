/**
 * 想我了吧 · 本地预览服务器
 * 用法：node scripts/serve.js  （默认 8080 端口，可 node scripts/serve.js 9000）
 *
 * 用 Python 也行：python -m http.server 8080
 * 手机和电脑连同一个 Wi-Fi，用电脑的局域网 IP 打开即可测试。
 * 注意：Service Worker 需要 http://localhost 或 https，用 IP 访问时不会注册，不影响主要功能。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const port = parseInt(process.argv[2], 10) || 8080;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.css': 'text/css; charset=utf-8'
};

http.createServer(function (req, res) {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') { p = '/mood.html'; }
    const file = path.join(root, path.normalize(p).replace(/^[\\/]+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 找不到 ' + p);
        return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
}).listen(port, function () {
    const nets = os.networkInterfaces();
    const ips = [];
    Object.keys(nets).forEach(function (name) {
        (nets[name] || []).forEach(function (net) {
            if (net.family === 'IPv4' && !net.internal) { ips.push(net.address); }
        });
    });
    console.log('想我了吧 · 本地预览已启动');
    console.log('  本机：http://localhost:' + port + '/mood.html');
    ips.forEach(function (ip) { console.log('  手机：http://' + ip + ':' + port + '/mood.html  （需同一个 Wi-Fi）'); });
    console.log('  自检：http://localhost:' + port + '/mood.html?selftest=1');
    console.log('按 Ctrl+C 停止');
});
