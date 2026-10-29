/**
 * camera-deck-card — camera card for Home Assistant.
 * Layout 1: one camera with prev / next and a thumbnail strip.
 * Layout 2 / 4: a two-column grid with 2 or 4 cameras per page.
 * The layout can be shared by every device through an input_select (`layout_entity`).
 *
 * Video: go2rtc streams played by the WebRTC Camera integration's `webrtc-camera`
 * element (WebRTC, MSE or HLS, whichever the network allows). Thumbnails: go2rtc
 * frames through the same integration (`/api/webrtc/ws?poster=<stream>`).
 * https://github.com/eMalinos/camera-deck-card
 */

const VERSION = '0.1.0';

const LAYOUTS = ['1', '2', '4'];
const OFFLINE_STATES = ['unavailable', 'unknown'];

const PTZ_DIRS = ['left', 'up', 'down', 'right'];

// Card badges sit top right: cameras usually stamp the time top left.
// Keeps only webrtc-camera's mode label (RTC / MSE / HLS), as a small pill bottom left
// (bottom right is the full screen button); the card draws its own overlays.
// `contain` keeps the camera's own overlays (time) in view.
export const PLAYER_STYLE = '.status{display:none} .header{top:auto;bottom:8px;left:10px;right:auto} .mode{opacity:1;pointer-events:none;background:rgba(0,0,0,.55);border-radius:8px;padding:2px 7px;font-size:10px;font-weight:600;letter-spacing:.04em} ha-card{background:none;border-radius:0;box-shadow:none} .player{background:none} video{height:100%;object-fit:contain;pointer-events:none}';

export function normalizeConfig(config) {
  const cameras = config && config.cameras;
  if (!Array.isArray(cameras) || cameras.length === 0) {
    throw new Error('camera-deck-card: cameras is required');
  }
  return {
    title: config.title ?? 'Cameras',
    layout_entity: config.layout_entity || null,
    cameras: cameras.map((c, i) => {
      if (!c || !c.stream) throw new Error(`camera-deck-card: cameras[${i}].stream is required`);
      return { stream: String(c.stream), name: c.name || String(c.stream), entity: c.entity || null, ptz: c.ptz || null, privacy: c.privacy || null, sound: !!c.sound };
    }),
  };
}

export function layoutOf(hass, layoutEntity, local) {
  const state = layoutEntity && hass?.states?.[layoutEntity]?.state;
  if (LAYOUTS.includes(state)) return state;
  if (LAYOUTS.includes(local)) return local;
  return '1';
}

export function isOnline(hass, entity) {
  if (!entity) return true;
  const st = hass?.states?.[entity];
  return !!st && !OFFLINE_STATES.includes(st.state);
}

export function wrap(i, n) {
  return ((i % n) + n) % n;
}

export function pageOf(count, per, page) {
  const pages = Math.max(1, Math.ceil(count / per));
  const p = Math.min(Math.max(page || 0, 0), pages - 1);
  return { pages, page: p, start: p * per, end: Math.min(p * per + per, count) };
}

export function posterPath(stream) {
  return '/api/webrtc/ws?poster=' + encodeURIComponent(stream);
}

export function playerConfig(stream, sound = false) {
  return { url: stream, muted: !sound, ui: false, intersection: 0.5, style: PLAYER_STYLE };
}

// PTZ buttons and the privacy switch: from the config, else found on the camera entity's
// device by entity id suffix (`button.*_move_up`, `switch.*_privacy`, as Tapo names them).
export function controlsOf(hass, cam) {
  const dev = cam.entity && hass?.entities?.[cam.entity]?.device_id;
  const ids = dev ? Object.values(hass.entities).filter((e) => e.device_id === dev).map((e) => e.entity_id) : [];
  const find = (domain, suffix) => ids.find((id) => id.startsWith(domain + '.') && id.endsWith(suffix)) || null;
  const ptzMap = cam.ptz || Object.fromEntries(PTZ_DIRS.map((d) => [d, find('button', '_move_' + d)]));
  const privacy = cam.privacy || find('switch', '_privacy');
  return {
    ptz: PTZ_DIRS.filter((d) => ptzMap[d]).map((d) => ({ dir: d, entity: ptzMap[d] })),
    privacy: privacy ? { entity: privacy, on: hass?.states?.[privacy]?.state === 'on' } : null,
  };
}

