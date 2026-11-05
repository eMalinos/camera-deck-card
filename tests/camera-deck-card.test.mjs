// Run: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, layoutOf, isOnline, wrap, pageOf, posterPath, playerConfig, viewModel, controlsOf, PLAYER_STYLE, STYLE, OVERLAY_DEFAULTS, OVERLAY_ALLOWED, OVERLAY_ORDER } from '../dist/camera-deck-card.js';

const hass = (states) => ({ states: Object.fromEntries(Object.entries(states).map(([k, v]) => [k, { state: v }])) });
const cfg = (n) => normalizeConfig({ cameras: Array.from({ length: n }, (_, i) => ({ stream: `s${i}`, name: `Cam ${i}` })) });

test('normalizeConfig fills defaults and rejects missing cameras/stream', () => {
  assert.deepEqual(normalizeConfig({ cameras: [{ stream: 'cam_entry' }] }),
    { overlay: OVERLAY_DEFAULTS, title: 'Cameras', layout_entity: null, cameras: [{ stream: 'cam_entry', name: 'cam_entry', entity: null, ptz: null, privacy: null, sound: false }] });
  assert.equal(normalizeConfig({ cameras: [{ stream: 'a', sound: true }] }).cameras[0].sound, true);
  assert.throws(() => normalizeConfig({}), /cameras is required/);
  assert.throws(() => normalizeConfig({ cameras: [] }), /cameras is required/);
  assert.throws(() => normalizeConfig({ cameras: [{ name: 'x' }] }), /cameras\[0\]\.stream is required/);
});

