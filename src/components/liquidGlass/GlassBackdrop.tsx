import React, { createContext, useContext, useMemo } from "react";
import { Image as RNImage, View as RNView, useWindowDimensions, StyleSheet } from "react-native";
import {
  ImageFormat,
  PaintStyle,
  Skia,
  TileMode,
  vec,
  type SkImage,
} from "@shopify/react-native-skia";
import { useTheme, isLightPalette } from "../../theme";

/**
 * Контекст «фона-подложки» темы Liquid Glass.
 *
 * В Backdrop (Compose) это `rememberCanvasBackdrop` — ОДИН координатно-
 * независимый источник фона, который все стеклянные поверхности семплируют
 * со сдвигом на свою оконную позицию.
 *
 * Здесь фон рисуется императивно в offscreen SkSurface и раздаётся как SkImage:
 *  - одна отрисовка на всю тему вместо отдельного TextureView на карточку;
 *  - снимок не зависит от жизненного цикла канвасов навигации (раньше
 *    декларативный Canvas провайдера терял содержимое после force-stop, и
 *    фон темы исчезал, оставляя плоский colors.bg);
 *  - поверхность рисует этот SkImage через <Image> со сдвигом.
 *
 * Провайдер НЕ рисует видимый фон сам — его рисует GlassScreen тем же снимком
 * на весь экран, поэтому фон и карточки совпадают пиксель-в-пиксель.
 */
export interface GlassBackdropValue {
  /** Ширина/высота окна в dp. */
  width: number;
  height: number;
  light: boolean;
  /** Снимок фона. Его размеры = width/height * BG_SCALE (пиксели). */
  image: SkImage | null;
  /** Во сколько раз снимок крупнее dp. */
  scale: number;
  /** Тот же фон как data-URI PNG — для видимого слоя через обычный RN <Image>. */
  imageUri: string | null;
}

const GlassBackdropContext = createContext<GlassBackdropValue | null>(null);

export function useGlassBackdrop(): GlassBackdropValue | null {
  return useContext(GlassBackdropContext);
}

/**
 * Разрешение снимка фона относительно dp.
 *
 * 1× достаточно: снимок — размытый градиент, и он уходит в RN <Image> как
 * PNG data-URI (меньше размер строки и время декодирования). Карточки
 * рисуют SkImage в dp-прямоугольник — масштаб снимка на математику стекла
 * не влияет.
 */
export const BG_SCALE = 1;

/** Палитра фона. Стеклянные блоки преломляют ЦВЕТ и КРАЯ форм (линза гнёт
 *  пиксели у границы на refractionAmount≈32dp, vibrancy×1.5 усиливает цвет).
 *  Поэтому фон обязан быть НАСЫЩЕННЫМ и иметь ЧЁТКИЕ переходы цвета — иначе
 *  стеклу нечего преломлять и блоки выглядят плоскими (раньше sat фона была
 *  42/21 против 159 у обоев демо Backdrop — эффект почти не читался).
 *  Значения намеренно ярче colors.bg и брендово-фиолетовые.
 *
 *  hard — «жёсткие» формы поверх блобов: кольца и диагональные полосы с
 *  чёткой границей. Именно такие края линза заметно гнёт, а vibrancy
 *  подсвечивает — как на фотообоях демо-каталога Backdrop. */
