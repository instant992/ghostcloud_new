import React, { createContext, useContext, useMemo } from "react";
import { View as RNView, useWindowDimensions, StyleSheet } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors, isLightPalette, useTheme } from "../../theme";

/**
 * Контекст и фон темы Liquid Glass.
 *
 * Фон НЕ плоский: стеклу AGSL нужно что-то преломлять — на однотонной
 * заливке блоки выглядят плоскими и «как будто без liquid». Здесь рисуется
 * мягкий диагональный градиент в тонах стандартной темы + фирменные блобы с
 * чётким краем (радиальный градиент с «плато») + жёсткие кольца и полосы.
 * Именно края форм линза заметно гнёт, а vibrancy подсвечивает — как в демо
 * Backdrop и в прежней Skia-версии темы.
 *
 * Skia-рендер удалён вместе со Skia-движком (теперь react-native-svg,
 * статичная картинка без анимации — JS/UI-поток не нагружает); фотообои
 * liquid_bg убраны по запросу пользователя (на их светящихся блобах
 * терялись фиолетовый акцент и серый текст). Палитра ниже спокойнее прежней
 * Skia-версии: насыщенные формы — в углах и по краям, центр экрана ровный,
 * чтобы текст на стекле читался в обоих режимах.
 *
 * Контекст оставлен как маркер «мы внутри темы glass»: useScreenBgColor и
 * ThemedCard проверяют его, чтобы делать экраны/карточки прозрачными — иначе
 * непрозрачный colors.bg экрана перекрыл бы фон провайдера и стеклу было бы
 * нечего преломлять.
 *
 * ВАЖНО про react-native-svg: альфа внутри rgba() в stopColor ИГНОРИРУЕТСЯ
 * (тот же баг описан в AnnouncementsArea). Поэтому цвет везде передаётся
 * чистым hex, а прозрачность — отдельными stopOpacity/strokeOpacity.
 */
export interface GlassBackdropValue {
  /** Ширина/высота окна в dp. */
  width: number;
  height: number;
  /** Светлая ли вариация палитры (для стеклянных эффектов). */
  light: boolean;
}

const GlassBackdropContext = createContext<GlassBackdropValue | null>(null);

export function useGlassBackdrop(): GlassBackdropValue | null {
  return useContext(GlassBackdropContext);
}

/** Палитра фона. Базовый градиент — цвета стандартной темы (bg/bgSoft);
 *  блобы/кольца/полосы — фирменный фиолетовый и соседние оттенки, спокойной
 *  насыщенности: фон заметен для линзы, но текст на нём читается. Альфа
 *  хранится отдельным полем и уходит в stopOpacity/strokeOpacity. */
function backgroundPalette(light: boolean) {
  if (light) {
    return {
      grad: ["#F4F2FA", "#EDE8F8", "#F6ECF7", "#E8E6F5"] as const,
      blobs: [
        { c: "#7C3AED", a: 0.26 },
        { c: "#2563EB", a: 0.2 },
        { c: "#DB2777", a: 0.16 },
        { c: "#0891B2", a: 0.14 },
        { c: "#A855F7", a: 0.22 },
      ],
      rings: [
        { fx: 0.78, fy: 0.1, fr: 0.3, t: 0.03, c: "#7C3AED", a: 0.3 },
        { fx: 0.15, fy: 0.42, fr: 0.24, t: 0.026, c: "#2563EB", a: 0.26 },
        { fx: 0.88, fy: 0.74, fr: 0.2, t: 0.024, c: "#DB2777", a: 0.22 },
      ],
      bands: [
        { c: "#0891B2", a: 0.16, w: 0.045 },
        { c: "#A78BFA", a: 0.14, w: 0.035 },
      ],
    };
  }
  return {
    grad: ["#0F0B1E", "#160F2B", "#120C24", "#0B0818"] as const,
    blobs: [
      { c: "#9333EA", a: 0.36 },
      { c: "#2563EB", a: 0.28 },
      { c: "#EC2E9A", a: 0.22 },
      { c: "#06B6D4", a: 0.2 },
      { c: "#A855F7", a: 0.32 },
    ],
    rings: [
      { fx: 0.78, fy: 0.1, fr: 0.3, t: 0.03, c: "#C084FC", a: 0.34 },
      { fx: 0.15, fy: 0.42, fr: 0.24, t: 0.026, c: "#60A5FA", a: 0.3 },
      { fx: 0.88, fy: 0.74, fr: 0.2, t: 0.024, c: "#F472B6", a: 0.26 },
    ],
    bands: [
      { c: "#22D3EE", a: 0.2, w: 0.045 },
      { c: "#A78BFA", a: 0.18, w: 0.035 },
    ],
  };
}

/** Позиции и радиусы блобов (доли от размера окна) — общие для обеих тем.
 *  Крупные, частично перекрывающиеся формы с краями у границ экрана — как в
 *  прежней Skia-версии: линзе есть что преломлять по периметру каждого блока. */
const BLOBS = [
  { fx: 0.8, fy: 0.04, fr: 0.52 },
  { fx: 0.08, fy: 0.36, fr: 0.46 },
  { fx: 1.04, fy: 0.74, fr: 0.44 },
  { fx: 0.16, fy: 0.06, fr: 0.38 },
  { fx: 0.44, fy: 0.7, fr: 0.36 },
] as const;

