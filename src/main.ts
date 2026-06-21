/// <reference types="@songloft/plugin-sdk" />

import {
  createRouter,
  jsonResponse,
  parseQuery,
  type HTTPRequest,
  type HTTPResponse,
  type PlayEvent,
  type SearchResultItem
} from '@songloft/plugin-sdk';

const ENTRY_PATH = 'lx-sync-server';
const PLUGIN_NAME = 'LX Sync Server';
const CONFIG_KEY = 'config';
const SNAPSHOT_KEY = 'snapshot';
const SESSION_KEY = 'lx-session';
const PLAY_EVENTS_KEY = 'play-events';
const IMPORT_MAP_KEY = 'import-map';
const ONLINE_IMPORT_MAP_KEY = 'online-import-map';
const MAX_EVENT_HISTORY = 30;
const MIOT_ENTRY_PATH = 'miot';
const MIOT_PLUGIN_NAME = '智能音箱';
const MIOT_STATUS_TIMEOUT_MS = 8_000;
const MAX_ONLINE_IMPORT_PAGES = 20;
const ONLINE_SOURCES = [
  { id: 'kw', name: '酷我音乐' },
  { id: 'kg', name: '酷狗音乐' },
  { id: 'tx', name: 'QQ音乐' },
  { id: 'wy', name: '网易云音乐' },
  { id: 'mg', name: '咪咕音乐' }
] as const;
type OnlineSource = typeof ONLINE_SOURCES[number]['id'];
type OnlineKind = 'songlist' | 'leaderboard';

interface PluginConfig {
  baseUrl: string;
  username: string;
  password: string;
  playerUrl: string;
  importPrefix: string;
  defaultQuality: string;
  autoRefreshMinutes: number;
  recordPlayEvents: boolean;
}

interface LxSession {
  token: string;
  username: string;
  baseUrl: string;
  expiresAt: number;
}

interface LxMusicInfo {
  id?: string | number | null;
  name?: string;
  singer?: string;
  source?: string;
  interval?: string | null;
  albumName?: string;
  img?: string;
  songmid?: string | number | null;
  songId?: string | number | null;
  hash?: string | number | null;
  copyrightId?: string | number | null;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

interface LxUserListInfo {
  id: string;
  name: string;
  list?: LxMusicInfo[];
  locationUpdateTime?: number | null;
  [key: string]: unknown;
}

interface LxListData {
  defaultList?: LxMusicInfo[];
  loveList?: LxMusicInfo[];
  userList?: LxUserListInfo[];
}

interface NormalizedPlaylist {
  id: string;
  name: string;
  system: boolean;
  songs: LxMusicInfo[];
  songCount: number;
  locationUpdateTime?: number | null;
}

interface Snapshot {
  fetchedAt: number;
  baseUrl: string;
  username: string;
  playlists: NormalizedPlaylist[];
}

interface PlayEventRecord {
  type: string;
  source: string;
  timestamp: number;
  song?: {
    id?: number;
    title: string;
    artist: string;
  };
  playlist?: {
    id: number | string;
    name: string;
  };
}

interface ImportRequest {
  playlistIds?: string[];
  refresh?: boolean;
  includeEmpty?: boolean;
}

interface ImportDetail {
  lxPlaylistId: string;
  name: string;
  songloftPlaylistId?: number;
  songloftPlaylistName?: string;
  songCount: number;
  submitted?: number;
  importedSongs?: number;
  remoteReady?: number;
  added?: number;
  skipped?: number;
  playlistAdded?: number;
  playlistExisting?: number;
  localSkipped: number;
  imported: boolean;
  reason?: string;
}

interface ImportResult {
  success: true;
  fetchedAt: number;
  playlistsRequested: number;
  totalSongsSubmitted: number;
  totalSongsImported: number;
  totalRemoteReady: number;
  totalAdded: number;
  totalSkipped: number;
  totalPlaylistAdded: number;
  totalPlaylistExisting: number;
  totalLocalSkipped: number;
  details: ImportDetail[];
}

interface ImportedPlaylistRecord {
  lxPlaylistId: string;
  lxPlaylistName: string;
  songloftPlaylistId: number;
  songloftPlaylistName: string;
  songCount: number;
  importedAt: number;
}

interface ImportedOnlineRecord extends ImportedPlaylistRecord {
  kind: OnlineKind;
  source: OnlineSource;
  onlineId: string;
}

interface ImportableCollection {
  id: string;
  name: string;
  songs: LxMusicInfo[];
  songCount: number;
  songloftPlaylistName: string;
  description: string;
  coverUrl: string;
}

interface HostPlaylist {
  id: number;
  name: string;
  type: string;
  song_count?: number;
  songCount?: number;
}

interface HostSong {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

interface HostPluginInfo {
  id: number;
  name: string;
  entry_path: string;
  status: string;
}

interface MiotDevice {
  deviceID: string;
  name?: string;
  alias?: string;
  model?: string;
  hardware?: string;
  presence?: string;
  managed?: boolean;
  volume?: number;
  play_mode?: string;
  playlist_id?: number;
  current_song_index?: number;
}

interface MiotAccountDevices {
  account_id: string;
  account_name: string;
  devices: MiotDevice[];
  last_selected_device_id?: string;
}

interface MiotConfigSummary {
  server_host?: string;
  server_host_status?: string;
}

interface MiotStatus {
  installed: boolean;
  active: boolean;
  pluginId?: number;
  entryPath: string;
  name: string;
  status?: string;
  devices: MiotAccountDevices[];
  config?: MiotConfigSummary;
  importedPlaylists: ImportedPlaylistRecord[];
  error?: string;
}

interface MiotEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

type MiotPlayMode = 'order' | 'random' | 'single' | 'loop';

interface MiotPlayRequest {
  accountId?: string;
  deviceId?: string;
  lxPlaylistId?: string;
  songloftPlaylistId?: number;
  songloftPlaylistName?: string;
  startIndex?: number;
  playMode?: string;
  refresh?: boolean;
}

interface MiotControlRequest {
  accountId?: string;
  deviceId?: string;
  action?: string;
}

interface MiotSongUrlRequest {
  accountId?: string;
  deviceId?: string;
  lxPlaylistId?: string;
  songIndex?: number;
}

interface MiotOnlineSongUrlRequest {
  accountId?: string;
  deviceId?: string;
  songInfo?: LxMusicInfo;
}

interface OnlineImportRequest {
  kind?: OnlineKind;
  source?: string;
  id?: string;
  bangid?: string;
  name?: string;
  includeEmpty?: boolean;
}

interface OnlineImportResult {
  success: true;
  kind: OnlineKind;
  source: OnlineSource;
  sourceName: string;
  onlineId: string;
  detail: ImportDetail;
}

interface SongSearchResult {
  results: SearchResultItem[];
  songs: LxMusicInfo[];
  total: number;
  source: OnlineSource;
  sourceName: string;
  page: number;
  pageSize: number;
}

interface PluginTabEntry {
  plugin_id: number;
  entry_path: string;
  name: string;
}

interface HostTabConfig {
  show_library: boolean;
  show_playlists: boolean;
  plugin_tabs: PluginTabEntry[];
}

interface MenuStatus {
  enabled: boolean;
  canEnable: boolean;
  usedSlots: number;
  maxSlots: number;
  pluginId: number;
  entryPath: string;
  name: string;
}

class MenuCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MenuCapacityError';
  }
}

