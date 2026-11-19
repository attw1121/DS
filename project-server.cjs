'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {openMaterials} = require('./material-store.cjs');

function createProjectServer(root = __dirname) {
  fs.mkdirSync(path.join(root, 'data'), {recursive: true});
  const materials = openMaterials(root);
  const db = new DatabaseSync(path.join(root, 'data', 'projects.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, saved_at TEXT NOT NULL, payload TEXT NOT NULL)');
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(value)); };
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) return json(403, {error: 'Forbidden'});
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api/materials') {
        if (req.method === 'GET') return json(200, materials.read());
        if (!['POST', 'PUT'].includes(req.method)) return json(405, {error: 'Method not allowed'});
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, {error: 'JSON required'});
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) return json(413, {error: 'Catalog too large'});
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, {error: 'Invalid JSON'}); }
        const status = materials.save(body?.parts, req.method === 'POST');
        return json(status, status === 200 ? {ok: true} : {error: 'Invalid or duplicate material'});
      }
      if (url.pathname === '/api/projects' && req.method === 'GET') {
        return json(200, db.prepare('SELECT id, name, saved_at AS savedAt FROM projects ORDER BY id').all());
      }
      if (url.pathname === '/api/projects' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, {error: 'JSON required'});
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 20 * 1024 * 1024) return json(413, {error: 'Project too large'});
          chunks.push(chunk);
        }
        let project;
        try { project = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, {error: 'Invalid JSON'}); }
        if (!project || typeof project.name !== 'string' || !project.name.trim() || !project.formValues || typeof project.formValues !== 'object' || !project.calculation || typeof project.calculation !== 'object') return json(400, {error: 'Invalid project'});
        project.savedAt = new Date().toISOString();
        const result = db.prepare('INSERT INTO projects (name, saved_at, payload) VALUES (?, ?, ?)').run(project.name, project.savedAt, JSON.stringify(project));
        return json(201, {id: Number(result.lastInsertRowid)});
      }
      const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
      if (match && req.method === 'GET') {
        const row = db.prepare('SELECT id, payload FROM projects WHERE id = ?').get(Number(match[1]));
        return row ? json(200, {...JSON.parse(row.payload), id: row.id}) : json(404, {error: 'Project not found'});
      }
      if (req.method !== 'GET') return json(405, {error: 'Method not allowed'});
      const name = decodeURIComponent(url.pathname === '/' ? '/ACT20261119-03.html' : url.pathname).slice(1);
      const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png'};
      const type = types[path.extname(name)];
      if (!type || name.includes('/') || name.includes('\\') || name.includes(':') || name.startsWith('.')) return json(404, {error: 'Not found'});
      const file = path.join(root, name);
      if (!fs.existsSync(file)) return json(404, {error: 'Not found'});
      res.writeHead(200, {'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store'});
      fs.createReadStream(file).pipe(res);
    } catch (error) { console.error(error); if (!res.headersSent) json(500, {error: 'Database or server error'}); else res.end(); }
  });
  server.on('close', () => { db.close(); materials.close(); });
  return server;
}
if (require.main === module) {
  const server = createProjectServer();
  server.listen(8765, '127.0.0.1', () => console.log('Open http://127.0.0.1:8765/ — projects saved in data/projects.sqlite'));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = {createProjectServer};
