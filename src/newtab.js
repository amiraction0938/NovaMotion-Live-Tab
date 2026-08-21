const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const DB_NAME = 'nova-miraction-db', DB_VERSION = 1, WP = 'wallpapers', AUDIO = 'audio';

const DEFAULTS = {
  showBrand: true, reducedMotion: false,
  showGreeting: true, greetingCustom: '', greetingSize: 20,
  showDate: true, clock24h: true, showSeconds: false,
  clockSize: 104, clockWeight: 650, clockSpacing: -.06, clockOpacity: 1, clockColor: '#ffffff', clockFont: 'Bahnschrift', clockShadow: 35,
  timePosX: 50, timePosY: 35, timeAlign: 'center', 
  
  showCalendar: true, calendarType: 'gregorian', calendarDateStyle: 'long', calendarFont: 'Segoe UI Variable', calendarSize: 12, calendarWeight: 500, calendarColor: '#dbe7f3', calendarRadius: 12, calendarOpacity: .82, calendarDirection: 'auto',
  calPosX: 50, calPosY: 48, calAlign: 'center', 
  
  showSearch: true, autoFocusSearch: true, searchNewTab: true, searchEngine: 'https://www.google.com/search?q=',
  searchWidth: 720, searchHeight: 58, searchRadius: 18,
  searchPosX: 50, searchPosY: 60, searchAlign: 'center', 
  
  showShortcuts: true, showDock: true, shortcutLimit: 12, dockRadius: 18, iconSize: 50,
  pomodoroFocus: 25, pomodoroBreak: 5, autoNextPhase: false, focusDim: .58, focusBlur: 1.5,
  
  wallpaperRandom: false, rotationEnabled: false, rotationMinutes: 30, muted: true, loop: true, volume: .35, 
  brightness: .72, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, blur: 0, overlay: .18, 
  idleSaver: true, idleMinutes: 3,
  
  depthMode: false, depthX: 30, depthY: 25, depthW: 40, depthH: 28, depthFeather: 0, depthShadow: .26,
  parallaxIntensity: 15, parallaxSmoothing: 0.08, performanceFps: 60,
  pvMode: '16:9'
};

let appSettings = { ...DEFAULTS }; 
let draftSettings = null; 

let wallpapers = [], sounds = [], shortcuts = [], activeWallpaper = null, activeUrl = null, loadToken = 0, rotationTimer = null, idleTimer = null, idleActive = false, audioNodes = new Map(), previewUrls = new Set();
let pomodoro = { running: false, phase: 'focus', endAt: 0, remaining: 1500, sessions: 0 }, pomoTimer = null;
let modalCleanups = [];

const formatters = { clock: null, date: null, calendar: null, params: '', calParams: '' };