const defaultConfig: PluginConfig = {
  baseUrl: '',
  username: '',
  password: '',
  playerUrl: '',
  importPrefix: 'LX - ',
  defaultQuality: '128k',
  autoRefreshMinutes: 30,
  recordPlayEvents: true
};

const textDecoder = new TextDecoder('utf-8');
const router = createRouter();
let refreshTimer: number | null = null;

function now(): number {
  if (typeof __go_now_ms === 'function') return __go_now_ms();
  return Date.now();
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function primitiveString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function numericValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function defaultPlayerUrl(baseUrl: string): string {
  return baseUrl ? joinUrl(baseUrl, '/music') : '';
}

function onlineSourceName(source: OnlineSource): string {
  return ONLINE_SOURCES.find((item) => item.id === source)?.name || source;
}

function normalizeOnlineSource(value: unknown): OnlineSource {
  const source = primitiveString(value);
  if (ONLINE_SOURCES.some((item) => item.id === source)) return source as OnlineSource;
  throw new Error(`unsupported online source: ${source || 'empty'}`);
}

function normalizeOnlineKind(value: unknown): OnlineKind {
  if (value === 'songlist' || value === 'leaderboard') return value;
  throw new Error('kind must be songlist or leaderboard');
}

function queryPath(path: string, params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function decodeBody(req: HTTPRequest): unknown {
  const body = req.body as unknown;
  if (body === null || body === undefined) return {};
  if (typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer)) return body;
  let text = '';
  if (typeof body === 'string') {
    text = body;
  } else if (body instanceof Uint8Array) {
    text = textDecoder.decode(body);
  } else if (body instanceof ArrayBuffer) {
    text = textDecoder.decode(new Uint8Array(body));
  } else {
    text = String(body);
  }
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function publicConfig(config: PluginConfig): Omit<PluginConfig, 'password'> & { hasPassword: boolean } {
  const { password, ...safe } = config;
  return { ...safe, hasPassword: password.length > 0 };
}

function normalizeConfig(input: Partial<PluginConfig>, previous?: PluginConfig): PluginConfig {
  const base: PluginConfig = { ...defaultConfig, ...(previous || {}) };
  const baseUrl = normalizeBaseUrl(safeString(input.baseUrl, base.baseUrl));
  return {
    baseUrl,
    username: safeString(input.username, base.username).trim(),
    password: typeof input.password === 'string' ? input.password : base.password,
    playerUrl: safeString(input.playerUrl, base.playerUrl).trim() || defaultPlayerUrl(baseUrl),
    importPrefix: typeof input.importPrefix === 'string' ? input.importPrefix : base.importPrefix,
    defaultQuality: safeString(input.defaultQuality, base.defaultQuality).trim() || '128k',
    autoRefreshMinutes: Math.max(0, Number(input.autoRefreshMinutes ?? base.autoRefreshMinutes) || 0),
    recordPlayEvents: input.recordPlayEvents === undefined ? base.recordPlayEvents : Boolean(input.recordPlayEvents)
  };
}

async function loadConfig(): Promise<PluginConfig> {
  const stored = await songloft.storage.get(CONFIG_KEY);
  if (!stored || typeof stored !== 'object') return { ...defaultConfig };
  return normalizeConfig(stored as Partial<PluginConfig>);
}

async function saveConfig(config: PluginConfig): Promise<void> {
  await songloft.storage.set(CONFIG_KEY, config);
  configureAutoRefresh(config);
}

async function loadSession(): Promise<LxSession | null> {
  const stored = await songloft.storage.get(SESSION_KEY);
  if (!stored || typeof stored !== 'object') return null;
  const session = stored as Partial<LxSession>;
  if (!session.token || !session.username || !session.baseUrl || !session.expiresAt) return null;
  return session as LxSession;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    const detail = typeof payload === 'object' && payload ? JSON.stringify(payload) : String(payload || res.statusText);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return payload as T;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

async function login(config: PluginConfig, force = false): Promise<LxSession> {
  if (!config.baseUrl || !config.username || !config.password) {
    throw new Error('LX server URL, username and password are required');
  }

  const existing = await loadSession();
  if (
    !force &&
    existing &&
    existing.username === config.username &&
    existing.baseUrl === config.baseUrl &&
    existing.expiresAt > now() + 60_000
  ) {
    return existing;
  }

  const payload = await fetchJson<{ success?: boolean; token?: string; username?: string }>(
    joinUrl(config.baseUrl, '/api/user/login'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password })
    }
  );

  if (!payload.success || !payload.token) {
    throw new Error('LX login failed');
  }

  const session: LxSession = {
    token: payload.token,
    username: payload.username || config.username,
    baseUrl: config.baseUrl,
    expiresAt: now() + 50 * 60 * 1000
  };
  await songloft.storage.set(SESSION_KEY, session);
  return session;
}

async function lxFetchJson<T>(path: string, init: RequestInit = {}, authed = true, retry = true): Promise<T> {
  const config = await loadConfig();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined)
  };
  if (init.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (authed) {
    const session = await login(config);
    headers['x-user-token'] = session.token;
    headers['x-user-name'] = session.username;
  }

  try {
    return await fetchJson<T>(joinUrl(config.baseUrl, path), { ...init, headers });
  } catch (err) {
    if (!authed || !retry || !(err instanceof Error) || !err.message.includes('HTTP 401')) {
      throw err;
    }
    await login(config, true);
    return await lxFetchJson<T>(path, init, authed, false);
  }
}

