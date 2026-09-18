import React, { useMemo, useEffect } from "react";
import { View, StyleSheet, LayoutChangeEvent, Text, Image } from "react-native";
import Svg, { G, Circle, Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  interpolate,
  cancelAnimation,
} from "react-native-reanimated";
import { colors } from "../../theme";
import { DOTS, MAP_W, MAP_H } from "./dots";
import { LANDMARKS } from "./landmarks";
import { LANDMARK_PHOTOS } from "./landmarkPhotos";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type MapMarker = {
  country: string;
  flag: string;
  city: string;
  x: number;
  y: number;
  lm?: string;
  nodeIds: string[];
};

/** Одна точка суши как замкнутая дуга — вся карта рисуется ОДНИМ Path,
 *  а не ~2000 элементов <Circle> (на порядок быстрее первый рендер). */
function buildDotsPath(r: number): string {
  const parts: string[] = [];
  for (const pair of DOTS.split(" ")) {
    const c = pair.indexOf(",");
    if (c < 0) continue;
    const x = pair.slice(0, c);
    const y = pair.slice(c + 1);
    parts.push(`M${x},${y} m-${r},0 a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 -${r * 2},0`);
  }
  return parts.join(" ");
}

const HOME = { x: 604, y: 76 }; // Москва — точка «откуда» для дуги перелёта

/** Размер фото-карточки достопримечательности. Пиксели задаём явно: проценты
 *  внутри Animated.View с transform на Fabric могут не разрешиться → картинка
 *  получает нулевой размер и не рисуется. */
const LM_W = 132;
const LM_H = 88;

/** Живая карта мира: точечная суша, маркеры стран, плавный наезд камеры на
 *  выбранную страну, светящийся маркер с кольцами-пингами, дуга перелёта с
 *  бегущим огоньком и прорисовка достопримечательности. Всё векторное (SVG) —
 *  нулевой вес в APK. Контейнер точно повторяет пропорции viewBox, поэтому
 *  SVG не получает полей и координаты камеры считаются линейно. */
