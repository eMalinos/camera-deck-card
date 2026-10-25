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

// Hides webrtc-camera's own header and mode label; the card draws its own overlays.
export const PLAYER_STYLE = '.header,.mode{display:none} ha-card{background:none;border-radius:0;box-shadow:none} video{height:100%;object-fit:cover;pointer-events:none}';

export function normalizeConfig(config) {
  const cameras = config && config.cameras;
  if (!Array.isArray(cameras) || cameras.length === 0) {
    throw new Error('camera-deck-card: cameras is required');
  }
  return {
    title: config.title ?? 'Kamery',
    layout_entity: config.layout_entity || null,
    cameras: cameras.map((c, i) => {
      if (!c || !c.stream) throw new Error(`camera-deck-card: cameras[${i}].stream is required`);
      return { stream: String(c.stream), name: c.name || String(c.stream), entity: c.entity || null };
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

export function playerConfig(stream) {
  return { url: stream, muted: true, ui: false, intersection: 0.5, style: PLAYER_STYLE };
}

export function viewModel(cfg, hass, state) {
  const layout = state.forceSingle ? '1' : layoutOf(hass, cfg.layout_entity, state.layout);
  const isSingle = layout === '1';
  const n = cfg.cameras.length;
  const ci = wrap(state.cam || 0, n);
  const cams = cfg.cameras.map((c, i) => ({
    index: i, stream: c.stream, name: c.name, online: isOnline(hass, c.entity), selected: i === ci,
  }));
  const pg = pageOf(n, isSingle ? 1 : Number(layout), state.page);
  return {
    title: cfg.title,
    layout,
    isSingle,
    pager: {
      label: isSingle ? '' : `Strana ${pg.page + 1} / ${pg.pages}`,
      pages: pg.pages,
      page: pg.page,
      dots: Array.from({ length: pg.pages }, (_, k) => k === pg.page),
    },
    cam: { index: ci, stream: cams[ci].stream, name: cams[ci].name, online: cams[ci].online, pos: `${ci + 1} / ${n}` },
    cams,
    grid: isSingle ? [] : cams.slice(pg.start, pg.end).map(({ selected, ...c }) => c),
  };
}

const THUMB_REFRESH_MS = 10000;
const PLAYER_WAIT_MS = 10000;
const MISSING_PLAYER = 'Chybí integrace WebRTC Camera (HACS)';

const ICON_PATHS = {
  '1': '<rect x="3" y="5" width="18" height="14" rx="2"></rect>',
  '2': '<rect x="2" y="7" width="9" height="10" rx="1.5"></rect><rect x="13" y="7" width="9" height="10" rx="1.5"></rect>',
  '4': '<rect x="3" y="4" width="8" height="7" rx="1.5"></rect><rect x="13" y="4" width="8" height="7" rx="1.5"></rect><rect x="3" y="13" width="8" height="7" rx="1.5"></rect><rect x="13" y="13" width="8" height="7" rx="1.5"></rect>',
};
const LAYOUT_LABELS = { '1': '1 kamera', '2': '2 kamery', '4': '4 kamery' };
const CAMERA_ICON = (size, width) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" aria-hidden="true"><path d="M3 7h12v10H3zM15 10l6-3v10l-6-3"></path></svg>`;
const CHEVRON = (dir, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="${dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"></path></svg>`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const STYLE = `
:host{display:block}
.card{background:var(--ha-card-background,var(--card-background-color,#ffffff));color:var(--primary-text-color,#212121);border-radius:20px;padding:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:10px;font-family:inherit}
button{font-family:inherit;cursor:pointer}
.head{display:flex;align-items:center;gap:10px;padding:2px 4px 0}
.head h2{margin:0;flex:1;font-size:16px;font-weight:500}
.page-label{font-size:12px;color:var(--secondary-text-color,#6b6b6b)}
.switch{display:flex;background:var(--secondary-background-color,#f0f0f0);border-radius:12px;padding:3px;gap:3px}
.switch button{width:40px;height:36px;border:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--secondary-text-color,#616161)}
.switch button[aria-checked="true"]{background:var(--card-background-color,#ffffff);color:var(--primary-text-color,#212121);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.view{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#2b3036}
.slot{position:absolute;inset:0}
.slot>webrtc-camera{display:block;width:100%;height:100%}
.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;font-size:12px;color:rgba(255,255,255,.35)}
.badges{position:absolute;left:12px;top:12px;display:flex;gap:8px;align-items:center}
.badge{border-radius:10px;padding:4px 10px;font-size:11px;font-weight:700;color:#ffffff;background:#d32f2f}
.badge.off{background:#616161}
.pill{background:rgba(0,0,0,.55);color:#ffffff;border-radius:10px;padding:4px 10px;font-size:12px;font-weight:500}
.pos{position:absolute;right:12px;top:12px;background:rgba(0,0,0,.55);color:#ffffff;border-radius:10px;padding:4px 10px;font-size:12px}
.nav{position:absolute;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.85);color:#212121;display:flex;align-items:center;justify-content:center}
.nav.prev{left:10px}.nav.next{right:10px}
.vdots{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:6px}
.vdots span{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,.5)}
.vdots span.on{width:18px;background:#ffffff}
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
.tile{position:relative;border:0;padding:0;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#2b3036}
.tile.off{opacity:.6}
.tile .slot{pointer-events:none}
.tile .badges{left:8px;top:8px;gap:6px}
.tile .badge{border-radius:8px;padding:3px 8px;font-size:10px}
.tile .pill{border-radius:8px;padding:3px 8px;font-size:11px}
.pager{display:flex;align-items:center;justify-content:center;gap:12px}
.pager button{width:44px;height:44px;border-radius:50%;border:0;background:var(--secondary-background-color,#f0f0f0);color:var(--primary-text-color,#212121);display:flex;align-items:center;justify-content:center}
.pdots{display:flex;gap:6px}
.pdots span{width:6px;height:6px;border-radius:3px;background:var(--disabled-text-color,#c9c9c9)}
.pdots span.on{width:18px;background:var(--primary-text-color,#212121)}
.missing{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;font-size:13px;color:#ffffff}
`;

class CameraDeckCard extends (globalThis.HTMLElement ?? class {}) {
  constructor() {
    super();
    this._state = { layout: '1', cam: 0, page: 0, forceSingle: false };
    this._players = new Map(); // stream -> webrtc-camera element
    this._thumbs = new Map(); // stream -> signed image URL
    this._vmKey = '';
    this._layoutState = undefined;
    this._missingPlayer = false;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    this._onVisibility = () => { if (document.visibilityState === 'visible') this._refreshThumbs(); };
  }

  static getStubConfig() {
    return { cameras: [{ stream: 'cam_entry' }] };
  }

  setConfig(config) {
    this._cfg = normalizeConfig(config);
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
    document.addEventListener('visibilitychange', this._onVisibility);
    this._timer = setInterval(() => this._refreshThumbs(), THUMB_REFRESH_MS);
    this._refreshThumbs();
    requestAnimationFrame(() => this._quietPlayers()); // players connect after the card
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    clearInterval(this._timer);
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
        this._set({ cam: wrap(vm.cam.index + Number(v), n) });
        break;
      case 'pick':
        this._set({ cam: Number(v) });
        break;
      case 'page':
        this._set({ page: wrap(vm.pager.page + Number(v), vm.pager.pages) });
        break;
      case 'open':
        this._set({ layout: '1', cam: Number(v), forceSingle: true });
        break;
    }
  }

  _render() {
    if (!this._cfg || !this._hass) return;
    const vm = viewModel(this._cfg, this._hass, this._state);
    this._vm = vm;
    const key = JSON.stringify(vm) + this._missingPlayer;
    if (key === this._vmKey) return;
    this._vmKey = key;
    const scroll = this.shadowRoot.querySelector('.strip')?.scrollLeft || 0;
    const wasSingle = this._wasSingle;
    this._wasSingle = vm.isSingle;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card">${this._head(vm)}${vm.isSingle ? this._single(vm) : this._grid(vm)}</div>`;
    this._mountPlayers(vm);
    if (!vm.isSingle) return;
    const strip = this.shadowRoot.querySelector('.strip');
    strip.scrollLeft = scroll;
    const sel = strip.querySelector('.thumb[aria-selected="true"]');
    if (sel.offsetLeft < strip.scrollLeft || sel.offsetLeft + sel.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
    }
    for (const img of strip.querySelectorAll('img')) img.addEventListener('error', () => this._thumbFailed(img));
    if (!wasSingle) this._refreshThumbs();
  }

  _thumbFailed(img) {
    img.parentElement.innerHTML = `<span class="ph">${CAMERA_ICON(20, 1.5)}</span>`;
  }

  _head(vm) {
    const btns = ['1', '2', '4'].map((id) =>
      `<button role="radio" aria-checked="${vm.layout === id}" aria-label="${LAYOUT_LABELS[id]}" data-act="layout" data-val="${id}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICON_PATHS[id]}</svg></button>`).join('');
    return `<div class="head"><h2>${esc(vm.title)}</h2><span class="page-label">${vm.pager.label}</span><div class="switch" role="radiogroup" aria-label="Rozvržení kamer">${btns}</div></div>`;
  }

  _badges(c) {
    return `<span class="badges"><span class="badge${c.online ? '' : ' off'}">${c.online ? '● ŽIVĚ' : 'OFFLINE'}</span><span class="pill">${esc(c.name)}</span></span>`;
  }

  _video(c, iconSize) {
    if (!c.online) return `<span class="ph">${CAMERA_ICON(iconSize, 1.5)}<span>Kamera nedostupná</span></span>`;
    if (this._missingPlayer) return `<span class="missing">${MISSING_PLAYER}</span>`;
    return `<span class="ph">${CAMERA_ICON(iconSize, 1.5)}</span><div class="slot" data-stream="${esc(c.stream)}"></div>`;
  }

  _single(vm) {
    const c = vm.cam;
    const n = vm.cams.length;
    const nav = n > 1
      ? `<button class="nav prev" aria-label="Předchozí kamera" data-act="cam" data-val="-1">${CHEVRON('prev', 20)}</button><button class="nav next" aria-label="Další kamera" data-act="cam" data-val="1">${CHEVRON('next', 20)}</button>`
      : '';
    const dots = vm.cams.map((x) => `<span class="${x.selected ? 'on' : ''}"></span>`).join('');
    const thumbs = vm.cams.map((x) => {
      const src = x.online && this._thumbs.get(x.stream);
      const img = src ? `<img alt="" src="${esc(src)}">` : `<span class="ph">${CAMERA_ICON(20, 1.5)}</span>`;
      return `<button class="thumb${x.online ? '' : ' off'}" role="tab" aria-selected="${x.selected}" data-act="pick" data-val="${x.index}"><span class="img">${img}</span><span class="lbl"><span class="dot"></span>${esc(x.name)}</span></button>`;
    }).join('');
    return `<div class="view">${this._video(c, 44)}${this._badges(c)}<span class="pos">${c.pos}</span>${nav}<div class="vdots">${dots}</div></div>`
      + `<div class="strip" role="tablist" aria-label="Kamery">${thumbs}</div>`;
  }

  _grid(vm) {
    const tiles = vm.grid.map((c) =>
      `<button class="tile${c.online ? '' : ' off'}" aria-label="Otevřít ${esc(c.name)}" data-act="open" data-val="${c.index}">${this._video(c, 32)}${this._badges(c)}</button>`).join('');
    const dots = vm.pager.dots.map((on) => `<span class="${on ? 'on' : ''}"></span>`).join('');
    return `<div class="grid">${tiles}</div><div class="pager"><button aria-label="Předchozí strana" data-act="page" data-val="-1">${CHEVRON('prev', 18)}</button><div class="pdots">${dots}</div><button aria-label="Další strana" data-act="page" data-val="1">${CHEVRON('next', 18)}</button></div>`;
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
        el.setConfig(playerConfig(stream));
        el.hass = this._hass;
        this._players.set(stream, el);
      }
      slot.appendChild(el); // moving an existing player keeps its stream (webrtc-camera waits 5 s before closing)
    }
    this._quietPlayers();
  }

  // video-rtc turns native controls on (on connect) unless its own UI is on.
  _quietPlayers() {
    for (const el of this._players.values()) if (el.video) el.video.controls = false;
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