function intervalToSeconds(interval?: string | null): number {
  if (!interval) return 0;
  const parts = interval.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function normalizeListData(data: LxListData): NormalizedPlaylist[] {
  const playlists: NormalizedPlaylist[] = [];

  playlists.push({
    id: 'default',
    name: '试听列表',
    system: true,
    songs: Array.isArray(data.defaultList) ? data.defaultList : [],
    songCount: Array.isArray(data.defaultList) ? data.defaultList.length : 0
  });

  playlists.push({
    id: 'love',
    name: '我的收藏',
    system: true,
    songs: Array.isArray(data.loveList) ? data.loveList : [],
    songCount: Array.isArray(data.loveList) ? data.loveList.length : 0
  });

  const userLists = Array.isArray(data.userList) ? data.userList : [];
  for (const list of userLists) {
    const songs = Array.isArray(list.list) ? list.list : [];
    playlists.push({
      id: String(list.id),
      name: list.name || String(list.id),
      system: false,
      songs,
      songCount: songs.length,
      locationUpdateTime: list.locationUpdateTime ?? null
    });
  }

  return playlists;
}

async function refreshSnapshot(): Promise<Snapshot> {
  const config = await loadConfig();
  const data = await lxFetchJson<LxListData>('/api/user/list', { method: 'GET' }, true);
  const snapshot: Snapshot = {
    fetchedAt: now(),
    baseUrl: config.baseUrl,
    username: config.username,
    playlists: normalizeListData(data)
  };
  await songloft.storage.set(SNAPSHOT_KEY, snapshot);
  return snapshot;
}

async function getSnapshot(refresh = false): Promise<Snapshot> {
  if (!refresh) {
    const stored = await songloft.storage.get(SNAPSHOT_KEY);
    if (stored && typeof stored === 'object') return stored as Snapshot;
  }
  return await refreshSnapshot();
}

function allSongs(snapshot: Snapshot): LxMusicInfo[] {
  const seen = new Set<string>();
  const songs: LxMusicInfo[] = [];
  for (const playlist of snapshot.playlists) {
    for (const song of playlist.songs) {
      const key = lxDedupKey(song);
      if (seen.has(key)) continue;
      seen.add(key);
      songs.push(song);
    }
  }
  return songs;
}

function songAlbum(song: LxMusicInfo): string {
  const meta = song.meta || {};
  return primitiveString(song.albumName)
    || primitiveString(song.album)
    || primitiveString(meta.albumName)
    || primitiveString(meta.album)
    || '';
}

function songCover(song: LxMusicInfo): string {
  const meta = song.meta || {};
  return primitiveString(song.img)
    || primitiveString(song.pic)
    || primitiveString(song.picUrl)
    || primitiveString(song.cover)
    || primitiveString(meta.picUrl)
    || primitiveString(meta.img)
    || primitiveString(meta.cover)
    || '';
}

function lxDedupKey(song: LxMusicInfo): string {
  const meta = song.meta || {};
  const id = [
    song.id,
    song.songmid,
    song.songId,
    song.hash,
    song.copyrightId,
    song.mid,
    meta.songId,
    meta.songmid,
    meta.copyrightId,
    meta.hash,
    meta.id
  ].map((value) => primitiveString(value)).find(Boolean) || '';
  const source = primitiveString(song.source, 'unknown');
  if (id) return `lx:${source}:${id}`;
  const raw = JSON.stringify({ source, name: song.name, singer: song.singer, album: songAlbum(song) });
  return `lx:${source}:hash:${__go_crypto_sha256(raw).slice(0, 24)}`;
}

function sourceData(song: LxMusicInfo, quality: string): Record<string, unknown> {
  return {
    schema: 1,
    provider: ENTRY_PATH,
    quality,
    songInfo: song
  };
}

function toSearchResult(song: LxMusicInfo, quality: string): SearchResultItem {
  return {
    title: song.name || 'Untitled',
    artist: song.singer || '',
    album: songAlbum(song),
    duration: intervalToSeconds(song.interval),
    cover_url: songCover(song),
    source_data: sourceData(song, quality)
  };
}

function toRemoteSongInput(song: LxMusicInfo, quality: string): Record<string, unknown> | null {
  if (song.source === 'local') return null;
  return {
    url: '',
    title: song.name || 'Untitled',
    artist: song.singer || '',
    album: songAlbum(song),
    cover_url: songCover(song),
    duration: intervalToSeconds(song.interval),
    plugin_entry_path: ENTRY_PATH,
    source_data: JSON.stringify(sourceData(song, quality)),
    dedup_key: lxDedupKey(song),
    lyric: '',
    lyric_source: ''
  };
}

async function hostJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hostUrl = normalizeBaseUrl(await songloft.plugin.getHostUrl());
  const token = await songloft.plugin.getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined)
  };
  if (init.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return await fetchJson<T>(joinUrl(hostUrl, path), { ...init, headers });
}

async function listHostPlaylists(): Promise<HostPlaylist[]> {
  const payload = await hostJson<{ playlists?: HostPlaylist[] }>('/api/v1/playlists?limit=100000&offset=0');
  return Array.isArray(payload.playlists) ? payload.playlists : [];
}

async function listHostPlugins(): Promise<HostPluginInfo[]> {
  const payload = await hostJson<{ plugins?: HostPluginInfo[] }>('/api/v1/jsplugins/');
  return Array.isArray(payload.plugins) ? payload.plugins : [];
}

async function getSelfPluginInfo(): Promise<HostPluginInfo> {
  const plugin = (await listHostPlugins()).find((item) => item.entry_path === ENTRY_PATH);
  if (!plugin) throw new Error(`Songloft plugin ${ENTRY_PATH} not found`);
  return plugin;
}

async function getMiotPluginInfo(): Promise<HostPluginInfo | null> {
  return (await listHostPlugins()).find((item) => item.entry_path === MIOT_ENTRY_PATH) || null;
}

function miotApiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/api/v1/jsplugin/${MIOT_ENTRY_PATH}${normalizedPath}`;
}

async function miotJson<T>(path: string, init: RequestInit = {}): Promise<MiotEnvelope<T>> {
  const payload = await hostJson<MiotEnvelope<T>>(miotApiPath(path), init);
  if (payload && payload.success === false) {
    throw new Error(payload.error || payload.message || 'MiOT request failed');
  }
  return payload;
}

function normalizeTabConfig(config: Partial<HostTabConfig> | null | undefined): HostTabConfig {
  return {
    show_library: typeof config?.show_library === 'boolean' ? config.show_library : true,
    show_playlists: typeof config?.show_playlists === 'boolean' ? config.show_playlists : true,
    plugin_tabs: Array.isArray(config?.plugin_tabs) ? config.plugin_tabs : []
  };
}

async function getHostTabConfig(): Promise<HostTabConfig> {
  return normalizeTabConfig(await hostJson<Partial<HostTabConfig>>('/api/v1/settings/tab-config'));
}

async function getMenuStatus(): Promise<MenuStatus> {
  const [plugin, tabConfig] = await Promise.all([getSelfPluginInfo(), getHostTabConfig()]);
  const enabled = tabConfig.plugin_tabs.some((tab) => tab.entry_path === ENTRY_PATH);
  const usedSlots = tabConfig.plugin_tabs.length
    + (tabConfig.show_library ? 1 : 0)
    + (tabConfig.show_playlists ? 1 : 0);
  return {
    enabled,
    canEnable: enabled || usedSlots < 10,
    usedSlots,
    maxSlots: 10,
    pluginId: plugin.id,
    entryPath: ENTRY_PATH,
    name: PLUGIN_NAME
  };
}

async function setMenuEnabled(enabled: boolean): Promise<MenuStatus> {
  const [plugin, tabConfig] = await Promise.all([getSelfPluginInfo(), getHostTabConfig()]);
  const alreadyEnabled = tabConfig.plugin_tabs.some((tab) => tab.entry_path === ENTRY_PATH);
  const usedSlots = tabConfig.plugin_tabs.length
    + (tabConfig.show_library ? 1 : 0)
    + (tabConfig.show_playlists ? 1 : 0);
  if (enabled && !alreadyEnabled && usedSlots >= 10) {
    throw new MenuCapacityError('左侧菜单已达到 10 个可选项上限，请先在 Songloft 设置中关闭一个 Tab 后再打开此开关');
  }

  const withoutSelf = tabConfig.plugin_tabs.filter((tab) => tab.entry_path !== ENTRY_PATH);
  const nextTabs = enabled
    ? [...withoutSelf, { plugin_id: plugin.id, entry_path: ENTRY_PATH, name: PLUGIN_NAME }]
    : withoutSelf;

  await hostJson<HostTabConfig>('/api/v1/settings/tab-config', {
    method: 'PUT',
    body: JSON.stringify({
      show_library: tabConfig.show_library,
      show_playlists: tabConfig.show_playlists,
      plugin_tabs: nextTabs
    })
  });

  return {
    enabled,
    canEnable: true,
    usedSlots: enabled && !alreadyEnabled ? usedSlots + 1 : enabled ? usedSlots : Math.max(0, usedSlots - (alreadyEnabled ? 1 : 0)),
    maxSlots: 10,
    pluginId: plugin.id,
    entryPath: ENTRY_PATH,
    name: PLUGIN_NAME
  };
}

async function loadImportMap(): Promise<Record<string, ImportedPlaylistRecord>> {
  const stored = await songloft.storage.get(IMPORT_MAP_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const result: Record<string, ImportedPlaylistRecord> = {};
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Partial<ImportedPlaylistRecord>;
    if (
      typeof record.lxPlaylistId === 'string' &&
      typeof record.lxPlaylistName === 'string' &&
      typeof record.songloftPlaylistId === 'number' &&
      typeof record.songloftPlaylistName === 'string'
    ) {
      result[key] = {
        lxPlaylistId: record.lxPlaylistId,
        lxPlaylistName: record.lxPlaylistName,
        songloftPlaylistId: record.songloftPlaylistId,
        songloftPlaylistName: record.songloftPlaylistName,
        songCount: Number(record.songCount || 0),
        importedAt: Number(record.importedAt || 0)
      };
    }
  }
  return result;
}

async function saveImportMap(map: Record<string, ImportedPlaylistRecord>): Promise<void> {
  await songloft.storage.set(IMPORT_MAP_KEY, map);
}

function toImportRecord(detail: ImportDetail): ImportedPlaylistRecord | null {
  if (!detail.imported || !detail.songloftPlaylistId || !detail.songloftPlaylistName) return null;
  return {
    lxPlaylistId: detail.lxPlaylistId,
    lxPlaylistName: detail.name,
    songloftPlaylistId: detail.songloftPlaylistId,
    songloftPlaylistName: detail.songloftPlaylistName,
    songCount: detail.songCount,
    importedAt: now()
  };
}

async function ensureHostPlaylist(name: string, description: string, coverUrl: string): Promise<HostPlaylist> {
  const existing = (await listHostPlaylists()).find((playlist) => playlist.name === name);
  if (existing) return existing;

  try {
    return await hostJson<HostPlaylist>('/api/v1/playlists', {
      method: 'POST',
      body: JSON.stringify({
        type: 'normal',
        name,
        description,
        cover_url: coverUrl,
        labels: ['lx-sync']
      })
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('HTTP 409')) {
      const retry = (await listHostPlaylists()).find((playlist) => playlist.name === name);
      if (retry) return retry;
    }
    throw err;
  }
}

async function addRemoteSongs(inputs: Record<string, unknown>[]): Promise<HostSong[]> {
  const songs: HostSong[] = [];
  const chunkSize = 100;
  for (let i = 0; i < inputs.length; i += chunkSize) {
    const chunk = inputs.slice(i, i + chunkSize);
    const payload = await hostJson<{ songs?: HostSong[]; count?: number }>('/api/v1/songs/remote', {
      method: 'POST',
      body: JSON.stringify(chunk)
    });
    if (Array.isArray(payload.songs)) songs.push(...payload.songs);
  }
  return songs;
}

async function addSongsToPlaylist(playlistId: number, songIds: number[]): Promise<{ added: number; skipped: number }> {
  if (songIds.length === 0) return { added: 0, skipped: 0 };
  const payload = await hostJson<{ added?: number; skipped?: number }>(`/api/v1/playlists/${playlistId}/songs`, {
    method: 'POST',
    body: JSON.stringify({ song_ids: songIds })
  });
  return {
    added: Number(payload.added || 0),
    skipped: Number(payload.skipped || 0)
  };
}

async function importCollectionToSongloft(
  collection: ImportableCollection,
  quality: string,
  includeEmpty = false
): Promise<ImportDetail> {
  const remoteInputs = collection.songs
    .map((song) => toRemoteSongInput(song, quality))
    .filter((song): song is Record<string, unknown> => Boolean(song));
  const localSkipped = collection.songs.length - remoteInputs.length;

  if (remoteInputs.length === 0 && !includeEmpty) {
    return {
      lxPlaylistId: collection.id,
      name: collection.name,
      songCount: collection.songCount,
      imported: false,
      reason: 'empty_or_local_only',
      localSkipped
    };
  }

  const hostPlaylist = await ensureHostPlaylist(
    collection.songloftPlaylistName,
    collection.description,
    collection.coverUrl
  );
  const importedSongs = remoteInputs.length > 0 ? await addRemoteSongs(remoteInputs) : [];
  const songIds = importedSongs.map((song) => song.id).filter((id) => Number.isFinite(id));
  const addResult = await addSongsToPlaylist(hostPlaylist.id, songIds);

  return {
    lxPlaylistId: collection.id,
    name: collection.name,
    songloftPlaylistId: hostPlaylist.id,
    songloftPlaylistName: collection.songloftPlaylistName,
    songCount: collection.songCount,
    submitted: remoteInputs.length,
    importedSongs: importedSongs.length,
    remoteReady: importedSongs.length,
    added: addResult.added,
    skipped: addResult.skipped,
    playlistAdded: addResult.added,
    playlistExisting: addResult.skipped,
    localSkipped,
    imported: true
  };
}

async function importPlaylists(req: ImportRequest): Promise<ImportResult> {
  const config = await loadConfig();
  const snapshot = await getSnapshot(Boolean(req.refresh));
  const selectedIds = new Set(req.playlistIds || []);
  const selected = selectedIds.size > 0
    ? snapshot.playlists.filter((playlist) => selectedIds.has(playlist.id))
    : snapshot.playlists;

  const details: ImportDetail[] = [];
  const importMap = await loadImportMap();
  let totalSongsSubmitted = 0;
  let totalSongsImported = 0;
  let totalAdded = 0;
  let totalSkipped = 0;
  let totalLocalSkipped = 0;
  let importMapChanged = false;

  for (const playlist of selected) {
    const playlistName = `${config.importPrefix}${playlist.name}`;
    const coverUrl = playlist.songs.map(songCover).find(Boolean) || '';
    const detail = await importCollectionToSongloft(
      {
        id: playlist.id,
        name: playlist.name,
        songs: playlist.songs,
        songCount: playlist.songCount,
        songloftPlaylistName: playlistName,
        description: `Imported from LX Sync Server list "${playlist.name}" (${playlist.id}).`,
        coverUrl
      },
      config.defaultQuality,
      Boolean(req.includeEmpty)
    );
    details.push(detail);
    totalLocalSkipped += detail.localSkipped;

    if (!detail.imported) {
      continue;
    }

    totalSongsSubmitted += detail.submitted || 0;
    totalSongsImported += detail.importedSongs || 0;
    totalAdded += detail.added || 0;
    totalSkipped += detail.skipped || 0;
    const record = toImportRecord(detail);
    if (record) {
      importMap[playlist.id] = record;
      importMapChanged = true;
    }
  }

  if (importMapChanged) {
    await saveImportMap(importMap);
  }

  return {
    success: true,
    fetchedAt: snapshot.fetchedAt,
    playlistsRequested: selected.length,
    totalSongsSubmitted,
    totalSongsImported,
    totalRemoteReady: totalSongsImported,
    totalAdded,
    totalSkipped,
    totalPlaylistAdded: totalAdded,
    totalPlaylistExisting: totalSkipped,
    totalLocalSkipped,
    details
  };
}

function normalizeOnlineSongs(value: unknown, fallbackSource: OnlineSource): LxMusicInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      ...item,
      source: primitiveString(item.source, fallbackSource)
    } as LxMusicInfo));
}

function uniqueSongs(songs: LxMusicInfo[]): LxMusicInfo[] {
  const seen = new Set<string>();
  const result: LxMusicInfo[] = [];
  for (const song of songs) {
    const key = lxDedupKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(song);
  }
  return result;
}

function normalizeOnlinePayload(payload: Record<string, unknown>, source: OnlineSource): Record<string, unknown> {
  const list = Array.isArray(payload.list)
    ? payload.list.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const record = item as Record<string, unknown>;
      return {
        ...record,
        source: primitiveString(record.source, source)
      };
    })
    : [];
  return {
    ...payload,
    source,
    sourceName: onlineSourceName(source),
    list
  };
}

async function getOnlineSongListTags(source: OnlineSource): Promise<Record<string, unknown>> {
  const payload = await lxFetchJson<Record<string, unknown>>(
    queryPath('/api/music/songList/tags', { source }),
    { method: 'GET' },
    true
  );
  const hotTags = Array.isArray(payload.hotTags)
    ? payload.hotTags
    : Array.isArray(payload.hotTag)
      ? payload.hotTag
      : [];
  return {
    ...payload,
    source,
    sourceName: onlineSourceName(source),
    hotTags,
    hotTag: hotTags,
    sortList: Array.isArray(payload.sortList) ? payload.sortList : []
  };
}

async function getOnlineSongList(source: OnlineSource, tagId: string, sortId: string, page: number): Promise<Record<string, unknown>> {
  const payload = await lxFetchJson<Record<string, unknown>>(
    queryPath('/api/music/songList/list', { source, tagId, sortId, page }),
    { method: 'GET' },
    true
  );
  return normalizeOnlinePayload(payload, source);
}

async function searchOnlineSongList(source: OnlineSource, text: string, page: number): Promise<Record<string, unknown>> {
  const payload = await lxFetchJson<Record<string, unknown>>(
    queryPath('/api/music/songList/search', { source, text, page }),
    { method: 'GET' },
    true
  );
  return normalizeOnlinePayload(payload, source);
}

async function getOnlineSongListDetail(source: OnlineSource, id: string, page: number): Promise<Record<string, unknown>> {
  const payload = await lxFetchJson<Record<string, unknown>>(
    queryPath('/api/music/songList/detail', { source, id, page }),
    { method: 'GET' },
    true
  );
  const normalized = normalizeOnlinePayload(payload, source);
  return {
    ...normalized,
    kind: 'songlist'
  };
}

async function getOnlineLeaderboardBoards(source: OnlineSource): Promise<Record<string, unknown>> {
  const payload = await lxFetchJson<Record<string, unknown>>(
    queryPath('/api/music/leaderboard/boards', { source }),
    { method: 'GET' },
    true
  );
  return normalizeOnlinePayload(payload, source);
}

async function getOnlineLeaderboardList(source: OnlineSource, bangid: string, page: number): Promise<Record<string, unknown>> {
  const payload = await lxFetchJson<Record<string, unknown>>(
    queryPath('/api/music/leaderboard/list', { source, bangid, page }),
    { method: 'GET' },
    true
  );
  const normalized = normalizeOnlinePayload(payload, source);
  return {
    ...normalized,
    kind: 'leaderboard'
  };
}

function onlinePayloadPageCount(payload: Record<string, unknown>, currentCount: number): number {
  const total = numericValue(payload.total, currentCount);
  const limit = numericValue(payload.limit, currentCount || total || 1);
  if (total <= 0 || limit <= 0) return 1;
  return Math.max(1, Math.min(MAX_ONLINE_IMPORT_PAGES, Math.ceil(total / limit)));
}

function onlineSongListInfoName(payload: Record<string, unknown>, fallback: string): string {
  const info = payload.info;
  if (info && typeof info === 'object') {
    const name = primitiveString((info as Record<string, unknown>).name);
    if (name) return name;
  }
  return fallback;
}

function onlineSongListInfoCover(payload: Record<string, unknown>, songs: LxMusicInfo[]): string {
  const info = payload.info;
  if (info && typeof info === 'object') {
    const record = info as Record<string, unknown>;
    const cover = primitiveString(record.img)
      || primitiveString(record.pic)
      || primitiveString(record.cover);
    if (cover) return cover;
  }
  return songs.map(songCover).find(Boolean) || '';
}

async function collectOnlineSongList(source: OnlineSource, id: string, requestedName?: string): Promise<ImportableCollection> {
  const first = await getOnlineSongListDetail(source, id, 1);
  let songs = normalizeOnlineSongs(first.list, source);
  const pages = onlinePayloadPageCount(first, songs.length);
  for (let page = 2; page <= pages; page += 1) {
    const payload = await getOnlineSongListDetail(source, id, page);
    songs = songs.concat(normalizeOnlineSongs(payload.list, source));
  }
  songs = uniqueSongs(songs);
  const name = onlineSongListInfoName(first, requestedName || id);
  const sourceName = onlineSourceName(source);
  return {
    id: `songlist:${source}:${id}`,
    name,
    songs,
    songCount: songs.length,
    songloftPlaylistName: `LX歌单 - ${sourceName} - ${name}`,
    description: `Imported from LX ${sourceName} online songlist "${name}" (${id}).`,
    coverUrl: onlineSongListInfoCover(first, songs)
  };
}

async function collectOnlineLeaderboard(source: OnlineSource, bangid: string, requestedName?: string): Promise<ImportableCollection> {
  const first = await getOnlineLeaderboardList(source, bangid, 1);
  let songs = normalizeOnlineSongs(first.list, source);
  const pages = onlinePayloadPageCount(first, songs.length);
  for (let page = 2; page <= pages; page += 1) {
    const payload = await getOnlineLeaderboardList(source, bangid, page);
    songs = songs.concat(normalizeOnlineSongs(payload.list, source));
  }
  songs = uniqueSongs(songs);
  const name = requestedName || `${onlineSourceName(source)}榜单 ${bangid}`;
  const sourceName = onlineSourceName(source);
  return {
    id: `leaderboard:${source}:${bangid}`,
    name,
    songs,
    songCount: songs.length,
    songloftPlaylistName: `LX榜单 - ${sourceName} - ${name}`,
    description: `Imported from LX ${sourceName} leaderboard "${name}" (${bangid}).`,
    coverUrl: songs.map(songCover).find(Boolean) || ''
  };
}

async function loadOnlineImportMap(): Promise<Record<string, ImportedOnlineRecord>> {
  const stored = await songloft.storage.get(ONLINE_IMPORT_MAP_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const result: Record<string, ImportedOnlineRecord> = {};
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Partial<ImportedOnlineRecord>;
    if (
      typeof record.lxPlaylistId === 'string' &&
      typeof record.lxPlaylistName === 'string' &&
      typeof record.songloftPlaylistId === 'number' &&
      typeof record.songloftPlaylistName === 'string' &&
      (record.kind === 'songlist' || record.kind === 'leaderboard') &&
      record.source &&
      ONLINE_SOURCES.some((item) => item.id === record.source) &&
      typeof record.onlineId === 'string'
    ) {
      result[key] = {
        lxPlaylistId: record.lxPlaylistId,
        lxPlaylistName: record.lxPlaylistName,
        songloftPlaylistId: record.songloftPlaylistId,
        songloftPlaylistName: record.songloftPlaylistName,
        songCount: Number(record.songCount || 0),
        importedAt: Number(record.importedAt || 0),
        kind: record.kind,
        source: record.source,
        onlineId: record.onlineId
      };
    }
  }
  return result;
}

async function saveOnlineImportMap(map: Record<string, ImportedOnlineRecord>): Promise<void> {
  await songloft.storage.set(ONLINE_IMPORT_MAP_KEY, map);
}

function onlineImportKey(kind: OnlineKind, source: OnlineSource, onlineId: string): string {
  return `${kind}:${source}:${onlineId}`;
}

async function importOnlineCollection(req: OnlineImportRequest): Promise<OnlineImportResult> {
  const kind = normalizeOnlineKind(req.kind);
  const source = normalizeOnlineSource(req.source);
  const config = await loadConfig();
  const onlineId = kind === 'songlist'
    ? assertString(req.id, 'id')
    : assertString(req.bangid || req.id, 'bangid');
  const collection = kind === 'songlist'
    ? await collectOnlineSongList(source, onlineId, req.name)
    : await collectOnlineLeaderboard(source, onlineId, req.name);
  const detail = await importCollectionToSongloft(collection, config.defaultQuality, Boolean(req.includeEmpty));
  if (detail.imported) {
    const map = await loadOnlineImportMap();
    map[onlineImportKey(kind, source, onlineId)] = {
      ...toImportRecord(detail)!,
      kind,
      source,
      onlineId
    };
    await saveOnlineImportMap(map);
  }
  return {
    success: true,
    kind,
    source,
    sourceName: onlineSourceName(source),
    onlineId,
    detail
  };
}

async function playMiotOnlineSongUrl(req: MiotOnlineSongUrlRequest): Promise<Record<string, unknown>> {
  const accountId = assertString(req.accountId, 'accountId');
  const deviceId = assertString(req.deviceId, 'deviceId');
  if (!req.songInfo || typeof req.songInfo !== 'object') {
    throw new Error('songInfo is required');
  }
  if (req.songInfo.source === 'local') {
    throw new Error('本地歌曲无法通过 LX 远程 URL 推送到小爱音箱');
  }
  const config = await loadConfig();
  const url = await resolveLxMusicUrl(sourceData(req.songInfo, config.defaultQuality));
  const payload = await miotJson<Record<string, unknown>>('/mina/play-url', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      device_id: deviceId,
      url
    })
  });
  await recordPluginPlayEvent({
    type: 'play-url',
    source: 'plugin-miot',
    song: {
      title: req.songInfo.name || 'Untitled',
      artist: req.songInfo.singer || ''
    }
  });
  return {
    success: true,
    mode: 'url',
    song: {
      title: req.songInfo.name || 'Untitled',
      artist: req.songInfo.singer || '',
      source: req.songInfo.source || ''
    },
    miot: payload.data || null
  };
}

function normalizePlayMode(value: unknown): MiotPlayMode {
  if (value === 'order' || value === 'random' || value === 'single' || value === 'loop') {
    return value;
  }
  return 'order';
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function songloftSongCount(playlist: HostPlaylist): number {
  return Number(playlist.song_count ?? playlist.songCount ?? 0);
}

async function ensureImportedPlaylist(lxPlaylistId: string, refresh = false): Promise<ImportedPlaylistRecord> {
  const snapshot = await getSnapshot(refresh);
  const lxPlaylist = snapshot.playlists.find((playlist) => playlist.id === lxPlaylistId);
  if (!lxPlaylist) {
    throw new Error('LX playlist not found');
  }

  const config = await loadConfig();
  const expectedName = `${config.importPrefix}${lxPlaylist.name}`;
  const [importMap, hostPlaylists] = await Promise.all([loadImportMap(), listHostPlaylists()]);
  const mapped = importMap[lxPlaylistId];
  const existingById = mapped
    ? hostPlaylists.find((playlist) => playlist.id === mapped.songloftPlaylistId)
    : undefined;
  const existing = existingById || hostPlaylists.find((playlist) => playlist.name === expectedName);

  if (existing) {
    const record: ImportedPlaylistRecord = {
      lxPlaylistId,
      lxPlaylistName: lxPlaylist.name,
      songloftPlaylistId: existing.id,
      songloftPlaylistName: existing.name,
      songCount: songloftSongCount(existing) || lxPlaylist.songCount,
      importedAt: mapped?.importedAt || now()
    };
    importMap[lxPlaylistId] = record;
    await saveImportMap(importMap);
    return record;
  }

  const result = await importPlaylists({ playlistIds: [lxPlaylistId], refresh: false, includeEmpty: false });
  const detail = result.details.find((item) => item.lxPlaylistId === lxPlaylistId);
  const record = detail ? toImportRecord(detail) : null;
  if (!record) {
    const reason = detail?.reason === 'empty_or_local_only'
      ? '这个 LX 歌单没有可投放的远程歌曲'
      : 'LX playlist import failed';
    throw new Error(reason);
  }
  return record;
}

async function getMiotStatus(): Promise<MiotStatus> {
  const [lxImportMap, onlineImportMap] = await Promise.all([loadImportMap(), loadOnlineImportMap()]);
  const importedPlaylists = [
    ...Object.values(lxImportMap),
    ...Object.values(onlineImportMap)
  ].sort((a, b) => b.importedAt - a.importedAt);
  const plugin = await getMiotPluginInfo();
  if (!plugin) {
    return {
      installed: false,
      active: false,
      entryPath: MIOT_ENTRY_PATH,
      name: MIOT_PLUGIN_NAME,
      devices: [],
      importedPlaylists,
      error: '未安装 MiOT 智能音箱插件'
    };
  }

  if (plugin.status !== 'active') {
    return {
      installed: true,
      active: false,
      pluginId: plugin.id,
      entryPath: MIOT_ENTRY_PATH,
      name: plugin.name || MIOT_PLUGIN_NAME,
      status: plugin.status,
      devices: [],
      importedPlaylists,
      error: 'MiOT 智能音箱插件未启用'
    };
  }

  try {
    const [devicesPayload, configPayload] = await Promise.all([
      withTimeout(
        miotJson<MiotAccountDevices[]>('/mina/devices'),
        MIOT_STATUS_TIMEOUT_MS,
        'MiOT devices request'
      ),
      withTimeout(
        miotJson<MiotConfigSummary>('/config'),
        MIOT_STATUS_TIMEOUT_MS,
        'MiOT config request'
      )
    ]);
    return {
      installed: true,
      active: true,
      pluginId: plugin.id,
      entryPath: MIOT_ENTRY_PATH,
      name: plugin.name || MIOT_PLUGIN_NAME,
      status: plugin.status,
      devices: Array.isArray(devicesPayload.data) ? devicesPayload.data : [],
      config: configPayload.data || {},
      importedPlaylists,
    };
  } catch (err) {
    return {
      installed: true,
      active: true,
      pluginId: plugin.id,
      entryPath: MIOT_ENTRY_PATH,
      name: plugin.name || MIOT_PLUGIN_NAME,
      status: plugin.status,
      devices: [],
      importedPlaylists,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function playMiotPlaylist(req: MiotPlayRequest): Promise<Record<string, unknown>> {
  const accountId = assertString(req.accountId, 'accountId');
  const deviceId = assertString(req.deviceId, 'deviceId');
  const playMode = normalizePlayMode(req.playMode);
  const startIndex = Math.max(0, Number(req.startIndex || 0) || 0);
  const playlistRecord = req.songloftPlaylistId
    ? null
    : await ensureImportedPlaylist(assertString(req.lxPlaylistId, 'lxPlaylistId'), Boolean(req.refresh));
  const songloftPlaylistId = Number(req.songloftPlaylistId || playlistRecord?.songloftPlaylistId);
  if (!songloftPlaylistId || Number.isNaN(songloftPlaylistId)) {
    throw new Error('songloftPlaylistId is required');
  }

  const payload = await miotJson<Record<string, unknown>>('/player/play', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      device_id: deviceId,
      playlist_id: songloftPlaylistId,
      start_index: startIndex,
      play_mode: playMode
    })
  });
  await recordPluginPlayEvent({
    type: 'play-playlist',
    source: 'plugin-miot',
    playlist: {
      id: songloftPlaylistId,
      name: playlistRecord?.songloftPlaylistName || req.songloftPlaylistName || `Songloft #${songloftPlaylistId}`
    }
  });

  return {
    success: true,
    mode: 'playlist',
    songloftPlaylistId,
    importedPlaylist: playlistRecord,
    miot: payload.data || null
  };
}

