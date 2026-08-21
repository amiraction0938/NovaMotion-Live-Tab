const DEFAULT_SETTINGS = {
  showBrand: true,
  autoFocusSearch: true,
  showGreeting: true,
  showDate: true,
  showSeconds: false,
  clock24h: true,
  showSearch: true,
  showShortcuts: true,
  showDock: true,
  showWallpaperName: false,
  reducedMotion: false,
  wallpaperRandom: false,
  rotationEnabled: false,
  rotationMinutes: 30,
  muted: true,
  loop: true,
  volume: 0.35,
  brightness: 0.72,
  blur: 0,
  overlay: 0.18,
  idleSaver: true,
  idleMinutes: 3,
  depthMode: false,
  depthX: 30,
  depthY: 25,
  depthW: 40,
  depthH: 28,
  depthFeather: 0,
  depthShadow: 0.26,
  clockSize: 104,
  clockWeight: 650,
  clockSpacing: -0.06,
  clockOpacity: 1,
  clockColor: "#ffffff",
  clockFont: "Bahnschrift",
  greetingSize: 20,
  searchWidth: 720,
  searchRadius: 18,
  dockRadius: 18,
  iconSize: 50,
  shortcutLimit: 12,
  searchNewTab: true,
  searchEngine: "https://www.google.com/search?q=",
  pomodoroFocus: 25,
  pomodoroBreak: 5,
  autoNextPhase: false,
  focusDim: 0.58,
  focusBlur: 1.5,
  showHints: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["novaSettings"]);
  if (!current.novaSettings) {
    await chrome.storage.local.set({ novaSettings: DEFAULT_SETTINGS });
  }
  
  // Safe Sync Initialization (stripping base64 icons if migrating from 2.2.4 to prevent Quota error)
  const local = await chrome.storage.local.get(["novaShortcuts"]);
  const sync = await chrome.storage.sync.get(["novaShortcuts"]);
  if (!sync.novaShortcuts && Array.isArray(local.novaShortcuts)) {
    const syncSafe = local.novaShortcuts.map(s => ({ id: s.id, name: s.name, url: s.url }));
    try { await chrome.storage.sync.set({ novaShortcuts: syncSafe }); } catch (e) { console.warn('Sync init failed', e); }
  }
});