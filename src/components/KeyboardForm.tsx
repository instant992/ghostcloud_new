import React from "react";
import { Keyboard, Platform, ScrollView, ScrollViewProps, StyleSheet, TextInput, View, ViewProps } from "react-native";

/** Only reserve the part of this viewport actually covered by the IME.
 * adjustResize may already resize it; edge-to-edge/modal windows may not.
 * Measuring in window coordinates avoids both double padding and header offsets. */
export function KeyboardViewport({ children, style, onLayout, ...props }: ViewProps) {
  const ref = React.useRef<View>(null);
  const [overlap, setOverlap] = React.useState(0);
  const frame = React.useRef<number | null>(null);
  const update = React.useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const keyboard = Keyboard.metrics();
      if (!keyboard) { setOverlap(0); return; }
      ref.current?.measureInWindow((_x, y, _width, height) => {
        setOverlap(Math.max(0, Math.min(height, y + height - keyboard.screenY)));
      });
    });
  }, []);
  React.useEffect(() => {
    const subscriptions = [
      Keyboard.addListener("keyboardDidShow", update),
      Keyboard.addListener("keyboardDidHide", update),
      ...(Platform.OS === "ios" ? [Keyboard.addListener("keyboardWillChangeFrame", update)] : []),
    ];
    update();
    return () => {
      subscriptions.forEach(subscription => subscription.remove());
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [update]);
  return <View {...props} ref={ref} collapsable={false} style={[style, { paddingBottom: overlap }]} onLayout={event => { onLayout?.(event); update(); }}>
    {children}
  </View>;
}

export const KeyboardFormContext = React.createContext<(() => void) | null>(null);

/** Keep the focused field visible after keyboard opening, focus changes and
 * multiline growth. Native scrolling alone is unreliable with edge-to-edge. */
export function KeyboardScrollView({ style, onScroll, onLayout, onContentSizeChange, children, ...props }: ScrollViewProps) {
  const ref = React.useRef<ScrollView>(null);
  const offset = React.useRef(0);
  const innerRef = React.useRef<View>(null);
  const frame = React.useRef<number | null>(null);
  const reveal = React.useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const scroll = ref.current;
      const input = TextInput.State.currentlyFocusedInput();
      const content = innerRef.current;
      if (!scroll || !input || !content || !Keyboard.isVisible()) return;
      // Validate ancestry: a background screen must not scroll for a modal input.
      input.measureLayout(content, () => {
        scroll.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
          input.measureInWindow((_ix, iy, _iw, ih) => {
            const bottom = Math.min(y + height, Keyboard.metrics()?.screenY ?? y + height) - 16;
            const delta = iy + ih > bottom ? iy + ih - bottom : iy < y ? iy - y : 0;
            if (delta) scroll.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
          });
        });
      }, () => {});
    });
  }, []);
  React.useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", reveal);
    return () => { show.remove(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [reveal]);
  return <KeyboardViewport style={[styles.flex, style]}>
    <KeyboardFormContext.Provider value={reveal}>
      <ScrollView {...props} ref={ref} innerViewRef={innerRef as React.RefObject<View>} style={styles.flex}
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
        scrollEventThrottle={16}
        onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
        onLayout={event => { onLayout?.(event); reveal(); }}
        onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); reveal(); }}>
        {children}
      </ScrollView>
    </KeyboardFormContext.Provider>
  </KeyboardViewport>;
}

/** Scroll the complete dialog, including actions, when the IME leaves little room. */
export function KeyboardFormModalContent({ children }: { children: React.ReactNode }) {
  return <KeyboardScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
    {React.Children.map(children, child => React.isValidElement<ViewProps>(child)
      ? React.cloneElement(child, { style: [child.props.style, { flexGrow: 1, flexShrink: 0, flexBasis: "auto" }] })
      : child)}
  </KeyboardScrollView>;
}

export function KeyboardTextInput({ onFocus, onContentSizeChange, ...props }: React.ComponentProps<typeof TextInput>) {
  const reveal = React.useContext(KeyboardFormContext);
  return <TextInput {...props}
    onFocus={event => { onFocus?.(event); reveal?.(); }}
    onContentSizeChange={event => { onContentSizeChange?.(event); reveal?.(); }} />;
}
const styles = StyleSheet.create({ flex: { flex: 1 }, modalContent: { flexGrow: 1 } });