async function controlMiotPlayer(req: MiotControlRequest): Promise<Record<string, unknown>> {
  const accountId = assertString(req.accountId, 'accountId');
  const deviceId = assertString(req.deviceId, 'deviceId');
  const action = assertString(req.action, 'action');
  if (!['stop', 'toggle', 'previous', 'next'].includes(action)) {
    throw new Error('unsupported MiOT control action');
  }
  const payload = await miotJson<Record<string, unknown>>(`/player/${action}`, {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      device_id: deviceId
    })
  });
  return {
    success: true,
    action,
    miot: payload.data || null
  };
}

async function playMiotSongUrl(req: MiotSongUrlRequest): Promise<Record<string, unknown>> {
  const accountId = assertString(req.accountId, 'accountId');
  const deviceId = assertString(req.deviceId, 'deviceId');
  const lxPlaylistId = assertString(req.lxPlaylistId, 'lxPlaylistId');
  const songIndex = Math.max(0, Number(req.songIndex || 0) || 0);
  const snapshot = await getSnapshot(false);
  const playlist = snapshot.playlists.find((item) => item.id === lxPlaylistId);
  if (!playlist) throw new Error('LX playlist not found');
  const song = playlist.songs[songIndex];
  if (!song) throw new Error('LX song not found');
  if (song.source === 'local') {
    throw new Error('本地歌曲无法通过 LX 远程 URL 推送到小爱音箱');
  }

  const config = await loadConfig();
  const url = await resolveLxMusicUrl(sourceData(song, config.defaultQuality));
  const payload = await miotJson<Record<string, unknown>>('/mina/play-url', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      device_id: deviceId,
      url
    })
  });
  await recordPluginPlayEvent({
    type: 'play-url',
    source: 'plugin-miot',
    playlist: {
      id: playlist.id,
      name: playlist.name
    },
    song: {
      title: song.name || 'Untitled',
      artist: song.singer || ''
    }
  });

  return {
    success: true,
    mode: 'url',
    playlist: {
      id: playlist.id,
      name: playlist.name
    },
    song: {
      index: songIndex,
      title: song.name || 'Untitled',
      artist: song.singer || ''
    },
    miot: payload.data || null
  };
}

