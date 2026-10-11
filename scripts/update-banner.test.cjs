const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
function render(state, tv = false) {
  const exports = {}, calls = []; let dismissed = false, listener;
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: () => [dismissed, v => { dismissed = v; }], useEffect: fn => { if (!listener) fn(); }, useSyncExternalStore: () => state };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/UpdateBanner.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    if (name === 'react') return React;
    if (name === 'react-native') return { Modal: 'Modal', ScrollView: 'ScrollView', AppState: { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove() {} }; } }, View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: 320, height: 800, fontScale: 2 }) };
    if (name === 'react-native-safe-area-context') return { SafeAreaInsetsContext: { Provider: 'SafeArea' }, useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) };
    if (name === 'react-native-svg') return { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'Gradient', Stop: 'Stop', Rect: 'Rect' };
    if (name === '@expo/vector-icons') return { MaterialIcons: 'Icon' };
    if (name === '../theme') return { useTheme: () => ({ mode: 'dark' }), colors: { bg: '#000', text: '#fff', textDim: '#ccc' } };
    if (name === '../tv') return { IS_TV: tv };
    if (name === '../tv/TvFocusable') return { TvFocusable: 'TvFocusable' };
    if (name === '../update') return { subscribe: () => {}, getSnapshot: () => state, downloadAndInstall: info => calls.push(info), firstChangelogLine: x => x, formatSizeMb: () => '1 МБ' };
    throw Error(name);
  }});
  return { tree: exports.UpdateBanner(), rerender: () => exports.UpdateBanner(), enter: () => { listener('background'); listener('active'); }, layout: children => exports.UpdateLayout({ children }), calls };
}
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : [];
test('bottom sheet download, later and reentry work', () => {
  const info = { version: '0.0.2', changelog: 'Fix\nSecond', apkSize: 1024 };
  const r = render({ status: 'available', info });
  assert.equal(r.tree.type, 'Modal'); assert.equal(r.tree.props.animationType, 'slide');
  const buttons = nodes(r.tree).filter(x => x.type === 'Pressable');
  buttons[1].props.onPress(); assert.equal(r.calls[0], info);
  buttons[2].props.onPress(); assert.equal(r.rerender(), null);
  r.enter(); assert.equal(r.rerender().type, 'Modal');
  assert.ok(JSON.stringify(r.tree).includes('Second'));
});
test('root does not consume safe area or resize screens', () => {
  const r = render({ status: 'idle' });
  const tree = r.layout('LOGIN OR ANY THEME');
  assert.ok(JSON.stringify(tree).includes('LOGIN OR ANY THEME'));
  assert.equal(nodes(tree).some(n => n.type === 'SafeArea'), false);
});
test('download progress prevents dismiss and no update renders nothing', () => {
  const r = render({ status: 'downloading', info: { version: '0.0.2', changelog: '' }, progress: 0.4 });
  assert.ok(JSON.stringify(r.tree).includes('40%'));
  r.tree.props.onRequestClose(); assert.ok(r.rerender());
  assert.ok(nodes(r.tree).filter(x => x.type === 'Pressable').every(x => x.props.disabled));
  for (const status of ['idle', 'checking', 'up-to-date', 'error']) assert.equal(render({ status }).tree, null);
});