export function viewModel(cfg, hass, state) {
  const n = cfg.cameras.length;
  const layout = n === 1 || state.forceSingle || state.fs === 'cam' ? '1' : layoutOf(hass, cfg.layout_entity, state.layout);
  const isSingle = layout === '1';
  const ci = wrap(state.cam || 0, n);
  const cams = cfg.cameras.map((c, i) => ({
    index: i, stream: c.stream, name: c.name, online: isOnline(hass, c.entity), selected: i === ci, sound: !!state.sound?.[c.stream],
    // Sound wanted but the browser blocked it until the first tap on the page.
    waiting: !!state.sound?.[c.stream] && !!state.blocked?.[c.stream],
  }));
  const pg = pageOf(n, isSingle ? 1 : Number(layout), state.page);
  const grid = isSingle ? [] : cams.slice(pg.start, pg.end).map(({ selected, ...c }) => c);
  return {
    title: cfg.title,
    layout,
    fs: state.fs || null,
    isSingle,
    pager: {
      label: isSingle || pg.pages === 1 ? '' : `Page ${pg.page + 1} / ${pg.pages}`,
      pages: pg.pages,
      page: pg.page,
      dots: Array.from({ length: pg.pages }, (_, k) => k === pg.page),
    },
    cam: {
      index: ci, stream: cams[ci].stream, name: cams[ci].name, online: cams[ci].online, pos: `${ci + 1} / ${n}`,
      sound: cams[ci].sound, waiting: cams[ci].waiting, ...(isSingle ? controlsOf(hass, cfg.cameras[ci]) : { ptz: [], privacy: null }),
    },
    cams,
    grid,
    // Grid sound button: on when every camera on the page has sound.
    gridSound: grid.length > 0 && grid.every((c) => c.sound),
    gridWaiting: grid.some((c) => c.waiting),
  };
}

const THUMB_REFRESH_MS = 10000;
const PLAYER_WAIT_MS = 10000;
const MISSING_PLAYER = 'WebRTC Camera integration (HACS) is missing';

