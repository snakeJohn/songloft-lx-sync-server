# Songloft LX Sync Server Plugin

这个插件把 LX Sync Server 用户歌单接入 Songloft：

- 从 LX Sync Server 拉取 `defaultList`、`loveList`、`userList`。
- 在插件页中浏览 LX 歌单快照。
- 在插件页中浏览 LX Web 播放器同源的 5 个平台在线歌单和排行榜：酷我、酷狗、QQ 音乐、网易云音乐、咪咕。
- 支持按平台歌单分类、排序和关键词搜索；支持预览在线歌单或榜单歌曲。
- 在插件页中打开或关闭“显示在左侧菜单”开关；打开后 Songloft 左侧栏会出现插件入口，点击后右侧区域展示插件页面。
- 将选定 LX 歌单导入为 Songloft 原生普通歌单。
- 将选定在线歌单或排行榜导入为 Songloft 原生普通歌单，导入时会自动翻页拉取完整歌曲列表。
- 导入的歌曲使用 Songloft 远程歌曲模型，`plugin_entry_path` 为 `lx-sync-server`。
- Songloft 播放这些远程歌曲时，会回调插件的 `/api/music/url`，插件再调用 LX Sync Server 的 `/api/music/url` 解析真实播放地址。
- 注册 Songloft 搜索接口 `/api/search`，可从已缓存的 LX 歌单快照里搜索歌曲。
- 订阅 Songloft 播放事件，并记录插件自己发起的小爱音箱投放事件，供插件页查看。
- 调用官方 MiOT 智能音箱插件，把 LX 歌单导入后的 Songloft 歌单推送到小爱音箱播放。
- 支持从插件页刷新小爱音箱设备、选择播放模式、投放歌单、推送单曲 URL，以及发送暂停/继续、上一首、下一首、停止控制。

## 设计边界

Songloft 2.6.0 的插件 SDK 只有 `songs.read` / `playlists.read` bridge，未直接暴露写入方法。这个插件导入歌单时通过 `songloft.plugin.getToken()` 获取宿主 JWT，然后调用 Songloft 宿主 HTTP API：

- `POST /api/v1/songs/remote`
- `POST /api/v1/playlists`
- `POST /api/v1/playlists/{id}/songs`

Songloft 远程歌曲按 `(plugin_entry_path, dedup_key)` 去重，重复导入会更新远程歌曲元数据并复用 ID；歌单加歌接口会返回已存在歌曲数量，插件页会展示为“已在歌单”，不是导入失败。

LX Sync Server 当前公开 API 未提供 Web 播放器远程控制端点。插件不会直接控制 LX Web 播放器播放/暂停/切歌；“同步播放”落在同一 LX Server 播放 URL 解析链路和 Songloft 播放事件记录上。后续如果 LX Server 增加远控 API，可以在现有播放事件记录与 MiOT 投放链路中接入。

小爱音箱投放通过官方 `miot` 插件完成，不在本插件里实现小米协议。歌单投放主路径为：

1. LX 歌单导入或复用为 Songloft 原生歌单。
2. 调用 MiOT 插件 `/player/play`，让 MiOT 的播放管理器负责推送和连续播放。
3. 播放控制继续调用 MiOT 插件 `/player/toggle`、`/player/previous`、`/player/next`、`/player/stop`。

单曲“推送”按钮会直接解析当前 LX 歌曲 URL，并调用 MiOT 插件 `/mina/play-url`。这个模式适合快速播放一首歌，不负责列表自动下一首。

在线歌单和排行榜也复用同一条 MiOT 链路：

1. 在线歌单或榜单先导入为 Songloft 原生歌单。
2. 插件调用 MiOT 插件 `/player/play` 投放导入后的 Songloft 歌单。
3. 在线歌曲预览里的单曲“推送”会直接解析该歌曲 URL，再调用 MiOT 插件 `/mina/play-url`。

## 首次配置

公开版本不会预填任何个人服务器地址、用户名或密码。首次安装后进入插件页填写并保存：

- LX Server: 你的 LX Sync Server 地址，例如 `http://your-lx-server:9527`
- 用户名: 你的 LX Sync Server 用户名
- 密码: 你的 LX Sync Server 密码
- Web 播放器: 可留空；保存配置时会按 LX Server 自动推导为 `/music`
- 导入歌单前缀: `LX - `

密码不会写死在源码里，也不会写入 README 或构建脚本。

## 构建

```bash
npm install
npm run typecheck
npm run build
npm run validate
```

构建产物位于：

```text
dist/lx-sync-server.jsplugin.zip
```

## 安装

在 Songloft 后台上传 `dist/lx-sync-server.jsplugin.zip`，启用插件后打开插件页：

```text
http://<songloft-host>/api/v1/jsplugin/lx-sync-server/static
```

## 左侧菜单开关

插件页的“显示在左侧菜单”开关会读写 Songloft 宿主配置：

- `GET /api/v1/settings/tab-config`
- `PUT /api/v1/settings/tab-config`

Songloft 的可选菜单项上限是 10 个，计算方式为 `show_library + show_playlists + plugin_tabs.length`。如果菜单已满，插件会拒绝打开开关并提示先关闭一个 Tab，不会自动删除已有菜单项。

## 插件后端接口

- `GET /api/status`: 当前配置摘要、缓存状态、最近播放事件。
- `POST /api/config`: 保存 LX Server 连接配置。
- `POST /api/test`: 测试 LX 登录和 `/api/user/list`。
- `POST /api/sync`: 拉取 LX 歌单并缓存快照。
- `GET /api/playlists`: 返回缓存歌单，`?refresh=1` 强制刷新。
- `GET /api/playlists/:id/songs`: 返回某个 LX 歌单的歌曲。
- `POST /api/import`: 导入选中歌单到 Songloft。
- `GET /api/online/sources`: 返回支持的 5 个在线平台。
- `GET /api/online/songlist/tags`: 获取某个平台的歌单分类和排序。
- `GET /api/online/songlist/list`: 获取某个平台某分类下的歌单列表。
- `GET /api/online/songlist/search`: 搜索某个平台的歌单。
- `GET /api/online/songlist/detail`: 获取在线歌单歌曲预览。
- `GET /api/online/leaderboard/boards`: 获取某个平台的排行榜列表。
- `GET /api/online/leaderboard/list`: 获取排行榜歌曲预览。
- `POST /api/online/import`: 导入一个在线歌单或排行榜到 Songloft。
- `POST /api/online/miot/play-song-url`: 解析在线歌曲 URL 并调用 MiOT 插件推送单曲。
- `GET /api/miot/status`: 返回 MiOT 插件状态、托管设备、已导入歌单映射。
- `POST /api/miot/play`: 导入或复用 LX 歌单，并通过 MiOT 插件推送歌单播放。
- `POST /api/miot/control`: 代理 MiOT 播放控制，`action` 支持 `toggle`、`previous`、`next`、`stop`。
- `POST /api/miot/play-song-url`: 解析某首 LX 歌曲 URL，并调用 MiOT 插件直接推送 URL。
- `POST /api/search`: Songloft 音源搜索接口。
- `POST /api/music/url`: Songloft 远程歌曲播放 URL 解析接口。
