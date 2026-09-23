import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";

/** Элемент, фокусируемый с D-пульта (Android TV).
 *  - focusable + onFocus/onBlur — нативные события фокуса RN-вью;
 *  - при фокусе: лёгкое увеличение, акцентная рамка и свечение — видно с 3 метров;
 *  - hasTVPreferredFocus — начальный фокус экрана;
 *  - onPress срабатывает на «OK» пульта (клик по фокусируемой вью).
 *  Не использовать Pressable: его scale-анимация на press-in конфликтует
 *  с D-pad-нажатием, а состояние focused в нём недоступно. */
export function TvFocusable({
  children,
  onPress,
  style,
  contentStyle,
  contentFocusedStyle,
  autoFocus,
  disabled,
  borderRadius = 18,
  scale = 1.04,
  onFocusChange,
  accessibilityLabel,
  focusKey,
  ...rest
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** стиль внутренней карточки (под рамку фокуса) */
  contentStyle?: StyleProp<ViewStyle>;
  /** доп. стиль внутренней карточки при фокусе */
  contentFocusedStyle?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  disabled?: boolean;
  borderRadius?: number;
  scale?: number;
  onFocusChange?: (focused: boolean) => void;
  accessibilityLabel?: string;
  focusKey?: string;
} & Omit<React.ComponentProps<typeof View>, "style" | "onFocus" | "onBlur">) {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const onFocus = useCallback(() => {
    setFocused(true);
    onFocusChange?.(true);
    Animated.timing(anim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, onFocusChange]);

  const onBlur = useCallback(() => {
    setFocused(false);
    onFocusChange?.(false);
    Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, onFocusChange]);

  const scaleInterp = anim.interpolate({ inputRange: [0, 1], outputRange: [1, scale] });

  return (
    <Animated.View
      focusable={!disabled}
      hasTVPreferredFocus={autoFocus}
      onFocus={onFocus}
      onBlur={onBlur}
      // onClick — нативный prop View (topClick от setFocusable): срабатывает на
      // «ОК» пульта по фокусируемой вью. В TS-типах ViewProps его нет.
      {...({ onClick: disabled ? undefined : onPress } as any)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.wrap,
        { borderRadius: borderRadius + 10, transform: [{ scale: scaleInterp }] },
        style,
      ]}
      {...rest}
    >
      {/* Рамка фокуса: двойной контур (фирменный акцент + светлая обводка).
          ТОЛЬКО Animated.View: Animated.Value в стиле обычного View
          сериализуется в map и крашит native-проп opacity. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.focusRing,
          { borderRadius: borderRadius + 10, borderColor: colors.accent, opacity: anim },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.focusRingOuter,
          { borderRadius: borderRadius + 14, opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) },
        ]}
      />
      <View style={[{ borderRadius, overflow: "hidden" }, contentStyle, focused && contentFocusedStyle]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start" },
  focusRing: { borderWidth: 2.5 },
  focusRingOuter: { borderWidth: 6, borderColor: "rgba(168,85,247,0.25)", margin: -4 },
});
