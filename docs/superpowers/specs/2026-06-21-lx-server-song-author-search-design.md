# LX Server Song And Author Search Design

## Summary

Add a dedicated song/author search panel to the LX Sync Server Songloft plugin page. The search is performed against the configured LX Server, not the plugin snapshot cache, so users can search online songs by song name or singer/author and push a selected result to a MiOT speaker.

## Confirmed LX Server API

The LX Server test environment accepts authenticated song search requests at:

```text
GET /api/music/search?name=<keyword>&source=<source>&page=<page>&limit=<limit>
```

Required request headers use the existing LX user session:

```text
x-user-token: <token>
x-user-name: <username>
```

The `name` query parameter is used for both song-title and singer/author keyword searches. The endpoint returns an array of LX song objects. Tested alternatives such as `keyword`, `text`, and `key` returned `400 Bad Request`, so the plugin will use `name`.

Supported sources remain the existing LX online source IDs: `kw`, `kg`, `tx`, `wy`, and `mg`.

## UX

Add a new panel between "平台歌单与排行榜" and "LX 歌单快照".

The panel contains:

- A source selector using the existing source list and labels.
- A search input labeled for song or author keywords.
- Search and clear buttons.
- A status line that shows idle, loading, result count, or error state.
- A result list using the existing song row visual pattern.

Each result shows cover art, song title, singer/author, album, source, duration when available, and a "推送" button. The button sends that exact LX song object through the existing MiOT single-song URL playback flow.

## Backend

Keep the existing `POST /api/search` route as the plugin search boundary, but change its data source from local snapshot filtering to LX Server search.

Request body:

```json
{
  "keyword": "周杰伦",
  "source": "kw",
  "page": 1,
  "pageSize": 30
}
```

The backend will:

1. Normalize keyword, source, page, and page size.
2. Require a non-empty keyword for LX Server search.
3. Authenticate with LX Server through the existing `lxFetchJson` flow.
4. Call `/api/music/search` with `name`, `source`, `page`, and `limit`.
5. Normalize the result into both:
   - `results`: Songloft-compatible `SearchResultItem[]`.
   - `songs`: raw LX song objects for the plugin UI and MiOT push flow.
6. Return source and paging metadata.

Empty keyword returns an empty result set instead of fetching all songs.

## Frontend

Add `state.songSearch` with source, keyword, results, loading state, and last query metadata.

New functions:

- `renderSongSearchPanel()`
- `searchSongs()`
- `clearSongSearch()`
- `playMiotSearchSongUrl(songIndex, button)`

The MiOT push function posts to the existing `/api/online/miot/play-song-url` endpoint with `songInfo` from the selected search result. This reuses existing LX URL resolution and play-event recording.

## Error Handling

- Missing LX configuration or expired session follows the existing login/retry path.
- Empty search shows a toast and does not call the server.
- LX Server failures show a toast and leave prior results visible only if they belong to the same query; stale concurrent responses are ignored with a token counter.
- MiOT push keeps existing readiness checks and button busy behavior.

## Tests And Verification

Update the existing regression script to check that:

- The backend calls `/api/music/search` with the `name` query parameter.
- The static page includes the song/author search panel controls.
- The frontend calls `POST /api/search` and can push a selected search result through `/api/online/miot/play-song-url`.

Run:

```bash
npm run typecheck
npm run regression
npm run ui-check
npm run build
npm run validate
```

Then verify in the test Songloft plugin page by searching a singer such as `周杰伦` with source `酷我音乐` and checking that results render and the single-song push action is available.
