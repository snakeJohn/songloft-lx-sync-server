# LX Server Song And Author Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a song/author search panel to the LX Sync Server Songloft plugin page, backed by LX Server's `/api/music/search` endpoint.

**Architecture:** Keep the plugin's existing `POST /api/search` boundary and route it to authenticated LX Server search instead of local snapshot filtering. Add a static-page panel that calls the plugin API, renders normalized LX songs, and reuses the existing MiOT single-song push endpoint.

**Tech Stack:** TypeScript plugin runtime with `@songloft/plugin-sdk`, static HTML/CSS/vanilla JavaScript, existing Node-based regression/build validation scripts.

## Global Constraints

- The search must live inside the `LX Sync Server` plugin page.
- The plugin must call LX Server directly for song/author search.
- Use `GET /api/music/search?name=<keyword>&source=<source>&page=<page>&limit=<limit>`; `keyword`, `text`, and `key` are not valid LX Server search params.
- Use existing LX session headers: `x-user-token` and `x-user-name`.
- Supported sources are `kw`, `kg`, `tx`, `wy`, and `mg`.
- Empty keyword returns no results and must not fetch all songs.
- Do not add runtime dependencies.
- Preserve the existing `POST /api/search` Songloft plugin boundary and `POST /api/music/url` playback URL behavior.
- UI must fit the existing panel/control visual system and mobile breakpoints.

---

## File Structure

- Modify `scripts/regression-checks.mjs`: add red/green checks for LX Server search endpoint usage and new static-page controls.
- Modify `src/main.ts`: add normalized LX Server song search helpers and update `handleSearchRequest`.
- Modify `static/index.html`: add the "歌曲/作者搜索" panel.
- Modify `static/js/app.js`: add `state.songSearch`, render/search/clear/push functions, and event bindings.
- Modify `static/css/styles.css`: add layout styles for the new panel using existing tokens.
- Optionally modify `README.md`: mention the new search workflow if implementation changes user-facing usage text.

---

### Task 1: Add Failing Regression Checks

**Files:**
- Modify: `scripts/regression-checks.mjs`

**Interfaces:**
- Consumes: current source text loaded as `main`, `app`, `html`, `readme`.
- Produces: regression assertions that fail until backend and frontend search are implemented.

- [ ] **Step 1: Write the failing regression checks**

Add these objects to the `checks` array in `scripts/regression-checks.mjs`:

```js
  {
    name: 'LX song search calls server search endpoint with name parameter',
    pass: /api\/music\/search/.test(main)
      && /name:\s*keyword/.test(main)
      && /limit:\s*normalizedPageSize/.test(main)
      && /normalizeOnlineSource\(body\.source/.test(main)
  },
  {
    name: 'static plugin page exposes LX song and author search controls',
    pass: /id="song-search-form"/.test(html)
      && /id="song-search-source"/.test(html)
      && /id="song-search-input"/.test(html)
      && /id="song-search-results"/.test(html)
      && /songSearch/.test(app)
      && /pluginApi\.post\('\/api\/search'/.test(app)
      && /playMiotSearchSongUrl/.test(app)
  },
```

- [ ] **Step 2: Run regression to verify it fails**

Run: `npm run regression`

Expected: exit code `1`, with these two lines:

```text
not ok - LX song search calls server search endpoint with name parameter
not ok - static plugin page exposes LX song and author search controls
```

- [ ] **Step 3: Commit only if this task is being handled independently**

Do not commit a permanently failing regression on the main work line. If using a subagent with task-local commits, defer commit until Task 2 and Task 3 make these checks pass.

---

### Task 2: Route Plugin Search To LX Server

**Files:**
- Modify: `src/main.ts`
- Test: `scripts/regression-checks.mjs`

**Interfaces:**
- Consumes: `lxFetchJson<T>(path, init, authed)`, `queryPath(path, params)`, `normalizeOnlineSource(value)`, `toSearchResult(song, quality)`, `sourceData(song, quality)`.
- Produces: `searchSongs(keyword: string, source?: string, page?: number, pageSize?: number): Promise<{ results: SearchResultItem[]; songs: LxMusicInfo[]; total: number; source: OnlineSource; sourceName: string; page: number; pageSize: number }>` and a `/api/search` JSON response with `results`, `songs`, `source`, `sourceName`, `page`, `pageSize`, and `total`.

