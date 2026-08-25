import React from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Нажимной отклик: scale 0.97 за 110ms на press-in, возврат на press-out.
 *  Работа на UI-потоке (Reanimated), учитывает системную настройку анимаций. */
export function PressableScale({
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[aStyle, style]}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withTiming(0.97, { duration: 110, reduceMotion: ReduceMotion.System });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 130, reduceMotion: ReduceMotion.System });
        onPressOut?.(e);
      }}
      {...rest}
    />
  );
}