function backgroundPalette(light: boolean) {
  if (light) {
    return {
      grad: ["#EFE4FD", "#E0D6F8", "#FBDFF1", "#D6E5FC"],
      blobs: [
        { c: "#7B1FE8", a: 0.55 },
        { c: "#1E6BF6", a: 0.45 },
        { c: "#E81E8A", a: 0.42 },
        { c: "#06A6D4", a: 0.4 },
        { c: "#A855F7", a: 0.5 },
      ],
      hard: [
        { fx: 0.78, fy: 0.1, fr: 0.3, t: 0.05, c: "#7B1FE8", a: 0.9 },
        { fx: 0.15, fy: 0.42, fr: 0.24, t: 0.045, c: "#1E6BF6", a: 0.85 },
        { fx: 0.88, fy: 0.74, fr: 0.2, t: 0.04, c: "#E81E8A", a: 0.8 },
      ],
      bands: [
        { ang: 25, off: 0.35, wdt: 0.045, c: "#06A6D4", a: 0.6 },
        { ang: -30, off: 0.72, wdt: 0.035, c: "#A855F7", a: 0.55 },
      ],
      dock: {
        blobs: [
          { c: "#E81E8A", a: 0.5 },
          { c: "#06A6D4", a: 0.45 },
          { c: "#7B1FE8", a: 0.5 },
        ],
        ring: { c: "#1E6BF6", a: 0.85 },
        band: { c: "#A855F7", a: 0.55 },
      },
    };
  }
  return {
    grad: ["#090616", "#150C2C", "#0A0616", "#04030C"],
    blobs: [
      { c: "#9333EA", a: 0.65 },
      { c: "#2563EB", a: 0.55 },
      { c: "#EC2E9A", a: 0.48 },
      { c: "#06B6D4", a: 0.42 },
      { c: "#A855F7", a: 0.6 },
    ],
    hard: [
      { fx: 0.78, fy: 0.1, fr: 0.3, t: 0.05, c: "#C084FC", a: 0.95 },
      { fx: 0.15, fy: 0.42, fr: 0.24, t: 0.045, c: "#60A5FA", a: 0.9 },
      { fx: 0.88, fy: 0.74, fr: 0.2, t: 0.04, c: "#F472B6", a: 0.88 },
    ],
    bands: [
      { ang: 25, off: 0.35, wdt: 0.045, c: "#22D3EE", a: 0.7 },
      { ang: -30, off: 0.72, wdt: 0.035, c: "#A78BFA", a: 0.65 },
    ],
    dock: {
      blobs: [
        { c: "#EC2E9A", a: 0.6 },
        { c: "#06B6D4", a: 0.55 },
        { c: "#9333EA", a: 0.6 },
      ],
      ring: { c: "#60A5FA", a: 0.9 },
      band: { c: "#A78BFA", a: 0.65 },
    },
  };
}

/** Позиции и радиусы блобов (доли от размера окна) — общие для обеих тем.
 *  Крупные, частично перекрывающиеся формы с краями у границ экрана — как
 *  обои демо: линзе есть что преломлять по периметру каждого блока. */
const BLOBS = [
  { fx: 0.8, fy: 0.04, fr: 0.52 },
  { fx: 0.08, fy: 0.36, fr: 0.46 },
  { fx: 1.04, fy: 0.74, fr: 0.44 },
  { fx: 0.16, fy: 0.06, fr: 0.38 },
  { fx: 0.44, fy: 0.7, fr: 0.36 },
] as const;

/** Стопы радиального градиента блоба: держим насыщенный цвет до `PLATEAU`,
 *  затем плавно гасим в ноль. Плато даёт ЧЁТКИЙ край формы (мягкий спад от
 *  центра к краю не создаёт границы, и линза её не преломляет). */
const BLOB_PLATEAU = 0.52;

/** Позиции/радиусы форм ПОД доком (доли от окна). Нижний край экрана —
 *  зона меню: без насыщенных форм за доком линзе панели нечего преломлять,
 *  и док выглядит плоским (замеры: sat полосы за доком был 24/17 против 178
 *  у демо-обоев). Крупный блоб по центру нижнего края + два по углам,
 *  кольцо и полоса — их края проходят прямо за капсулой меню. */
const DOCK_BLOBS = [
  { fx: 0.5, fy: 0.99, fr: 0.4 },
  { fx: 0.05, fy: 0.92, fr: 0.3 },
  { fx: 0.98, fy: 0.9, fr: 0.28 },
] as const;
const DOCK_RING = { fx: 0.32, fy: 0.95, fr: 0.16, t: 0.035 } as const;
const DOCK_BAND = { ang: -12, off: 0.9, wdt: 0.04 } as const;

/** #RRGGBB + alpha(0..1) → #RRGGBBAA (Skia.Color понимает CSS-строки). */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/**
 * Рисует фон темы в offscreen-поверхность и возвращает снимок.
 * Императивно, вне React-дерева: результат не теряется при перезапуске
 * навигации/приложения.
 */