- [ ] **Step 1: Update the search result return type**

In `src/main.ts`, add this interface near the existing online/search-related interfaces:

```ts
interface SongSearchResult {
  results: SearchResultItem[];
  songs: LxMusicInfo[];
  total: number;
  source: OnlineSource;
  sourceName: string;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Replace local snapshot filtering in `searchSongs`**

Replace the existing `searchSongs` function with:

```ts
async function searchSongs(keyword: string, source: OnlineSource = 'kw', page = 1, pageSize = 30): Promise<SongSearchResult> {
  const config = await loadConfig();
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(100, Math.max(1, pageSize));
  const trimmed = keyword.trim();
  if (!trimmed) {
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
      name: trimmed,
      source,
      page: normalizedPage,
      limit: normalizedPageSize
    }),
    { method: 'GET' },
    true
  );
  const songs = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.list)
      ? payload.list
      : [];
  const total = Array.isArray(payload)
    ? songs.length
    : numericValue(payload.total, songs.length);

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
```

- [ ] **Step 3: Update `handleSearchRequest`**

Replace the body of `handleSearchRequest` with:

```ts
async function handleSearchRequest(req: HTTPRequest): Promise<HTTPResponse> {
  const body = requestBodyObject(req);
  const keyword = primitiveString(body.keyword ?? body.query ?? body.q);
  const source = normalizeOnlineSource(body.source || 'kw');
  const page = Math.max(1, numericValue(body.page, 1));
  const pageSize = Math.min(100, Math.max(1, numericValue(body.pageSize ?? body.page_size, 30)));
  return jsonResponse(await searchSongs(keyword, source, page, pageSize));
}
```

- [ ] **Step 4: Run targeted verification**

Run: `npm run typecheck`

Expected: exit code `0`.

Run: `npm run regression`

Expected: the backend regression passes while the static-page regression still fails until Task 3.

---

### Task 3: Add Static Page Search Panel And Behavior

**Files:**
- Modify: `static/index.html`
- Modify: `static/js/app.js`
- Test: `scripts/regression-checks.mjs`

**Interfaces:**
- Consumes: `pluginApi.post('/api/search', body)`, `pluginApi.post('/api/online/miot/play-song-url', body)`, `state.online.sources`, `sourceLabel`, `coverMarkup`, `songCover`, `onlineSongAlbum`, `escapeHtml`, `setBusy`, `showToast`, `miotReady`.
- Produces: `state.songSearch` with `source`, `keyword`, `results`, `busy`, `loadToken`, `lastQuery`.

- [ ] **Step 1: Add state**

In `static/js/app.js`, add this object after `state.online`:

```js
  songSearch: {
    source: 'kw',
    keyword: '',
    results: [],
    busy: false,
    loadToken: 0,
    lastQuery: ''
  }
```

Keep the surrounding object commas valid.

- [ ] **Step 2: Add HTML panel**

In `static/index.html`, insert this panel immediately after the existing `online-panel` and before the `toolbar panel`:

```html
        <div class="panel song-search-panel">
          <div class="song-search-header panel-header">
            <div>
              <span class="eyebrow">Search</span>
              <h2>歌曲/作者搜索</h2>
              <p id="song-search-status">输入歌曲名或作者后搜索 LX Server</p>
            </div>
          </div>
          <form id="song-search-form" class="song-search-form">
            <label>
              <span>平台</span>
              <select id="song-search-source">
                <option value="kw">酷我音乐</option>
                <option value="kg">酷狗音乐</option>
                <option value="tx">QQ音乐</option>
                <option value="wy">网易云音乐</option>
                <option value="mg">咪咕音乐</option>
              </select>
            </label>
            <label>
              <span>歌曲或作者</span>
              <input id="song-search-input" name="songSearch" type="search" placeholder="歌曲名、作者、歌手">
            </label>
            <button id="song-search-button" class="button icon" type="submit"><span class="button-glyph" aria-hidden="true">⌕</span>搜索</button>
            <button id="song-search-clear" class="button secondary icon" type="button"><span class="button-glyph" aria-hidden="true">×</span>清除</button>
          </form>
          <div id="song-search-results" class="song-list song-search-results">
            <div class="empty">等待搜索</div>
          </div>
        </div>
