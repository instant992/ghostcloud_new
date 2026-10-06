/**
 * Императивная сборка цепочки эффектов «жидкого стекла» для RN Skia.
 *
 * Порт конвейера из Backdrop (Kyant0/AndroidLiquidGlass, Apache-2.0):
 * порядок эффектов строго `color filter ⇒ blur ⇒ lens`
 * (см. kyant.gitbook.io/backdrop/api/backdrop-effects). В терминах
 * SkImageFilters.Compose(outer, inner) это значит:
 *   chain = Compose(lens, Compose(blur, vibrancy))
 * где vibrancy — самый внутренний (применяется к исходнику первым),
 * lens — самый внешний.
 *
 * Декларативный <Paint> не даёт задать vibrancy ВНУТРЕННИМ (color filter
 * у Skia применяется последним), поэтому цепочка собирается императивно.
 */
import {
  Skia,
  TileMode,
  type SkImageFilter,
  type SkRuntimeEffect,
  type SkRuntimeShaderBuilder,
} from "@shopify/react-native-skia";
import { REFRACTION_SHADER, REFRACTION_DISPERSION_SHADER } from "./shaders";

/** Матрица насыщенности (Android ColorMatrix.setSaturation). sat=1 → identity,
 *  sat=1.5 → vibrancy() из Backdrop. */