export function renderBackground(
  width: number,
  height: number,
  light: boolean,
  scale = BG_SCALE
): SkImage | null {
  if (width <= 0 || height <= 0) return null;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const surface = Skia.Surface.Make(w, h);
  if (!surface) {
    console.warn("[liquidGlass] Surface.Make вернул null — фон темы не отрисован");
    return null;
  }
  const canvas = surface.getCanvas();
  const p = backgroundPalette(light);

  // 1. Диагональный линейный градиент на всю площадь.
  const gradPaint = Skia.Paint();
  gradPaint.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(0, 0),
      vec(w, h),
      p.grad.map((c) => Skia.Color(c)),
      null,
      TileMode.Clamp
    )
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), gradPaint);

  // 2. Радиальные блобы: насыщенный цвет держится до BLOB_PLATEAU, затем
  //    плавно гаснет в тот же цвет с alpha 0. Плато создаёт различимый край
  //    формы — стекло преломляет именно границу цвета (в отличие от прежнего
  //    линейного спада от центра, который давал лишь едва заметное пятно).
  for (let i = 0; i < BLOBS.length; i++) {
    const b = BLOBS[i];
    const col = p.blobs[i];
    const cx = b.fx * w;
    const cy = b.fy * h;
    const r = b.fr * Math.min(w, h);
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeRadialGradient(
        vec(cx, cy),
        r,
        [
          Skia.Color(withAlpha(col.c, col.a)),
          Skia.Color(withAlpha(col.c, col.a)),
          Skia.Color(withAlpha(col.c, 0)),
        ],
        [0, BLOB_PLATEAU, 1],
        TileMode.Clamp
      )
    );
    canvas.drawCircle(cx, cy, r, paint);
  }

  // 3. «Жёсткие» кольца: штриховая окружность с чёткой внутренней и внешней
  //    границей. Линза заметно гнёт пиксели именно на таких краях — стекло
  //    читается на любой подложке (мягкие блобы сами по себе почти не
  //    преломляются: у них нет границы).
  const minWH = Math.min(w, h);
  for (let i = 0; i < p.hard.length; i++) {
    const ring = p.hard[i];
    const paint = Skia.Paint();
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(ring.t * minWH * 2);
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(withAlpha(ring.c, ring.a)));
    canvas.drawCircle(ring.fx * w, ring.fy * h, ring.fr * minWH, paint);
  }

  // 4. Диагональные полосы: линейный градиент с двумя резкими стопами
  //    (прозрачный → цвет → прозрачный) вдоль нормали полосы. Те же чёткие
  //    края, что и у колец, но другой ориентации — стекло преломляет их при
  //    любом положении блока.
  const maxWH = Math.max(w, h);
  for (let i = 0; i < p.bands.length; i++) {
    const band = p.bands[i];
    const rad = (band.ang * Math.PI) / 180;
    const nx = Math.cos(rad);
    const ny = Math.sin(rad);
    const c0 = band.off * maxWH - (band.wdt * maxWH) / 2;
    const c1 = band.off * maxWH + (band.wdt * maxWH) / 2;
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(c0 * nx, c0 * ny),
        vec(c1 * nx, c1 * ny),
        [
          Skia.Color(withAlpha(band.c, 0)),
          Skia.Color(withAlpha(band.c, band.a)),
          Skia.Color(withAlpha(band.c, band.a)),
          Skia.Color(withAlpha(band.c, 0)),
        ],
        [0, 0.15, 0.85, 1],
        TileMode.Clamp
      )
    );
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  }

  // 5. Формы ПОД доком: те же приёмы (плато-блобы, кольцо, полоса), но в
  //    нижней зоне экрана — прямо за капсулой меню. Без них линза дока
  //    преломляет плоский градиент и панель выглядит мёртвой.
  for (let i = 0; i < DOCK_BLOBS.length; i++) {
    const b = DOCK_BLOBS[i];
    const col = p.dock.blobs[i];
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeRadialGradient(
        vec(b.fx * w, b.fy * h),
        b.fr * minWH,
        [
          Skia.Color(withAlpha(col.c, col.a)),
          Skia.Color(withAlpha(col.c, col.a)),
          Skia.Color(withAlpha(col.c, 0)),
        ],
        [0, BLOB_PLATEAU, 1],
        TileMode.Clamp
      )
    );
    canvas.drawCircle(b.fx * w, b.fy * h, b.fr * minWH, paint);
  }
  {
    const ring = p.dock.ring;
    const paint = Skia.Paint();
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(DOCK_RING.t * minWH * 2);
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(withAlpha(ring.c, ring.a)));
    canvas.drawCircle(DOCK_RING.fx * w, DOCK_RING.fy * h, DOCK_RING.fr * minWH, paint);
  }
  {
    const band = p.dock.band;
    const rad = (DOCK_BAND.ang * Math.PI) / 180;
    const nx = Math.cos(rad);
    const ny = Math.sin(rad);
    const c0 = DOCK_BAND.off * maxWH - (DOCK_BAND.wdt * maxWH) / 2;
    const c1 = DOCK_BAND.off * maxWH + (DOCK_BAND.wdt * maxWH) / 2;
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(c0 * nx, c0 * ny),
        vec(c1 * nx, c1 * ny),
        [
          Skia.Color(withAlpha(band.c, 0)),
          Skia.Color(withAlpha(band.c, band.a)),
          Skia.Color(withAlpha(band.c, band.a)),
          Skia.Color(withAlpha(band.c, 0)),
        ],
        [0, 0.15, 0.85, 1],
        TileMode.Clamp
      )
    );
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  }

  // ВАЖНО: makeImageSnapshot() у GPU-поверхности возвращает texture-backed
  // изображение, привязанное к GL-контексту текущего потока (JS). Карточки
  // рисуют его из onscreen-канваса UI-потока с ДРУГИМ контекстом — чужая
  // текстура композитится чёрным (см. Shopify/react-native-skia#3092).
  // makeNonTextureImage() копирует пиксели на CPU — такое изображение можно
  // безопасно рисовать из любого потока/контекста.
  const shot = surface.makeImageSnapshot();
  const raster = shot?.makeNonTextureImage() ?? null;
  surface.dispose();
  return raster;
}

