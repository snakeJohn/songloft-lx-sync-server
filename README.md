# Songloft LX Sync Server Plugin

把 LX Sync Server 的歌单、在线歌单和排行榜接入 Songloft。导入后的歌曲会作为 Songloft 远程歌曲保存，播放时再通过 LX Sync Server 解析真实播放地址。

## 需要准备

- 已安装并可访问的 Songloft。
- 已安装并可访问的 LX Sync Server。
- LX Sync Server 用户名和密码。
- 可选：Songloft 官方 MiOT 智能音箱插件。只有需要投放到小爱音箱时才需要。

## 安装

1. 构建插件包：

   ```bash
   npm install
   npm run build
   ```

2. 在 Songloft 后台上传：

   ```text
   dist/lx-sync-server.jsplugin.zip
   ```

3. 启用插件后打开插件页。也可以直接访问：

   ```text
   http://<songloft-host>/api/v1/jsplugin/lx-sync-server/static
   ```

## 配置

首次打开插件页后填写并保存：

- `LX Server`: LX Sync Server 地址，例如 `http://your-lx-server:9527`。
- `用户名`: LX Sync Server 用户名。
- `密码`: LX Sync Server 密码。
- `Web 播放器`: 可留空；留空时会按 `LX Server + /music` 自动生成。
- `导入前缀`: 导入到 Songloft 时使用的歌单名前缀，默认 `LX - `。
- `默认音质`: 解析播放地址时请求的音质，默认 `128k`。
- `自动刷新分钟`: 定时刷新 LX 歌单快照；填 `0` 表示关闭。
- `记录播放事件和插件投放`: 是否在插件页显示最近播放/投放记录。

公开版本不会预填个人服务器地址、用户名或密码。密码只保存在 Songloft 插件存储中，不会写入源码、README 或构建脚本。

## 使用

1. 点击“测试连接”，确认 LX Sync Server 登录和歌单读取正常。
2. 点击“刷新歌单”，把 LX 歌单同步为插件页快照。
3. 勾选要导入的 LX 歌单，点击“导入选中歌单”。
4. 在 Songloft 中播放导入后的远程歌曲；Songloft 会回调插件解析播放 URL。
5. 需要浏览公开平台内容时，在“平台歌单与排行榜”中选择平台、分类或排行榜，再点击“导入到 Songloft”。
6. 需要小爱音箱投放时，先启用 MiOT 插件，再在本插件页选择账号、设备和歌单，点击“导入并投放”。

## 左侧菜单

插件页的“显示在左侧菜单”开关可以把本插件入口加入 Songloft 左侧栏。Songloft 可选菜单项上限为 10 个；如果菜单已满，需要先在 Songloft 设置中关闭一个 Tab。

## 开发验证

```bash
npm run typecheck
npm run regression
npm run ui-check
npm run build
npm run validate
```

构建产物：

```text
dist/lx-sync-server.jsplugin.zip
```
