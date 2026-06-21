function pluginApiPath(path) {
  if (!String(path).startsWith('/')) return path;
  const baseHref = document.querySelector('base')?.href || window.location.href.replace(/\/static(?:\/.*)?$/, '/');
  return new URL(String(path).replace(/^\/+/, ''), baseHref).toString();
}

const pluginApi = (() => {
  if (window.SongloftPlugin) {
    const { apiGet, apiPost } = window.SongloftPlugin;
    return {
      get: (path) => apiGet(path),
      post: (path, body) => apiPost(path, body)
    };
  }
  return {
    get: async (path) => {
      const res = await fetch(pluginApiPath(path));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    post: async (path, body) => {
      const res = await fetch(pluginApiPath(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  };
})();

const state = {
  playlists: [],
  selected: new Set(),
  status: null,
  menuBusy: false,
  miot: {
    accounts: [],
    importedPlaylists: [],
    selectedAccountId: '',
    selectedDeviceId: '',
    selectedPlaylistId: '',
    playMode: 'order',
    busy: false,
    status: null
  },
  online: {
    mode: 'songlist',
    sources: [
      { id: 'kw', name: '酷我音乐' },
      { id: 'kg', name: '酷狗音乐' },
      { id: 'tx', name: 'QQ音乐' },
      { id: 'wy', name: '网易云音乐' },
      { id: 'mg', name: '咪咕音乐' }
    ],
    source: 'kw',
    tags: [],
    sortList: [],
    tagId: '',
    sortId: '',
    searchText: '',
    items: [],
    selectedIndex: -1,
    detail: null,
    songs: [],
    busy: false,
    loadToken: 0,
    detailToken: 0
  },
  songSearch: {
    source: 'kw',
    keyword: '',
    results: [],
    busy: false,
    loadToken: 0,
    lastQuery: ''
  }
};

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function showToast(message, error = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
}

function countValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatImportDetailSummary(detail = {}) {
  const ready = countValue(detail.remoteReady ?? detail.importedSongs ?? detail.submitted);
  const added = countValue(detail.playlistAdded ?? detail.added);
  const existing = countValue(detail.playlistExisting ?? detail.skipped);
  const localSkipped = countValue(detail.localSkipped);
  const parts = [
    `远程歌曲 ${ready} 首已准备`,
    `新增到歌单 ${added} 首`
  ];
  if (existing) parts.push(`已在歌单 ${existing} 首`);
  if (localSkipped) parts.push(`本地歌曲未导入 ${localSkipped} 首`);
  return `导入完成：${parts.join('，')}`;
}

function formatImportResultSummary(result = {}) {
  const ready = countValue(result.totalRemoteReady ?? result.totalSongsImported ?? result.totalSongsSubmitted);
  const added = countValue(result.totalPlaylistAdded ?? result.totalAdded);
  const existing = countValue(result.totalPlaylistExisting ?? result.totalSkipped);
  const localSkipped = countValue(result.totalLocalSkipped);
  const parts = [
    `远程歌曲 ${ready} 首已准备`,
    `新增到歌单 ${added} 首`
  ];
  if (existing) parts.push(`已在歌单 ${existing} 首`);
  if (localSkipped) parts.push(`本地歌曲未导入 ${localSkipped} 首`);
  return `导入完成：${parts.join('，')}`;
}

function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.textContent = text || '处理中';
    button.disabled = true;
  } else {
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    button.disabled = false;
  }
}

function errorMessage(err) {
  if (!err) return '未知错误';
  if (typeof err === 'object' && (err.error || err.message)) {
    return err.error || err.message;
  }
  const raw = err.message || String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.error || parsed.message) return parsed.error || parsed.message;
      if (parsed.success === false && parsed.data?.error) return parsed.data.error;
    }
    return raw;
  } catch {
    return raw;
  }
}

function deviceLabel(device) {
  if (!device) return '';
  const name = device.name || device.alias || device.deviceID || '未命名设备';
  const model = device.hardware || device.model || '';
  const status = device.presence === 'online' ? '在线' : '离线';
  return `${name}${model ? ` [${model}]` : ''} · ${status}`;
}

function sourceLabel(source) {
  return state.online.sources.find((item) => item.id === source)?.name || source || '';
}

function selectedOnlineItem() {
  return state.online.items[state.online.selectedIndex] || null;
}

function onlineItemId(item) {
  if (!item) return '';
  return String(item.id || item.bangid || '');
}

function onlineBangid(item) {
  if (!item) return '';
  if (item.bangid) return String(item.bangid);
  const id = String(item.id || '');
  return id.includes('__') ? id.split('__').pop() : id;
}

function onlineSongAlbum(song) {
  return song.albumName || song.album || song.meta?.albumName || '';
}