/** Последний валидный снимок фона. `useWindowDimensions` при сворачивании/
 *  разворачивании приложения и поворотах может на мгновение выдать 0×0 —
 *  тогда фон пересчитался бы в null и ВСЕ стеклянные поверхности потеряли бы
 *  подложку (рамки «пропадают»). Держим прежний снимок, пока не получим новый. */
let lastGoodBackdrop: { w: number; h: number; light: boolean; image: SkImage } | null = null;

/** Провайдер фона Liquid Glass: держит один снимок фона для всех поверхностей. */
export function GlassBackdropProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  const light = isLightPalette();
  const dims = useWindowDimensions();

  const image = useMemo(() => {
    const w = dims.width;
    const h = dims.height;
    if (w > 0 && h > 0) {
      const fresh = renderBackground(w, h, light);
      if (fresh) {
        lastGoodBackdrop = { w, h, light, image: fresh };
        return fresh;
      }
    }
    // Нулевые/невалидные размеры или сбой отрисовки — reuse последнего снимка.
    return lastGoodBackdrop?.image ?? null;
  }, [dims.width, dims.height, light]);

  // Видимый слой фона — обычный RN <Image> из PNG data-URI, а НЕ Skia <Canvas>:
  // TextureView Skia теряет содержимое после ухода приложения в фон/force-stop,
  // и экран оставался плоским colors.bg — стеклянным карточкам тогда нечего
  // преломлять, и они выглядят прозрачными/чёрными. RN <Image> композитится
  // обычным слоём и не зависит от жизненного цикла Skia-поверхности.
  // Размеры, соответствующие снимку: если в этом кадре dimensions нулевые и мы
  // берём предыдущий снимок, размеры тоже берём прежние — иначе поверхности
  // получат сдвиг фона по 0×0 и стекло «поплывёт»/исчезнет на один кадр.
  const effW = dims.width > 0 ? dims.width : lastGoodBackdrop?.w ?? 0;
  const effH = dims.height > 0 ? dims.height : lastGoodBackdrop?.h ?? 0;

  const imageUri = useMemo(() => {
    if (!image) return null;
    return `data:image/png;base64,${image.encodeToBase64(ImageFormat.PNG)}`;
  }, [image]);

  const value = useMemo<GlassBackdropValue>(
    () => ({ width: effW, height: effH, light, image, scale: BG_SCALE, imageUri }),
    [effW, effH, light, image, imageUri]
  );

  return (
    <GlassBackdropContext.Provider value={value}>
      <RNView pointerEvents="none" style={styles.backdropHost}>
        {imageUri ? (
          <RNImage
            source={{ uri: imageUri }}
            style={styles.backdropImage}
            resizeMode="stretch"
            fadeDuration={0}
          />
        ) : null}
      </RNView>
      {children}
    </GlassBackdropContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdropHost: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden" },
  backdropImage: { flex: 1, width: "100%", height: "100%" },
});
