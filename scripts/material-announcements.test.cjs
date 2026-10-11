const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

// Render the actual screen JSX without requiring a session or native modules.
function render(top, bottom) {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useCallback: fn => fn, useEffect: () => {}, useMemo: fn => fn(),
    useRef: value => ({ current: value }), useState: value => [value, () => {}],
    useSyncExternalStore: () => ({}),
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/screens/themes/MaterialScreen.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    if (name === 'react') return React;
    if (name === 'react-native') return { AppState: {}, Image: 'Image', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: x => x } };
    if (name === 'react-native-paper') return { ActivityIndicator: 'Spinner', Appbar: { Header: 'Header', Action: 'Action' }, Button: 'Button', Divider: 'Divider', Text: 'Text', TouchableRipple: 'Ripple', useTheme: () => ({ colors: {} }) };
    if (name === '@react-navigation/native') return { useNavigation: () => ({}), useFocusEffect: () => {} };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top, bottom, left: 0, right: 0 }) };
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name === 'expo-haptics') return {};
    if (name === '../../context') return { useApp: () => ({ nodes: [], subscriptionActive: true }) };
    if (name === '../../vpn/manager') return { resolveSavedNode: () => null };
    if (name === '../../vpn/timer') return { useVpnTimerSeconds: () => 0 };
    if (name === '../../vpn/pingStore' || name === '../../stats' || name === '../../theme' || name === '../../utils/transportLabel') return {};
    const components = { '../../components/BrandName': 'BrandName', '../../components/AnnouncementsArea': 'AnnouncementsArea', '../../components/PowerButton': 'PowerButton', '../../components/ConnectionFilterModal': 'ConnectionFilterModal', './ServerSheet': 'ServerSheet' };
    if (components[name]) return { [components[name]]: components[name] };
    throw Error(name);
  }});
  return exports.default();
}
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : [];
const style = node => Object.assign({}, ...[node.props.style].flat().filter(Boolean));

for (const [top, bottom] of [[0, 0], [24, 24], [48, 34]]) {
  test(`announcements share the home scroll, without a height cap; insets ${top}/${bottom}`, () => {
    const tree = render(top, bottom);
    assert.equal(style(tree).paddingTop, top, 'screen owns the status-bar/cutout inset');
    const scrolls = nodes(tree).filter(n => n.type === 'ScrollView');
    assert.equal(scrolls.length, 1, 'no separate capped announcement viewport');
    const scroll = scrolls[0];
    const announcement = nodes(scroll).find(n => n.type === 'AnnouncementsArea');
    assert.ok(announcement, 'announcements scroll with the home content');
    assert.equal(scroll.children[0], announcement, 'announcements stay above the app bar');
    assert.equal(scroll.children[1].type, 'Header');
    assert.equal(scroll.children[1].props.statusBarHeight, 0, 'do not double the top inset');
    for (const node of [scroll, announcement]) {
      assert.equal(style(node).height, undefined);
      assert.equal(style(node).maxHeight, undefined, 'long/multiple/scaled announcements remain reachable');
    }
    assert.equal(style(scroll.children[2]).paddingBottom, bottom + 28);
    assert.ok(nodes(scroll).some(n => n.type === 'PowerButton'));
    assert.ok(tree.children.some(n => n.type === 'ServerSheet'), 'modals remain outside scrolling content');
  });
}