function uid() { return crypto.randomUUID(); }
function openDB() { return new Promise((resolve, reject) => { const r = indexedDB.open(DB_NAME, DB_VERSION); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(WP)) d.createObjectStore(WP, { keyPath: 'id' }); if (!d.objectStoreNames.contains(AUDIO)) d.createObjectStore(AUDIO, { keyPath: 'id' }); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function dbGetAllMeta(store) { const d = await openDB(); return new Promise((res, rej) => { const t = d.transaction(store, 'readonly'); const req = t.objectStore(store).openCursor(); const items = []; req.onsuccess = e => { const cursor = e.target.result; if (cursor) { const { blob, ...meta } = cursor.value; items.push(meta); cursor.continue(); } else { res(items); } }; req.onerror = () => rej(req.error); }); }
async function dbGetItem(store, id) { const d = await openDB(); return new Promise((res, rej) => { const t = d.transaction(store, 'readonly'); const req = t.objectStore(store).get(id); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
async function dbPut(store, val) { const d = await openDB(); return new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(val); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function dbDel(store, id) { const d = await openDB(); return new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
function url(blob) { return URL.createObjectURL(blob); }
function revoke(u) { if (u) try { URL.revokeObjectURL(u); } catch { } }
async function hashFile(file) { return `${file.name}-${file.size}-${file.lastModified}`; }
const isV = f => f.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes((f.name.split('.').pop() || '').toLowerCase());
const isI = f => f.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes((f.name.split('.').pop() || '').toLowerCase());
function bytes(n) { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB'], i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 3); return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}` }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

async function save() {
  await chrome.storage.local.set({ novaSettings: appSettings });
  try { await chrome.storage.sync.set({ novaSettings: appSettings }) } catch { }
}
async function saveShortcuts() {
  const syncSafe = shortcuts.map(s => ({ id: s.id, name: s.name, url: s.url }));
  try { await chrome.storage.sync.set({ novaShortcuts: syncSafe }); } catch { }
  await chrome.storage.local.set({ novaShortcuts: shortcuts });
}

async function loadData() {
  const st = await chrome.storage.local.get(['novaSettings', 'novaShortcuts', 'novaPomodoro']);
  let sy = {}; try { sy = await chrome.storage.sync.get(['novaShortcuts', 'novaSettings']) } catch { }
  const saved = st.novaSettings || sy.novaSettings || {}; 
  if(saved.searchOffset !== undefined && saved.searchPosY === undefined) saved.searchPosY = 60 + (saved.searchOffset/10); 
  
  appSettings = { ...DEFAULTS, ...saved }; 
  if (!Object.prototype.hasOwnProperty.call(saved, 'calendarType')) appSettings.calendarType = 'gregorian';
  
  const noteSaved = await chrome.storage.local.get(['novaNote', 'novaNoteOpen']); 
  if (typeof noteSaved.novaNote === 'string') appSettings.noteText = noteSaved.novaNote; 
  if (typeof noteSaved.novaNoteOpen === 'boolean') appSettings.noteOpen = noteSaved.novaNoteOpen;
  
  let rawSc = Array.isArray(sy.novaShortcuts) && sy.novaShortcuts.length > 0 ? sy.novaShortcuts : (Array.isArray(st.novaShortcuts) ? st.novaShortcuts : []);
  shortcuts = rawSc.map(s => { if(!s.icon) { const ic = iconFor(s.url); return {...s, icon: ic.remote || ic.fallback}; } return s; });
  
  if (st.novaPomodoro) pomodoro = { ...pomodoro, ...st.novaPomodoro };
  wallpapers = await dbGetAllMeta(WP); sounds = await dbGetAllMeta(AUDIO);
  
  applyUI(); renderShortcuts(); updateClock(); setSearchEngine(appSettings.searchEngine);
  await initialWallpaper(); setupRotation(); setupIdleSaver();
}

function applyLayoutData(rootDoc, settingsObj) {
  const hero = $('.hero', rootDoc);
  if(hero) {
      const calBlock = $('.calendar', rootDoc); const tb = $('.time-block', rootDoc);
      if (calBlock && tb && tb.contains(calBlock)) hero.appendChild(calBlock); 
      const searchForm = $('#searchForm', rootDoc); let sbWrap = $('.search-bar-wrap', rootDoc);
      if (searchForm && !sbWrap) { sbWrap = rootDoc.createElement('div'); sbWrap.className = 'search-bar-wrap'; hero.appendChild(sbWrap); sbWrap.appendChild(searchForm); }
  }

  rootDoc.body?.classList.toggle('reduced-motion', settingsObj.reducedMotion);
  const brand = $('.brand', rootDoc); if(brand) brand.style.display = settingsObj.showBrand ? 'flex' : 'none';
  const searchFormEl = $('.search-bar', rootDoc); if(searchFormEl) searchFormEl.style.display = settingsObj.showSearch ? 'flex' : 'none';
  const botArea = $('.bottom-area', rootDoc); if(botArea) botArea.style.display = settingsObj.showDock ? 'flex' : 'none';
  const shortcutGrid = $('.shortcut-grid', rootDoc); if(shortcutGrid) shortcutGrid.style.display = settingsObj.showShortcuts ? 'flex' : 'none';
  
  const rail = $('.shortcut-rail', rootDoc);
  if(rail) { rail.style.borderRadius = `${settingsObj.dockRadius}px`; rail.style.setProperty('--dock-radius', `${settingsObj.dockRadius}px`); }
  
  const mediaFilter = `brightness(${settingsObj.brightness}) saturate(${settingsObj.saturation}) contrast(${settingsObj.contrast}) hue-rotate(${settingsObj.hueRotate}deg) sepia(${settingsObj.sepia})`;
  const wpImg = $('.wallpaper#wallpaperImage', rootDoc); if(wpImg) wpImg.style.filter = mediaFilter;
  const wpVid = $('.wallpaper#wallpaperVideo', rootDoc); if(wpVid) wpVid.style.filter = mediaFilter;
  const wpOv = $('.wallpaper-overlay', rootDoc);
  if(wpOv) {
      wpOv.style.background = `rgba(4,10,16,${settingsObj.overlay})`;
      wpOv.style.backdropFilter = `blur(${settingsObj.blur}px)`;
      wpOv.style.webkitBackdropFilter = `blur(${settingsObj.blur}px)`;
  }
  
  $$('.icon-btn', rootDoc).forEach(x => { x.style.width = `${settingsObj.iconSize}px`; x.style.height = `${settingsObj.iconSize}px` });
  $$('.compact-tool', rootDoc).forEach(x => { x.style.minWidth = `${Math.max(54, settingsObj.iconSize - 4)}px`; x.style.height = `${Math.max(50, settingsObj.iconSize - 4)}px` });

  const c = $('.clock', rootDoc); 
  if(c) {
      c.style.fontSize = `min(13vw,${settingsObj.clockSize}px)`; c.style.fontWeight = settingsObj.clockWeight; c.style.letterSpacing = `${settingsObj.clockSpacing}em`; 
      c.style.opacity = settingsObj.clockOpacity; c.style.color = settingsObj.clockColor; 
      c.style.fontFamily = `"${settingsObj.clockFont}","Segoe UI Variable","Segoe UI",system-ui,sans-serif`;
      c.style.textShadow = `0 18px 50px rgba(0,0,0,${settingsObj.clockShadow/100})`;
  }
  const greet = $('.greeting', rootDoc); if(greet) greet.style.fontSize = `${settingsObj.greetingSize}px`;
  
  const tbBlock = $('.time-block', rootDoc);
  if(tbBlock) {
      tbBlock.style.left = `${settingsObj.timePosX}%`; tbBlock.style.top = `${settingsObj.timePosY}%`; tbBlock.style.transform = `translate(-${settingsObj.timePosX}%, -${settingsObj.timePosY}%)`;
      tbBlock.style.alignItems = settingsObj.timeAlign === 'left' ? 'flex-start' : (settingsObj.timeAlign === 'right' ? 'flex-end' : 'center'); tbBlock.style.textAlign = settingsObj.timeAlign;
      tbBlock.style.zIndex = '5';
  }
  
  const sbWrapEl = $('.search-bar-wrap', rootDoc);
  if(sbWrapEl) {
      sbWrapEl.style.left = `${settingsObj.searchPosX}%`; sbWrapEl.style.top = `${settingsObj.searchPosY}%`; sbWrapEl.style.transform = `translate(-${settingsObj.searchPosX}%, -${settingsObj.searchPosY}%)`;
      sbWrapEl.style.width = `min(${settingsObj.searchWidth}px, 86vw)`; 
      const sbInner = $('.search-bar', sbWrapEl);
      if(sbInner) { sbInner.style.height = `${settingsObj.searchHeight}px`; sbInner.style.borderRadius = `${settingsObj.searchRadius}px`; }
      sbWrapEl.style.zIndex = '6';
  }
  
  // Custom Calendar Positioning Fix
  const calBlockNode = $('.calendar', rootDoc);
  if(calBlockNode) {
      calBlockNode.style.position = 'absolute'; calBlockNode.style.left = `${settingsObj.calPosX}%`; calBlockNode.style.top = `${settingsObj.calPosY}%`; calBlockNode.style.transform = `translate(-${settingsObj.calPosX}%, -${settingsObj.calPosY}%)`;
      calBlockNode.style.textAlign = settingsObj.calAlign; calBlockNode.style.fontSize = `${settingsObj.calendarSize}px`; calBlockNode.style.fontWeight = String(settingsObj.calendarWeight); 
      calBlockNode.style.color = settingsObj.calendarColor; calBlockNode.style.opacity = String(settingsObj.calendarOpacity); calBlockNode.style.borderRadius = `${settingsObj.calendarRadius}px`; 
      calBlockNode.style.fontFamily = `"${settingsObj.calendarFont}","Segoe UI Variable","Segoe UI",system-ui,sans-serif`; 
      calBlockNode.style.zIndex = '10'; // Ensures it doesn't get hidden under other blocks
      calBlockNode.style.setProperty('display', settingsObj.showCalendar ? 'block' : 'none', 'important');
  }
}

function applyUI() {
  applyLayoutData(document, appSettings);
  applyNoteVisibility();
  
  const mainVideo = $('#wallpaperVideo'); if (mainVideo) { mainVideo.muted = Boolean(appSettings.muted); mainVideo.volume = Number(appSettings.volume) || 0 }
  $('#muteBtn').textContent = appSettings.muted ? '🔇' : '🔊';
  $('#wallpaperCaption').classList.toggle('show', Boolean(appSettings.showWallpaperName && activeWallpaper));
  updateDepthLayer(); updatePlay();

  if (!appSettings.depthMode) {
      const els = [$('#wallpaperImage'), $('#wallpaperVideo'), $('.hero'), $('#depthLayer'), $('.topbar'), $('.bottom-area')];
      els.forEach(el => { if(el) el.style.transform = ''; });
  }
}

function calendarInfo(type) {
  const names = { gregorian: 'Gregorian', persian: 'Persian', islamic: 'Islamic', hebrew: 'Hebrew', japanese: 'Japanese', chinese: 'Chinese', indian: 'Indian National' };
  return { type, label: names[type] || 'Gregorian', rtl: ['persian', 'islamic', 'hebrew'].includes(type) };
}

function populateTimeNodes(rootDoc, settingsObj, dateObj) {
  const pKey = `${settingsObj.clock24h}-${settingsObj.showSeconds}`;
  if (formatters.params !== pKey) {
    formatters.clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: !settingsObj.clock24h, ...(settingsObj.showSeconds ? { second: '2-digit' } : {}) });
    formatters.date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    formatters.params = pKey;
  }
  
  const cNode = $('.clock', rootDoc); if(cNode) cNode.textContent = formatters.clock.format(dateObj);
  const dNode = $('.date', rootDoc); if(dNode) dNode.textContent = settingsObj.showDate ? formatters.date.format(dateObj) : '';
  
  const gNode = $('.greeting', rootDoc);
  if(gNode) {
      if(settingsObj.showGreeting) { const h = dateObj.getHours(); gNode.textContent = settingsObj.greetingCustom ? settingsObj.greetingCustom : (h < 5 ? 'Quiet night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night'); } 
      else gNode.textContent = '';
  }

  const info = calendarInfo(settingsObj.calendarType || 'gregorian');
  const styleMap = { numeric: { year: 'numeric', month: 'numeric', day: 'numeric' }, short: { year: 'numeric', month: 'short', day: 'numeric' }, medium: { year: 'numeric', month: 'short', day: 'numeric' }, long: { year: 'numeric', month: 'long', day: 'numeric' } };
  const m = { persian: 'fa-IR-u-ca-persian', islamic: 'en-US-u-ca-islamic', hebrew: 'en-US-u-ca-hebrew', japanese: 'ja-JP-u-ca-japanese', chinese: 'zh-CN-u-ca-chinese', indian: 'en-IN-u-ca-indian' };
  
  const calKey = `${info.type}-${settingsObj.calendarDateStyle}`;
  if(formatters.calParams !== calKey) {
      try { formatters.calendar = new Intl.DateTimeFormat(m[info.type] || 'en-US', styleMap[settingsObj.calendarDateStyle] || styleMap.long); }
      catch { formatters.calendar = new Intl.DateTimeFormat('en-US', styleMap.long); }
      formatters.calParams = calKey;
  }
  
  const calNode = $('.calendar', rootDoc);
  if(calNode) { 
      calNode.textContent = formatters.calendar.format(dateObj) || "Calendar"; 
      calNode.dir = settingsObj.calendarDirection === 'auto' ? (info.rtl ? 'rtl' : 'ltr') : settingsObj.calendarDirection; 
  }
}

function updateClock() { populateTimeNodes(document, appSettings, new Date()); }

let pxMouse = { x: 0, y: 0 }, pxCurr = { x: 0, y: 0 }, pxLastTime = 0, pxRaf = null;
document.addEventListener('mousemove', e => {
    if (!appSettings.depthMode) return;
    pxMouse.x = (e.clientX / window.innerWidth - 0.5) * 2; pxMouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

function parallaxLoop(time) {
    pxRaf = requestAnimationFrame(parallaxLoop);
    if (!appSettings.depthMode || document.hidden || document.body.classList.contains('reduced-motion')) return;
    const targetFps = appSettings.performanceFps || 60;
    if (targetFps < 120 && time - pxLastTime < (1000 / targetFps)) return;
    pxLastTime = time;

    const smooth = appSettings.parallaxSmoothing || 0.08;
    pxCurr.x += (pxMouse.x - pxCurr.x) * smooth; pxCurr.y += (pxMouse.y - pxCurr.y) * smooth;
    if (Math.abs(pxMouse.x - pxCurr.x) < 0.001 && Math.abs(pxMouse.y - pxCurr.y) < 0.001) return;

    const intensity = appSettings.parallaxIntensity || 15;
    const bgTransform = `translate3d(${pxCurr.x * -intensity}px, ${pxCurr.y * -intensity}px, 0) scale(1.06)`; 
    const mTransform = `translate3d(${pxCurr.x * -(intensity * 0.4)}px, ${pxCurr.y * -(intensity * 0.4)}px, 0)`;
    const sTransform = `translate3d(${pxCurr.x * (intensity * 0.7)}px, ${pxCurr.y * (intensity * 0.7)}px, 0) scale(1.06)`;
    const fTransform = `translate3d(${pxCurr.x * (intensity * 1.3)}px, ${pxCurr.y * (intensity * 1.3)}px, 0)`;

    const bg = $('#wallpaperImage'), bgv = $('#wallpaperVideo');
    if (bg && bg.style.opacity !== '0') bg.style.transform = bgTransform;
    if (bgv && bgv.style.opacity !== '0') bgv.style.transform = bgTransform;
    const hero = $('.hero'); if (hero) hero.style.transform = mTransform;
    const dl = $('#depthLayer'); if (dl && dl.style.opacity !== '0') dl.style.transform = sTransform;
    const tb = $('.topbar'), ba = $('.bottom-area');
    if (tb) tb.style.transform = fTransform; if (ba) ba.style.transform = fTransform;
}
pxRaf = requestAnimationFrame(parallaxLoop);

function focusSearchOnce() {
  if (!appSettings.autoFocusSearch || $('#modalBackdrop')?.hidden === false) return;
  const input = $('#searchInput'); if (!input) return;
  const focus = () => { if (document.visibilityState !== 'visible' || $('#modalBackdrop')?.hidden === false) return; try { window.focus() } catch { } try { input.focus({ preventScroll: true }) } catch { input.focus() } };
  [0, 80, 250, 700].forEach(ms => setTimeout(focus, ms));
}
window.addEventListener('pageshow', focusSearchOnce);

function setSearchEngine(v) { appSettings.searchEngine = v; $('#engineBtn').textContent = ENGINE_NAME[v] || 'Google'; }
const ENGINES = { 'Google': 'https://www.google.com/search?q=', 'Bing': 'https://www.bing.com/search?q=', 'DuckDuckGo': 'https://duckduckgo.com/?q=', 'Brave Search': 'https://search.brave.com/search?q=', 'Ecosia': 'https://www.ecosia.org/search?q=', 'Yahoo': 'https://search.yahoo.com/search?p=', 'Startpage': 'https://www.startpage.com/sp/search?query=', 'Perplexity': 'https://www.perplexity.ai/search?q=' };
const ENGINE_NAME = Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [v, k]));

function chooseWallpaper() {
  if (!wallpapers.length) return null;
  const favorites = wallpapers.filter(x => x.favorite);
  if (appSettings.wallpaperRandom) { const pool = favorites.length ? favorites : wallpapers; return pool[Math.floor(Math.random() * pool.length)]; }
  return (appSettings.primaryId && wallpapers.find(x => x.id === appSettings.primaryId)) || wallpapers[0]
}
function updateFavoriteButton() { const b = $('#favoriteBtn'); if (!b) return; const on = !!activeWallpaper?.favorite; b.textContent = on ? '♥' : '♡'; b.title = on ? 'Remove from favorites' : 'Favorite wallpaper'; }
async function toggleFavorite() {
  if (!activeWallpaper) { toast('Choose a wallpaper first.'); return }
  activeWallpaper.favorite = !activeWallpaper.favorite;
  const index = wallpapers.findIndex(x => x.id === activeWallpaper.id);
  if (index >= 0) wallpapers[index].favorite = activeWallpaper.favorite;
  const fullObj = await dbGetItem(WP, activeWallpaper.id); if(fullObj) { fullObj.favorite = activeWallpaper.favorite; await dbPut(WP, fullObj); }
  updateFavoriteButton(); toast(activeWallpaper.favorite ? 'Added to favorites' : 'Removed from favorites');
}
async function initialWallpaper() { await showWallpaper(chooseWallpaper()) }
function clearMedia() { const v = $('#wallpaperVideo'), i = $('#wallpaperImage'), d = $('#depthLayer'); stopMainVideo(); v.removeAttribute('src'); v.load(); i.removeAttribute('src'); d.removeAttribute('src'); d.style.opacity = '0'; if (activeUrl) revoke(activeUrl); activeUrl = null; }
function status(msg, error = false) { const n = $('#mediaStatus'); n.textContent = msg || ''; n.classList.toggle('show', !!msg); n.classList.toggle('error', !!error) }

async function showWallpaper(itemMeta) {
  const token = ++loadToken; clearMedia(); activeWallpaper = itemMeta || null; $('#wallpaperCaption').textContent = itemMeta?.name || ''; $('#wallpaperCaption').classList.toggle('show', Boolean(itemMeta && appSettings.showWallpaperName)); applyUI();
  if (!itemMeta) { status(''); return }
  status('Loading wallpaper…');
  const fullItem = await dbGetItem(WP, itemMeta.id); if(!fullItem || !fullItem.blob) { status('Media not found.', true); return; }
  activeUrl = url(fullItem.blob);
  const v = $('#wallpaperVideo'), i = $('#wallpaperImage');
  if (itemMeta.type === 'video') {
    document.body.classList.remove('depth-enabled'); v.muted = appSettings.muted; v.volume = appSettings.volume; v.loop = appSettings.loop; v.preload = 'auto'; v.src = activeUrl;
    v.oncanplay = async () => { if (token !== loadToken) return; v.style.opacity = '1'; i.style.opacity = '0'; status(''); refreshOpenPreview(); if (!document.hidden && !document.body.classList.contains('focus') && !idleActive) { restoreMainVideoAudio(); try { await v.play() } catch { } } updatePlay() };
    v.onerror = () => { if (token !== loadToken) return; v.style.opacity = '0'; status('Chrome could not decode this video format.', true); updatePlay() }; v.onended = () => { if (!appSettings.loop && token === loadToken) nextWallpaper() }; v.load();
  } else {
    i.onload = () => { if (token !== loadToken) return; i.style.opacity = '1'; v.style.opacity = '0'; status(''); updateDepthLayer(); refreshOpenPreview() }; i.onerror = () => { if (token !== loadToken) return; status('Image could not be displayed.', true) }; i.src = activeUrl;
  }
}
async function nextWallpaper() { if (wallpapers.length < 2) { if (wallpapers[0]) await showWallpaper(wallpapers[0]); else toast('Add a wallpaper first.'); return } let idx = wallpapers.findIndex(x => x.id === activeWallpaper?.id); await showWallpaper(wallpapers[(idx + 1) % wallpapers.length]) }
function setupRotation() { clearInterval(rotationTimer); if (appSettings.rotationEnabled && wallpapers.length > 1) rotationTimer = setInterval(() => { if (!document.hidden && !document.body.classList.contains('focus')) nextWallpaper() }, Math.max(1, Number(appSettings.rotationMinutes) || 30) * 60000) }
function setupIdleSaver() { clearTimeout(idleTimer); idleActive = false; document.body.classList.remove('idle-save'); if (!appSettings.idleSaver || activeWallpaper?.type !== 'video') return; idleTimer = setTimeout(() => { idleActive = true; document.body.classList.add('idle-save'); stopMainVideo(); }, Math.max(1, Number(appSettings.idleMinutes) || 3) * 60000) }
function pausePreviewVideo() { const pv = $('#pvVideo'); if (pv) pv.pause() }
function stopMainVideo() { const v = $('#wallpaperVideo'); if (!v) return; v.pause(); v.muted = true; v.volume = 0; pausePreviewVideo(); updatePlay(); }
function restoreMainVideoAudio() { const v = $('#wallpaperVideo'); if (!v) return; v.muted = Boolean(appSettings.muted); v.volume = Number(appSettings.volume) || 0; }
function updatePlay() { const v = $('#wallpaperVideo'), b = $('#playBtn'); const playing = activeWallpaper?.type === 'video' && v && !v.paused; b.textContent = playing ? 'Ⅱ' : '▶' }
async function togglePlay() {
  if (activeWallpaper?.type !== 'video') { toast('Play/Pause is for video wallpapers.'); return }
  const v = $('#wallpaperVideo');
  if (v.paused) { idleActive = false; document.body.classList.remove('idle-save'); restoreMainVideoAudio(); try { await v.play() } catch { toast('Playback blocked. Click once and try again.') } } 
  else { v.pause(); pausePreviewVideo(); v.muted = true; v.volume = 0; if (!appSettings.muted) v.muted = false; }
  updatePlay()
}
function updateDepthLayer() {
  const d = $('#depthLayer'); const enabled = Boolean(appSettings.depthMode && activeWallpaper?.type === 'image' && activeUrl); d.style.opacity = enabled ? '1' : '0';
  if (!enabled) { d.removeAttribute('src'); return }
  d.src = activeUrl; const x = Math.max(0, Math.min(95, Number(appSettings.depthX) || 0)), y = Math.max(0, Math.min(95, Number(appSettings.depthY) || 0)), w = Math.max(4, Math.min(100 - x, Number(appSettings.depthW) || 4)), h = Math.max(4, Math.min(100 - y, Number(appSettings.depthH) || 4));
  d.style.clipPath = `inset(${y}% ${100 - x - w}% ${100 - y - h}% ${x}% round ${Math.max(0, Number(appSettings.depthFeather) || 0)}px)`; d.style.webkitClipPath = d.style.clipPath; d.style.filter = `drop-shadow(0 14px 36px rgba(0,0,0,${appSettings.depthShadow}))`;
}
function toggleFocus() { const on = document.body.classList.toggle('focus'); $('#wallpaperOverlay').style.background = `rgba(4,10,16,${on ? appSettings.focusDim : appSettings.overlay})`; $('#wallpaperOverlay').style.backdropFilter = `blur(${on ? appSettings.focusBlur : appSettings.blur}px)`; $('#wallpaperOverlay').style.webkitBackdropFilter = `blur(${on ? appSettings.focusBlur : appSettings.blur}px)`; if (on) stopMainVideo(); else if (activeWallpaper?.type === 'video' && !document.hidden && !idleActive) { restoreMainVideoAudio(); $('#wallpaperVideo').play().catch(() => { }) } updatePlay() }

function iconFor(site) {
  try {
    const host = new URL(site).hostname.replace(/^www\./, ''); const letter = (host[0] || '?').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#75f5d6"/><stop offset="1" stop-color="#73a9ff"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0b1824"/><text x="32" y="39" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="url(#g)">${esc(letter)}</text></svg>`;
    const generated = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    return { fallback: generated, remote: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` };
  } catch { return { fallback: 'icons/icon32.svg', remote: '' } }
}
function renderShortcuts() {
  const g = $('#shortcutGrid'); g.innerHTML = '';
  for (const item of shortcuts.slice(0, appSettings.shortcutLimit)) {
    const n = document.createElement('div'); n.className = 'shortcut'; n.dataset.id = item.id;
    n.innerHTML = `<img alt=""><span class="name"></span><button class="delete" title="Remove shortcut">×</button>`;
    n.querySelector('.name').textContent = item.name;
    const icon = item.icon || iconFor(item.url); const img = n.querySelector('img');
    img.src = typeof icon === 'string' ? icon : icon.remote || icon.fallback;
    img.dataset.fallback = typeof icon === 'string' ? 'icons/icon32.svg' : icon.fallback;
    img.onerror = () => { if (img.src !== img.dataset.fallback) { img.src = img.dataset.fallback; } }; g.appendChild(n);
  }
  renderShortcutCount();
}

$('#shortcutGrid').onclick = async (e) => {
    const s = e.target.closest('.shortcut'); if(!s) return;
    const id = s.dataset.id; const item = shortcuts.find(x => x.id === id);
    if(e.target.closest('.delete')) { shortcuts = shortcuts.filter(x => x.id !== id); await saveShortcuts(); renderShortcuts(); }
    else if(item) { window.open(item.url, appSettings.searchNewTab ? '_blank' : '_self'); }
};
function renderShortcutCount() { const rail = $('#shortcutRail'); if (rail) rail.dataset.count = String(shortcuts.length) }
function toast(msg) { const n = $('#toast'); n.textContent = msg; n.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.remove('show'), 2300) }

function openModal(html) {
    const m = $('#modal'), b = $('#modalBackdrop');
    m.innerHTML = html; b.hidden = false; b.setAttribute('aria-hidden', 'false');
    const closeBtn = m.querySelector('.close');
    if(closeBtn) { const h = () => closeModal(); closeBtn.addEventListener('click', h); modalCleanups.push(() => closeBtn.removeEventListener('click', h)); }
}
function closeModal() {
  draftSettings = null; 
  stopPreviews(); $('#modal').innerHTML = ''; $('#modalBackdrop').hidden = true; $('#modalBackdrop').setAttribute('aria-hidden', 'true');
  modalCleanups.forEach(fn => fn()); modalCleanups = [];
}
function stopPreviews() { for (const u of previewUrls) revoke(u); previewUrls.clear(); $$('#modal video').forEach(v => v.pause()) }
function tabs(title, items) { openModal(`<div class="modal-head"><h2>${esc(title)}</h2><button class="close">×</button></div><div class="tabs">${items.map((x, i) => `<button class="tab ${i ? '' : 'active'}" data-tab="${x.id}">${x.label}</button>`).join('')}</div>${items.map((x, i) => `<div class="panel ${i ? '' : 'active'}" id="panel-${x.id}">${x.html}</div>`).join('')}`); $$('.tab').forEach(b => { const h = () => { $$('.tab').forEach(x => x.classList.toggle('active', x === b)); $$('.panel').forEach(x => x.classList.toggle('active', x.id === `panel-${b.dataset.tab}`)) }; b.addEventListener('click', h); modalCleanups.push(()=>b.removeEventListener('click',h)); }) }

async function addWallpapers(files) {
  const arr = [...files].filter(x => isV(x) || isI(x)); if (!arr.length) { toast('Choose an image or video file.'); return } let added = 0;
  for (const f of arr) { try { const h = await hashFile(f); if (wallpapers.some(x => x.hash === h)) continue; const it = { id: uid(), hash: h, name: f.name, size: f.size, mime: f.type, type: isV(f) ? 'video' : 'image', blob: f, createdAt: Date.now() }; await dbPut(WP, it); const { blob, ...meta } = it; wallpapers.push(meta); added++; if (!activeWallpaper) await showWallpaper(meta); } catch (e) { console.error(e) } }
  toast(added ? `${added} wallpaper${added > 1 ? 's' : ''} added` : 'Nothing new was added'); setupRotation();
}
async function wallpapersModal() {
  const html = `<div class="toolbar"><label class="primary" for="wpUpload">＋ Add wallpapers</label><input id="wpUpload" type="file" accept="image/*,video/*" multiple hidden><button class="secondary" id="wpRandom">Random now</button></div><div class="notice">Your media stays in this browser profile. Only the active wallpaper is decoded on the main page.</div><div style="height:12px"></div><div class="grid" id="wpGrid"></div>`;
  tabs('Wallpaper Library', [{ id: 'library', label: 'Library', html }]); drawWallpapers();
  const fileIn = $('#wpUpload'); const randBtn = $('#wpRandom');
  const fHandler = async (e) => { await addWallpapers(e.target.files); drawWallpapers(); }; const rHandler = () => nextWallpaper();
  fileIn.addEventListener('change', fHandler); randBtn.addEventListener('click', rHandler);
  modalCleanups.push(() => { fileIn.removeEventListener('change', fHandler); randBtn.removeEventListener('click', rHandler); });
}
function drawWallpapers() {
  const g = $('#wpGrid'); if (!g) return; stopPreviews(); g.innerHTML = '';
  if (!wallpapers.length) { g.innerHTML = '<div class="notice">Your wallpaper library is empty. Use Add wallpapers or drag media onto the page.</div>'; return }
  const observer = new IntersectionObserver((entries) => { entries.forEach(async entry => { if (entry.isIntersecting) { const media = entry.target; if(!media.src) { const id = media.dataset.id; const full = await dbGetItem(WP, id); if(full && full.blob) { const u = url(full.blob); previewUrls.add(u); media.src = u; } } } }); }, { rootMargin: '150px' });
  modalCleanups.push(() => observer.disconnect());
  for (const w of wallpapers) {
    const c = document.createElement('article'); c.className = 'card'; c.dataset.id = w.id;
    c.innerHTML = `<div class="thumb">${w.type === 'video' ? '<video muted playsinline preload="metadata" data-id="'+w.id+'"></video>' : '<img alt="" data-id="'+w.id+'">'}</div><div class="card-body"><div class="row"><strong></strong><span class="small">${w.type.toUpperCase()} · ${bytes(w.size)}</span></div><div class="actions"><button class="secondary use">Use</button><button class="secondary favorite">${w.favorite ? "♥ Favorite" : "♡ Favorite"}</button><button class="secondary primary">${appSettings.primaryId === w.id ? 'Primary ✓' : 'Set primary'}</button><button class="danger del">Delete</button></div></div>`;
    c.querySelector('strong').textContent = w.name; const media = c.querySelector('video,img'); observer.observe(media);
    if (media.tagName === 'VIDEO') { media.onmouseenter = () => media.play().catch(() => { }); media.onmouseleave = () => { media.pause(); media.currentTime = 0 } } g.appendChild(c)
  }
  const gridHandler = async (e) => {
      const btn = e.target.closest('button'); if(!btn) return;
      const card = btn.closest('.card'); const id = card.dataset.id; const w = wallpapers.find(x => x.id === id); if(!w) return;
      if(btn.classList.contains('use')) { await showWallpaper(w); closeModal(); }
      else if(btn.classList.contains('favorite')) { w.favorite = !w.favorite; const full = await dbGetItem(WP, w.id); if(full) { full.favorite = w.favorite; await dbPut(WP, full); } if(activeWallpaper?.id === w.id) { activeWallpaper.favorite = w.favorite; updateFavoriteButton(); } drawWallpapers(); }
      else if(btn.classList.contains('primary')) { appSettings.primaryId = w.id; appSettings.wallpaperRandom = false; await save(); await showWallpaper(w); drawWallpapers(); }
      else if(btn.classList.contains('del')) { if(!confirm(`Delete “${w.name}”?`)) return; await dbDel(WP, w.id); wallpapers = wallpapers.filter(x => x.id !== w.id); if(appSettings.primaryId === w.id) { appSettings.primaryId = wallpapers[0]?.id || null; await save(); } if(activeWallpaper?.id === w.id) await showWallpaper(chooseWallpaper()); drawWallpapers(); }
  };
  g.addEventListener('click', gridHandler); modalCleanups.push(() => g.removeEventListener('click', gridHandler));
}

function tip(text){return`<span class="tip" data-tip="${esc(text)}">?</span>`}
function toggleField(id,label,value,help){return`<div class="field"><label><span>${esc(label)} ${tip(help)}</span><input id="${id}" type="checkbox" ${value?'checked':''}></label></div>`}
function rangeField(id,label,min,max,step,value,help){return`<div class="field"><label><span>${esc(label)} ${tip(help)}</span><b id="${id}Val">${value}</b></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`}
function numberField(id,label,min,max,value,help){return`<div class="field"><label><span>${esc(label)} ${tip(help)}</span></label><input id="${id}" type="number" min="${min}" max="${max}" value="${value}"></div>`}
function selectField(id,label,value,options,help){ const current=options.find(([v])=>v===value)||options[0]; return `<div class="field"><label><span>${esc(label)} ${tip(help)}</span></label><div class="custom-select" id="${id}Select"><button class="select-button" type="button"><span>${esc(current[1])}</span><span>⌄</span></button><div class="select-menu">${options.map(([v,t])=>`<div class="select-option ${v===current[0]?'active':''}" data-value="${encodeURIComponent(v)}">${esc(t)}</div>`).join('')}</div></div></div>` }

function refreshOpenPreview(){
    if(!$('#modalBackdrop')||$('#modalBackdrop').hidden) return;
    const bg=$('#pvBg'),video=$('#pvVideo');
    if(activeWallpaper&&activeUrl){
        if(bg){bg.style.backgroundImage=activeWallpaper.type==='image'?`url("${activeUrl}")`:'';bg.style.display=activeWallpaper.type==='image'?'block':'none'}
        if(video){video.style.display=activeWallpaper.type==='video'?'block':'none';if(activeWallpaper.type==='video'&&video.src!==activeUrl){video.src=activeUrl;video.load();video.play().catch(()=>{})}}
    }
    wireLivePreview()();
}

function makePreview(){
  const item = activeWallpaper; const src = activeUrl||''; 
  const media = item?.type==='video' 
      ? `<video id="pvVideo" class="wallpaper" muted playsinline loop autoplay preload="metadata" style="display:block; opacity:1 !important" src="${src}"></video>` 
      : `<div id="pvBg" class="wallpaper" style="${src?`background-image:url("${src}")`:''}; background-size:cover; background-position:center; display:block; opacity:1 !important"></div>`; 
  
  return `<div class="preview-pane">
    <div class="pv-header">
       <div class="pv-title">Live Preview <span>Active</span></div>
       <div class="pv-controls" id="pvResizer">
           <button class="pv-btn active" data-mode="16:9">16:9</button>
           <button class="pv-btn" data-mode="21:9">Ultrawide</button>
           <button class="pv-btn" data-mode="window">Window</button>
       </div>
    </div>
    <div class="preview-wrapper" id="pvWrap">
        <div class="preview-stage" id="pvStage">
            ${media}
            <div id="pvOv" class="wallpaper-overlay"></div>
            <div class="hero pv-hero" id="pvApp">
                <div class="time-block">
                    <div class="greeting"></div>
                    <div class="clock">00:00</div>
                    <div class="date"></div>
                </div>
                <div id="calendar" class="calendar"></div>
                
                <div class="search-bar-wrap">
                    <div class="search-bar glass">
                        <span class="search-icon">⌕</span>
                        <input autocomplete="off" placeholder="Search the web…" disabled>
                        <button type="button" class="search-engine" id="pvEngineBtn">Google</button>
                    </div>
                </div>
                <div class="bottom-area"><div class="shortcut-rail glass" style="width:500px; height:50px;"></div></div>
            </div>
        </div>
    </div>
  </div>`; 
}

function wireLivePreview(){ 
  const stage = $('#pvStage'); const wrap = $('#pvWrap');
  if(!stage || !wrap) return () => {};
  
  let ro = new ResizeObserver(entries => {
      if(!draftSettings) return;
      const rect = entries[0].contentRect;
      const wW = rect.width, wH = rect.height;
      
      let targetW = 1920, targetH = 1080;
      if (draftSettings.pvMode === '21:9') { targetW = 2560; targetH = 1080; }
      else if (draftSettings.pvMode === 'window') { targetW = window.innerWidth; targetH = window.innerHeight; }
      
      stage.style.width = targetW + 'px'; stage.style.height = targetH + 'px';
      const scale = Math.min(wW / targetW, wH / targetH);
      stage.style.transform = `scale(${scale})`;
      
      const offX = (wW - (targetW * scale)) / 2; const offY = (wH - (targetH * scale)) / 2;
      stage.style.left = offX + 'px'; stage.style.top = offY + 'px';
  });
  ro.observe(wrap);
  modalCleanups.push(() => ro.disconnect());

  const update = () => { 
    if(!draftSettings) return;
    
    const mediaFilter = `brightness(${draftSettings.brightness}) saturate(${draftSettings.saturation}) contrast(${draftSettings.contrast}) hue-rotate(${draftSettings.hueRotate}deg) sepia(${draftSettings.sepia})`;
    const bg = $('#pvBg', stage); if(bg) { bg.style.filter = mediaFilter; bg.style.opacity = '1'; }
    const video = $('#pvVideo', stage); 
    if(video) { 
        video.style.filter = mediaFilter; 
        video.style.opacity = '1'; 
        if (activeUrl && !video.src.includes(activeUrl)) { video.src = activeUrl; video.load(); }
        video.play().catch(()=>{}); 
    }
    
    const ov = $('#pvOv', stage);
    if(ov) {
        ov.style.background = `rgba(4,10,16,${draftSettings.overlay})`;
        ov.style.backdropFilter = `blur(${draftSettings.blur}px)`;
        ov.style.webkitBackdropFilter = `blur(${draftSettings.blur}px)`;
    }

    applyLayoutData(stage, draftSettings);
    populateTimeNodes(stage, draftSettings, new Date());
    const pvEngine = $('#pvEngineBtn', stage); if(pvEngine) pvEngine.textContent = ENGINE_NAME[draftSettings.searchEngine]||'Google';
    
    if(wrap) ro.unobserve(wrap); if(wrap) ro.observe(wrap);
  }; 
  return update; 
}

function settingsModal(){
  draftSettings = JSON.parse(JSON.stringify(appSettings)); 
  
  const clockFonts=[['Bahnschrift','Bahnschrift'],['Segoe UI Variable','Segoe UI Variable'],['Aptos Display','Aptos Display'],['Arial','Arial'],['Trebuchet MS','Trebuchet MS'],['Verdana','Verdana'],['Consolas','Consolas'],['Georgia','Georgia'],['Times New Roman','Times New Roman']];
  const engines=Object.entries(ENGINES);
  
  const html=`<div class="settings-layout"><aside class="preview-col">${makePreview()}</aside><div class="setting-col"> <div class="settings-savebar"><div><strong>Customize NovaMotion</strong><span>Changes preview instantly and stay temporary until saved.</span></div><div class="toolbar compact-toolbar"><button class="secondary" id="cancelSettings">Cancel</button><button class="secondary" id="resetSettings">Reset Default</button><button class="primary" id="saveSettings">Save & Apply</button></div></div> 
  
  <div class="setting-section"><h3>Visuals & Wallpaper</h3><div class="setting-grid"> 
    ${rangeField('brightness','Brightness',0.2,1.5,0.01,draftSettings.brightness,'')} 
    ${rangeField('contrast','Contrast',0.2,2.0,0.01,draftSettings.contrast,'Control vividness.')} 
    ${rangeField('saturation','Saturation',0,2.5,0.01,draftSettings.saturation,'')} 
    ${rangeField('hueRotate','Color Shift (Hue)',0,360,1,draftSettings.hueRotate,'Spin the color wheel.')} 
    ${rangeField('sepia','Vintage Tone (Sepia)',0,1,0.01,draftSettings.sepia,'Warm nostalgic look.')} 
    ${rangeField('blur','Background Blur',0,20,0.5,draftSettings.blur,'')} 
    ${rangeField('overlay','Dark Overlay',0,0.85,0.01,draftSettings.overlay,'Improve contrast.')} 
    ${toggleField('wallpaperRandom','Random on load',draftSettings.wallpaperRandom,'')} 
    ${toggleField('rotationEnabled','Auto rotation',draftSettings.rotationEnabled,'')} 
    ${rangeField('rotationMinutes','Rotation interval (min)',1,240,1,draftSettings.rotationMinutes,'')} 
    ${toggleField('loop','Loop video',draftSettings.loop,'')} 
    ${toggleField('muted','Mute video',draftSettings.muted,'')} 
    ${rangeField('volume','Video volume',0,1,0.01,draftSettings.volume,'')} 
  </div></div> 

  <div class="setting-section"><h3>Time & Date Display</h3><div class="setting-grid"> 
    ${toggleField('showGreeting','Show greeting',draftSettings.showGreeting,'Display greeting above the clock.')} 
    <div class="field"><label><span>Custom greeting ${tip('Leave blank for automatic.')}</span></label><input id="greetingCustom" type="text" value="${esc(draftSettings.greetingCustom||'')}" placeholder="Good evening"></div> 
    ${toggleField('showDate','Show date',draftSettings.showDate,'')} 
    ${toggleField('clock24h','24-hour clock',draftSettings.clock24h,'')} 
    ${toggleField('showSeconds','Show seconds',draftSettings.showSeconds,'')} 
    ${rangeField('clockSize','Clock size',56,220,1,draftSettings.clockSize,'Scale the clock.')} 
    ${rangeField('clockWeight','Clock weight',300,900,10,draftSettings.clockWeight,'Boldness.')} 
    ${rangeField('clockSpacing','Letter spacing',-0.12,0.1,0.005,draftSettings.clockSpacing,'')} 
    ${rangeField('clockShadow','Glow & Shadow',0,100,1,draftSettings.clockShadow,'Text depth.')} 
    ${rangeField('clockOpacity','Opacity',0.1,1,0.01,draftSettings.clockOpacity,'')} 
    <div class="field"><label><span>Color ${tip('Pick a readable clock color.')}</span></label><input id="clockColor" type="color" value="${draftSettings.clockColor}"></div> 
    ${selectField('clockFont','Font',draftSettings.clockFont,clockFonts,'')} 
  </div></div> 

  <div class="setting-section"><h3>Calendar Details</h3><div class="setting-grid"> 
    ${toggleField('showCalendar','Enable custom calendar',draftSettings.showCalendar,'')} 
    ${selectField('calendarType','Calendar style',draftSettings.calendarType,[['gregorian','Gregorian'],['persian','تقویم شمسی'],['islamic','Islamic'],['hebrew','Hebrew'],['japanese','Japanese'],['chinese','Chinese'],['indian','Indian National']],'')} 
    ${selectField('calendarDateStyle','Date format',draftSettings.calendarDateStyle,[['long','Long'],['medium','Medium'],['short','Short'],['numeric','Numeric']],'')} 
    ${selectField('calendarFont','Font',draftSettings.calendarFont,[['Segoe UI Variable','Segoe UI Variable'],['Bahnschrift','Bahnschrift'],['Aptos Display','Aptos Display'],['Arial','Arial'],['Trebuchet MS','Trebuchet MS'],['Verdana','Verdana'],['Georgia','Georgia'],['Times New Roman','Times New Roman']],'')} 
    ${rangeField('calendarSize','Size',9,36,1,draftSettings.calendarSize,'')} 
    ${rangeField('calendarWeight','Weight',300,800,10,draftSettings.calendarWeight,'')} 
    ${rangeField('calendarRadius','Shape radius',0,30,1,draftSettings.calendarRadius,'')} 
    ${rangeField('calendarOpacity','Opacity',0.2,1,0.01,draftSettings.calendarOpacity,'')} 
    <div class="field"><label><span>Color</span></label><input id="calendarColor" type="color" value="${draftSettings.calendarColor}"></div> 
    ${selectField('calendarDirection','Text direction',draftSettings.calendarDirection,[['auto','Auto'],['ltr','Left to right'],['rtl','Right to left']],'')}
  </div></div> 

  <div class="setting-section"><h3>Layout & Positioning (Absolute Freedom)</h3><div class="notice" style="margin-bottom:12px">Position elements precisely. Move sliders to place widgets anywhere on the screen safely.</div><div class="setting-grid"> 
    ${rangeField('timePosX','Clock X Position',5,95,1,draftSettings.timePosX,'Horizontal alignment.')} 
    ${rangeField('timePosY','Clock Y Position',5,95,1,draftSettings.timePosY,'Vertical alignment.')} 
    ${selectField('timeAlign','Clock text align',draftSettings.timeAlign,[['center','Center'],['left','Left Align'],['right','Right Align']],'')} 
    ${rangeField('calPosX','Calendar X Position',5,95,1,draftSettings.calPosX,'')} 
    ${rangeField('calPosY','Calendar Y Position',5,95,1,draftSettings.calPosY,'')} 
    ${selectField('calAlign','Calendar text align',draftSettings.calAlign,[['center','Center'],['left','Left'],['right','Right']],'')} 
    ${rangeField('searchPosX','Search X Position',5,95,1,draftSettings.searchPosX,'')} 
    ${rangeField('searchPosY','Search Y Position',5,95,1,draftSettings.searchPosY,'')} 
    ${rangeField('searchWidth','Search width',400,1200,5,draftSettings.searchWidth,'')} 
    ${rangeField('searchHeight','Search height',40,80,1,draftSettings.searchHeight,'')} 
  </div></div>
  
  <div class="setting-section"><h3>Premium Parallax & Depth</h3><div class="notice">Creates a layered 3D parallax effect moving smoothly with your mouse. For best performance on battery, select 30 FPS.</div><div class="depth-editor" style="margin-top:10px"><div id="depthPreview" class="depth-preview">${activeWallpaper?.type==='image'&&activeUrl?`<img src="${activeUrl}" alt="">`:'<div class="notice" style="margin:20px">Choose an image wallpaper to edit depth.</div>'}<div id="depthSelection" class="depth-selection"></div></div><div class="depth-tip">Drag the box over the part of the subject that should overlap the clock.</div></div> <div class="setting-grid"> 
    ${toggleField('depthMode','Enable Depth & Parallax',draftSettings.depthMode,'Places region above clock and enables 3D mouse parallax.')} 
    ${rangeField('parallaxIntensity','Parallax motion scale',0,40,1,draftSettings.parallaxIntensity,'How much layers move.')} 
    ${rangeField('parallaxSmoothing','Motion smoothing (Lerp)',0.01,0.25,0.01,draftSettings.parallaxSmoothing,'Lower is smoother.')} 
    ${selectField('performanceFps','Animation FPS',draftSettings.performanceFps,[[60,'60 FPS (Balanced)'],[30,'30 FPS (Battery Saver)'],[120,'120 FPS (Ultra Smooth)']],'Cap frame rate.')} 
    ${rangeField('depthFeather','Edge rounding',0,40,1,draftSettings.depthFeather,'')} 
    ${rangeField('depthShadow','Depth shadow drop',0,0.8,0.01,draftSettings.depthShadow,'')} 
    <div class="toolbar" style="align-items:end; grid-column: 1 / -1;"><button class="secondary" id="depthCenter">Center preset</button><button class="secondary" id="depthTop">Clock overlap preset</button></div> 
  </div></div> 
  
  <div class="setting-section"><h3>Features & General</h3><div class="setting-grid"> 
    ${toggleField('showBrand','NovaMotion logo',draftSettings.showBrand,'')} 
    ${toggleField('showDock','Bottom dock',draftSettings.showDock,'')} 
    ${toggleField('showSearch','Search bar',draftSettings.showSearch,'')} 
    ${toggleField('showShortcuts','Shortcut rail',draftSettings.showShortcuts,'')} 
    ${toggleField('idleSaver','Idle video saver',draftSettings.idleSaver,'Pause video on inactivity.')} 
    ${rangeField('idleMinutes','Idle timeout (min)',1,30,1,draftSettings.idleMinutes,'')} 
    ${selectField('engineSelect','Search engine',draftSettings.searchEngine,engines.map(([name,url])=>[url,name]),'')} 
    ${toggleField('searchNewTab','Open search in new tab',draftSettings.searchNewTab,'')} 
  </div></div> 
  </div></div>`;
  openModal(`<div class="modal-head"><h2>NovaMotion Settings</h2><button class="close">×</button></div>${html}`);
  
  const live = wireLivePreview(); 
  bindSettingsInputs(live);
  
  const selects = ['engineSelect','calendarType','calendarDateStyle','calendarFont','calendarDirection','clockFont','timeAlign','calAlign'];
  selects.forEach(id => {
      bindCustomSelect($(`#${id}Select`), v => { 
          if(id === 'engineSelect') draftSettings.searchEngine = v;
          else if(id === 'timeAlign' || id === 'calAlign') draftSettings[id] = v;
          else draftSettings[id] = v;
          live();
      });
  });
  bindCustomSelect($('#performanceFpsSelect'), v => { draftSettings.performanceFps = Number(v); live(); });
  
  const cColor = $('#clockColor'), calColor = $('#calendarColor');
  const ccHandler = e => { draftSettings.clockColor=e.target.value; live() };
  const calcHandler = e => { draftSettings.calendarColor=e.target.value; live() };
  cColor.addEventListener('input', ccHandler); calColor.addEventListener('input', calcHandler);
  modalCleanups.push(() => { cColor.removeEventListener('input', ccHandler); calColor.removeEventListener('input', calcHandler); });
  
  const pvBtns = $$('.pv-btn');
  pvBtns.forEach(btn => {
      const h = e => { 
          pvBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
          draftSettings.pvMode = btn.dataset.mode; live(); 
      };
      btn.addEventListener('click', h); modalCleanups.push(()=>btn.removeEventListener('click',h));
  });

  $('#depthCenter').onclick=()=>{Object.assign(draftSettings,{depthX:30,depthY:25,depthW:40,depthH:28});syncSettingValues();live()};
  $('#depthTop').onclick=()=>{Object.assign(draftSettings,{depthX:28,depthY:16,depthW:44,depthH:35});syncSettingValues();live()};
  
  enableDepthDrag(); syncSettingValues(); live();
  
  $('#saveSettings').onclick=async()=>{
      appSettings = JSON.parse(JSON.stringify(draftSettings)); 
      await save(); applyUI(); updateClock(); setSearchEngine(appSettings.searchEngine);
      toast('Settings applied perfectly.'); closeModal();
  };
  $('#resetSettings').onclick=()=>{draftSettings={...DEFAULTS};syncSettingValues();live();toast('Restored to defaults. Press Save to apply.')};
  $('#cancelSettings').onclick=closeModal; 
}

function bindCustomSelect(node,cb){
  if(!node)return; const btn=$('.select-button',node); if(!btn)return;
  const close=()=>node.classList.remove('open');
  const toggleH = e => { e.preventDefault(); e.stopPropagation(); node.classList.toggle('open') };
  const stopH = e => { e.preventDefault(); e.stopPropagation() };
  btn.addEventListener('pointerdown', toggleH); btn.addEventListener('click', stopH);
  
  const optH = [];
  $$('.select-option',node).forEach(o=>{
      const h = e => {
          e.preventDefault(); e.stopPropagation(); const v=decodeURIComponent(o.dataset.value);
          $$('.select-option',node).forEach(x=>x.classList.toggle('active',x===o));
          const label=$('.select-button span',node);if(label)label.textContent=o.textContent.trim();
          close();cb(v);
      };
      o.addEventListener('pointerdown', h); optH.push({el: o, fn: h});
  });
  
  const docDownH = e => $$('.custom-select.open').forEach(s=>{if(!s.contains(e.target))s.classList.remove('open')});
  const docKeyH = e => {if(e.key==='Escape')$$('.custom-select.open').forEach(s=>s.classList.remove('open'))};
  document.addEventListener('pointerdown', docDownH); document.addEventListener('keydown', docKeyH);
  
  modalCleanups.push(() => {
      btn.removeEventListener('pointerdown', toggleH); btn.removeEventListener('click', stopH);
      optH.forEach(oh => oh.el.removeEventListener('pointerdown', oh.fn));
      document.removeEventListener('pointerdown', docDownH); document.removeEventListener('keydown', docKeyH);
  });
}

function bindSettingsInputs(live){
  const bools=['showBrand','autoFocusSearch','showCalendar','showGreeting','showDate','showSeconds','clock24h','showSearch','showShortcuts','showDock','reducedMotion','showWallpaperName','noteOpen','wallpaperRandom','rotationEnabled','loop','muted','idleSaver','depthMode','searchNewTab','autoNextPhase'];
  bools.forEach(id=>{const n=$(`#${id}`);if(!n)return; const h = ()=>{draftSettings[id]=n.checked;live()}; n.addEventListener('change', h); modalCleanups.push(()=>n.removeEventListener('change', h));});
  
  const greetingInput=$('#greetingCustom'); 
  if(greetingInput) { const h = ()=>{draftSettings.greetingCustom=greetingInput.value;live()}; greetingInput.addEventListener('input', h); modalCleanups.push(()=>greetingInput.removeEventListener('input',h)); }

  let rafs = {}; 
  const nums=['clockSize','clockWeight','clockSpacing','clockOpacity','clockShadow','greetingSize','calendarSize','calendarWeight','calendarRadius','calendarOpacity','brightness','contrast','saturation','hueRotate','sepia','blur','overlay','volume','searchWidth','searchHeight','searchRadius','searchPosX','searchPosY','timePosX','timePosY','calPosX','calPosY','dockRadius','iconSize','rotationMinutes','idleMinutes','depthFeather','depthShadow','depthX','depthY','depthW','depthH','focusDim','focusBlur','parallaxIntensity','parallaxSmoothing'];
  nums.forEach(id=>{
      const n=$(`#${id}`);if(!n)return;
      const h = (e) => {
          draftSettings[id]=Number(e.target.value);
          const v=$(`#${id}Val`);if(v)v.textContent=e.target.value;
          if(rafs[id]) cancelAnimationFrame(rafs[id]);
          rafs[id] = requestAnimationFrame(() => { live(); }); 
      };
      n.addEventListener('input', h);
      modalCleanups.push(() => { n.removeEventListener('input', h); if(rafs[id]) cancelAnimationFrame(rafs[id]); });
  });
  
  ['pomodoroFocus','pomodoroBreak'].forEach(id=>{
      const n = $(`#${id}`); if(!n) return;
      const h = e => { draftSettings[id]=Math.max(1,Number(e.target.value)||1); live(); };
      n.addEventListener('change', h); modalCleanups.push(()=>n.removeEventListener('change', h));
  });
}
function syncCustomSelect(id,value){ const node=$(`#${id}Select`);if(!node)return; const option=$$(`.select-option`,node).find(o=>decodeURIComponent(o.dataset.value)===String(value)); const label=$('.select-button span',node); if(option&&label)label.textContent=option.textContent.trim(); $$('.select-option',node).forEach(o=>o.classList.toggle('active',o===option)); }
function syncSettingValues(){ 
  const ids=['clockSize','clockWeight','clockSpacing','clockOpacity','clockShadow','greetingSize','calendarSize','calendarWeight','calendarRadius','calendarOpacity','brightness','contrast','saturation','hueRotate','sepia','blur','overlay','volume','searchWidth','searchHeight','searchRadius','searchPosX','searchPosY','timePosX','timePosY','calPosX','calPosY','dockRadius','iconSize','rotationMinutes','idleMinutes','depthFeather','depthShadow','depthX','depthY','depthW','depthH','focusDim','focusBlur','parallaxIntensity','parallaxSmoothing']; 
  ids.forEach(id=>{const n=$(`#${id}`);if(n)n.value=draftSettings[id];const v=$(`#${id}Val`);if(v)v.textContent=draftSettings[id]}); 
  ['showBrand','autoFocusSearch','showCalendar','showGreeting','showDate','showSeconds','clock24h','showSearch','showShortcuts','showDock','reducedMotion','showWallpaperName','noteOpen','wallpaperRandom','rotationEnabled','loop','muted','idleSaver','depthMode','searchNewTab','autoNextPhase'].forEach(id=>{const n=$(`#${id}`);if(n)n.checked=!!draftSettings[id]}); 
  syncCustomSelect('engineSelect',draftSettings.searchEngine); syncCustomSelect('calendarType',draftSettings.calendarType); syncCustomSelect('calendarDateStyle',draftSettings.calendarDateStyle); syncCustomSelect('calendarFont',draftSettings.calendarFont); syncCustomSelect('calendarDirection',draftSettings.calendarDirection); syncCustomSelect('clockFont',draftSettings.clockFont); syncCustomSelect('performanceFps',draftSettings.performanceFps); syncCustomSelect('timeAlign',draftSettings.timeAlign); syncCustomSelect('calAlign',draftSettings.calAlign);
  const calColor=$('#calendarColor');if(calColor)calColor.value=draftSettings.calendarColor; const greetingInput=$('#greetingCustom');if(greetingInput)greetingInput.value=draftSettings.greetingCustom||''; 
  const depthBox = $('#depthSelection'); if(depthBox){ depthBox.style.left=draftSettings.depthX+'%'; depthBox.style.top=draftSettings.depthY+'%'; depthBox.style.width=draftSettings.depthW+'%'; depthBox.style.height=draftSettings.depthH+'%'; }
}

function enableDepthDrag(){
  const box=$('#depthSelection'),stage=$('#depthPreview');if(!box||!stage)return;
  const paint=()=>{box.style.left=draftSettings.depthX+'%';box.style.top=draftSettings.depthY+'%';box.style.width=draftSettings.depthW+'%';box.style.height=draftSettings.depthH+'%'};
  let dragging=false,sx=0,sy=0,ox=0,oy=0;
  
  const downH = e => { dragging=true;sx=e.clientX;sy=e.clientY;ox=draftSettings.depthX;oy=draftSettings.depthY;box.setPointerCapture(e.pointerId); };
  const moveH = e => { if(!dragging)return;const r=stage.getBoundingClientRect();draftSettings.depthX=Math.max(0,Math.min(100-draftSettings.depthW,ox+(e.clientX-sx)/r.width*100));draftSettings.depthY=Math.max(0,Math.min(100-draftSettings.depthH,oy+(e.clientY-sy)/r.height*100));syncSettingValues();paint(); };
  const upH = () => { dragging=false; };
  
  box.addEventListener('pointerdown', downH); box.addEventListener('pointermove', moveH); box.addEventListener('pointerup', upH);
  modalCleanups.push(()=>{ box.removeEventListener('pointerdown', downH); box.removeEventListener('pointermove', moveH); box.removeEventListener('pointerup', upH); });
}

async function audioModal(){
  const html=`<div class="toolbar"><label class="primary" for="audioUpload">＋ Add sounds</label><input id="audioUpload" type="file" accept="audio/*" multiple hidden><button class="secondary" id="stopAllAudio">Stop all</button></div><div class="grid" id="audioGrid"></div>`;
  tabs('Sounds & Music',[{id:'audio',label:'Library',html}]);drawAudio();
  $('#audioUpload').onchange=async e=>{for(const f of [...e.target.files]){if(!f.type.startsWith('audio/'))continue;const h=await hashFile(f);if(sounds.some(x=>x.hash===h))continue;const it={id:uid(),hash:h,name:f.name,size:f.size,blob:f};await dbPut(AUDIO,it); const { blob, ...meta } = it; sounds.push(meta);}drawAudio()};
  $('#stopAllAudio').onclick=stopAllAudio;
}
function drawAudio(){
  const g=$('#audioGrid');if(!g)return;g.innerHTML='';if(!sounds.length){g.innerHTML='<div class="notice">No local sounds yet.</div>';return}
  for(const s of sounds){
    const c=document.createElement('article');c.className='card';c.dataset.id=s.id;
    c.innerHTML=`<div class="card-body"><div class="row"><strong></strong><span class="small">${bytes(s.size)}</span></div><div class="field"><label>Volume</label><input class="soundVol" type="range" min="0" max="1" step=".01" value=".35"></div><div class="actions"><button class="secondary play">Play</button><button class="danger del">Delete</button></div></div>`;
    c.querySelector('strong').textContent=s.name;
    const rng = c.querySelector('.soundVol');
    const rh = e=>{const a=audioNodes.get(s.id);if(a)a.volume=Number(e.target.value)};
    rng.addEventListener('input', rh); modalCleanups.push(()=>rng.removeEventListener('input',rh));
    g.appendChild(c)
  }
  
  const gridH = async (e) => {
      const btn = e.target.closest('button'); if(!btn) return;
      const card = btn.closest('.card'); const id = card.dataset.id; const s = sounds.find(x => x.id === id); if(!s) return;
      if(btn.classList.contains('play')) {
          if(audioNodes.has(s.id)){audioNodes.get(s.id).pause();audioNodes.delete(s.id);return}
          const full = await dbGetItem(AUDIO, s.id); if(!full) return;
          const a=new Audio(url(full.blob));a.loop=true;a.volume=.35;a.play().catch(()=>toast('Playback blocked.'));audioNodes.set(s.id,a);
      } else if(btn.classList.contains('del')) { const a=audioNodes.get(s.id);a?.pause();audioNodes.delete(s.id);await dbDel(AUDIO,s.id);sounds=sounds.filter(x=>x.id!==s.id);drawAudio(); }
  };
  g.addEventListener('click', gridH); modalCleanups.push(()=>g.removeEventListener('click',gridH));
}
function stopAllAudio(){for(const a of audioNodes.values())a.pause();audioNodes.clear()}

async function addShortcutModal(){
  openModal(`<div class="modal-head"><h2>Add shortcut</h2><button class="close">×</button></div><div class="shortcut-form"> <div class="shortcut-form-preview"><div class="shortcut-demo-icon">N</div><div><strong>Bottom rail shortcut</strong><span>Saved here automatically</span></div></div> <div class="field"><label><span>Name ${tip('A short name works best on the bottom rail.')}</span></label><input id="scName" type="text" autocomplete="off" placeholder="YouTube"></div> <div class="field"><label><span>URL ${tip('Use a full website address. https:// is added automatically.')}</span></label><input id="scUrl" type="url" autocomplete="url" placeholder="https://youtube.com"></div> <div class="notice" style="margin-bottom:12px">This shortcut is saved in local storage and Chrome Sync when available, so reopening or updating the extension can restore it automatically.</div> <div class="toolbar shortcut-modal-actions"><button class="secondary" id="cancelSc">Cancel</button><button class="primary" id="saveSc">Save to bottom rail</button></div> </div>`);
  const nameInput=$('#scName'),urlInput=$('#scUrl');
  const updateDemo=()=>{const v=urlInput.value.trim();try{const host=new URL(/^https?:\/\//i.test(v)?v:`https://${v}`).hostname;$('.shortcut-demo-icon').textContent=(host.replace(/^www\./,'')[0]||'N').toUpperCase()}catch{}};
  urlInput.oninput=updateDemo; $('#cancelSc').onclick=closeModal;
  $('#saveSc').onclick=async()=>{
    let name=nameInput.value.trim()||'Website',u=urlInput.value.trim();
    if(!/^https?:\/\//i.test(u))u='https://'+u; try{new URL(u)}catch{toast('Enter a valid URL');return}
    const icons=iconFor(u); shortcuts.push({id:uid(),name,url:u,icon:icons.remote||icons.fallback}); shortcuts=shortcuts.slice(-appSettings.shortcutLimit);
    await saveShortcuts();renderShortcuts();closeModal();toast('Shortcut saved to the bottom rail');
  };
  nameInput.focus();
}
async function bookmarksModal(){
  try{
    const ok=await chrome.permissions.contains({permissions:['bookmarks']})||await chrome.permissions.request({permissions:['bookmarks']});if(!ok){toast('Bookmarks permission was not granted');return}
    const tree=await chrome.bookmarks.getTree(),links=[];(function w(ns){for(const n of ns){if(n.url)links.push(n);if(n.children)w(n.children)}})(tree);
    tabs('Bookmarks',[{id:'b',label:`${links.length} bookmarks`,html:'<div class="grid" id="bmGrid"></div>'}]);const g=$('#bmGrid');for(const b of links.slice(0,180)){const c=document.createElement('article');c.className='card';c.innerHTML='<div class="card-body"><strong></strong><div class="small"></div><div class="actions"><button class="primary open">Open</button><button class="secondary add">Add shortcut</button></div></div>';c.querySelector('strong').textContent=b.title||b.url;c.querySelector('.small').textContent=b.url;c.querySelector('.open').onclick=()=>window.open(b.url,'_blank');c.querySelector('.add').onclick=async()=>{const bi=iconFor(b.url);shortcuts.push({id:uid(),name:b.title||new URL(b.url).hostname,url:b.url,icon:bi.remote||bi.fallback});shortcuts=shortcuts.slice(-appSettings.shortcutLimit);await saveShortcuts();renderShortcuts();toast('Bookmark added to the bottom rail')};g.appendChild(c)}
  }catch(e){console.error(e);toast('Could not open bookmarks')}
}
function pomodoroModal(){openModal(`<div class="modal-head"><h2>Pomodoro</h2><button class="close">×</button></div><div class="timer"><div class="phase" id="pPhase">${pomodoro.phase==='focus'?'Focus':'Break'}</div><div class="big" id="pTime">00:00</div><div class="small">Sessions: <b id="pSessions">${pomodoro.sessions||0}</b></div><div class="toolbar" style="justify-content:center;margin-top:18px"><button class="primary" id="pStart">${pomodoro.running?'Pause':'Start'}</button><button class="secondary" id="pReset">Reset</button></div></div>`);renderPomo();if(pomodoro.running&&!pomoTimer)pomoTimer=setInterval(pomoLoop,250);$('#pStart').onclick=togglePomo;$('#pReset').onclick=resetPomo}
function renderPomo(){const sec=Math.max(0,Math.floor((pomodoro.running?pomodoro.endAt-Date.now():pomodoro.remaining*1000)/1000));const s=String(sec%60).padStart(2,'0'),m=String(Math.floor(sec/60)).padStart(2,'0');$('#pTime')?.replaceChildren(document.createTextNode(`${m}:${s}`));if($('#pPhase'))$('#pPhase').textContent=pomodoro.phase==='focus'?'Focus':'Break';if($('#pSessions'))$('#pSessions').textContent=pomodoro.sessions||0}
async function togglePomo(){if(pomodoro.running){pomodoro.remaining=Math.max(0,Math.ceil((pomodoro.endAt-Date.now())/1000));pomodoro.running=false;clearInterval(pomoTimer);pomoTimer=null}else{pomodoro.running=true;pomodoro.endAt=Date.now()+pomodoro.remaining*1000;clearInterval(pomoTimer);pomoTimer=setInterval(pomoLoop,250)}await chrome.storage.local.set({novaPomodoro:pomodoro});renderPomo();if($('#pStart'))$('#pStart').textContent=pomodoro.running?'Pause':'Start'}
async function pomoLoop(){if(Date.now()>=pomodoro.endAt){if(pomodoro.phase==='focus')pomodoro.sessions=(pomodoro.sessions||0)+1;pomodoro.phase=pomodoro.phase==='focus'?'break':'focus';pomodoro.remaining=(pomodoro.phase==='focus'?appSettings.pomodoroFocus:appSettings.pomodoroBreak)*60;if(appSettings.autoNextPhase)pomodoro.endAt=Date.now()+pomodoro.remaining*1000;else{pomodoro.running=false;clearInterval(pomoTimer);pomoTimer=null}await chrome.storage.local.set({novaPomodoro:pomodoro});toast(pomodoro.phase==='focus'?'Focus started':'Break started')}renderPomo()}
function resetPomo(){pomodoro={running:false,phase:'focus',remaining:appSettings.pomodoroFocus*60,sessions:pomodoro.sessions||0};clearInterval(pomoTimer);pomoTimer=null;chrome.storage.local.set({novaPomodoro:pomodoro});renderPomo();if($('#pStart'))$('#pStart').textContent='Start'}

let noteSaveTimer=null;
async function saveNoteText(value){ clearTimeout(noteSaveTimer); const noteStatus=$('#noteStatus'); if(noteStatus)noteStatus.textContent='Saving…'; noteSaveTimer=setTimeout(async()=>{ try{ appSettings.noteText=value; await chrome.storage.local.set({novaNote:value}); if(noteStatus)noteStatus.textContent='Saved'; setTimeout(()=>{if(noteStatus)noteStatus.textContent='Auto-saved'},900); }catch{if(noteStatus)noteStatus.textContent='Couldn’t save'} },250); }
async function loadNote(){ try{ const saved=await chrome.storage.local.get('novaNote'); const value=typeof saved.novaNote==='string'?saved.novaNote:(appSettings.noteText||''); appSettings.noteText=value; const input=$('#noteInput');if(input)input.value=value; }catch{} applyNoteVisibility(); }
function applyNoteVisibility(){ const note=$('#noteWidget'),reopen=$('#noteReopen');if(!note)return; const hidden=!appSettings.noteOpen; note.classList.toggle('hidden',hidden); if(reopen)reopen.classList.toggle('show',hidden); const toggle=$('#noteToggle');if(toggle)toggle.title='Hide notes'; }
async function hideNotes(){ appSettings.noteOpen=false; applyNoteVisibility(); await chrome.storage.local.set({novaNoteOpen:false}); }
async function showNotes(){ appSettings.noteOpen=true; applyNoteVisibility(); await chrome.storage.local.set({novaNoteOpen:true}); setTimeout(()=>$('#noteInput')?.focus({preventScroll:true}),120); }

function searchSubmit(e){e.preventDefault();const q=$('#searchInput').value.trim();if(q)window.open(appSettings.searchEngine+encodeURIComponent(q),appSettings.searchNewTab?'_blank':'_self')}
$('#searchForm').onsubmit=searchSubmit; $('#noteToggle').onclick=hideNotes; $('#noteReopen').onclick=showNotes; $('#noteInput').oninput=e=>saveNoteText(e.target.value); $('#noteClear').onclick=async()=>{const input=$('#noteInput');if(!input)return;input.value='';await saveNoteText('');}; $('#engineBtn').onclick=()=>{const keys=Object.keys(ENGINES),i=keys.indexOf(ENGINE_NAME[appSettings.searchEngine]||'Google'),n=keys[(i+1)%keys.length];setSearchEngine(ENGINES[n]);save();toast(`Search: ${n}`)}; $('#shuffleBtn').onclick=nextWallpaper;$('#favoriteBtn').onclick=toggleFavorite;$('#playBtn').onclick=togglePlay;
$('#muteBtn').onclick=async()=>{ appSettings.muted=!appSettings.muted; const v=$('#wallpaperVideo'); const pv=$('#pvVideo'); if(v){ if(appSettings.muted){v.muted=true;v.volume=0;} else{v.muted=false;v.volume=Number(appSettings.volume)||0;} } if(pv)pv.muted=true; await save();applyUI(); if(!appSettings.muted&&activeWallpaper?.type==='video'&&!document.hidden&&!document.body.classList.contains('focus')&&!idleActive){restoreMainVideoAudio();v?.play().catch(()=>{})} };
$('#focusBtn').onclick=toggleFocus;$('#settingsBtn').onclick=settingsModal;$('#wallpapersBtn').onclick=wallpapersModal;$('#audioBtn').onclick=audioModal;$('#bookmarksBtn').onclick=bookmarksModal;$('#pomodoroBtn').onclick=pomodoroModal;$('#addShortcutBtn').onclick=addShortcutModal; $('#app').ondblclick=e=>{if(!e.target.closest('button,input,.modal,.shortcut,.search-bar,.search-bar-wrap'))toggleFocus()}; $('#modalBackdrop').onclick=e=>{if(e.target===$('#modalBackdrop'))closeModal()};
document.onkeydown=e=>{if(e.key==='Escape'&&!$('#modalBackdrop').hidden){closeModal();return}if(e.ctrlKey&&e.shiftKey&&e.code==='Space'){e.preventDefault();nextWallpaper()}else if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();toggleFocus()}else if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();pomodoroModal()}else if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&$('#modalBackdrop').hidden){e.preventDefault();togglePlay()}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMainVideo();else if(activeWallpaper?.type==='video'&&!document.body.classList.contains('focus')&&!idleActive){restoreMainVideoAudio();$('#wallpaperVideo').play().catch(()=>{})}updatePlay()});
let drag=0;$('#app').ondragenter=e=>{e.preventDefault();drag++;$('#dropHint').classList.add('show');$('#app').classList.add('drag-over')};$('#app').ondragover=e=>e.preventDefault();$('#app').ondragleave=e=>{e.preventDefault();drag=Math.max(0,drag-1);if(!drag){$('#dropHint').classList.remove('show');$('#app').classList.remove('drag-over')}};$('#app').ondrop=async e=>{e.preventDefault();drag=0;$('#dropHint').classList.remove('show');$('#app').classList.remove('drag-over');await addWallpapers(e.dataTransfer.files)};
document.addEventListener('pointerdown',()=>{if(idleActive){idleActive=false;document.body.classList.remove('idle-save');setupIdleSaver();if(activeWallpaper?.type==='video'&&!document.hidden&&!document.body.classList.contains('focus')){restoreMainVideoAudio();$('#wallpaperVideo').play().catch(()=>{})}updatePlay()}});
window.addEventListener('error',e=>console.error('NovaMotion runtime error',e.error||e.message)); window.addEventListener('unhandledrejection',e=>console.error('NovaMotion promise error',e.reason));
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='sync'&&changes.novaShortcuts){shortcuts=Array.isArray(changes.novaShortcuts.newValue)?changes.novaShortcuts.newValue:[];renderShortcuts()}
  if(area==='sync'&&changes.novaSettings){appSettings={...appSettings,...changes.novaSettings.newValue}; if(!draftSettings) { applyUI(); updateClock(); }}
});

setInterval(updateClock,1000); closeModal(); loadData().then(async()=>{await loadNote();focusSearchOnce()}).catch(e=>{console.error('boot',e);toast('NovaMotion could not load its saved data')});
document.addEventListener('dragstart',e=>{if(e.target.closest('#modal,.settings-layout,input[type="range"],button,.custom-select'))e.preventDefault()});
document.addEventListener('pointerdown',e=>{const range=e.target.closest('input[type="range"]');if(range){e.stopPropagation();range.setAttribute('draggable','false');document.body.classList.add('range-dragging');}});
document.addEventListener('pointerup',()=>document.body.classList.remove('range-dragging'));