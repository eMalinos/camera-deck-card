// Run: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, layoutOf, isOnline, wrap, pageOf, posterPath, playerConfig, viewModel, PLAYER_STYLE, STYLE } from '../dist/camera-deck-card.js';

const hass = (states) => ({ states: Object.fromEntries(Object.entries(states).map(([k, v]) => [k, { state: v }])) });
const cfg = (n) => normalizeConfig({ cameras: Array.from({ length: n }, (_, i) => ({ stream: `s${i}`, name: `Cam ${i}` })) });

test('normalizeConfig fills defaults and rejects missing cameras/stream', () => {
  assert.deepEqual(normalizeConfig({ cameras: [{ stream: 'cam_entry' }] }),
    { title: 'Cameras', layout_entity: null, cameras: [{ stream: 'cam_entry', name: 'cam_entry', entity: null }] });
  assert.throws(() => normalizeConfig({}), /cameras is required/);
  assert.throws(() => normalizeConfig({ cameras: [] }), /cameras is required/);
  assert.throws(() => normalizeConfig({ cameras: [{ name: 'x' }] }), /cameras\[0\]\.stream is required/);
});

test('layoutOf prefers a valid entity state, then local, then 1', () => {
  assert.equal(layoutOf(hass({ 'input_select.l': '4' }), 'input_select.l', '2'), '4');
  assert.equal(layoutOf(hass({ 'input_select.l': '3' }), 'input_select.l', '2'), '2');
  assert.equal(layoutOf(hass({ 'input_select.l': 'unavailable' }), 'input_select.l', undefined), '1');
  assert.equal(layoutOf(hass({}), 'input_select.missing', '4'), '4');
  assert.equal(layoutOf(hass({}), null, 'x'), '1');
});

test('isOnline is false only for an unavailable/unknown/missing entity', () => {
  assert.equal(isOnline(hass({}), null), true);
  assert.equal(isOnline(hass({ 'camera.a': 'idle' }), 'camera.a'), true);
  assert.equal(isOnline(hass({ 'camera.a': 'unavailable' }), 'camera.a'), false);
  assert.equal(isOnline(hass({ 'camera.a': 'unknown' }), 'camera.a'), false);
  assert.equal(isOnline(hass({}), 'camera.a'), false);
});

test('wrap and pageOf', () => {
  assert.equal(wrap(-1, 5), 4);
  assert.equal(wrap(5, 5), 0);
  assert.deepEqual(pageOf(5, 2, 0), { pages: 3, page: 0, start: 0, end: 2 });
  assert.deepEqual(pageOf(5, 2, 2), { pages: 3, page: 2, start: 4, end: 5 });
  assert.deepEqual(pageOf(5, 4, 2), { pages: 2, page: 1, start: 4, end: 5 });
  assert.deepEqual(pageOf(1, 4, 0), { pages: 1, page: 0, start: 0, end: 1 });
});

test('posterPath and playerConfig encode the stream and never use entity', () => {
  assert.equal(posterPath('camera.cam entry&x'), '/api/webrtc/ws?poster=camera.cam%20entry%26x');
  const p = playerConfig('cam_entry');
  assert.equal(p.url, 'cam_entry');
  assert.equal(p.muted, true);
  assert.equal('entity' in p, false);
  assert.match(p.style, /\.mode/);
});

test('viewModel single layout', () => {
  const vm = viewModel(cfg(5), hass({}), { layout: '1', cam: -1, page: 0 });
  assert.equal(vm.isSingle, true);
  assert.equal(vm.cam.index, 4);
  assert.equal(vm.cam.pos, '5 / 5');
  assert.equal(vm.pager.label, '');
  assert.equal(vm.cams.filter((c) => c.selected).length, 1);
});

test('viewModel grid pages are clamped and use 2 columns semantics', () => {
  const vm = viewModel(cfg(5), hass({}), { layout: '4', cam: 0, page: 2 });
  assert.equal(vm.isSingle, false);
  assert.equal(vm.pager.label, 'Page 2 / 2');
  assert.deepEqual(vm.grid.map((g) => g.index), [4]);
  assert.deepEqual(vm.pager.dots, [false, true]);
  const two = viewModel(cfg(5), hass({}), { layout: '2', cam: 0, page: 0 });
  assert.deepEqual(two.grid.map((g) => g.index), [0, 1]);
});

test('viewModel forceSingle overrides the shared layout entity', () => {
  const c = normalizeConfig({ layout_entity: 'input_select.l', cameras: [{ stream: 'a' }, { stream: 'b' }] });
  const h = hass({ 'input_select.l': '4' });
  assert.equal(viewModel(c, h, { layout: '1', cam: 0, page: 0 }).isSingle, false);
  assert.equal(viewModel(c, h, { layout: '1', cam: 1, page: 0, forceSingle: true }).cam.stream, 'b');
});

test('player video ignores taps (no native controls over the overlays)', () => {
  assert.match(PLAYER_STYLE, /video\{[^}]*pointer-events:none/);
});

test('card colours follow the theme: hex colours only as var() fallbacks, except badges/overlays', () => {
  const fixed = ['#d32f2f', '#616161', '#ffffff', '#43a047', '#9e9e9e', '#2b3036', '#212121'];
  const allowedIn = (sel) => /badge|nav|vdots|pos|pill|ph|missing|\.view|\.tile|\.img|\.dot|\.off/.test(sel);
  const rules = STYLE.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, '').split('}');
  for (const r of rules) {
    const [sel, body = ''] = r.split('{');
    for (const hex of body.match(/#[0-9a-f]{3,6}\b/gi) || []) {
      assert.ok(allowedIn(sel) && fixed.includes(hex.toLowerCase()), `bare ${hex} in "${sel.trim()}"`);
    }
  }
});

test('player host fills its slot', () => {
  assert.match(STYLE, /\.slot>webrtc-camera\{display:block;width:100%;height:100%\}/);
});
