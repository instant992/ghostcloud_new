const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
function render(state, tv = false) {
  const exports = {}, calls = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useSyncExternalStore: () => state };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/UpdateBanner.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    if (name === 'react') return React;
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: 320, fontScale: 2 }) };
    if (name === 'react-native-safe-area-context') return { SafeAreaInsetsContext: { Provider: 'SafeArea' }, useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) };
    if (name === 'react-native-svg') return { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'Gradient', Stop: 'Stop', Rect: 'Rect' };
    if (name === '@expo/vector-icons') return { MaterialIcons: 'Icon' };
    if (name === '../theme') return { useTheme: () => ({ mode: 'dark' }), colors: { bg: '#000', text: '#fff', textDim: '#ccc' } };
    if (name === '../tv') return { IS_TV: tv };
    if (name === '../tv/TvFocusable') return { TvFocusable: 'TvFocusable' };
    if (name === '../update') return { subscribe: () => {}, getSnapshot: () => state, downloadAndInstall: info => calls.push(info), firstChangelogLine: x => x, formatSizeMb: () => '1 МБ' };
    throw Error(name);
  }});
  return { tree: exports.UpdateBanner(), layout: children => exports.UpdateLayout({ children }), calls };
}
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : [];
test('banner real update action works for mobile and TV, no dismissal', () => {
  const info = { version: '0.0.2', changelog: 'Fix', apkSize: 1024 };
  for (const tv of [false, true]) {
    const r = render({ status: 'available', info }, tv);
    const button = nodes(r.tree).find(x => x.type === (tv ? 'TvFocusable' : 'Pressable'));
    assert.ok(button); button.props.onPress(); assert.equal(r.calls[0], info);
    assert.ok(JSON.stringify(r.tree).includes('0.0.2'));
    assert.equal(nodes(r.tree).filter(x => x.props.onPress).length, 1);
  }
});
test('root band consumes top safe area only while visible, screens keep bottom inset', () => {
  for (const status of ['available', 'idle']) {
    const r = render({ status, info: { version: '0.0.2' } });
    const layout = r.layout('LOGIN OR ANY THEME');
    const provider = nodes(layout).find(x => x.type === 'SafeArea');
    assert.equal(provider.props.value.top, status === 'available' ? 0 : 24);
    assert.equal(provider.props.value.bottom, 20);
    assert.ok(JSON.stringify(layout).includes('LOGIN OR ANY THEME'));
  }
});

test('download shows progress with disabled action; no-update states have no banner', () => {
  const r = render({ status: 'downloading', info: { version: '0.0.2' }, progress: 0.4, downloaded: 40, total: 100 });
  assert.equal(nodes(r.tree).find(x => x.type === 'Pressable').props.disabled, true);
  assert.ok(JSON.stringify(r.tree).includes('40%'));
  for (const status of ['idle', 'checking', 'up-to-date', 'error']) assert.equal(render({ status }).tree, null);
});
