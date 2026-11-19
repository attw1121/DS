'use strict';
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const defaults = require('./material-defaults.json');

function openMaterials(root) {
  const db = new DatabaseSync(path.join(root, 'data', 'materials.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS materials (code TEXT PRIMARY KEY, spec TEXT NOT NULL UNIQUE, payload TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO materials (code, spec, payload) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    const exists = db.prepare('SELECT 1 FROM materials WHERE code = ?');
    for (const part of defaults) if (!exists.get(part.code)) insert.run(part.code, part.spec, JSON.stringify(part));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  return {
    close: () => db.close(),
    read: () => db.prepare('SELECT payload FROM materials ORDER BY rowid').all().map(row => JSON.parse(row.payload)),
    save(parts, add) {
      if (!Array.isArray(parts) || !parts.length || parts.length > 10000) return 400;
      const normalized = [];
      for (const part of parts) {
        if (!part || typeof part.code !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(part.code) || !['frame', 'main', 'rail', 'brace', 'other'].includes(part.kind) || typeof part.weight !== 'number' || !Number.isFinite(part.weight) || part.weight <= 0 || !Number.isSafeInteger(Math.round(part.weight * 100)) || Math.abs(part.weight * 100 - Math.round(part.weight * 100)) > 1e-8) return 400;
        if (part.kind !== 'other' && (typeof part.size !== 'number' || !Number.isFinite(part.size) || part.size <= 0)) return 400;
        if (part.kind === 'brace' && (typeof part.rise !== 'number' || !Number.isFinite(part.rise) || part.rise <= 0)) return 400;
        const spec = part.kind === 'other' ? part.code : part.kind + ':' + part.size + (part.kind === 'brace' ? ':' + part.rise : '');
        normalized.push({...part, spec});
      }
      db.exec('BEGIN');
      try {
        const update = db.prepare('UPDATE materials SET payload = ? WHERE code = ?');
        const get = db.prepare('SELECT payload FROM materials WHERE code = ?');
        for (const part of normalized) {
          if (add) insert.run(part.code, part.spec, JSON.stringify(part));
          else {
            const old = get.get(part.code);
            if (!old) { db.exec('ROLLBACK'); return 404; }
            update.run(JSON.stringify({...JSON.parse(old.payload), weight: part.weight}), part.code);
          }
        }
        db.exec('COMMIT');
        return 200;
      } catch (error) {
        db.exec('ROLLBACK');
        if (String(error.message).includes('UNIQUE constraint')) return 409;
        throw error;
      }
    }
  };
}
module.exports = {openMaterials};