function songAlbum(song) {
  return song.albumName || song.album || song.meta?.albumName || song.meta?.album || '';
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function isRawIdentifier(value) {
  const text = firstString(value);
  return /^id_\d+$/i.test(text)
    || /^digest-[\w-]+__\d+$/i.test(text)
    || /^[a-z]{1,4}__\d+$/i.test(text)
    || /^\d{8,}[a-z]*$/i.test(text);
}

function displayText(...values) {
  for (const value of values) {
    const text = firstString(value);
    if (text && !isRawIdentifier(text)) return text;
  }
  return '';
}

function onlineItemName(item) {
  return displayText(item?.name, item?.title) || '未命名';
}

function songCover(song) {
  return firstString(
    song?.img,
    song?.pic,
    song?.picUrl,
    song?.cover,
    song?.albumPic,
    song?.meta?.picUrl,
    song?.meta?.img,
    song?.meta?.cover
  );
}

function onlineItemCover(item) {
  return firstString(
    item?.img,
    item?.pic,
    item?.picUrl,
    item?.cover,
    item?.coverUrl,
    item?.logo
  );
}

function onlineDetailCover() {
  const detail = state.online.detail || {};
  const info = detail.info || {};
  const item = selectedOnlineItem();
  return firstString(
    info.img,
    info.pic,
    info.picUrl,
    info.cover,
    onlineItemCover(item),
    ...state.online.songs.map(songCover)
  );
}

function coverStyle(url) {
  return url ? ` style="background-image: url('${escapeAttribute(url)}')"` : '';
}

function sourceInitial(source) {
  const label = sourceLabel(source || state.online.source);
  return label ? label.slice(0, 1) : 'L';
}

function coverMarkup(url, label, size = '') {
  const classes = ['cover-art'];
  if (size) classes.push(size);
  if (!url) classes.push('cover-placeholder');
  const content = url ? '' : `<span>${escapeHtml(label || 'L')}</span>`;
  return `<div class="${classes.join(' ')}"${coverStyle(url)} aria-hidden="true">${content}</div>`;
}

function onlineItemMeta(item) {
  if (state.online.mode === 'songlist') {
    return [
      displayText(item.author, item.username, item.userName),
      item.total ? `${item.total} 首` : '',
      item.play_count || item.playCount || '',
      sourceLabel(item.source || state.online.source)
    ].filter(Boolean).join(' · ');
  }
  return [
    sourceLabel(item.source || state.online.source),
    '排行榜'
  ].filter(Boolean).join(' · ');
}

function onlineDetailMeta(item, songs) {
  if (!item) return '选择一个平台歌单或榜单';
  const detail = state.online.detail || {};
  const info = detail.info || {};
  if (state.online.mode === 'songlist') {
    return [
      displayText(item.author, item.username, item.userName, info.author),
      songs.length ? `${songs.length} 首` : '',
      info.play_count || item.play_count || item.playCount || '',
      sourceLabel(item.source || state.online.source)
    ].filter(Boolean).join(' · ');
  }
  return [
    sourceLabel(item.source || state.online.source),
    songs.length ? `${songs.length} 首` : '',
    '排行榜'
  ].filter(Boolean).join(' · ');
}

function miotReady() {
  const miot = state.miot.status;
  return Boolean(miot?.active && !miot?.error && selectedMiotDevice());
}

function selectedMiotAccount() {
  return state.miot.accounts.find((account) => account.account_id === state.miot.selectedAccountId) || null;
}

function managedDevices(account) {
  if (!account || !Array.isArray(account.devices)) return [];
  return account.devices.filter((device) => device.managed !== false);
}

function selectedMiotDevice() {
  const account = selectedMiotAccount();
  return managedDevices(account).find((device) => device.deviceID === state.miot.selectedDeviceId) || null;
}

function reconcileMiotSelection() {
  const accounts = state.miot.accounts;
  if (!accounts.length) {
    state.miot.selectedAccountId = '';
    state.miot.selectedDeviceId = '';
  } else if (!accounts.some((account) => account.account_id === state.miot.selectedAccountId)) {
    state.miot.selectedAccountId = accounts[0].account_id;
  }

  const account = selectedMiotAccount();
  const devices = managedDevices(account);
  if (!devices.length) {
    state.miot.selectedDeviceId = '';
  } else if (!devices.some((device) => device.deviceID === state.miot.selectedDeviceId)) {
    const lastSelected = account?.last_selected_device_id;
    const preferred = devices.find((device) => device.deviceID === lastSelected) || devices[0];
    state.miot.selectedDeviceId = preferred.deviceID;
  }

  if (state.playlists.length && !state.playlists.some((playlist) => playlist.id === state.miot.selectedPlaylistId)) {
    const firstPlayable = state.playlists.find((playlist) => playlist.songCount > 0) || state.playlists[0];
    state.miot.selectedPlaylistId = firstPlayable ? firstPlayable.id : '';
  }
}

function fillConfig(config) {
  $('base-url').value = config.baseUrl || '';
  $('username').value = config.username || '';
  $('password').value = '';
  $('player-url').value = config.playerUrl || '';
  $('import-prefix').value = config.importPrefix || '';
  $('default-quality').value = config.defaultQuality || '128k';
  $('auto-refresh').value = String(config.autoRefreshMinutes ?? 30);
  $('record-events').checked = !!config.recordPlayEvents;
  const playerLink = $('player-link');
  playerLink.href = config.playerUrl || '#';
  playerLink.setAttribute('aria-disabled', config.playerUrl ? 'false' : 'true');
}

function renderStatus() {
  const status = state.status;
  if (!status) return;
  const snapshot = status.snapshot;
  const eventCount = (status.recentPlayEvents || []).length;
  const latestEvent = (status.recentPlayEvents || [])[0];
  $('status-line').textContent = status.config.hasPassword && status.config.baseUrl && status.config.username
    ? `已配置 ${status.config.username}@${status.config.baseUrl}`
    : '请填写 LX Server 配置';
  setText('summary-connection', status.config.hasPassword && status.config.baseUrl && status.config.username ? '已配置' : '待配置');
  setText('summary-player', status.config.playerUrl || status.config.baseUrl || '等待配置');
  if (snapshot) {
    $('snapshot-meta').textContent = `${snapshot.playlistCount} 个歌单，${snapshot.songCount} 首歌，${formatTime(snapshot.fetchedAt)}`;
    setText('summary-snapshot', `${snapshot.playlistCount} 个歌单`);
    setText('summary-snapshot-time', `${snapshot.songCount} 首歌 · ${formatTime(snapshot.fetchedAt)}`);
  } else {
    $('snapshot-meta').textContent = '尚未同步';
    setText('summary-snapshot', '尚未同步');
    setText('summary-snapshot-time', '等待 LX Server');
  }
  setText('summary-menu', status.menu?.enabled ? '已显示' : '未显示');
  setText(
    'summary-menu-slots',
    status.menu?.error || (
      status.menu
        ? `${status.menu.usedSlots}/${status.menu.maxSlots} 个菜单位`
        : '等待 Songloft'
    )
  );
  setText('summary-events', `${eventCount} 条`);
  setText(
    'summary-events-latest',
    latestEvent
      ? `${playEventTypeLabel(latestEvent.type)} · ${formatTime(latestEvent.timestamp)}`
      : '暂无播放事件'
  );
  renderMenuSwitch(status.menu);
  renderEvents(status.recentPlayEvents || []);
}

function renderMenuSwitch(menu) {
  const input = $('menu-enabled');
  if (!input) return;
  input.checked = !!menu?.enabled;
  input.disabled = state.menuBusy || !!menu?.error;
  if (menu?.error) {
    input.title = menu.error;
  } else if (menu && !menu.enabled && menu.canEnable === false) {
    input.title = `左侧菜单已满（${menu.usedSlots}/${menu.maxSlots}）`;
  } else {
    input.title = '';
  }
}

function renderMiotPanel() {
  const accountSelect = $('miot-account');
  if (!accountSelect) return;

  reconcileMiotSelection();
  const miot = state.miot.status;
  const device = selectedMiotDevice();
  const hasDevice = Boolean(device);
  const hasPlaylist = Boolean(state.miot.selectedPlaylistId);
  const isReady = Boolean(miot?.active && !miot?.error && hasDevice);

  $('miot-status').textContent = miot?.error
    ? miot.error
    : isReady
      ? `已连接 ${deviceLabel(device)}`
      : miot?.active
        ? 'MiOT 插件已启用，暂无可投放设备'
        : '正在读取 MiOT 插件状态';

  accountSelect.innerHTML = state.miot.accounts.length
    ? state.miot.accounts.map((account) => `
      <option value="${escapeHtml(account.account_id)}">${escapeHtml(account.account_name || account.account_id)}</option>
    `).join('')
    : '<option value="">暂无账号</option>';
  accountSelect.value = state.miot.selectedAccountId;
  accountSelect.disabled = state.miot.busy || !state.miot.accounts.length;

  const deviceSelect = $('miot-device');
  const devices = managedDevices(selectedMiotAccount());
  deviceSelect.innerHTML = devices.length
    ? devices.map((item) => `
      <option value="${escapeHtml(item.deviceID)}">${escapeHtml(deviceLabel(item))}</option>
    `).join('')
    : '<option value="">暂无托管设备</option>';
  deviceSelect.value = state.miot.selectedDeviceId;
  deviceSelect.disabled = state.miot.busy || !devices.length;

  const playlistSelect = $('miot-playlist');
  playlistSelect.innerHTML = state.playlists.length
    ? state.playlists.map((playlist) => `
      <option value="${escapeHtml(playlist.id)}">${escapeHtml(playlist.name)} (${playlist.songCount || 0})</option>
    `).join('')
    : '<option value="">暂无 LX 歌单</option>';
  playlistSelect.value = state.miot.selectedPlaylistId;
  playlistSelect.disabled = state.miot.busy || !state.playlists.length;

  const modeSelect = $('miot-play-mode');
  modeSelect.value = state.miot.playMode;
  modeSelect.disabled = state.miot.busy;

  $('miot-play-button').disabled = state.miot.busy || !isReady || !hasPlaylist;
  $('miot-toggle-button').disabled = state.miot.busy || !isReady;
  $('miot-prev-button').disabled = state.miot.busy || !isReady;
  $('miot-next-button').disabled = state.miot.busy || !isReady;
  $('miot-stop-button').disabled = state.miot.busy || !isReady;

  const result = $('miot-result');
  const imported = state.miot.importedPlaylists.find((item) => item.lxPlaylistId === state.miot.selectedPlaylistId);
  result.textContent = imported
    ? `已关联 Songloft 歌单：${imported.songloftPlaylistName} #${imported.songloftPlaylistId}`
    : hasPlaylist
      ? '首次投放会先导入为 Songloft 歌单'
      : '等待选择 LX 歌单';
}

function renderPlaylists() {
  const body = $('playlist-body');
  if (!state.playlists.length) {
    body.innerHTML = '<div class="empty">暂无快照</div>';
    return;
  }

  body.innerHTML = state.playlists.map((playlist) => {
    const checked = state.selected.has(playlist.id) ? 'checked' : '';
    const kind = playlist.system ? '系统列表' : '用户歌单';
    return `
      <article class="playlist-card">
        <input type="checkbox" aria-label="选择 ${escapeHtml(playlist.name)}" data-select="${escapeHtml(playlist.id)}" ${checked}>
        <div class="playlist-card-main">
          <div class="playlist-card-top">
            <div>
              <div class="playlist-name">${escapeHtml(playlist.name)}</div>
              <div class="playlist-meta">${escapeHtml(playlist.id)}</div>
            </div>
            <span class="playlist-count">${playlist.songCount || 0} 首</span>
          </div>
          <div class="inline-actions">
            <span class="tag">${kind}</span>
            <button class="button secondary small icon" type="button" data-view="${escapeHtml(playlist.id)}"><span class="button-glyph" aria-hidden="true">⌕</span>查看歌曲</button>
            <button class="button secondary small icon" type="button" data-miot-playlist="${escapeHtml(playlist.id)}"><span class="button-glyph" aria-hidden="true">▶</span>投放</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  body.querySelectorAll('[data-select]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.select);
      else state.selected.delete(input.dataset.select);
      renderPlaylists();
    });
  });
  body.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => loadSongs(button.dataset.view));
  });
  body.querySelectorAll('[data-miot-playlist]').forEach((button) => {
    button.addEventListener('click', () => {
      state.miot.selectedPlaylistId = button.dataset.miotPlaylist;
      renderMiotPanel();
      playMiotPlaylist(button.dataset.miotPlaylist);
    });
  });
}

function renderSongs(playlist, songs) {
  $('detail-title').textContent = playlist ? playlist.name : '歌曲预览';
  $('detail-count').textContent = playlist ? `${songs.length} 首` : '';
  const list = $('song-list');
  if (!songs.length) {
    list.innerHTML = '<div class="empty">这个歌单没有歌曲</div>';
    return;
  }
  list.innerHTML = songs.slice(0, 200).map((song, index) => `
    <div class="song-row">
      ${coverMarkup(songCover(song), sourceInitial(song.source || 'lx'), 'cover-art-small')}
      <div>
        <div class="song-title">${escapeHtml(song.name || 'Untitled')}</div>
        <div class="song-meta">${escapeHtml(song.singer || '')}${songAlbum(song) ? ' · ' + escapeHtml(songAlbum(song)) : ''}</div>
      </div>
      <div class="song-actions">
        <span class="tag">${escapeHtml(song.source || 'unknown')}</span>
        <button class="button secondary small" type="button" data-miot-song="${index}">推送</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-miot-song]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!playlist) return;
      playMiotSongUrl(playlist.id, Number(button.dataset.miotSong || 0), button);
    });
  });
}

