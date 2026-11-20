const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ds-storage.js'), 'utf8');
test('localhost keeps using SQLite APIs with JSON writes', async () => {
  let call;
  const context = vm.createContext({location: {hostname: '127.0.0.1', protocol: 'http:'},
    fetch: async (...args) => { call = args; return {ok: true, json: async () => ({id: 7})}; }});
  vm.runInContext(source, context);
  assert.equal(context.DSStorage.local, true);
  const result = await context.DSStorage.request('projects', '', {method: 'POST', body: '{"name":"測試"}'});
  assert.equal(result.id, 7);
  assert.equal(call[0], '/api/projects');
  assert.equal(call[1].method, 'POST');
  assert.equal(call[1].headers['Content-Type'], 'application/json');
});
test('local duplicate materials retain the UI conflict error', async () => {
  const context = vm.createContext({location: {hostname: 'localhost', protocol: 'http:'},
    fetch: async () => ({ok: false, status: 409})});
  vm.runInContext(source, context);
  await assert.rejects(context.DSStorage.request('materials', '', {method: 'POST'}), {name: 'ConstraintError'});
});
test('GitHub Pages fails closed without cloud configuration and never calls local APIs', async () => {
  const elements = new Map();
  const context = vm.createContext({location: {hostname: 'attw1121.github.io', protocol: 'https:'},
    document: {getElementById(id) { if (!elements.has(id)) elements.set(id, {hidden: true, addEventListener() {}}); return elements.get(id); }},
    fetch: () => { throw new Error('Must not call a local API'); }});
  vm.runInContext(source, context);
  assert.equal(context.DSStorage.local, false);
  assert.equal(elements.get('cloud-account').hidden, false);
  await assert.rejects(context.DSStorage.request('projects'), /尚未完成設定/);
});