test('normalizeConfig overlay: defaults, full override, unknown key, disallowed value', () => {
  const ov = (overlay) => normalizeConfig({ cameras: [{ stream: 'a' }], overlay }).overlay;
  assert.deepEqual(ov(undefined), OVERLAY_DEFAULTS);
  assert.deepEqual(ov({ sound: 'bottom-left' }), { ...OVERLAY_DEFAULTS, sound: 'bottom-left' });
  const all = { live: 'top-left', name: 'hidden', mode: 'center', fullscreen: 'below', ptz: 'middle-right', sound: 'below', privacy: 'bottom-center' };
  assert.deepEqual(ov(all), { ...OVERLAY_DEFAULTS, ...all });
  for (const [k, list] of Object.entries(OVERLAY_ALLOWED)) for (const v of list) assert.equal(ov({ [k]: v })[k], v);
  assert.throws(() => ov({ nope: 'hidden' }), /unknown overlay key nope/);
  assert.throws(() => ov({ constructor: 'hidden' }), /unknown overlay key constructor/);
  assert.throws(() => ov({ toString: 'hidden' }), /unknown overlay key toString/);
  assert.throws(() => ov({ live: 'heading' }), /overlay\.live must be one of top-left, .*hidden/);
  assert.throws(() => ov({ ptz: 'heading' }), /overlay\.ptz must be one of/);
  assert.throws(() => ov({ mode: 'below' }), /overlay\.mode must be one of/);
  assert.throws(() => ov({ mode: 'below-left' }), /overlay\.mode must be one of/);
  assert.throws(() => ov({ ptz: 'below-center' }), /overlay\.ptz must be one of/);
  assert.throws(() => ov('top-left'), /overlay must be an object/);
  // card full screen: heading or under the card
  assert.equal(ov({ card_fullscreen: 'footer-right' }).card_fullscreen, 'footer-right');
  assert.throws(() => ov({ card_fullscreen: 'top-left' }), /overlay\.card_fullscreen must be one of/);
  // order: the listed controls first, the rest after them in the default order
  assert.deepEqual(ov({ order: ['ptz', 'sound'] }).order, ['ptz', 'sound', ...OVERLAY_ORDER.filter((c) => c !== 'ptz' && c !== 'sound')]);
  assert.deepEqual(ov({ order: null }).order, OVERLAY_ORDER);
  assert.throws(() => ov({ order: ['ptz', 'ptz'] }), /overlay\.order must be a list/);
  assert.throws(() => ov({ order: ['nope'] }), /overlay\.order must be a list/);
  assert.throws(() => ov({ order: 'ptz' }), /overlay\.order must be a list/);
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
  assert.equal(playerConfig('a', true).muted, false);
  assert.match(p.style, /\.status\{display:none\}/);
  assert.doesNotMatch(p.style, /\.mode\{display:none/); // RTC / MSE label stays visible
  assert.match(p.style, /bottom:var\(--mb,8px\);left:var\(--mx,10px\)/); // bottom left unless the card places it
});

test('playerConfig hides the mode label only for overlay.mode hidden', () => {
  assert.equal(playerConfig('a', false, 'bottom-left').style, PLAYER_STYLE);
  assert.equal(playerConfig('a', false, 'top-center').style, PLAYER_STYLE); // placed by the card (--mx / --my)
  assert.match(PLAYER_STYLE, /\.header\{top:var\(--my,auto\);bottom:var\(--mb,8px\);left:var\(--mx,10px\)/);
  assert.match(playerConfig('a', false, 'hidden').style, /\.mode\{display:none\}$/);
});

test('player keeps the whole frame (camera time overlay is not cropped)', () => {
  assert.match(PLAYER_STYLE, /video\{[^}]*object-fit:contain/);
});

test('controlsOf finds PTZ buttons and privacy switch on the camera device, config wins', () => {
  const h = {
    states: { 'switch.bed_privacy': { state: 'on' } },
    entities: Object.fromEntries([
      ['camera.bed', 'd1'], ['button.bed_move_up', 'd1'], ['button.bed_move_left', 'd1'], ['switch.bed_privacy', 'd1'],
      ['button.other_move_down', 'd2'], ['button.bed_reboot', 'd1'],
    ].map(([id, dev]) => [id, { entity_id: id, device_id: dev }])),
  };
  const c = controlsOf(h, { entity: 'camera.bed' });
  assert.deepEqual(c.ptz, [{ dir: 'left', entity: 'button.bed_move_left' }, { dir: 'up', entity: 'button.bed_move_up' }]);
  assert.deepEqual(c.privacy, { entity: 'switch.bed_privacy', on: true });
  assert.deepEqual(controlsOf(h, { entity: 'camera.bed', ptz: { right: 'button.x' }, privacy: 'switch.y' }),
    { ptz: [{ dir: 'right', entity: 'button.x' }], privacy: { entity: 'switch.y', on: false } });
  assert.deepEqual(controlsOf({ states: {} }, { entity: 'camera.bed' }), { ptz: [], privacy: null });
  assert.deepEqual(controlsOf(h, { entity: null }), { ptz: [], privacy: null });
});

test('viewModel sound is per stream and controls only in the single layout', () => {
  const c = cfg(2);
  assert.equal(viewModel(c, hass({}), { layout: '1', cam: 1, page: 0, sound: { s1: true } }).cam.sound, true);
  assert.equal(viewModel(c, hass({}), { layout: '1', cam: 0, page: 0, sound: { s1: true } }).cam.sound, false);
  assert.deepEqual(viewModel(c, hass({}), { layout: '2', cam: 0, page: 0 }).cam.ptz, []);
});

test('viewModel gridSound is on only when every camera on the page has sound', () => {
  const c = cfg(3);
  assert.equal(viewModel(c, hass({}), { layout: '2', cam: 0, page: 0, sound: { s0: true, s1: true } }).gridSound, true);
  assert.equal(viewModel(c, hass({}), { layout: '2', cam: 0, page: 0, sound: { s0: true } }).gridSound, false);
  assert.deepEqual(viewModel(c, hass({}), { layout: '2', cam: 0, page: 1, sound: { s0: true, s1: true } }).grid.map((g) => g.sound), [false]);
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
  assert.equal(viewModel(cfg(2), hass({}), { layout: '2', cam: 0, page: 0 }).pager.label, ''); // one page: no label
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
  const fixed = ['#000000', '#d32f2f', '#616161', '#ffffff', '#43a047', '#9e9e9e', '#2b3036', '#212121'];
  const allowedIn = (sel) => /badge|nav|pos|pill|ph|missing|fsb|\.view|\.tile|\.img|\.dot|\.off|\.out/.test(sel);
  const rules = STYLE.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, '').split('}');
  for (const r of rules) {
    const [sel, body = ''] = r.split('{');
    for (const hex of body.match(/#[0-9a-f]{3,6}\b/gi) || []) {
      assert.ok(allowedIn(sel) && fixed.includes(hex.toLowerCase()), `bare ${hex} in "${sel.trim()}"`);
    }
  }
});

test('card badges hide on a narrow card wherever they are placed', () => {
  assert.match(STYLE, /\.z-top-right,\.z-middle-right\{right:var\(--s\)\}/);
  assert.match(STYLE, /@container \(max-width:500px\)\{\.grid \.bdg\{display:none\}\}/);
});

test('viewModel: grid tiles get privacy only on the picture; the selected camera has its controls in a grid too', () => {
  const h = { states: {}, entities: { 'camera.a': { entity_id: 'camera.a', device_id: 'd' }, 'switch.a_privacy': { entity_id: 'switch.a_privacy', device_id: 'd' }, 'button.a_move_up': { entity_id: 'button.a_move_up', device_id: 'd' } } };
  const mk = (privacy) => normalizeConfig({ overlay: privacy && { privacy }, cameras: [{ stream: 'a', entity: 'camera.a' }, { stream: 'b' }] });
  const st = { layout: '2', cam: 0, page: 0 };
  assert.deepEqual(viewModel(mk(), h, st).grid.map((g) => g.privacy), [null, null]);
  assert.deepEqual(viewModel(mk('below'), h, st).grid.map((g) => g.privacy), [null, null]);
  assert.deepEqual(viewModel(mk('top-left'), h, st).grid.map((g) => g.privacy), [{ entity: 'switch.a_privacy', on: false }, null]);
  const vm = viewModel(mk(), h, st);
  assert.equal(vm.cam.ptz.length, 1);
  assert.deepEqual(vm.grid.map((g) => g.selected), [true, false]);
});

test('viewModel waiting: sound wanted but blocked by the browser', () => {
  const c = cfg(2);
  const vm = viewModel(c, hass({}), { layout: '2', cam: 0, page: 0, sound: { s0: true }, blocked: { s0: true, s1: true } });
  assert.deepEqual(vm.grid.map((g) => g.waiting), [true, false]);
  assert.equal(vm.gridWaiting, true);
  assert.equal(viewModel(c, hass({}), { layout: '1', cam: 0, page: 0, sound: { s0: true } }).cam.waiting, false);
});

test('viewModel camera full screen shows one camera over a grid layout', () => {
  const vm = viewModel(cfg(4), hass({}), { layout: '4', cam: 2, page: 0, fs: 'cam' });
  assert.equal(vm.isSingle, true);
  assert.equal(vm.cam.index, 2);
  assert.equal(vm.fs, 'cam');
  assert.equal(viewModel(cfg(4), hass({}), { layout: '4', cam: 0, page: 0, fs: 'deck' }).isSingle, false);
});

test('player host fills its slot', () => {
  assert.match(STYLE, /\.slot>webrtc-camera\{display:block;width:100%;height:100%\}/);
});

test('viewModel one camera is always the single layout', () => {
  assert.equal(viewModel(cfg(1), hass({}), { layout: '4', cam: 0, page: 0 }).isSingle, true);
});
