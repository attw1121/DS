const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ACT20261119-03.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const context = vm.createContext({});
context.invalid = message => { throw new Error(message); };
vm.runInContext(fs.readFileSync(path.join(root, 'scaffold-model.js'), 'utf8'), context);
vm.runInContext(scripts.find(script => script.includes('function planRails')), context);
const calculator = scripts.find(script => script.includes('function calculateMaterials'));
vm.runInContext(calculator.slice(calculator.indexOf('const SPACINGS'), calculator.indexOf('// 表單與結果')) +
  calculator.slice(calculator.indexOf('  const defaultSizes'), calculator.indexOf('  let railSizes')) +
  '\nglobalThis.calculate = calculateMaterials;', context);

test('5 m equal corners connect every 25 cm auxiliary disk in X and Y, with matching quantities', () => {
  const result = context.calculate({spacingX: 1.5, spacingY: 1.5, lengthX: 6, lengthY: 6,
    h1: 5, h2: 5, h3: 5, h4: 5, baseHeight: 0.2, frameHeight: 3,
    xGaps: null, yGaps: null, xBraces: null, yBraces: null});
  const model = context.ScaffoldACT.build(result.geometry);
  const rails = model.members.filter(member => member.code.startsWith('H66'));
  const auxiliaries = model.members.filter(member => member.code === 'V62025');
  assert.equal(auxiliaries.length, 25);
  for (const auxiliary of auxiliaries) {
    const disk = [auxiliary.start[0], auxiliary.start[1], auxiliary.end[2] - 0.1];
    const touches = point => point.every((value, i) => Math.abs(value - disk[i]) < 1e-7);
    const connected = rails.filter(rail => touches(rail.start) || touches(rail.end));
    assert.ok(connected.some(rail => rail.start[0] !== rail.end[0]), 'X rail must meet auxiliary disk');
    assert.ok(connected.some(rail => rail.start[1] !== rail.end[1]), 'Y rail must meet auxiliary disk');
  }
  assert.equal(rails.filter(rail => Math.abs(rail.start[2] - 4.55) < 1e-7).length, 40);
  assert.equal(rails.filter(rail => Math.abs(rail.start[2] - 4.3) < 1e-7).length, 40);
  result.geometry.catalog.forEach((part, index) => {
    assert.equal(model.members.filter(member => member.code === part.code).length, result.quantities[index]);
  });
});

test('25 cm disk already served by the planned tail is not duplicated', () => {
  const plan = context.ScaffoldACT.planRails(0.2, 3.65, 3.65,
    {start: 3.4, short: 1, long: 0}, {start: 3.4, short: 1, long: 0});
  assert.equal(plan.tail, 0.25);
  assert.equal(plan.extraLevels, undefined);
});

test('upper jacks stay within 15–40 cm for standard and selected frames at boundary heights', () => {
  for (const settings of [{frameHeight: 3}, {frameHeight: 1.5}, {frameHeight: 1, mainCode: 'V61150'}]) {
    for (const height of [3.54, 3.55, 3.56, 3.8, 4, 4.54, 4.55, 4.56, 4.8, 5, 5.04, 5.05]) {
      const result = context.calculate({spacingX: 1.5, spacingY: 1.5, lengthX: 3, lengthY: 3,
        h1: height, h2: height, h3: height, h4: height, baseHeight: 0.2,
        xGaps: [1.5], yGaps: [1.5], xBraces: null, yBraces: null, ...settings});
      const jacks = context.ScaffoldACT.build(result.geometry).members.filter(member => member.code === 'U48601');
      assert.equal(jacks.length, 4);
      for (const jack of jacks) {
        const extension = jack.end[2] - jack.start[2];
        assert.ok(extension >= 0.15 - 1e-7 && extension <= 0.4 + 1e-7, `${height}: ${extension}`);
      }
    }
  }
});

test('3D rejects a stored result with an upper jack below 15 cm', () => {
  const catalog = require('../material-defaults.json');
  const quantities = catalog.map(() => 0);
  quantities[0] = quantities[8] = 1;
  assert.throws(() => context.ScaffoldACT.build({catalog, quantities,
    xGaps: [0, 1.5, 0], yGaps: [0, 1.5, 0], heights: [[], [0, 1.14]], base: 0.2,
    supports: [{i: 1, j: 1, parts: [[0, 1], [8, 1]]}], links: [], truncated: false}), /15 cm/);
});

test('50 cm auxiliary connects to a taller neighbor in both directions at its disk', () => {
  const aux = {start: 4.4, short: 0, long: 1};
  const levels = plan => [
    ...Array.from({length: plan.regularCount}, (_, n) => 0.3 + n * 1.5),
    ...(plan.tail ? [0.3 + (plan.regularCount - 1) * 1.5 + plan.tail] : []),
    ...(plan.extraLevels || [])
  ];
  for (const [height, neighbor] of [[5.15, {start: 4.4, short: 1, long: 1}], [5.4, null], [5.65, {start: 5.4, short: 1, long: 0}]]) {
    const forward = levels(context.ScaffoldACT.planRails(0.2, 4.9, height, aux, neighbor));
    const reverse = levels(context.ScaffoldACT.planRails(0.2, height, 4.9, neighbor, aux));
    assert.deepEqual(forward, reverse);
    assert.equal(forward.filter(z => Math.abs(z - 4.8) < 1e-7).length, 1);
    assert.ok(forward.every(z => z <= 4.8 + 1e-7));
  }
  const lower = levels(context.ScaffoldACT.planRails(0.2, 4.9, 4.65, aux, {start: 4.4, short: 1, long: 0}));
  assert.ok(lower.every(z => z <= 4.65 + 1e-7));
});

test('sloped 50 cm auxiliary connections appear in 3D and material counts', () => {
  for (const corners of [[5.2, 5.7, 5.2, 5.7], [5.7, 5.2, 5.7, 5.2], [5.2, 5.2, 5.7, 5.7], [5.7, 5.7, 5.2, 5.2]]) {
    const [h1,h2,h3,h4] = corners;
    const result = context.calculate({spacingX: 1.5, spacingY: 1.5, lengthX: 3, lengthY: 3,
      h1,h2,h3,h4,baseHeight: 0.2,frameHeight: 3,xGaps:[1.5],yGaps:[1.5],xBraces:null,yBraces:null});
    const model = context.ScaffoldACT.build(result.geometry);
    const auxiliaries = model.members.filter(m => m.code === 'V62050');
    assert.ok(auxiliaries.length > 0);
    for (const aux of auxiliaries) {
      const disk = [aux.start[0], aux.start[1], aux.end[2] - 0.1];
      assert.ok(model.members.some(m => m.code.startsWith('H66') && [m.start,m.end].some(p => p.every((v,i) => Math.abs(v-disk[i]) < 1e-7))));
    }
    result.geometry.catalog.forEach((part,i) => assert.equal(model.members.filter(m => m.code === part.code).length,result.quantities[i]));
  }
});