function renderOnlinePanel() {
  const online = state.online;
  $('online-status').textContent = online.busy
    ? '正在加载在线内容'
    : `${sourceLabel(online.source)} · ${online.mode === 'songlist' ? '平台歌单' : '排行榜'}`;

  document.querySelectorAll('[data-online-mode]').forEach((button) => {
    const active = button.dataset.onlineMode === online.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const sourceSelect = $('online-source');
  sourceSelect.innerHTML = online.sources.map((source) => `
    <option value="${escapeHtml(source.id)}">${escapeHtml(source.name)}</option>
  `).join('');
  sourceSelect.value = online.source;
  sourceSelect.disabled = online.busy;

  const isSonglist = online.mode === 'songlist';
  $('online-tag-field').style.display = isSonglist ? '' : 'none';
  $('online-sort-field').style.display = isSonglist ? '' : 'none';
  $('online-search-form').style.display = isSonglist ? 'grid' : 'none';

  const tagSelect = $('online-tag');
  tagSelect.innerHTML = '<option value="">全部</option>' + online.tags.map((tag) => `
    <option value="${escapeHtml(tag.id)}">${escapeHtml(tag.category ? `${tag.category} / ${tag.name}` : tag.name)}</option>
  `).join('');
  tagSelect.value = online.tagId;
  tagSelect.disabled = online.busy || !isSonglist;

  const sortSelect = $('online-sort');
  sortSelect.innerHTML = online.sortList.length
    ? online.sortList.map((sort) => `
      <option value="${escapeHtml(sort.id)}">${escapeHtml(sort.name || sort.id)}</option>
    `).join('')
    : '<option value="">默认</option>';
  sortSelect.value = online.sortId;
  sortSelect.disabled = online.busy || !isSonglist;

  $('online-search').value = online.searchText;
  $('online-search').disabled = online.busy || !isSonglist;
  $('online-clear-search').disabled = online.busy || !online.searchText;
  $('online-refresh-button').disabled = online.busy;

  renderOnlineItems();
  renderOnlineDetail();
}

function renderOnlineItems() {
  const body = $('online-items-body');
  const online = state.online;
  if (!online.items.length) {
    body.innerHTML = '<div class="empty">暂无在线内容</div>';
    return;
  }

  body.innerHTML = online.items.map((item, index) => {
    const active = index === online.selectedIndex ? ' active' : '';
    const name = onlineItemName(item);
    const meta = onlineItemMeta(item);
    const cover = onlineItemCover(item);
    return `
      <button class="online-item${active}" type="button" data-online-index="${index}">
        ${coverMarkup(cover, sourceInitial(item.source || online.source))}
        <span class="online-item-copy">
          <span class="online-item-title">${escapeHtml(name)}</span>
          <span class="online-item-meta">${escapeHtml(meta || sourceLabel(item.source || online.source))}</span>
        </span>
        <span class="online-item-action">查看</span>
      </button>
    `;
  }).join('');

  body.querySelectorAll('[data-online-index]').forEach((button) => {
    button.addEventListener('click', () => loadOnlineDetail(Number(button.dataset.onlineIndex || 0)));
  });
}

function renderOnlineDetail() {
  const item = selectedOnlineItem();
  const songs = state.online.songs;
  const title = item ? onlineItemName(item) : '在线歌曲预览';
  const detailCover = onlineDetailCover();
  $('online-detail-title').textContent = title;
  $('online-detail-count').textContent = songs.length ? `${songs.length} 首` : '';
  $('online-detail-meta').textContent = onlineDetailMeta(item, songs);
  const cover = $('online-detail-cover');
  cover.className = `cover-art cover-art-large${detailCover ? '' : ' cover-placeholder'}`;
  cover.style.backgroundImage = detailCover ? `url("${detailCover.replace(/"/g, '\\"')}")` : '';
  cover.innerHTML = detailCover ? '' : `<span>${escapeHtml(sourceInitial(item?.source || state.online.source))}</span>`;

  $('online-import-button').disabled = state.online.busy || !item;
  $('online-miot-button').disabled = state.online.busy || !item || !miotReady();

  const list = $('online-song-list');
  if (!item) {
    list.innerHTML = '<div class="empty">选择一个平台歌单或榜单</div>';
    return;
  }
  if (!songs.length) {
    list.innerHTML = '<div class="empty">暂无歌曲</div>';
    return;
  }

  list.innerHTML = songs.slice(0, 200).map((song, index) => `
    <div class="song-row">
      ${coverMarkup(songCover(song), sourceInitial(song.source || state.online.source), 'cover-art-small')}
      <div>
        <div class="song-title">${escapeHtml(song.name || 'Untitled')}</div>
        <div class="song-meta">${escapeHtml(song.singer || '')}${onlineSongAlbum(song) ? ' · ' + escapeHtml(onlineSongAlbum(song)) : ''}</div>
      </div>
      <div class="song-actions">
        <span class="tag">${escapeHtml(song.source || state.online.source)}</span>
        <button class="button secondary small" type="button" data-online-song="${index}">推送</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-online-song]').forEach((button) => {
    button.addEventListener('click', () => {
      playMiotOnlineSongUrl(Number(button.dataset.onlineSong || 0), button);
    });
  });
}

function searchSongAlbum(song) {
  return song.albumName || song.album || song.meta?.albumName || song.meta?.album || '';
}

function renderSongSearchPanel() {
  const search = state.songSearch;
  $('song-search-source').innerHTML = state.online.sources.map((source) => `
    <option value="${escapeHtml(source.id)}">${escapeHtml(source.name)}</option>
  `).join('');
  $('song-search-source').value = search.source;
  $('song-search-source').disabled = search.busy;
  $('song-search-input').value = search.keyword;
  $('song-search-input').disabled = search.busy;
  $('song-search-button').disabled = search.busy;
  $('song-search-clear').disabled = search.busy || (!search.keyword && !search.results.length);

  $('song-search-status').textContent = search.busy
    ? '正在搜索 LX Server'
    : search.lastQuery
      ? `${sourceLabel(search.source)} · ${search.lastQuery} · ${search.results.length} 首`
      : '输入歌曲名或作者后搜索 LX Server';

  const list = $('song-search-results');
  if (!search.results.length) {
    list.innerHTML = search.lastQuery
      ? '<div class="empty">没有找到匹配歌曲</div>'
      : '<div class="empty">等待搜索</div>';
    return;
  }

  list.innerHTML = search.results.slice(0, 200).map((song, index) => `
    <div class="song-row">
      ${coverMarkup(songCover(song), sourceInitial(song.source || search.source), 'cover-art-small')}
      <div>
        <div class="song-title">${escapeHtml(song.name || 'Untitled')}</div>
        <div class="song-meta">${escapeHtml(song.singer || '')}${searchSongAlbum(song) ? ' · ' + escapeHtml(searchSongAlbum(song)) : ''}</div>
      </div>
      <div class="song-actions">
        <span class="tag">${escapeHtml(song.source || search.source)}</span>
        <button class="button secondary small" type="button" data-search-song="${index}">推送</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-search-song]').forEach((button) => {
    button.addEventListener('click', () => {
      playMiotSearchSongUrl(Number(button.dataset.searchSong || 0), button);
    });
  });
}