export function WorldMap({
  markers,
  active,
  connected,
  light,
  style,
}: {
  markers: MapMarker[];
  active: MapMarker | null;
  connected: boolean;
  light: boolean;
  style?: any;
}) {
  const w = useSharedValue(0);
  const h = useSharedValue(0);

  // Камера: k=1 и фокус в центре = весь мир; при подключении наезжает на страну.
  const focus = useSharedValue({ k: 1, sx: MAP_W / 2, sy: MAP_H / 2 });
  useEffect(() => {
    const target =
      connected && active
        ? { k: 2.4, sx: active.x, sy: active.y }
        : { k: 1, sx: MAP_W / 2, sy: MAP_H / 2 };
    focus.value = withTiming(target, {
      duration: connected ? 1500 : 1100,
      easing: Easing.bezier(0.22, 0.9, 0.24, 1),
    });
  }, [connected, active?.country]);

  const onLayout = (e: LayoutChangeEvent) => {
    w.value = e.nativeEvent.layout.width;
    h.value = e.nativeEvent.layout.height;
  };

  // Без полей (контейнер = пропорции viewBox): пиксель = (user/ MAP_*) * размер.
  // transformOrigin: top-left → scale вокруг (0,0), поэтому t = центр − k·фокус.
  const camStyle = useAnimatedStyle(() => {
    if (w.value === 0 || h.value === 0) return {};
    const { k, sx, sy } = focus.value;
    const fx = (sx / MAP_W) * w.value;
    const fy = (sy / MAP_H) * h.value;
    const tx = w.value / 2 - k * fx;
    const ty = h.value / 2 - k * fy;
    return { transform: [{ translateX: tx }, { translateY: ty }, { scale: k }] };
  });

  const dotsPath = useMemo(() => buildDotsPath(2.2), []);
  const dotColor = light ? "#cdbdef" : "#4a3a6e";

  // Дуга перелёта home → active (квадратичная Безье)
  const flight = useMemo(() => {
    if (!active) return null;
    const x1 = HOME.x, y1 = HOME.y, x2 = active.x, y2 = active.y;
    const mx = (x1 + x2) / 2;
    const my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.2 - 20;
    return { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, x1, y1, x2, y2, mx, my };
  }, [active?.country]);

  // Бегущий огонёк по дуге
  const t = useSharedValue(0);
  useEffect(() => {
    if (connected && flight) {
      t.value = 0;
      t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, false);
    } else {
      cancelAnimation(t);
      t.value = 0;
    }
  }, [connected, flight?.d]);
  const planeProps = useAnimatedProps(() => {
    if (!flight) return { cx: 0, cy: 0, opacity: 0 } as any;
    const { x1, y1, x2, y2, mx, my } = flight;
    const u = t.value;
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return { cx: a * x1 + b * mx + c * x2, cy: a * y1 + b * my + c * y2, opacity: connected ? 1 : 0 } as any;
  });

  // «Муравьиная тропа» на дуге
  const dash = useSharedValue(0);
  useEffect(() => {
    if (connected) dash.value = withRepeat(withTiming(-48, { duration: 2400, easing: Easing.linear }), -1, false);
    else { cancelAnimation(dash); dash.value = 0; }
  }, [connected]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }) as any);

  // Кольца-пинги вокруг активного маркера
  const ping1 = useSharedValue(0);
  const ping2 = useSharedValue(0);
  useEffect(() => {
    if (connected) {
      const mk = (v: any, delay: number) => {
        v.value = 0;
        v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
      };
      mk(ping1, 0);
      mk(ping2, 800);
    } else { cancelAnimation(ping1); cancelAnimation(ping2); ping1.value = 0; ping2.value = 0; }
  }, [connected]);
  const ring1 = useAnimatedProps(() => ({
    r: interpolate(ping1.value, [0, 1], [4, 20]),
    opacity: interpolate(ping1.value, [0, 1], [0.8, 0]),
  }) as any);
  const ring2 = useAnimatedProps(() => ({
    r: interpolate(ping2.value, [0, 1], [4, 20]),
    opacity: interpolate(ping2.value, [0, 1], [0.8, 0]),
  }) as any);

  // Достопримечательность: живое фото (Wikimedia Commons, CC0/PD) с анимацией
  // появления; если фото нет — прежняя векторная прорисовка.
  const draw = useSharedValue(0);
  const lmKey = connected && active?.lm ? active.lm : null;
  useEffect(() => {
    if (lmKey) {
      draw.value = 0;
      draw.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    } else { cancelAnimation(draw); draw.value = 0; }
  }, [lmKey]);
  const lmProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - draw.value) * 900 }) as any);
  const lmPath = lmKey ? LANDMARKS[lmKey] : null;
  const lmPhoto = lmKey ? LANDMARK_PHOTOS[lmKey] : null;
  const lmPhotoStyle = useAnimatedStyle(() => ({
    opacity: draw.value,
    transform: [
      { scale: interpolate(draw.value, [0, 1], [0.82, 1]) },
      { translateY: interpolate(draw.value, [0, 1], [14, 0]) },
    ],
  }));

  // Маркеры стран должны читаться поверх тусклых точек суши (#4a3a6e) —
  // поэтому заметно светлее их и с плотным ореолом.
  const markerColor = light ? "#7c3aed" : "#d6c4ff";
  const markerHalo = light ? "rgba(124,45,214,0.22)" : "rgba(200,170,255,0.30)";

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.band} onLayout={onLayout}>
        <Animated.View style={[styles.cam, camStyle, { transformOrigin: "top left" } as any]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none">
            <Path d={dotsPath} fill={dotColor} />

            {/* декоративные орбитальные дуги (координаты в проекции карты) */}
            <G stroke={light ? "rgba(124,45,214,0.16)" : "rgba(168,85,247,0.16)"} strokeWidth={1} fill="none">
              <Path d="M604,76 Q449,30 294,118" />
              <Path d="M604,76 Q746,20 888,132" />
              <Path d="M524,91 Q409,60 294,118" />
              <Path d="M514,85 Q701,25 888,132" />
              <Path d="M500,88 Q540,110 580,117" />
            </G>

            {/* маркеры стран */}
            {markers.map((m) => {
              const isActive = active?.country === m.country;
              // зелёный — только при активном подключении; выбранная страна без
              // подключения подсвечивается акцентным фиолетовым
              const activeColor = connected ? colors.green : colors.accent;
              const activeHalo = connected ? "rgba(52,211,153,0.28)" : "rgba(168,85,247,0.35)";
              return (
                <G key={m.country}>
                  <Circle cx={m.x} cy={m.y} r={isActive ? 12 : 7.5} fill={isActive ? activeHalo : markerHalo} />
                  <Circle cx={m.x} cy={m.y} r={isActive ? 4.2 : 3.4} fill={isActive ? activeColor : markerColor} />
                </G>
              );
            })}

            {/* дуга перелёта + огонёк */}
            {connected && flight && (
              <G>
                <AnimatedPath d={flight.d} stroke={colors.accent} strokeWidth={1.8} fill="none" strokeDasharray="5 7" animatedProps={arcProps} />
                <AnimatedCircle r={3.4} fill="#fff" animatedProps={planeProps} />
              </G>
            )}

            {/* кольца-пинги на активном маркере */}
            {connected && active && (
              <G>
                <AnimatedCircle cx={active.x} cy={active.y} stroke={colors.green} strokeWidth={1.6} fill="none" animatedProps={ring1} />
                <AnimatedCircle cx={active.x} cy={active.y} stroke={colors.green} strokeWidth={1.6} fill="none" animatedProps={ring2} />
              </G>
            )}
          </Svg>
        </Animated.View>

        {/* достопримечательность — живое фото по центру ленты (фолбэк: вектор) */}
        {lmPhoto ? (
          <View style={styles.lmWrap} pointerEvents="none">
            <Animated.View style={lmPhotoStyle}>
              <View style={[styles.lmCard, { borderColor: light ? "rgba(124,45,214,0.55)" : "rgba(200,170,255,0.5)" }]}>
                <Image
                  source={lmPhoto}
                  style={styles.lmImg}
                  resizeMode="cover"
                />
              </View>
            </Animated.View>
          </View>
        ) : lmPath ? (
          <View style={styles.lmWrap} pointerEvents="none">
            <Svg width={116} height={116} viewBox="0 0 100 100">
              <AnimatedPath
                d={lmPath}
                stroke={light ? "#6d28d9" : "#d7b3ff"}
                strokeWidth={2.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={900}
                animatedProps={lmProps}
              />
            </Svg>
          </View>
        ) : null}
      </View>

      {/* подпись активной страны под картой */}
      {active && (
        <View style={styles.caption}>
          <Text style={[styles.capFlag]}>{active.flag}</Text>
          <Text style={[styles.capName, { color: light ? "#2e1a4d" : "#fff" }]}>{active.country}</Text>
          <Text style={[styles.capCity, { color: light ? "#6b5a86" : "#a294c4" }]}> · {active.city}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },
  band: { width: "100%", aspectRatio: MAP_W / MAP_H, overflow: "hidden" },
  cam: { width: "100%", height: "100%" },
  lmWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  lmCard: {
    width: LM_W, height: LM_H, borderRadius: 14, borderWidth: 2, padding: 2,
    backgroundColor: "#120c1c",
    shadowColor: "#a855f7", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  lmImg: { width: LM_W - 8, height: LM_H - 8, borderRadius: 11 },
  caption: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  capFlag: { fontSize: 18, marginRight: 6 },
  capName: { fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  capCity: { fontSize: 13, fontWeight: "600" },
});
