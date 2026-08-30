import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { colors, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";

/** Кнопка питания VPN — единая для основной темы и темы Liquid Glass:
 *  кольца из частиц, пульсация и свечение при подключении. */
export function PowerButton({
  connected,
  busy,
  onToggle,
}: {
  connected: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  useTheme();
  const styles = makeStyles();

  // Плавная пульсация кругов при подключении
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!connected) return;
    const mk = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
    const a1 = mk(pulse1, 1200);
    const a2 = mk(pulse2, 1600);
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
      pulse1.setValue(0);
      pulse2.setValue(0);
    };
  }, [connected, pulse1, pulse2]);

  // Медленное вращение колец из частиц
  const spin1 = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const mk = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.timing(val, { toValue: 360, duration: dur, easing: Easing.linear, useNativeDriver: true })
      );
    const a1 = mk(spin1, 80000);
    const a2 = mk(spin2, 110000);
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [spin1, spin2]);

  return (
    <PressableScale
      onPress={onToggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={connected ? "Выключить VPN" : "Включить VPN"}
      accessibilityState={{ busy, checked: connected }}
      style={styles.pressable}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbit,
          styles.orbitOuter,
          {
            opacity: connected ? 1 : 0.55,
            transform: [
              {
                rotate: spin1.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }),
              },
            ],
          },
        ]}
      >
        <ParticleRing size={304} color={colors.accent} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbit,
          styles.orbitInner,
          {
            opacity: connected ? 0.95 : 0.45,
            transform: [
              {
                rotate: spin2.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "-360deg"] }),
              },
            ],
          },
        ]}
      >
        <ParticleRing size={256} color="#C4B5FD" />
      </Animated.View>
      <View pointerEvents="none" style={[styles.halo, connected && styles.haloOn]} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring3,
          connected && styles.ringOn3,
          {
            transform: [
              { scale: pulse1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
            ],
            opacity: pulse1.interpolate({ inputRange: [0, 1], outputRange: [connected ? 1 : 0, 0.35] }),
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring2,
          connected && styles.ringOn2,
          {
            transform: [
              { scale: pulse2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
            opacity: pulse2.interpolate({ inputRange: [0, 1], outputRange: [connected ? 1 : 0, 0.3] }),
          },
        ]}
      />
      <View
        style={[
          styles.button,
          busy && { opacity: 0.7 },
          connected ? styles.buttonOn : styles.buttonOff,
        ]}
      >
        <Ionicons
          name={connected ? "pause" : "power"}
          size={64}
          color="#fff"
          style={{ marginTop: -6 }}
        />
      </View>
    </PressableScale>
  );
}

/** Кольцо из частиц вокруг кнопки питания.
 *  Детерминированный псевдослучайный сид — частицы не «прыгают» при ре-рендере. */
function ParticleRing({ size, color }: { size: number; color: string }) {
  const particles = useMemo(() => {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const count = 130;
    const rInner = size * 0.375;
    const rOuter = size * 0.5;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.32;
      const radius = rInner + (rOuter - rInner) * Math.pow(rnd(), 0.6);
      return {
        x: size / 2 + Math.cos(angle) * radius,
        y: size / 2 + Math.sin(angle) * radius,
        r: 0.7 + rnd() * 1.5,
        opacity: 0.12 + rnd() * 0.6,
      };
    });
  }, [size]);

  return (
    <Svg width={size} height={size}>
      {particles.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color} opacity={p.opacity} />
      ))}
    </Svg>
  );
}

const makeStyles = () => StyleSheet.create({
  pressable: { width: 304, height: 304, alignItems: "center", justifyContent: "center" },
  orbit: { position: "absolute" },
  orbitOuter: { left: 0, top: 0 },
  orbitInner: { left: 24, top: 24 },
  halo: {
    position: "absolute",
    width: 216,
    height: 216,
    left: 44,
    top: 44,
    borderRadius: 108,
    backgroundColor: "rgba(124,58,237,0.10)",
  },
  haloOn: { backgroundColor: "rgba(124,58,237,0.18)" },
  ring2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ringOn2: { borderColor: colors.accentDeep },
  ring3: {
    position: "absolute",
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 1,
    borderColor: colors.bgSoft,
  },
  ringOn3: { borderColor: "#4C2E85" },
  button: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonOff: {
    backgroundColor: colors.cardLight,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 10,
  },
  buttonOn: {
    backgroundColor: colors.accentDeep,
    shadowColor: colors.accent,
    shadowOpacity: 0.65,
    shadowRadius: 40,
    elevation: 16,
  },
});