export function saturationMatrix(sat: number): number[] {
  const R = 0.213,
    G = 0.715,
    B = 0.072;
  const t = 1 - sat;
  return [
    R * t + sat, G * t, B * t, 0, 0,
    R * t, G * t + sat, B * t, 0, 0,
    R * t, G * t, B * t + sat, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

let refractionEffect: SkRuntimeEffect | null | undefined;
let dispersionEffect: SkRuntimeEffect | null | undefined;

function getRefractionEffect(): SkRuntimeEffect | null {
  if (refractionEffect === undefined) {
    refractionEffect = Skia.RuntimeEffect.Make(REFRACTION_SHADER);
    if (!refractionEffect) console.warn("[liquidGlass] REFRACTION_SHADER не скомпилировался");
  }
  return refractionEffect;
}
function getDispersionEffect(): SkRuntimeEffect | null {
  if (dispersionEffect === undefined) {
    dispersionEffect = Skia.RuntimeEffect.Make(REFRACTION_DISPERSION_SHADER);
    if (!dispersionEffect) console.warn("[liquidGlass] DISPERSION_SHADER не скомпилировался");
  }
  return dispersionEffect;
}

/** Есть ли поддержка runtime-шейдеров (линзы). На очень старых Skia-сборках
 *  может не быть — тогда поверхность откатится к blur+vibrancy без рефракции. */
export function isLensSupported(): boolean {
  return getRefractionEffect() != null;
}

export interface LensParams {
  /** Ширина/высота поверхности в dp (без учёта pad). */
  width: number;
  height: number;
  /** Радиусы углов [topLeft, topRight, bottomRight, bottomLeft] в dp. */
  cornerRadii: [number, number, number, number];
  /** Высота рефракции (dp) — насколько далеко от края гнётся свет. */
  refractionHeight: number;
  /** Сила преломления (dp). */
  refractionAmount: number;
  /** Объёмный эффект (линза тянет к центру). */
  depthEffect?: boolean;
  /** Хроматическая аберрация: true = 1.0, либо непрерывная сила 0..N
   *  (шейдер принимает float — Glass Playground регулирует её ползунком). */
  chromaticAberration?: boolean | number;
  /** Отступ канвы (dp) — шейдер использует его как offset. */
  padding?: number;
}

/** Собирает полную цепочку vibrancy → blur → lens как один SkImageFilter.
 *  Возвращает null, если нечего применять (все параметры нулевые). */
export function buildGlassFilter(
  opts: {
    /** Насыщенность (vibrancy=1.5). 1/undefined = без color filter. */
    saturation?: number;
    /** Сигма гауссова блюра в dp. 0/undefined = без блюра. */
    blur?: number;
    lens?: LensParams | null;
  }
): SkImageFilter | null {
  let filter: SkImageFilter | null = null;

  // 1) vibrancy (color filter) — самый внутренний
  const sat = opts.saturation;
  if (sat != null && Math.abs(sat - 1) > 1e-3) {
    const cf = Skia.ColorFilter.MakeMatrix(saturationMatrix(sat));
    filter = Skia.ImageFilter.MakeColorFilter(cf, filter);
  }

  // 2) blur
  const blur = opts.blur ?? 0;
  if (blur > 0) {
    filter = Skia.ImageFilter.MakeBlur(blur, blur, TileMode.Clamp, filter);
  }

  // 3) lens (runtime shader) — самый внешний
  const lens = opts.lens;
  if (lens && lens.refractionHeight > 0 && lens.refractionAmount > 0) {
    // Аберрация — непрерывная сила (float-униформ шейдера), а не флаг.
    const aberration =
      typeof lens.chromaticAberration === "number"
        ? lens.chromaticAberration
        : lens.chromaticAberration
          ? 1
          : 0;
    const useDispersion = aberration > 0 && getDispersionEffect() != null;
    const effect = useDispersion ? getDispersionEffect() : getRefractionEffect();
    if (effect) {
      const builder: SkRuntimeShaderBuilder = Skia.RuntimeShaderBuilder(effect);
      const pad = lens.padding ?? 0;
      builder.setUniform("size", [lens.width, lens.height]);
      builder.setUniform("offset", [-pad, -pad]);
      builder.setUniform("cornerRadii", lens.cornerRadii);
      builder.setUniform("refractionHeight", [lens.refractionHeight]);
      // В Backdrop refractionAmount передаётся со знаком минус (Lens.kt:
      // setFloatUniform("refractionAmount", -refractionAmount)).
      builder.setUniform("refractionAmount", [-lens.refractionAmount]);
      builder.setUniform("depthEffect", [lens.depthEffect ? 1 : 0]);
      if (useDispersion) builder.setUniform("chromaticAberration", [aberration]);
      // Имя child-шейдера ОБЯЗАНО совпадать с объявлением в SkSL (`uniform shader
      // content`) — Backdrop делает то же: RuntimeShaderEffect(shader, "content").
      // Пустая строка НЕ означает «единственный child»: Skia ищет child с именем ""
      // и оставляет `content` несвязанным → eval() возвращает чёрный.
      filter = Skia.ImageFilter.MakeRuntimeShader(builder, "content", filter);
    }
  }

  return filter;
}

/** Пресеты эффектов — соответствуют компонентам каталога Backdrop. */
export interface GlassPreset {
  saturation: number;
  blur: number;
  refractionHeight: number;
  refractionAmount: number;
  depthEffect?: boolean;
  chromaticAberration?: boolean;
}

export const GLASS_PRESETS: Record<string, GlassPreset> = {
  /** Блок списка из ScrollContainerContent: RoundedRectangle(32dp),
   *  `vibrancy()` + `lens(16dp, 32dp)` — БЕЗ blur и БЕЗ подложки.
   *  Это канонический «блок» каталога: чистое стекло, край читается
   *  только бликом (Highlight.Default) и тенью (Shadow.Default). */
  scroll: { saturation: 1.5, blur: 0, refractionHeight: 16, refractionAmount: 32, depthEffect: false },
  /** Карточка/крупная поверхность (Glass Bottom Sheet из туториала). */
  card: { saturation: 1.5, blur: 4, refractionHeight: 24, refractionAmount: 48, depthEffect: true },
  /** Кнопка (LiquidButton: blur 2, lens 12/24). */
  button: { saturation: 1.5, blur: 2, refractionHeight: 12, refractionAmount: 24, depthEffect: false },
  /** Панель нижнего таб-бара (LiquidBottomTabs: blur 8, lens 24/24). */
  tabBar: { saturation: 1.5, blur: 8, refractionHeight: 24, refractionAmount: 24, depthEffect: false },
  /** Мелкий значок (blur 4, lens 16/32). */
  icon: { saturation: 1.5, blur: 4, refractionHeight: 16, refractionAmount: 32, depthEffect: false },
  /** Индикатор активной вкладки: в каталоге `lens(10dp·progress, 14dp·progress,
   *  chromaticAberration = true)` — стекло с дисперсией появляется при нажатии. */
  tabIndicator: { saturation: 1.5, blur: 0, refractionHeight: 10, refractionAmount: 14, chromaticAberration: true },
  /** Тумблер/слайдер-ручка (blur 8 → lens 5/10 с дисперсией при нажатии). */
  knob: { saturation: 1.5, blur: 8, refractionHeight: 5, refractionAmount: 10, chromaticAberration: true },
  /** Ручка LiquidSlider: `blur(8dp·(1-progress))` + `lens(10dp·p, 14dp·p, dispersion)`. */
  sliderKnob: { saturation: 1.5, blur: 8, refractionHeight: 10, refractionAmount: 14, chromaticAberration: true },
};

export type GlassPresetName =
  | "scroll"
  | "card"
  | "button"
  | "tabBar"
  | "icon"
  | "tabIndicator"
  | "knob"
  | "sliderKnob";