async function searchSongsFromLx() {
  const keyword = $('song-search-input').value.trim();
  state.songSearch.keyword = keyword;
  state.songSearch.source = $('song-search-source').value;
  if (!keyword) {
    state.songSearch.results = [];
    state.songSearch.lastQuery = '';
    showToast('请输入歌曲名或作者', true);
    renderSongSearchPanel();
    return;
  }

  const token = ++state.songSearch.loadToken;
  state.songSearch.busy = true;
  renderSongSearchPanel();
  try {
    const data = await pluginApi.post('/api/search', {
      keyword,
      source: state.songSearch.source,
      page: 1,
      pageSize: 30
    });
    if (token !== state.songSearch.loadToken) return;
    state.songSearch.results = Array.isArray(data.songs) ? data.songs : [];
    state.songSearch.lastQuery = keyword;
  } catch (err) {
    if (token === state.songSearch.loadToken) {
      showToast(`歌曲搜索失败: ${errorMessage(err)}`, true);
    }
  } finally {
    if (token === state.songSearch.loadToken) {
      state.songSearch.busy = false;
      renderSongSearchPanel();
    }
  }
}

function clearSongSearch() {
  state.songSearch.keyword = '';
  state.songSearch.results = [];
  state.songSearch.lastQuery = '';
  $('song-search-input').value = '';
  renderSongSearchPanel();
}