```

- [ ] **Step 3: Add render/search functions**

In `static/js/app.js`, add these functions after `renderOnlineDetail()`:

```js
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
```

- [ ] **Step 4: Add MiOT push function**

In `static/js/app.js`, add this function near `playMiotOnlineSongUrl`:

```js
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
```

- [ ] **Step 5: Bind events and initial rendering**

In `bindEvents()`, add:

```js
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
```

In the `init()` catch block and after `loadPlaylists(false)` succeeds, call:

```js
renderSongSearchPanel();
```

- [ ] **Step 6: Run regression**

Run: `npm run regression`

Expected: exit code `0`, including:

```text
ok - LX song search calls server search endpoint with name parameter
ok - static plugin page exposes LX song and author search controls
```

---

### Task 4: Style And Responsive Layout

**Files:**
- Modify: `static/css/styles.css`
- Test: `scripts/ui-design-checks.mjs`

**Interfaces:**
- Consumes: HTML classes `song-search-panel`, `song-search-header`, `song-search-form`, and `song-search-results`.
- Produces: a responsive search panel that fits existing desktop and mobile layouts.

- [ ] **Step 1: Add panel classes to shared padding/header selectors**

Update the existing selector:

```css
.toolbar,
.miot-panel,
.online-panel,
.playlist-panel,
.detail-panel,
.events-panel {
  padding: 16px;
}
```

to:

```css
.toolbar,
.miot-panel,
.online-panel,
.song-search-panel,
.playlist-panel,
.detail-panel,
.events-panel {
  padding: 16px;
}
```

Update the existing header media selector:

```css
.topbar,
.toolbar,
.miot-header,
.online-header,
.detail-header {
  align-items: stretch;
  flex-direction: column;
}
```

to include `.song-search-header`.

- [ ] **Step 2: Add form/result styles**

Add these rules near `.online-search-form`:

```css
.song-search-form {
  display: grid;
  grid-template-columns: minmax(150px, 190px) minmax(260px, 1fr) auto auto;
  gap: 8px;
  align-items: end;
  margin: 14px 0 0;
}

.song-search-results {
  max-height: 430px;
}
```

- [ ] **Step 3: Update responsive selectors**

Update the `max-width: 900px` block so this selector:

```css
.miot-grid,
.online-controls,
.online-search-form {
  grid-template-columns: 1fr;
}
```

becomes:

```css
.miot-grid,
.online-controls,
.online-search-form,
.song-search-form {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 4: Run UI design checks**

Run: `npm run ui-check`

Expected: exit code `0`.

---

### Task 5: Build, Validate, And Browser Verify

**Files:**
- Modify: none unless validation finds an issue.

**Interfaces:**
- Consumes: completed backend, frontend, CSS, and regression checks.
- Produces: validated build artifact and live-page smoke verification.

- [ ] **Step 1: Run full local verification**

Run:

```bash
npm run typecheck
npm run regression
npm run ui-check
npm run build
npm run validate
```

Expected: every command exits `0`; `npm run validate` prints:

```text
Built plugin is valid.
```

- [ ] **Step 2: Inspect build output**

Run: `git status --short`

Expected: modified source files and generated `dist/` changes if the build updates tracked files. Do not revert user changes.

- [ ] **Step 3: Browser smoke test in Songloft test environment**

Open:

```text
http://192.168.31.63:58091/api/v1/jsplugin/lx-sync-server/static
```

Search:

```text
source: kw
keyword: 周杰伦
```

Expected: the new panel renders LX Server search results and each visible result has a "推送" button. If MiOT is configured, one push request should show the existing success or failure toast from `/api/online/miot/play-song-url`.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/main.ts static/index.html static/js/app.js static/css/styles.css scripts/regression-checks.mjs docs/superpowers/plans/2026-06-21-lx-server-song-author-search.md
git commit -m "Add LX server song search panel"
```

Expected: commit succeeds with the implementation and plan.