async function resolveLxMusicUrl(source: Record<string, unknown>): Promise<string> {
  const config = await loadConfig();
  const songInfo = source.songInfo as LxMusicInfo | undefined;
  if (!songInfo || typeof songInfo !== 'object') {
    throw new Error('missing LX songInfo in source_data');
  }
  const quality = safeString(source.quality, config.defaultQuality);
  const payload = await lxFetchJson<{ url?: string }>('/api/music/url', {
    method: 'POST',
    body: JSON.stringify({
      songInfo,
      quality,
      enableAutoSwitchApiSource: true
    })
  }, true);

  if (!payload.url) throw new Error('LX music/url returned empty url');
  return payload.url;
}

async function loadPlayEvents(): Promise<PlayEventRecord[]> {
  const stored = await songloft.storage.get(PLAY_EVENTS_KEY);
  return Array.isArray(stored) ? stored as PlayEventRecord[] : [];
}

async function appendPlayEvent(record: PlayEventRecord): Promise<void> {
  const config = await loadConfig();
  if (!config.recordPlayEvents) return;
  const events = await loadPlayEvents();
  const next: PlayEventRecord[] = [record, ...events].slice(0, MAX_EVENT_HISTORY);
  await songloft.storage.set(PLAY_EVENTS_KEY, next);
}