function playEventTypeLabel(type) {
  const labels = {
    play: '播放',
    'play-url': '单曲推送',
    'play-playlist': '歌单投放',
    finish: '播放完成',
    skip: '切歌'
  };
  return labels[type] || type || '播放';
}

function playEventSourceLabel(source) {
  const labels = {
    'plugin-miot': '小爱音箱',
    songloft: 'Songloft'
  };
  return labels[source] || source || '';
}

function renderEvents(events) {
  const list = $('events-list');
  if (!events.length) {
    list.innerHTML = '<div class="empty">暂无记录</div>';
    return;
  }
  list.innerHTML = events.slice(0, 12).map((event) => {
    const title = event.song?.title || event.playlist?.name || '播放事件';
    const meta = [
      event.song?.artist || '',
      event.playlist ? `歌单 ${event.playlist.id}` : '',
      playEventTypeLabel(event.type),
      playEventSourceLabel(event.source)
    ].filter(Boolean).join(' · ');
    return `
      <div class="event-row">
        <div>
          <div class="event-title">${escapeHtml(title)}</div>
          <div class="event-meta">${escapeHtml(meta)}</div>
        </div>
        <span class="muted">${formatTime(event.timestamp)}</span>
      </div>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '');
}

async function loadStatus() {
  state.status = await pluginApi.get('/api/status');
  fillConfig(state.status.config);
  renderStatus();
}

async function loadMiotStatus() {
  const result = await pluginApi.get('/api/miot/status');
  state.miot.status = result;
  state.miot.accounts = result.devices || [];
  state.miot.importedPlaylists = result.importedPlaylists || [];
  renderMiotPanel();
  renderOnlinePanel();
}

async function loadMiotStatusSafely() {
  try {
    await loadMiotStatus();
  } catch (err) {
    state.miot.status = {
      installed: false,
      active: false,
      devices: [],
      importedPlaylists: [],
      error: errorMessage(err)
    };
    state.miot.accounts = [];
    state.miot.importedPlaylists = [];
    renderMiotPanel();
    renderOnlinePanel();
  }
}

async function loadPlaylists(refresh = false) {
  const data = await pluginApi.get(`/api/playlists${refresh ? '?refresh=1' : ''}`);
  state.playlists = data.playlists || [];
  state.selected = new Set(state.playlists.filter((p) => p.songCount > 0).map((p) => p.id));
  if (!state.miot.selectedPlaylistId) {
    const firstPlayable = state.playlists.find((p) => p.songCount > 0) || state.playlists[0];
    state.miot.selectedPlaylistId = firstPlayable ? firstPlayable.id : '';
  }
  $('snapshot-meta').textContent = `${state.playlists.length} 个歌单，${formatTime(data.fetchedAt)}`;
  renderPlaylists();
  renderMiotPanel();
}

async function loadSongs(id) {
  const playlist = state.playlists.find((item) => item.id === id);
  const data = await pluginApi.get(`/api/playlists/${encodeURIComponent(id)}/songs`);
  renderSongs(playlist, data.songs || []);
}

function flattenSongListTags(data) {
  const seen = new Set();
  const tags = [];
  const pushTag = (tag, category) => {
    if (!tag || typeof tag !== 'object') return;
    const id = String(tag.id ?? '');
    const name = String(tag.name ?? id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    tags.push({ ...tag, id, name, category });
  };

  (data.hotTags || data.hotTag || []).forEach((tag) => pushTag(tag, '热门'));
  (data.tags || []).forEach((group) => {
    const category = group?.name || '';
    (group?.list || []).forEach((tag) => pushTag(tag, category));
  });
  return tags;
}

async function loadOnlineSources() {
  const data = await pluginApi.get('/api/online/sources');
  if (Array.isArray(data.sources) && data.sources.length) {
    state.online.sources = data.sources;
    if (!state.online.sources.some((source) => source.id === state.online.source)) {
      state.online.source = state.online.sources[0].id;
    }
    if (!state.online.sources.some((source) => source.id === state.songSearch.source)) {
      state.songSearch.source = state.online.sources[0].id;
    }
  }
  renderSongSearchPanel();
}

async function loadOnlineContentSafely() {
  try {
    await loadOnlineSources();
    await refreshOnline();
  } catch (err) {
    state.online.busy = false;
    renderOnlinePanel();
    showToast(`在线内容加载失败: ${errorMessage(err)}`, true);
  }
}

async function loadOnlineTags(token = state.online.loadToken) {
  const data = await pluginApi.get(`/api/online/songlist/tags?source=${encodeURIComponent(state.online.source)}`);
  if (token !== state.online.loadToken) return false;
  state.online.tags = flattenSongListTags(data);
  state.online.sortList = Array.isArray(data.sortList)
    ? data.sortList.map((sort) => ({ ...sort, id: String(sort.id ?? ''), name: String(sort.name ?? sort.id ?? '') }))
    : [];

  if (!state.online.sortList.some((sort) => sort.id === state.online.sortId)) {
    state.online.sortId = state.online.sortList[0]?.id || '';
  }
  if (state.online.tagId && !state.online.tags.some((tag) => tag.id === state.online.tagId)) {
    state.online.tagId = '';
  }
  if (!state.online.tagId) {
    const firstHotTag = state.online.tags.find((tag) => tag.category === '热门');
    state.online.tagId = firstHotTag?.id || '';
  }
  return true;
}

async function refreshOnline() {
  const token = ++state.online.loadToken;
  state.online.busy = true;
  renderOnlinePanel();
  try {
    if (state.online.mode === 'songlist') {
      const active = await loadOnlineTags(token);
      if (active) await loadOnlineSongLists(token);
    } else {
      await loadOnlineBoards(token);
    }
  } catch (err) {
    if (token === state.online.loadToken) {
      showToast(`在线内容加载失败: ${errorMessage(err)}`, true);
    }
  } finally {
    if (token === state.online.loadToken) {
      state.online.busy = false;
      renderOnlinePanel();
    }
  }
}

async function loadOnlineSongLists(token = state.online.loadToken) {
  const source = encodeURIComponent(state.online.source);
  const page = 1;
  const data = state.online.searchText
    ? await pluginApi.get(`/api/online/songlist/search?source=${source}&text=${encodeURIComponent(state.online.searchText)}&page=${page}`)
    : await pluginApi.get(`/api/online/songlist/list?source=${source}&tagId=${encodeURIComponent(state.online.tagId)}&sortId=${encodeURIComponent(state.online.sortId)}&page=${page}`);
  if (token !== state.online.loadToken) return false;
  state.online.items = Array.isArray(data.list) ? data.list : [];
  state.online.selectedIndex = -1;
  state.online.detail = null;
  state.online.songs = [];
  if (state.online.items.length) {
    await loadOnlineDetail(0, true, token);
  }
  return true;
}

async function loadOnlineBoards(token = state.online.loadToken) {
  const data = await pluginApi.get(`/api/online/leaderboard/boards?source=${encodeURIComponent(state.online.source)}`);
  if (token !== state.online.loadToken) return false;
  state.online.items = Array.isArray(data.list) ? data.list : [];
  state.online.selectedIndex = -1;
  state.online.detail = null;
  state.online.songs = [];
  if (state.online.items.length) {
    await loadOnlineDetail(0, true, token);
  }
  return true;
}

async function loadOnlineDetail(index, keepBusy = false, loadToken = null) {
  const item = state.online.items[index];
  if (!item) return;
  const detailToken = loadToken === null ? ++state.online.detailToken : state.online.detailToken;
  if (!keepBusy) {
    state.online.busy = true;
    renderOnlinePanel();
  }
  try {
    state.online.selectedIndex = index;
    const source = encodeURIComponent(state.online.source);
    const data = state.online.mode === 'songlist'
      ? await pluginApi.get(`/api/online/songlist/detail?source=${source}&id=${encodeURIComponent(onlineItemId(item))}&page=1`)
      : await pluginApi.get(`/api/online/leaderboard/list?source=${source}&bangid=${encodeURIComponent(onlineBangid(item))}&page=1`);
    if (loadToken !== null && loadToken !== state.online.loadToken) return;
    if (loadToken === null && detailToken !== state.online.detailToken) return;
    state.online.detail = data;
    state.online.songs = Array.isArray(data.list) ? data.list : [];
  } catch (err) {
    if (
      (loadToken !== null && loadToken === state.online.loadToken)
      || (loadToken === null && detailToken === state.online.detailToken)
    ) {
      showToast(`歌曲预览加载失败: ${errorMessage(err)}`, true);
    }
  } finally {
    if (
      !keepBusy
      && (
        (loadToken !== null && loadToken === state.online.loadToken)
        || (loadToken === null && detailToken === state.online.detailToken)
      )
    ) {
      state.online.busy = false;
      renderOnlinePanel();
    }
    if (keepBusy && (loadToken === null || loadToken === state.online.loadToken)) {
      renderOnlinePanel();
    }
  }
}

function onlineImportBody() {
  const item = selectedOnlineItem();
  if (!item) return null;
  const body = {
    kind: state.online.mode,
    source: state.online.source,
    name: onlineItemName(item)
  };
  if (state.online.mode === 'songlist') {
    body.id = onlineItemId(item);
  } else {
    body.bangid = onlineBangid(item);
  }
  return body;
}

async function importOnlineSelected(playAfter = false) {
  const body = onlineImportBody();
  if (!body) {
    showToast('请选择一个平台歌单或榜单', true);
    return;
  }
  if (playAfter && !miotReady()) {
    showToast('请选择可用的小爱音箱设备', true);
    return;
  }

  const button = playAfter ? $('online-miot-button') : $('online-import-button');
  state.online.busy = true;
  setBusy(button, true, playAfter ? '投放中' : '导入中');
  renderOnlinePanel();
  try {
    const result = await pluginApi.post('/api/online/import', body);
    const detail = result.detail || {};
    if (!detail.imported) {
      showToast('没有可导入的远程歌曲', true);
      return;
    }

    if (playAfter) {
      await pluginApi.post('/api/miot/play', {
        accountId: state.miot.selectedAccountId,
        deviceId: state.miot.selectedDeviceId,
        songloftPlaylistId: detail.songloftPlaylistId,
        songloftPlaylistName: detail.songloftPlaylistName,
        playMode: state.miot.playMode,
        startIndex: 0
      });
      showToast(`已导入并投放：${detail.songloftPlaylistName}`);
    } else {
      showToast(formatImportDetailSummary(detail));
    }
    await loadMiotStatus();
    await loadStatus();
  } catch (err) {
    showToast(`${playAfter ? '投放' : '导入'}失败: ${errorMessage(err)}`, true);
  } finally {
    state.online.busy = false;
    setBusy(button, false);
    renderOnlinePanel();
  }
}

async function playMiotOnlineSongUrl(songIndex, button) {
  if (!miotReady()) {
    showToast('请选择可用的小爱音箱设备', true);
    return;
  }
  const song = state.online.songs[songIndex];
  if (!song) {
    showToast('歌曲不存在', true);
    return;
  }
  setBusy(button, true, '推送中');
  try {
    const result = await pluginApi.post('/api/online/miot/play-song-url', {
      accountId: state.miot.selectedAccountId,
      deviceId: state.miot.selectedDeviceId,
      songInfo: song
    });
    showToast(`已推送单曲：${result.song?.title || song.name || '当前歌曲'}`);
    await loadStatus();
  } catch (err) {
    showToast(`单曲推送失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

async function playMiotSearchSongUrl(songIndex, button) {
  if (!miotReady()) {
    showToast('请选择可用的小爱音箱设备', true);
    return;
  }
  const song = state.songSearch.results[songIndex];
  if (!song) {
    showToast('歌曲不存在', true);
    return;
  }
  setBusy(button, true, '推送中');
  try {
    const result = await pluginApi.post('/api/online/miot/play-song-url', {
      accountId: state.miot.selectedAccountId,
      deviceId: state.miot.selectedDeviceId,
      songInfo: song
    });
    showToast(`已推送单曲：${result.song?.title || song.name || '当前歌曲'}`);
    await loadStatus();
  } catch (err) {
    showToast(`单曲推送失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

async function saveConfig(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, '保存中');
  try {
    const body = {
      baseUrl: $('base-url').value,
      username: $('username').value,
      password: $('password').value,
      playerUrl: $('player-url').value,
      importPrefix: $('import-prefix').value,
      defaultQuality: $('default-quality').value,
      autoRefreshMinutes: Number($('auto-refresh').value || 0),
      recordPlayEvents: $('record-events').checked
    };
    const result = await pluginApi.post('/api/config', body);
    state.status = { ...(state.status || {}), config: result.config };
    fillConfig(result.config);
    renderStatus();
    showToast('配置已保存');
  } catch (err) {
    showToast(`保存失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

async function toggleMenu(event) {
  const input = event.currentTarget;
  const enabled = input.checked;
  state.menuBusy = true;
  renderMenuSwitch({ enabled });
  try {
    const result = await pluginApi.post('/api/menu', { enabled });
    state.status = { ...(state.status || {}), menu: result };
    renderMenuSwitch(result);
    showToast(enabled ? '已加入左侧菜单' : '已从左侧菜单移除');
  } catch (err) {
    input.checked = !enabled;
    showToast(`菜单设置失败: ${errorMessage(err)}`, true);
  } finally {
    state.menuBusy = false;
    renderMenuSwitch(state.status?.menu || { enabled: input.checked });
  }
}

async function testConnection() {
  const button = $('test-button');
  setBusy(button, true, '测试中');
  try {
    const result = await pluginApi.post('/api/test', {});
    showToast(`连接正常：${result.playlistCount} 个歌单，${result.songCount} 首歌`);
  } catch (err) {
    showToast(`测试失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

async function refreshPlaylists() {
  const button = $('refresh-button');
  setBusy(button, true, '刷新中');
  try {
    const result = await pluginApi.post('/api/sync', {});
    state.playlists = result.playlists || [];
    state.selected = new Set(state.playlists.filter((p) => p.songCount > 0).map((p) => p.id));
    $('snapshot-meta').textContent = `${state.playlists.length} 个歌单，${formatTime(result.fetchedAt)}`;
    renderPlaylists();
    await loadStatus();
    showToast('歌单快照已刷新');
  } catch (err) {
    showToast(`刷新失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

async function importSelected() {
  const button = $('import-button');
  const playlistIds = Array.from(state.selected);
  if (!playlistIds.length) {
    showToast('请选择至少一个歌单', true);
    return;
  }
  setBusy(button, true, '导入中');
  try {
    const result = await pluginApi.post('/api/import', { playlistIds });
    showToast(formatImportResultSummary(result));
    await loadMiotStatus();
    await loadStatus();
  } catch (err) {
    showToast(`导入失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

async function playMiotPlaylist(playlistId = state.miot.selectedPlaylistId) {
  const button = $('miot-play-button');
  if (!state.miot.selectedAccountId || !state.miot.selectedDeviceId) {
    showToast('请选择小爱音箱设备', true);
    return;
  }
  if (!playlistId) {
    showToast('请选择 LX 歌单', true);
    return;
  }

  state.miot.selectedPlaylistId = playlistId;
  state.miot.busy = true;
  setBusy(button, true, '投放中');
  renderMiotPanel();
  try {
    const result = await pluginApi.post('/api/miot/play', {
      accountId: state.miot.selectedAccountId,
      deviceId: state.miot.selectedDeviceId,
      lxPlaylistId: playlistId,
      playMode: state.miot.playMode,
      startIndex: 0
    });
    await loadMiotStatus();
    await loadStatus();
    const playlist = state.playlists.find((item) => item.id === playlistId);
    showToast(`已推送播放：${playlist?.name || playlistId}`);
    if (result.importedPlaylist) {
      $('miot-result').textContent = `正在播放 Songloft 歌单：${result.importedPlaylist.songloftPlaylistName} #${result.importedPlaylist.songloftPlaylistId}`;
    }
  } catch (err) {
    showToast(`投放失败: ${errorMessage(err)}`, true);
  } finally {
    state.miot.busy = false;
    setBusy(button, false);
    renderMiotPanel();
  }
}

async function controlMiot(action, button) {
  if (!state.miot.selectedAccountId || !state.miot.selectedDeviceId) {
    showToast('请选择小爱音箱设备', true);
    return;
  }
  state.miot.busy = true;
  setBusy(button, true, '执行中');
  renderMiotPanel();
  try {
    await pluginApi.post('/api/miot/control', {
      accountId: state.miot.selectedAccountId,
      deviceId: state.miot.selectedDeviceId,
      action
    });
    const labels = { toggle: '暂停/继续', previous: '上一首', next: '下一首', stop: '停止' };
    showToast(`已发送：${labels[action] || action}`);
  } catch (err) {
    showToast(`控制失败: ${errorMessage(err)}`, true);
  } finally {
    state.miot.busy = false;
    setBusy(button, false);
    renderMiotPanel();
  }
}

async function playMiotSongUrl(playlistId, songIndex, button) {
  if (!state.miot.selectedAccountId || !state.miot.selectedDeviceId) {
    showToast('请选择小爱音箱设备', true);
    return;
  }
  setBusy(button, true, '推送中');
  try {
    const result = await pluginApi.post('/api/miot/play-song-url', {
      accountId: state.miot.selectedAccountId,
      deviceId: state.miot.selectedDeviceId,
      lxPlaylistId: playlistId,
      songIndex
    });
    showToast(`已推送单曲：${result.song?.title || '当前歌曲'}`);
    await loadStatus();
  } catch (err) {
    showToast(`单曲推送失败: ${errorMessage(err)}`, true);
  } finally {
    setBusy(button, false);
  }
}

function bindEvents() {
  $('config-form').addEventListener('submit', saveConfig);
  $('menu-enabled').addEventListener('change', toggleMenu);
  $('test-button').addEventListener('click', testConnection);
  $('refresh-button').addEventListener('click', refreshPlaylists);
  $('import-button').addEventListener('click', importSelected);
  $('events-refresh-button').addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true, '刷新中');
    try {
      await loadStatus();
      showToast('最近播放事件已刷新');
    } catch (err) {
      showToast(`刷新播放事件失败: ${errorMessage(err)}`, true);
    } finally {
      setBusy(event.currentTarget, false);
    }
  });
  $('miot-refresh-button').addEventListener('click', async () => {
    const button = $('miot-refresh-button');
    setBusy(button, true, '刷新中');
    try {
      await loadMiotStatus();
      showToast('小爱音箱设备已刷新');
    } catch (err) {
      showToast(`刷新设备失败: ${errorMessage(err)}`, true);
    } finally {
      setBusy(button, false);
    }
  });
  $('miot-account').addEventListener('change', (event) => {
    state.miot.selectedAccountId = event.target.value;
    state.miot.selectedDeviceId = '';
    renderMiotPanel();
  });
  $('miot-device').addEventListener('change', (event) => {
    state.miot.selectedDeviceId = event.target.value;
    renderMiotPanel();
  });
  $('miot-playlist').addEventListener('change', (event) => {
    state.miot.selectedPlaylistId = event.target.value;
    renderMiotPanel();
  });
  $('miot-play-mode').addEventListener('change', (event) => {
    state.miot.playMode = event.target.value;
  });
  $('miot-play-button').addEventListener('click', () => playMiotPlaylist());
  $('miot-toggle-button').addEventListener('click', (event) => controlMiot('toggle', event.currentTarget));
  $('miot-prev-button').addEventListener('click', (event) => controlMiot('previous', event.currentTarget));
  $('miot-next-button').addEventListener('click', (event) => controlMiot('next', event.currentTarget));
  $('miot-stop-button').addEventListener('click', (event) => controlMiot('stop', event.currentTarget));
  document.querySelectorAll('[data-online-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (state.online.mode === button.dataset.onlineMode) return;
      state.online.mode = button.dataset.onlineMode;
      state.online.selectedIndex = -1;
      state.online.detail = null;
      state.online.songs = [];
      await refreshOnline();
    });
  });
  $('online-source').addEventListener('change', async (event) => {
    state.online.source = event.target.value;
    state.online.tagId = '';
    state.online.sortId = '';
    state.online.searchText = '';
    await refreshOnline();
  });
  $('online-tag').addEventListener('change', async (event) => {
    state.online.tagId = event.target.value;
    state.online.searchText = '';
    await refreshOnline();
  });
  $('online-sort').addEventListener('change', async (event) => {
    state.online.sortId = event.target.value;
    state.online.searchText = '';
    await refreshOnline();
  });
  $('online-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.online.searchText = $('online-search').value.trim();
    await refreshOnline();
  });
  $('online-clear-search').addEventListener('click', async () => {
    state.online.searchText = '';
    await refreshOnline();
  });
  $('online-refresh-button').addEventListener('click', refreshOnline);
  $('online-import-button').addEventListener('click', () => importOnlineSelected(false));
  $('online-miot-button').addEventListener('click', () => importOnlineSelected(true));
  $('song-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await searchSongsFromLx();
  });
  $('song-search-source').addEventListener('change', (event) => {
    state.songSearch.source = event.target.value;
    renderSongSearchPanel();
  });
  $('song-search-input').addEventListener('input', (event) => {
    state.songSearch.keyword = event.target.value;
  });
  $('song-search-clear').addEventListener('click', clearSongSearch);
  $('select-all-button').addEventListener('click', () => {
    state.selected = new Set(state.playlists.map((p) => p.id));
    renderPlaylists();
  });
  $('clear-selection-button').addEventListener('click', () => {
    state.selected.clear();
    renderPlaylists();
  });
}

async function init() {
  bindEvents();
  try {
    await loadStatus();
    await loadPlaylists(false);
    renderSongSearchPanel();
  } catch (err) {
    renderPlaylists();
    renderMiotPanel();
    renderOnlinePanel();
    renderSongSearchPanel();
    showToast(`初始化失败: ${errorMessage(err)}`, true);
    return;
  }
  await Promise.allSettled([
    loadMiotStatusSafely(),
    loadOnlineContentSafely()
  ]);
}

document.addEventListener('DOMContentLoaded', init);
