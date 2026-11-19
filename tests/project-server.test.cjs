const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createProjectServer} = require('../project-server.cjs');

test('projects persist in SQLite across server restarts and private files are not served', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'act-project-test-'));
  let server;
  const start = async () => {
    server = createProjectServer(root);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise(resolve => server.close(resolve));
  try {
    let base = await start();
    const materials = await (await fetch(base + '/api/materials')).json();
    assert.equal(materials.length, 20);
    const saveMaterials = (parts, method = 'POST') => fetch(base + '/api/materials', {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({parts})});
    const custom = {code: 'H66120', kind: 'rail', size: 1.2, rise: null, weight: 3.5};
    assert.equal((await saveMaterials([custom])).status, 200);
    assert.equal((await saveMaterials([custom])).status, 409);
    assert.equal((await saveMaterials([{...custom, code: 'DUPLICATE'}])).status, 409);
    assert.equal((await saveMaterials([{...materials[0], weight: 9.99}], 'PUT')).status, 200);
    assert.equal((await saveMaterials([{...custom, weight: -1}], 'PUT')).status, 400);
    assert.equal((await saveMaterials([{...materials[0], weight: 8}, {...custom, code: 'MISSING'}], 'PUT')).status, 404);
    const project = {name: '測試專案', formValues: {a1: '1.5', ck01: true}, calculation: {quantities: {A: 12}}};
    const saved = await fetch(base + '/api/projects', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(project)});
    assert.equal(saved.status, 201);
    const {id} = await saved.json();
    await stop();
    base = await start();
    const reloadedMaterials = await (await fetch(base + '/api/materials')).json();
    assert.equal(reloadedMaterials.find(part => part.code === materials[0].code).weight, 9.99);
    assert.equal(reloadedMaterials.find(part => part.code === custom.code).weight, 3.5);
    assert.equal((await fetch(base + '/data/materials.sqlite')).status, 404);
    const loaded = await (await fetch(base + '/api/projects/' + id)).json();
    assert.equal(loaded.name, project.name);
    assert.deepEqual(loaded.formValues, project.formValues);
    assert.deepEqual(loaded.calculation, project.calculation);
    assert.equal((await (await fetch(base + '/api/projects')).json()).length, 1);
    assert.equal((await fetch(base + '/data/projects.sqlite')).status, 404);
    assert.equal((await fetch(base + '/api/projects', {headers: {Origin: 'https://example.com'}})).status, 403);
    assert.equal((await fetch(base + '/api/projects/999')).status, 404);
    assert.equal((await fetch(base + '/api/projects', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).status, 400);
  } finally {
    if (server?.listening) await stop();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
