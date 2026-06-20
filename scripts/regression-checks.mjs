import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../static/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../static/index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

function functionBlock(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  return match?.[0] || '';
}

const setBusyBlock = functionBlock(app, 'setBusy');
const escapeAttributeBlock = functionBlock(app, 'escapeAttribute');
const initBlock = functionBlock(app, 'init');

const checks = [
  {
    name: 'plugin-triggered MiOT playback is recorded locally',
    pass: /recordPluginPlayEvent/.test(main)
      && /await\s+recordPluginPlayEvent/.test(main)
      && /plugin-miot/.test(main)
  },
  {
    name: 'import summary distinguishes duplicate playlist songs from failed imports',
    pass: /formatImportDetailSummary/.test(app)
      && /已在歌单/.test(app)
      && !/导入完成：新增 \$\{[^}]+}\s*首，跳过/.test(app)
  },
  {
    name: 'Songloft search and music URL routes use local body decoding',
    pass: !/createSearchHandler/.test(main)
      && !/createMusicUrlHandler/.test(main)
      && /async function searchSongs/.test(main)
      && /async function handleMusicUrlRequest/.test(main)
  },
  {
    name: 'frontend refreshes status after plugin-triggered playback',
    pass: (app.match(/await loadStatus\(\)/g) || []).length >= 4
  },
  {
    name: 'busy buttons restore icon markup after async actions',
    pass: /dataset\.originalHtml/.test(setBusyBlock)
      && /button\.innerHTML\s*=\s*button\.dataset\.originalHtml/.test(setBusyBlock)
      && !/dataset\.originalText/.test(setBusyBlock)
  },
  {
    name: 'cover style URLs escape double quotes before entering HTML attributes',
    pass: /replace\(\s*\/"\/g,\s*'&quot;'\s*\)/.test(escapeAttributeBlock)
  },
  {
    name: 'standalone plugin page scopes fallback API calls to the plugin base path',
    pass: /function pluginApiPath\(\s*path\s*\)/.test(app)
      && /fetch\(\s*pluginApiPath\(path\)/.test(app)
      && /document\.querySelector\('base'\)/.test(app)
  },
  {
    name: 'MiOT status calls cannot hang the plugin status endpoint indefinitely',
    pass: /MIOT_STATUS_TIMEOUT_MS/.test(main)
      && /function withTimeout/.test(main)
      && /withTimeout\(\s*miotJson<MiotAccountDevices\[]>/.test(main)
  },
  {
    name: 'frontend initialization keeps playlists available when optional panels fail',
    pass: /async function loadMiotStatusSafely/.test(app)
      && /async function loadOnlineContentSafely/.test(app)
      && /Promise\.allSettled/.test(initBlock)
      && /loadPlaylists\(false\)/.test(initBlock)
  },
  {
    name: 'public release does not ship personal LAN defaults',
    pass: !/192\.168\.31\.63/.test([main, app, html, readme].join('\n'))
      && !/username:\s*'test'/.test(main)
      && /baseUrl:\s*''/.test(main)
      && /username:\s*''/.test(main)
      && /playerUrl:\s*''/.test(main)
  }
];

let failed = 0;
for (const check of checks) {
  if (check.pass) {
    console.log(`ok - ${check.name}`);
  } else {
    failed += 1;
    console.error(`not ok - ${check.name}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