async function recordPlayEvent(event: PlayEvent): Promise<void> {
  try {
    await appendPlayEvent({
      type: event.type || 'play',
      source: event.source || 'songloft',
      timestamp: event.timestamp || now(),
      song: event.song ? {
        id: event.song.id,
        title: event.song.title,
        artist: event.song.artist
      } : undefined
    });
  } catch (err) {
    songloft.log.warn(`Songloft play event record failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function recordPluginPlayEvent(record: Omit<PlayEventRecord, 'timestamp'> & { timestamp?: number }): Promise<void> {
  try {
    await appendPlayEvent({
      ...record,
      timestamp: record.timestamp || now()
    });
  } catch (err) {
    songloft.log.warn(`LX play event record failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function configureAutoRefresh(config: PluginConfig): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (config.autoRefreshMinutes <= 0) return;
  refreshTimer = setInterval(() => {
    refreshSnapshot().catch((err) => {
      songloft.log.warn(`LX snapshot refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, config.autoRefreshMinutes * 60 * 1000);
}

function requestBodyObject(req: HTTPRequest): Record<string, unknown> {
  const body = decodeBody(req);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

async function searchSongs(rawKeyword: string, source: OnlineSource = 'kw', page = 1, pageSize = 30): Promise<SongSearchResult> {
  const config = await loadConfig();
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(100, Math.max(1, pageSize));
  const keyword = rawKeyword.trim();
  if (!keyword) {
    return {
      results: [],
      songs: [],
      total: 0,
      source,
      sourceName: onlineSourceName(source),
      page: normalizedPage,
      pageSize: normalizedPageSize
    };
  }

  const payload = await lxFetchJson<LxMusicInfo[] | { list?: LxMusicInfo[]; total?: number }>(
    queryPath('/api/music/search', {
      name: keyword,
      source,
      page: normalizedPage,
      limit: normalizedPageSize
    }),
    { method: 'GET' },
    true
  );
  const payloadObject = Array.isArray(payload) ? null : payload;
  const songs = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadObject?.list)
      ? payloadObject.list
      : [];
  const total = payloadObject ? numericValue(payloadObject.total, songs.length) : songs.length;

  return {
    results: songs.map((song) => toSearchResult(song, config.defaultQuality)),
    songs,
    total,
    source,
    sourceName: onlineSourceName(source),
    page: normalizedPage,
    pageSize: normalizedPageSize
  };
}

async function handleSearchRequest(req: HTTPRequest): Promise<HTTPResponse> {
  const body = requestBodyObject(req);
  const keyword = primitiveString(body.keyword ?? body.query ?? body.q);
  const source = normalizeOnlineSource(body.source || 'kw');
  const page = Math.max(1, numericValue(body.page, 1));
  const pageSize = Math.min(100, Math.max(1, numericValue(body.pageSize ?? body.page_size, 30)));
  return jsonResponse(await searchSongs(keyword, source, page, pageSize));
}

function parseSourceData(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function handleMusicUrlRequest(req: HTTPRequest): Promise<HTTPResponse> {
  const body = requestBodyObject(req);
  const source = parseSourceData(body.source_data ?? body.sourceData ?? body.source);
  if (!source) {
    return jsonResponse({ error: 'source_not_available' }, 404);
  }

  try {
    const url = await resolveLxMusicUrl(source);
    return jsonResponse({ url });
  } catch (err) {
    return jsonResponse({
      error: 'source_not_available',
      message: err instanceof Error ? err.message : String(err)
    }, 404);
  }
}

router.get('/api/status', async () => {
  const config = await loadConfig();
  const snapshot = await songloft.storage.get(SNAPSHOT_KEY) as Snapshot | null;
  const events = await loadPlayEvents();
  let menu: MenuStatus | { enabled: false; canEnable: false; usedSlots: 0; maxSlots: 10; error: string };
  try {
    menu = await getMenuStatus();
  } catch (err) {
    menu = {
      enabled: false,
      canEnable: false,
      usedSlots: 0,
      maxSlots: 10,
      error: err instanceof Error ? err.message : String(err)
    };
  }
  return jsonResponse({
    config: publicConfig(config),
    menu,
    snapshot: snapshot ? {
      fetchedAt: snapshot.fetchedAt,
      baseUrl: snapshot.baseUrl,
      username: snapshot.username,
      playlistCount: snapshot.playlists.length,
      songCount: snapshot.playlists.reduce((sum, playlist) => sum + playlist.songCount, 0)
    } : null,
    recentPlayEvents: events
  });
});

router.post('/api/config', async (req) => {
  const previous = await loadConfig();
  const incoming = decodeBody(req) as Partial<PluginConfig>;
  const mergedInput = { ...incoming };
  if (incoming.password === '') {
    mergedInput.password = previous.password;
  }
  const config = normalizeConfig(mergedInput, previous);
  await saveConfig(config);
  await songloft.storage.delete(SESSION_KEY);
  return jsonResponse({ success: true, config: publicConfig(config) });
});

router.get('/api/menu', async () => {
  return jsonResponse(await getMenuStatus());
});

router.post('/api/menu', async (req) => {
  try {
    const body = decodeBody(req) as { enabled?: boolean };
    return jsonResponse(await setMenuEnabled(Boolean(body.enabled)));
  } catch (err) {
    if (err instanceof MenuCapacityError) {
      return jsonResponse({ success: false, error: err.message }, 400);
    }
    throw err;
  }
});

router.post('/api/test', async () => {
  const config = await loadConfig();
  await login(config, true);
  const data = await lxFetchJson<LxListData>('/api/user/list', { method: 'GET' }, true);
  const playlists = normalizeListData(data);
  return jsonResponse({
    success: true,
    playlistCount: playlists.length,
    songCount: playlists.reduce((sum, playlist) => sum + playlist.songCount, 0)
  });
});

router.post('/api/sync', async () => {
  const snapshot = await refreshSnapshot();
  return jsonResponse({
    success: true,
    fetchedAt: snapshot.fetchedAt,
    playlists: snapshot.playlists.map(({ songs, ...playlist }) => playlist),
    songCount: snapshot.playlists.reduce((sum, playlist) => sum + playlist.songCount, 0)
  });
});

router.get('/api/playlists', async (req) => {
  const query = parseQuery(req.query);
  const snapshot = await getSnapshot(query.refresh === '1' || query.refresh === 'true');
  return jsonResponse({
    fetchedAt: snapshot.fetchedAt,
    playlists: snapshot.playlists.map(({ songs, ...playlist }) => playlist)
  });
});

router.get('/api/playlists/:id/songs', async (req, params) => {
  const query = parseQuery(req.query);
  const snapshot = await getSnapshot(query.refresh === '1' || query.refresh === 'true');
  const playlist = snapshot.playlists.find((item) => item.id === params.id);
  if (!playlist) return jsonResponse({ error: 'playlist_not_found' }, 404);
  return jsonResponse({
    id: playlist.id,
    name: playlist.name,
    songCount: playlist.songCount,
    songs: playlist.songs
  });
});

router.post('/api/import', async (req) => {
  const body = decodeBody(req) as ImportRequest;
  return jsonResponse(await importPlaylists(body));
});

router.get('/api/online/sources', async () => {
  return jsonResponse({
    sources: ONLINE_SOURCES.map((source) => ({ ...source }))
  });
});

router.get('/api/online/songlist/tags', async (req) => {
  const query = parseQuery(req.query);
  const source = normalizeOnlineSource(query.source);
  return jsonResponse(await getOnlineSongListTags(source));
});

router.get('/api/online/songlist/list', async (req) => {
  const query = parseQuery(req.query);
  const source = normalizeOnlineSource(query.source);
  const page = Math.max(1, numericValue(query.page, 1));
  return jsonResponse(await getOnlineSongList(
    source,
    primitiveString(query.tagId),
    primitiveString(query.sortId),
    page
  ));
});

router.get('/api/online/songlist/search', async (req) => {
  const query = parseQuery(req.query);
  const source = normalizeOnlineSource(query.source);
  const text = assertString(query.text, 'text');
  const page = Math.max(1, numericValue(query.page, 1));
  return jsonResponse(await searchOnlineSongList(source, text, page));
});

router.get('/api/online/songlist/detail', async (req) => {
  const query = parseQuery(req.query);
  const source = normalizeOnlineSource(query.source);
  const id = assertString(query.id, 'id');
  const page = Math.max(1, numericValue(query.page, 1));
  return jsonResponse(await getOnlineSongListDetail(source, id, page));
});

router.get('/api/online/leaderboard/boards', async (req) => {
  const query = parseQuery(req.query);
  const source = normalizeOnlineSource(query.source);
  return jsonResponse(await getOnlineLeaderboardBoards(source));
});

router.get('/api/online/leaderboard/list', async (req) => {
  const query = parseQuery(req.query);
  const source = normalizeOnlineSource(query.source);
  const bangid = assertString(query.bangid || query.id, 'bangid');
  const page = Math.max(1, numericValue(query.page, 1));
  return jsonResponse(await getOnlineLeaderboardList(source, bangid, page));
});

router.post('/api/online/import', async (req) => {
  const body = decodeBody(req) as OnlineImportRequest;
  return jsonResponse(await importOnlineCollection(body));
});

router.post('/api/online/miot/play-song-url', async (req) => {
  const body = decodeBody(req) as MiotOnlineSongUrlRequest;
  return jsonResponse(await playMiotOnlineSongUrl(body));
});

router.get('/api/miot/status', async () => {
  return jsonResponse(await getMiotStatus());
});

router.post('/api/miot/play', async (req) => {
  const body = decodeBody(req) as MiotPlayRequest;
  return jsonResponse(await playMiotPlaylist(body));
});

router.post('/api/miot/control', async (req) => {
  const body = decodeBody(req) as MiotControlRequest;
  return jsonResponse(await controlMiotPlayer(body));
});

router.post('/api/miot/play-song-url', async (req) => {
  const body = decodeBody(req) as MiotSongUrlRequest;
  return jsonResponse(await playMiotSongUrl(body));
});

router.post('/api/search', handleSearchRequest);
router.post('/api/music/url', handleMusicUrlRequest);

async function onInit(): Promise<void> {
  const config = await loadConfig();
  configureAutoRefresh(config);
  songloft.events.onPlayEvent(recordPlayEvent);
  songloft.log.info('LX Sync Server plugin initialized');
}

async function onDeinit(): Promise<void> {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  songloft.events.offPlayEvent();
  songloft.log.info('LX Sync Server plugin deinitialized');
}

async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  try {
    return await router.handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    songloft.log.error(`LX plugin HTTP error: ${message}`);
    return jsonResponse({ success: false, error: message }, 500);
  }
}

globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onHTTPRequest;
