import React, { createContext, useContext, useMemo } from "react";
import { Image as RNImage, View as RNView, useWindowDimensions, StyleSheet } from "react-native";
import {
  ImageFormat,
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

/** Палитра фона. Намеренно контрастнее colors.bg: стеклу нужен неоднородный
 *  фон, иначе рефракция и блюр нечего преломлять и карточки сливаются с
 *  плоским фоном. */
function backgroundPalette(light: boolean) {
  if (light) {
    return {
      grad: ["#F6EFFD", "#D9CEEE", "#F0E6FB", "#C9BCE4"],
      blobs: [
        { c: "#8B45D6", a: 0.5 },
        { c: "#3B82F6", a: 0.42 },
        { c: "#EC4899", a: 0.38 },
        { c: "#06B6D4", a: 0.35 },
        { c: "#7C3AED", a: 0.4 },
      ],
    };
  }
  return {
    grad: ["#0B0B14", "#171227", "#0D0A18", "#06060F"],
    blobs: [
      { c: "#7B2FBE", a: 0.42 },
      { c: "#3B82F6", a: 0.32 },
      { c: "#EC4899", a: 0.28 },
      { c: "#06B6D4", a: 0.26 },
      { c: "#8B5CF6", a: 0.3 },
    ],
  };
}

/** Позиции и радиусы блобов (доли от размера окна) — общие для обеих тем. */
const BLOBS = [
  { fx: 0.78, fy: 0.06, fr: 0.46 },
  { fx: 0.12, fy: 0.38, fr: 0.42 },
  { fx: 1.02, fy: 0.78, fr: 0.38 },
  { fx: 0.18, fy: 0.09, fr: 0.34 },
  { fx: 0.42, fy: 0.68, fr: 0.3 },
] as const;

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

  // 2. Радиальные блобы: цвет → тот же цвет с alpha 0 (второй стоп прозрачный,
  //    Skia интерполирует и альфу).
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
        [Skia.Color(withAlpha(col.c, col.a)), Skia.Color(withAlpha(col.c, 0))],
        null,
        TileMode.Clamp
      )
    );
    canvas.drawCircle(cx, cy, r, paint);
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