/** Стоп «плато» радиального градиента блоба: насыщенный цвет держится до
 *  PLATEAU, затем гаснет в ноль. Плато даёт ЧЁТКИЙ край формы — мягкий спад
 *  от центра границы не создаёт, и линза его не преломляет. */
const BLOB_PLATEAU = 0.52;

/** Фон темы: SVG-градиент + блобы + кольца + полосы. Рисуется один раз на
 *  размер окна, без анимации — статичная картинка не нагружает JS/UI-поток.
 *
 * Экспортирован: стеклянные ВКЛАДКИ (Главная/Подписка/Профиль) дублируют его
 * у себя под контентом. Зачем: AGSL-захват бэкдропа исключает ВСЕ стеклянные
 * вью, но НЕ исключает контент соседних вкладок (во время перехода он ещё
 * примонтирован) — стекло успевало «впечатать» текст прошлой вкладки и
 * залипал призрак. С собственным непрозрачным фоном каждой вкладки захват
 * всегда видит только свой экран. Слои идентичны провайдерскому и лежат
 * пиксель-в-пиксель, поэтому визуально фон не меняется. */
export function BackdropSvg({ width, height, light }: { width: number; height: number; light: boolean }) {
  const p = backgroundPalette(light);
  const minWH = Math.min(width, height);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bgGrad" x1="0" y1="0" x2={String(width)} y2={String(height)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={p.grad[0]} />
          <Stop offset="0.38" stopColor={p.grad[1]} />
          <Stop offset="0.72" stopColor={p.grad[2]} />
          <Stop offset="1" stopColor={p.grad[3]} />
        </LinearGradient>
        {BLOBS.map((b, i) => {
          const col = p.blobs[i];
          return (
            <RadialGradient
              key={`g${i}`}
              id={`blob${i}`}
              cx={b.fx * width}
              cy={b.fy * height}
              rx={b.fr * minWH}
              ry={b.fr * minWH}
              gradientUnits="userSpaceOnUse"
            >
              {/* Альфа — через stopOpacity (rgba() в stopColor игнорируется). */}
              <Stop offset="0" stopColor={col.c} stopOpacity={col.a} />
              <Stop offset={BLOB_PLATEAU} stopColor={col.c} stopOpacity={col.a} />
              <Stop offset="1" stopColor={col.c} stopOpacity={0} />
            </RadialGradient>
          );
        })}
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#bgGrad)" />
      {BLOBS.map((b, i) => (
        <Circle
          key={`b${i}`}
          cx={b.fx * width}
          cy={b.fy * height}
          r={b.fr * minWH}
          fill={`url(#blob${i})`}
        />
      ))}
      {p.rings.map((ring, i) => (
        <Circle
          key={`r${i}`}
          cx={ring.fx * width}
          cy={ring.fy * height}
          r={ring.fr * minWH}
          fill="none"
          stroke={ring.c}
          strokeOpacity={ring.a}
          strokeWidth={ring.t * minWH * 2}
        />
      ))}
      {/* Диагональные полосы (Line + толстый stroke): ещё одна система рёбер
          для линзы при любом положении блока. Прозрачность — strokeOpacity. */}
      <Line
        x1={-height * 0.35}
        y1={height}
        x2={width}
        y2={-height * 0.1}
        stroke={p.bands[0].c}
        strokeOpacity={p.bands[0].a}
        strokeWidth={p.bands[0].w * minWH}
      />
      <Line
        x1={-height * 0.1}
        y1={0}
        x2={width * 1.1}
        y2={height * 0.82}
        stroke={p.bands[1].c}
        strokeOpacity={p.bands[1].a}
        strokeWidth={p.bands[1].w * minWH}
      />
    </Svg>
  );
}

/** Провайдер фона Liquid Glass: SVG-фон темы + маркер контекста. */
export function GlassBackdropProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  const dims = useWindowDimensions();
  const light = isLightPalette();

  const value = useMemo<GlassBackdropValue>(
    () => ({ width: dims.width, height: dims.height, light }),
    [dims.width, dims.height, light]
  );

  return (
    <GlassBackdropContext.Provider value={value}>
      <GlassScreenBackdrop />
      {children}
    </GlassBackdropContext.Provider>
  );
}

/** Фон темы отдельным слоем. Провайдер рисует его один раз под всем стеком;
 *  стеклянные ВКЛАДКИ добавляют свой экземпляр (см. примечание BackdropSvg) —
 *  тогда AGSL-захват бэкдропа не «впечатывает» контент соседней вкладки
 *  при переходах (призрачный текст Профиля под стеклом Подписки). */
export function GlassScreenBackdrop() {
  useTheme();
  const dims = useWindowDimensions();
  const light = isLightPalette();
  return (
    <RNView pointerEvents="none" style={[styles.backdropHost, { backgroundColor: colors.bg }]}>
      {dims.width > 0 && dims.height > 0 ? (
        <BackdropSvg width={dims.width} height={dims.height} light={light} />
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  backdropHost: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden" },
});
