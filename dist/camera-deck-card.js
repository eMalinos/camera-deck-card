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
export const PLAYER_STYLE = '.header,.mode{display:none} ha-card{background:none;border-radius:0;box-shadow:none}';

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

export { VERSION };
