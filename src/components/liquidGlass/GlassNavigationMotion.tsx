import React from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { NavigationAction, useIsFocused, useNavigation, usePreventRemove } from "@react-navigation/native";
import Animated, { cancelAnimation, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors } from "../../theme";
import { GlassScreenBackdrop } from "./GlassBackdrop";

/** Short travel keeps an opaque glass backdrop visible, never a faded scene.
 * The native stack still owns routing; removal is replayed after the UI spring.
 * No exiting layout animation: native screens can detach it before completion. */
export function GlassNavigationMotion({ children, reduceMotion }: {
  children: React.ReactNode;
  reduceMotion: boolean;
}) {
  const navigation = useNavigation<any>();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const travel = Math.min(64, width * 0.16);
  const offset = useSharedValue(reduceMotion ? 0 : travel);
  const closing = React.useRef(false);
  const removalAction = React.useRef<NavigationAction | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAction, setPendingAction] = React.useState<NavigationAction | null>(null);
  const spring = { damping: 28, stiffness: 260, mass: 0.85, overshootClamping: true, reduceMotion: ReduceMotion.System };

  React.useEffect(() => {
    if (focused) {
      closing.current = false;
      offset.value = reduceMotion ? 0 : withSpring(0, spring);
    }
    return () => cancelAnimation(offset);
  }, [focused, reduceMotion, offset]);

  usePreventRemove(focused && !reduceMotion && pendingAction === null, ({ data }) => {
    if (closing.current) return;
    closing.current = true;
    removalAction.current = data.action;
    closeTimer.current = setTimeout(() => setPendingAction(data.action), 700);
    offset.value = withSpring(travel, spring, (finished) => {
      if (finished) runOnJS(setPendingAction)(data.action);
    });
  });

  // Wait for prevent-remove to be disabled in the committed render, then replay
  // the exact action (goBack, popToTop, reset), preserving navigation semantics.
  React.useEffect(() => {
    if (pendingAction) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      cancelAnimation(offset);
      removalAction.current = null;
      navigation.dispatch(pendingAction);
      setPendingAction(null);
    }
  }, [pendingAction, navigation]);

  React.useEffect(() => {
    if (reduceMotion && closing.current) {
      cancelAnimation(offset);
      offset.value = 0;
      closing.current = false;
      if (removalAction.current) setPendingAction(removalAction.current);
    }
  }, [reduceMotion, offset]);

  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const motionStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <Animated.View style={[styles.scene, { backgroundColor: colors.bg }]}>
      <GlassScreenBackdrop />
      <Animated.View style={[styles.scene, motionStyle]}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ scene: { flex: 1 } });