const ICON_PATHS = {
  '1': '<rect x="3" y="5" width="18" height="14" rx="2"></rect>',
  '2': '<rect x="2" y="7" width="9" height="10" rx="1.5"></rect><rect x="13" y="7" width="9" height="10" rx="1.5"></rect>',
  '4': '<rect x="3" y="4" width="8" height="7" rx="1.5"></rect><rect x="13" y="4" width="8" height="7" rx="1.5"></rect><rect x="3" y="13" width="8" height="7" rx="1.5"></rect><rect x="13" y="13" width="8" height="7" rx="1.5"></rect>',
};
const LAYOUT_LABELS = { '1': '1 camera', '2': '2 cameras', '4': '4 cameras' };
const CAMERA_ICON = (size, width) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" aria-hidden="true"><path d="M3 7h12v10H3zM15 10l6-3v10l-6-3"></path></svg>`;
const CHEVRON_PATHS = { prev: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };
const CHEVRON = (dir, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="${CHEVRON_PATHS[dir]}"></path></svg>`;
const TOOL_ICON = (d) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"></path></svg>`;
const SOUND_ON = 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7';
const SOUND_OFF = 'M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5';
const FS = 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5';
const FS_EXIT = 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5';
const PRIVACY = 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4 4l16 16';
const PTZ_LABELS = { left: 'Pan left', up: 'Tilt up', down: 'Tilt down', right: 'Pan right' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const STYLE = `
:host{display:block}
:host([fs]){position:fixed;inset:0;z-index:9999}
.card{container-type:inline-size;background:var(--ha-card-background,var(--card-background-color,#ffffff));color:var(--primary-text-color,#212121);border-radius:20px;padding:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:10px;font-family:inherit}
button{font-family:inherit;cursor:pointer}
.head{display:flex;align-items:center;gap:10px;padding:2px 4px 0}
.head h2{margin:0;flex:1;font-size:16px;font-weight:500}
.page-label{font-size:12px;white-space:nowrap;color:var(--secondary-text-color,#6b6b6b)}
.switch{display:flex;background:var(--secondary-background-color,#f0f0f0);border-radius:12px;padding:3px;gap:3px}
.switch button{width:40px;height:36px;border:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--secondary-text-color,#616161)}
.switch button[aria-checked="true"]{background:var(--card-background-color,#ffffff);color:var(--primary-text-color,#212121);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.view{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#2b3036}
.slot{position:absolute;inset:0}
.slot>webrtc-camera{display:block;width:100%;height:100%}
.out{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000000}
.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;font-size:12px;color:rgba(255,255,255,.35)}
.top{position:absolute;right:12px;top:12px;display:flex;gap:8px;align-items:center}
.badges{display:flex;gap:8px;align-items:center}
@container (max-width:500px){.badges{display:none}}
.badge{border-radius:10px;padding:4px 10px;font-size:11px;font-weight:700;color:#ffffff;background:#d32f2f}
.badge.off{background:#616161}
.pill{background:rgba(0,0,0,.55);color:#ffffff;border-radius:10px;padding:4px 10px;font-size:12px;font-weight:500}
.pos{background:rgba(0,0,0,.55);color:#ffffff;border-radius:10px;padding:4px 10px;font-size:12px}
.nav{position:absolute;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.85);color:#212121;display:flex;align-items:center;justify-content:center}
.nav.prev{left:10px}.nav.next{right:10px}
.strip{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 4px}
.thumb{flex:none;width:132px;border:0;padding:4px;border-radius:14px;display:flex;flex-direction:column;gap:6px;text-align:left;background:transparent;scroll-snap-align:start;color:var(--primary-text-color,#212121)}
.thumb[aria-selected="true"]{background:color-mix(in srgb,var(--primary-color,#0277bd) 12%,transparent);outline:2px solid var(--primary-color,#0277bd)}
.thumb .img{position:relative;display:block;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#2b3036}
.thumb .img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.thumb .img .ph svg{width:20px;height:20px}
.thumb.off .img{opacity:.45}
.thumb .lbl{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500}
.dot{width:7px;height:7px;border-radius:50%;flex:none;background:#43a047}
.off .dot,.dot.off{background:#9e9e9e}
.grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}
.cell{position:relative;min-width:0}
.tile{position:relative;border:0;padding:0;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#2b3036}
.tile.off{opacity:.6}
.tile .slot{pointer-events:none}
.tile .top{right:8px;top:8px;gap:6px}
.tile .badges{gap:6px}
.tile .badge{border-radius:8px;padding:3px 8px;font-size:10px}
.tile .pill{border-radius:8px;padding:3px 8px;font-size:11px}
.pager{position:relative;display:flex;align-items:center;justify-content:center;gap:12px}
.hact[aria-pressed="true"],.tools button[aria-pressed="true"]{background:color-mix(in srgb,var(--primary-color,#0277bd) 16%,transparent);color:var(--primary-color,#0277bd)}
.pill.snd{display:flex;padding:3px 6px}
.pill.snd svg{width:14px;height:14px}
.pager button{width:44px;height:44px;border-radius:50%;border:0;background:var(--secondary-background-color,#f0f0f0);color:var(--primary-text-color,#212121);display:flex;align-items:center;justify-content:center}
.pdots{display:flex;gap:6px}
.pdots span{width:6px;height:6px;border-radius:3px;background:var(--disabled-text-color,#c9c9c9)}
.pdots span.on{width:18px;background:var(--primary-text-color,#212121)}
.tools{display:flex;align-items:center;gap:8px}
.tools .sp{flex:1}
.tools button{width:44px;height:40px;border:0;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color,#f0f0f0);color:var(--primary-text-color,#212121)}
.fsb{position:absolute;right:10px;bottom:10px;width:36px;height:36px;border:0;border-radius:10px;background:rgba(0,0,0,.55);color:#ffffff;display:flex;align-items:center;justify-content:center}
.cell .fsb{right:8px;bottom:8px;width:32px;height:32px}
.hbtn,.hact{width:42px;height:42px;border:0;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color,#f0f0f0);color:var(--primary-text-color,#212121)}
.card.fs{height:100%;box-sizing:border-box;border-radius:0}
.fs .view{flex:1;min-height:0;aspect-ratio:auto}
.fs .grid{flex:1;min-height:0;grid-auto-rows:minmax(0,1fr)}
.fs .tile{height:100%;aspect-ratio:auto}
@media (orientation:portrait){.fs .grid.n2{grid-template-columns:minmax(0,1fr)}}
.missing{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;font-size:13px;color:#ffffff}
`;

class CameraDeckCard extends (globalThis.HTMLElement ?? class {}) {
  constructor() {
    super();
    this._state = { layout: '1', cam: 0, page: 0, forceSingle: false, sound: {}, blocked: {}, fs: null };
    this._players = new Map(); // stream -> webrtc-camera element
    this._watched = new WeakSet(); // videos with a volumechange listener
    this._thumbs = new Map(); // stream -> signed image URL
    this._vmKey = '';
    this._layoutState = undefined;
    this._missingPlayer = false;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    this._onVisibility = () => { if (document.visibilityState === 'visible') this._refreshThumbs(); };
    // Full screen left with Esc / the system gesture.
    this._onFullscreen = () => {
      if (document.fullscreenElement === this) this._native = true;
      else if (this._native) this._exitFs();
    };
    // Any tap on the page lets the browser play sound it blocked on load.
    // Taps on this card's sound buttons unlock in _onClick.
    this._onGesture = (e) => {
      const path = e.composedPath();
      if (Object.keys(this._state.blocked).length && !(path.includes(this) && path[0]?.closest?.('[data-act$="sound"]'))) this._unlockSound();
    };
  }

  static getStubConfig() {
    return { cameras: [{ stream: 'cam_entry' }] };
  }

  setConfig(config) {
    this._cfg = normalizeConfig(config);
    this._state.sound = Object.fromEntries(this._cfg.cameras.filter((c) => c.sound).map((c) => [c.stream, true]));
    this._state.blocked = {};
    this._vmKey = '';
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const ls = this._cfg?.layout_entity && hass.states?.[this._cfg.layout_entity]?.state;
    if (this._layoutState !== undefined && ls !== this._layoutState) this._state.forceSingle = false;
    this._layoutState = ls;
    for (const p of this._players.values()) p.hass = hass;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 'full', min_columns: 6 };
  }

  connectedCallback() {
    if (this._moving) return;
    document.addEventListener('visibilitychange', this._onVisibility);
    document.addEventListener('fullscreenchange', this._onFullscreen);
    document.addEventListener('click', this._onGesture, true);
    document.addEventListener('touchend', this._onGesture, true); // iOS sends no click for taps on plain elements
    this._timer = setInterval(() => this._refreshThumbs(), THUMB_REFRESH_MS);
    this._refreshThumbs();
    requestAnimationFrame(() => this._quietPlayers()); // players connect after the card
  }

  disconnectedCallback() {
    if (this._moving) return;
    document.removeEventListener('visibilitychange', this._onVisibility);
    document.removeEventListener('fullscreenchange', this._onFullscreen);
    document.removeEventListener('click', this._onGesture, true);
    document.removeEventListener('touchend', this._onGesture, true);
    clearInterval(this._timer);
    if (this._state.fs) this._leaveFs(); // the browser leaves full screen with the element
  }

  _set(patch) {
    Object.assign(this._state, patch);
    this._render();
  }

  _onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const vm = this._vm;
    const n = this._cfg.cameras.length;
    const v = b.dataset.val;
    switch (b.dataset.act) {
      case 'layout':
        if (this._cfg.layout_entity) {
          this._hass.callService('input_select', 'select_option', { entity_id: this._cfg.layout_entity, option: v });
        }
        this._set({ layout: v, page: 0, forceSingle: false });
        break;
      case 'cam':
        this._slide = Number(v);
        this._set({ cam: wrap(vm.cam.index + Number(v), n) });
        break;
      case 'pick':
        this._slide = Math.sign(Number(v) - vm.cam.index);
        this._set({ cam: Number(v) });
        break;
      case 'page':
        this._set({ page: wrap(vm.pager.page + Number(v), vm.pager.pages) });
        break;
      case 'open':
        this._set({ layout: '1', cam: Number(v), forceSingle: true });
        break;
      case 'sound':
        if (vm.cam.waiting) this._unlockSound();
        else this._set({ sound: { ...this._state.sound, [vm.cam.stream]: !vm.cam.sound }, blocked: {} });
        break;
      case 'grid-sound':
        if (vm.gridWaiting) this._unlockSound();
        else this._set({ sound: { ...this._state.sound, ...Object.fromEntries(vm.grid.map((c) => [c.stream, !vm.gridSound])) }, blocked: {} });
        break;
      case 'fs':
        if (vm.fs) this._exitFs(); else this._enterFs('deck', {});
        break;
      case 'fs-cam':
        if (vm.fs !== 'cam') this._enterFs('cam', { cam: Number(v) });
        else if (this._backToDeck) this._set({ fs: 'deck' });
        else this._exitFs();
        break;
      case 'press':
        this._hass.callService('button', 'press', { entity_id: v });
        break;
      case 'toggle':
        this._hass.callService('switch', 'toggle', { entity_id: v });
        break;
    }
  }

  // The card itself goes full screen, so re-renders keep it there and players keep streaming.
  // It moves to <body> like a modal (position:fixed breaks under HA's transformed/contained
  // ancestors) and covers the page with CSS right away (all iPhone gets: no element full
  // screen there), then asks for real full screen, which some webviews never answer.
  _enterFs(mode, patch) {
    this._backToDeck = this._state.fs === 'deck';
    this._set({ ...patch, fs: mode });
    if (this.hasAttribute('fs')) return; // deck <-> camera
    this._scroll = [window.scrollX, window.scrollY];
    this._home = document.createComment('camera-deck-card');
    this._move(() => { this.replaceWith(this._home); document.body.appendChild(this); });
    this.setAttribute('fs', '');
    if (document.fullscreenEnabled) this.requestFullscreen?.().catch(() => {});
  }

  // Leave real full screen first and drop the CSS cover only once the browser is back:
  // Android WebView lays the page out for the full-screen viewport otherwise and stays
  // scrolled off, with the rest of the dashboard black.
  _exitFs() {
    if (document.fullscreenElement === this) {
      this._native = true; // _onFullscreen finishes the exit
      document.exitFullscreen().catch(() => this._leaveFs());
      return;
    }
    this._leaveFs();
  }

  // Re-parent without the connect/disconnect side effects (players keep streaming).
  _move(fn) {
    this._moving = true;
    fn();
    this._moving = false;
  }

  _leaveFs() {
    this._native = false;
    this.removeAttribute('fs');
    this._set({ fs: null });
    // ponytail: the view was left while in full screen -> the card just closes; keep it alive if that ever matters.
    if (this._home) this._move(() => (this._home.isConnected ? this._home.replaceWith(this) : this.remove()));
    this._home = null;
    const [x, y] = this._scroll || [window.scrollX, window.scrollY];
    window.scrollTo(x, y);
    window.dispatchEvent(new Event('resize')); // relayout the dashboard for the restored viewport
  }

  // Inside a user gesture: unmute the cameras whose sound the browser blocked.
  _unlockSound() {
    this._set({ blocked: {} });
  }

  _render() {
    if (!this._cfg || !this._hass) return;
    const vm = viewModel(this._cfg, this._hass, this._state);
    const prev = this._vm;
    this._vm = vm;
    const key = JSON.stringify(vm) + this._missingPlayer;
    if (key === this._vmKey) return;
    this._vmKey = key;
    const slide = vm.isSingle && prev?.isSingle && prev.cam.stream !== vm.cam.stream ? this._slide : 0;
    this._slide = 0;
    const out = slide ? this._snapshot(prev.cam.stream) : null;
    const scroll = this.shadowRoot.querySelector('.strip')?.scrollLeft || 0;
    const wasSingle = this._wasSingle;
    this._wasSingle = vm.isSingle;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card${vm.fs ? ' fs' : ''}">${vm.fs === 'cam' ? '' : this._head(vm)}${vm.isSingle ? this._single(vm) : this._grid(vm)}</div>`;
    this._mountPlayers(vm);
    if (!vm.isSingle) return;
    if (slide) this._slideIn(out, slide);
    const strip = this.shadowRoot.querySelector('.strip');
    if (!strip) return; // camera full screen
    strip.scrollLeft = scroll;
    const sel = strip.querySelector('.thumb[aria-selected="true"]');
    if (sel.offsetLeft < strip.scrollLeft || sel.offsetLeft + sel.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
    }
    for (const img of strip.querySelectorAll('img')) img.addEventListener('error', () => this._thumbFailed(img));
    if (!wasSingle) this._refreshThumbs();
  }

  // The last frame of the outgoing camera: its player leaves the DOM on the camera switch.
  _snapshot(stream) {
    const v = this._players.get(stream)?.video;
    if (!v?.videoWidth) return null;
    const c = document.createElement('canvas');
    c.className = 'out';
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    try { c.getContext('2d').drawImage(v, 0, 0); } catch { return null; }
    return c;
  }

  // Camera switch: the old picture slides out, the new one slides in (dir 1 = from the right).
  _slideIn(out, dir) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const view = this.shadowRoot.querySelector('.view');
    const opts = { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' };
    for (const el of view.querySelectorAll('.slot,.ph')) el.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: 'none' }], opts);
    if (!out) return;
    view.prepend(out);
    out.animate([{ transform: 'none' }, { transform: `translateX(${-dir * 100}%)` }], opts).onfinish = () => out.remove();
  }

  _thumbFailed(img) {
    img.parentElement.innerHTML = `<span class="ph">${CAMERA_ICON(20, 1.5)}</span>`;
  }

  _head(vm) {
    const btns = ['1', '2', '4'].map((id) =>
      `<button role="radio" aria-checked="${vm.layout === id}" aria-label="${LAYOUT_LABELS[id]}" data-act="layout" data-val="${id}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICON_PATHS[id]}</svg></button>`).join('');
    return `<div class="head"><h2>${esc(vm.title)}</h2><span class="page-label">${vm.pager.label}</span>${this._acts(vm, 'hact')}${vm.cams.length > 1 ? `<div class="switch" role="radiogroup" aria-label="Camera layout">${btns}</div>` : ''}<button class="hbtn" aria-label="${vm.fs ? 'Exit full screen' : 'Full screen'}" data-act="fs">${TOOL_ICON(vm.fs ? FS_EXIT : FS)}</button></div>`;
  }

  // Top right row: LIVE / OFFLINE and the name (hidden on a narrow card), then `extra`.
  _top(c, extra) {
    return `<span class="top"><span class="badges"><span class="badge${c.online ? '' : ' off'}">${c.online ? '● LIVE' : 'OFFLINE'}</span><span class="pill">${esc(c.name)}</span></span>${extra}</span>`;
  }

  _fsBtn(index, on) {
    return `<button class="fsb" aria-label="${on ? 'Exit full screen' : 'Full screen'}" data-act="fs-cam" data-val="${index}">${TOOL_ICON(on ? FS_EXIT : FS)}</button>`;
  }

  _soundIcon(c) {
    return TOOL_ICON(c.sound && !c.waiting ? SOUND_ON : SOUND_OFF);
  }

  _video(c, iconSize) {
    if (!c.online) return `<span class="ph">${CAMERA_ICON(iconSize, 1.5)}<span>Camera unavailable</span></span>`;
    if (this._missingPlayer) return `<span class="missing">${MISSING_PLAYER}</span>`;
    // The last thumbnail shows until the player has video.
    const thumb = this._thumbs.get(c.stream);
    const bg = thumb ? ` style="background:#000000 url(&quot;${esc(thumb)}&quot;) center/contain no-repeat"` : '';
    return `<span class="ph">${CAMERA_ICON(iconSize, 1.5)}</span><div class="slot" data-stream="${esc(c.stream)}"${bg}></div>`;
  }

  _single(vm) {
    const c = vm.cam;
    const n = vm.cams.length;
    const nav = n > 1
      ? `<button class="nav prev" aria-label="Previous camera" data-act="cam" data-val="-1">${CHEVRON('prev', 20)}</button><button class="nav next" aria-label="Next camera" data-act="cam" data-val="1">${CHEVRON('next', 20)}</button>`
      : '';
    const thumbs = vm.cams.map((x) => {
      const src = x.online && this._thumbs.get(x.stream);
      const img = src ? `<img alt="" src="${esc(src)}">` : `<span class="ph">${CAMERA_ICON(20, 1.5)}</span>`;
      return `<button class="thumb${x.online ? '' : ' off'}" role="tab" aria-selected="${x.selected}" data-act="pick" data-val="${x.index}"><span class="img">${img}</span><span class="lbl"><span class="dot"></span>${esc(x.name)}</span></button>`;
    }).join('');
    return `<div class="view">${this._video(c, 44)}${this._top(c, `<span class="pos">${c.pos}</span>`)}${nav}${this._fsBtn(c.index, vm.fs === 'cam')}</div>`
      + this._tools(c, vm.fs === 'cam' ? this._acts(vm, '') : '')
      + (vm.fs === 'cam' || n === 1 ? '' : `<div class="strip" role="tablist" aria-label="Cameras">${thumbs}</div>`);
  }

  // Sound (and privacy in layout 1) for the heading, above the cameras.
  _acts(vm, cls) {
    if (!vm.isSingle) {
      return `<button class="${cls}" aria-pressed="${vm.gridSound}" aria-label="${vm.gridWaiting ? 'Tap to turn sound on' : vm.gridSound ? 'Mute all' : 'Unmute all'}" data-act="grid-sound">${this._soundIcon({ sound: vm.gridSound, waiting: vm.gridWaiting })}</button>`;
    }
    const c = vm.cam;
    if (!c.online) return '';
    const privacy = c.privacy
      ? `<button class="${cls}" aria-pressed="${c.privacy.on}" aria-label="Privacy mode" data-act="toggle" data-val="${esc(c.privacy.entity)}">${TOOL_ICON(PRIVACY)}</button>`
      : '';
    return `<button class="${cls}" aria-pressed="${c.sound}" aria-label="${c.waiting ? 'Tap to turn sound on' : c.sound ? 'Mute' : 'Unmute'}" data-act="sound">${this._soundIcon(c)}</button>${privacy}`;
  }

  // PTZ under the camera; `acts` when the heading is hidden.
  _tools(c, acts) {
    if (!c.online) return '';
    const ptz = c.ptz.map((p) => `<button aria-label="${PTZ_LABELS[p.dir]}" data-act="press" data-val="${esc(p.entity)}">${CHEVRON(p.dir, 20)}</button>`).join('');
    return ptz || acts ? `<div class="tools">${acts}<span class="sp"></span>${ptz}</div>` : '';
  }

  _grid(vm) {
    // The full screen button sits next to the tile: a button can't hold another button.
    const tiles = vm.grid.map((c) => {
      const snd = c.online && c.sound ? `<span class="pill snd" aria-label="${c.waiting ? 'Sound waits for a tap' : 'Sound on'}">${this._soundIcon(c)}</span>` : '';
      return `<div class="cell"><button class="tile${c.online ? '' : ' off'}" aria-label="Open ${esc(c.name)}" data-act="open" data-val="${c.index}">${this._video(c, 32)}${this._top(c, snd)}</button>${this._fsBtn(c.index, false)}</div>`;
    }).join('');
    const dots = vm.pager.dots.map((on) => `<span class="${on ? 'on' : ''}"></span>`).join('');
    return `<div class="grid n${vm.grid.length}">${tiles}</div>${vm.pager.pages > 1 ? `<div class="pager"><button aria-label="Previous page" data-act="page" data-val="-1">${CHEVRON('prev', 18)}</button><div class="pdots">${dots}</div><button aria-label="Next page" data-act="page" data-val="1">${CHEVRON('next', 18)}</button></div>` : ''}`;
  }

  async _mountPlayers(vm) {
    const slots = [...this.shadowRoot.querySelectorAll('.slot')];
    const wanted = new Set(slots.map((s) => s.dataset.stream));
    // Detached players stop streaming after 5 s; they are kept and reused, because
    // webrtc-camera never removes its document listeners and would leak if recreated.
    for (const [stream, el] of this._players) {
      if (!wanted.has(stream)) el.remove();
    }
    if (!slots.length) return;
    if (!customElements.get('webrtc-camera')) {
      const ok = await Promise.race([
        customElements.whenDefined('webrtc-camera').then(() => true),
        new Promise((r) => setTimeout(() => r(false), PLAYER_WAIT_MS)),
      ]);
      if (!ok) {
        this._missingPlayer = true;
        this._vmKey = '';
        this._render();
        return;
      }
      if (this._vm !== vm) return; // re-rendered while waiting
    }
    for (const slot of slots) {
      const stream = slot.dataset.stream;
      let el = this._players.get(stream);
      if (!el) {
        el = document.createElement('webrtc-camera');
        el.setConfig(playerConfig(stream, this._wantsSound(stream)));
        el.hass = this._hass;
        this._players.set(stream, el);
      }
      slot.appendChild(el); // moving an existing player keeps its stream (webrtc-camera waits 5 s before closing)
      this._applySound(stream, el.video);
    }
    this._quietPlayers();
  }

  _wantsSound(stream) {
    return !!this._state.sound[stream] && !this._state.blocked[stream];
  }

  // A video exists once its player is connected (the card may not be yet).
  _applySound(stream, v) {
    if (!v) return;
    if (!this._watched.has(v)) {
      this._watched.add(v);
      // The player mutes itself when the browser refuses sound before the first tap.
      v.addEventListener('volumechange', () => this._onVolume(stream, v));
    }
    const want = this._wantsSound(stream);
    if (v.muted === !want) return;
    v.muted = !want;
    // Unmuting without a tap pauses the video: play on muted (marks the camera as waiting).
    if (want) v.play().catch((e) => { if (e.name === 'NotAllowedError') { v.muted = true; v.play().catch(() => {}); } });
  }

  // The player muted itself (sound refused, or a reconnect): unmute again, wait for a tap only if the browser refuses.
  _onVolume(stream, v) {
    if (!v.muted || !this._wantsSound(stream)) return;
    v.muted = false;
    v.play().catch((e) => {
      if (e.name !== 'NotAllowedError') return;
      this._set({ blocked: { ...this._state.blocked, [stream]: true } });
      v.muted = true;
      v.play().catch(() => {});
    });
  }

  // video-rtc turns native controls on (on connect) unless its own UI is on.
  _quietPlayers() {
    for (const [stream, el] of this._players) {
      if (el.video) el.video.controls = false;
      if (el.isConnected) this._applySound(stream, el.video);
    }
  }

  async _refreshThumbs() {
    if (!this._cfg || !this._hass || !this.isConnected || document.visibilityState !== 'visible') return;
    if (!this._vm?.isSingle) return;
    const online = this._vm.cams.filter((c) => c.online);
    const results = await Promise.allSettled(online.map((c) =>
      this._hass.callWS({ type: 'auth/sign_path', path: posterPath(c.stream), expires: 60 })
        .then((r) => [c.stream, this._hass.hassUrl(r.path)])));
    for (const r of results) if (r.status === 'fulfilled') this._thumbs.set(...r.value);
    // Swap only the image sources: a full render would also rebuild the players.
    for (const btn of this.shadowRoot.querySelectorAll('.thumb')) {
      const c = this._vm.cams[Number(btn.dataset.val)];
      const src = c && c.online && this._thumbs.get(c.stream);
      if (!src) continue;
      const box = btn.querySelector('.img');
      let img = box.querySelector('img');
      if (!img) {
        box.innerHTML = '<img alt="">';
        img = box.querySelector('img');
        img.addEventListener('error', () => this._thumbFailed(img));
      }
      img.src = src;
    }
  }
}

if (globalThis.customElements && !customElements.get('camera-deck-card')) {
  customElements.define('camera-deck-card', CameraDeckCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'camera-deck-card', name: 'Camera Deck Card', description: 'Cameras: single view with thumbnails, 2/4 grid with pages (go2rtc via WebRTC Camera).' });
  console.info(`%c CAMERA-DECK-CARD %c ${VERSION} `, 'color:#fff;background:#0277bd', '');
}

export { CameraDeckCard, VERSION };
