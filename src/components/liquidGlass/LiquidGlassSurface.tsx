import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as RNImage, PixelRatio, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import {
  BlendMode,
  BlurStyle,
  ClipOp,
  ImageFormat,
  PaintStyle,
  Skia,
  rrect,
  rect,
} from "@shopify/react-native-skia";
import { buildGlassFilter, GLASS_PRESETS, type GlassPresetName, type LensParams } from "./effects";
import { HIGHLIGHT_SHADER, AMBIENT_HIGHLIGHT_SHADER } from "./shaders";
import { useGlassBackdrop } from "./GlassBackdrop";
import { isLightPalette } from "../../theme";

/**
 * Стеклянная поверхность Liquid Glass — RN Skia порт `Modifier.drawBackdrop`
 * (Kyant0/AndroidLiquidGlass, Apache-2.0).
 *
 * Конвейер 1:1 с Backdrop:
 *   1. backdrop — срез фона темы со сдвигом на свою оконную позицию;
 *   2. effects — цепочка `vibrancy ⇒ blur ⇒ lens` одним SkImageFilter на слое;
 *   3. onDrawSurface — полупрозрачная подложка (containerColor);
 *   4. highlight — размытый штрих по контуру с угловым шейдером, blend Plus;
 *   5. shadow — внешняя тень (even-odd кольцо под стеклом).
 *
 * РЕНДЕР: всё стекло рисуется ИМПЕРАТИВНО в offscreen SkSurface и показывается
 * обычным RN <Image> (PNG data-URI) — никаких onscreen Skia <Canvas>.
 * Причина: onscreen TextureView-канвас в этом Fabric-сетапе композитится
 * непрозрачным чёрным прямоугольником (все карточки чернели), тогда как
 * offscreen-путь (Surface.Make → encodeToBase64 → RN <Image>) работает —
 * так уже рисуется фон темы. Стеклянная карточка статична: снимок
 * пересчитывается только при изменении размеров/позиции/темы.
 */

export interface LiquidGlassSurfaceProps {
  /** Радиус скругления (dp), все 4 угла — как RoundedCornerShape. */
  radius?: number;
  /** Пресет эффектов (card/button/tabBar/icon/knob). */
  preset?: GlassPresetName;
  /** Переопределение линзы; null = без линзы. */
  lens?: Partial<LensParams> | null;
  blur?: number;
  saturation?: number;
  /** Подложка поверх эффектов (containerColor). null = без подложки. */
  surfaceColor?: string | null;
  /** Обводка поверх стекла (заменяет RN border — тот оказался бы под канвой). */
  borderColor?: string | null;
  borderWidth?: number;
  /** Внешняя тень. false = без тени. */
  shadow?: boolean | { radius?: number; dy?: number; color?: string; alpha?: number };
  /** Хайлайт по контуру; false = без хайлайта. */
  highlight?:
    | false
    | {
        width?: number;
        blur?: number;
        alpha?: number;
        color?: string;
        angle?: number; // градусы (дефолт Backdrop 45°)
        falloff?: number;
        ambient?: boolean; // Ambient-стиль (белый по нормали)
      };
  /** Запас вокруг поверхности (dp) для блюра/линзы. */
  padding?: number;
  /** Автономный режим: НЕ семплировать фон провайдера (шторки в RN-модалках —
   *  отдельное окно, координаты фона не совпадают). Стеклянная панель рисуется
   *  как полупрозрачная подложка + хайлайт + обводка поверх затемнённого скрима. */
  standalone?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Если задан — поверхность кликабельна (Pressable), как GlassCard onPress. */
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function LiquidGlassSurface({
  radius = 20,
  preset = "card",
  lens: lensOverride,
  blur: blurOverride,
  saturation: saturationOverride,
  surfaceColor,
  borderColor,
  borderWidth = 1,
  shadow = true,
  highlight,
  padding: paddingOverride,
  standalone = false,
  children,
  style,
  onPress,
  accessibilityLabel,
}: LiquidGlassSurfaceProps) {
  const backdrop = useGlassBackdrop();
  const light = isLightPalette();

  const presetCfg = GLASS_PRESETS[preset] ?? GLASS_PRESETS.card;
  const blur = blurOverride ?? presetCfg.blur;
  const saturation = saturationOverride ?? presetCfg.saturation;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [win, setWin] = useState({ x: 0, y: 0 });
  const hostRef = useRef<View>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize((p) => (Math.abs(p.w - width) > 0.5 || Math.abs(p.h - height) > 0.5 ? { w: width, h: height } : p));
    }
  }, []);

  // Оконная позиция нужна для сдвига фона (координатно-независимый backdrop).
  // Повторный замер через 400 мс — страховка для модалок со slide-анимацией:
  // первый замер может попасть на середину въезда.
  useEffect(() => {
    const v = hostRef.current;
    if (!v || size.w <= 0) return;
    const measure = () => {
      v.measureInWindow((x, y) => {
        setWin((p) => (Math.abs(p.x - x) > 0.5 || Math.abs(p.y - y) > 0.5 ? { x, y } : p));
      });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const late = setTimeout(measure, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, [size.w, size.h]);

  // Эффективная высота рефракции известна до линзы — по ней считаем запас канвы.
  const effRefractionHeight =
    lensOverride === null ? 0 : (lensOverride?.refractionHeight ?? presetCfg.refractionHeight);
  const pad = paddingOverride ?? Math.max(blur, effRefractionHeight) + 2;

  const lens: LensParams | null = useMemo(() => {
    if (lensOverride === null) return null;
    if (size.w <= 0 || size.h <= 0) return null;
    const base: LensParams = {
      width: size.w,
      height: size.h,
      cornerRadii: [radius, radius, radius, radius],
      refractionHeight: presetCfg.refractionHeight,
      refractionAmount: presetCfg.refractionAmount,
      depthEffect: presetCfg.depthEffect,
      chromaticAberration: presetCfg.chromaticAberration,
      // Канва сдвинута на (pad, pad) и позиционирована left:-pad — шейдер получает
      // координаты канвы, поэтому offset=-pad возвращает их в систему поверхности.
      // БЕЗ этого правый/нижний край попадает «за» прямоугольник и тянется клином.
      padding: pad,
    };
    return { ...base, ...(lensOverride ?? {}), width: size.w, height: size.h, padding: pad };
  }, [lensOverride, size.w, size.h, radius, presetCfg, pad]);

  const hl = useMemo(() => {
    if (highlight === false) return null;
    const h = highlight ?? {};
    return {
      width: h.width ?? 0.75,
      blur: h.blur ?? 0.4,
      alpha: h.alpha ?? (light ? 0.5 : 0.8),
      color: h.color ?? "#FFFFFF",
      angle: ((h.angle ?? 45) * Math.PI) / 180,
      falloff: h.falloff ?? 1,
      ambient: h.ambient ?? false,
    };
  }, [highlight, light]);

  const hlEffect = useMemo(() => {
    if (!hl) return null;
    return Skia.RuntimeEffect.Make(hl.ambient ? AMBIENT_HIGHLIGHT_SHADER : HIGHLIGHT_SHADER);
  }, [hl]);

  const shadowCfg = useMemo(() => {
    if (shadow === false) return null;
    const s = typeof shadow === "object" ? shadow : {};
    const r = s.radius ?? 24;
    return { radius: r, dy: s.dy ?? r / 6, color: s.color ?? "#000000", alpha: s.alpha ?? (light ? 0.14 : 0.28) };
  }, [shadow, light]);

  const bodyRRect = useMemo(
    () => rrect(rect(pad, pad, size.w, size.h), radius, radius),
    [size.w, size.h, radius, pad]
  );
  const outlinePath = useMemo(() => {
    if (size.w <= 0) return null;
    const p = Skia.Path.Make();
    p.addRRect(bodyRRect);
    return p;
  }, [bodyRRect, size.w]);

  const shadowBlur = shadowCfg ? Math.min(shadowCfg.radius, pad * 0.9) : 0;

  // Стиль вызывающей стороны управляет РАЗМЕРАМИ/ОТСТУПАМИ/ФЛЕКСОМ хоста,
  // поэтому дети рисуются прямо в нём (иначе row/padding карточки сломались бы).
  // Обводку и скругление берём на себя: RN-бордюр оказался бы ПОД стеклом.
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const borderFromStyle = borderColor == null && flat?.borderColor != null;
  const effBorderColor = borderColor ?? (borderFromStyle ? (flat!.borderColor as string) : null);
  const effBorderWidth = borderFromStyle ? Number(flat!.borderWidth ?? 1) : borderWidth;
  const hostStyle: ViewStyle = {
    ...(flat ?? {}),
    borderRadius: radius,
    overflow: "visible",
    borderWidth: 0,
    borderColor: undefined,
  };

  const bgImage = backdrop?.image ?? null;

  // Все входные параметры снимка стекла — в одном memo. Пересчёт только при
  // реальном изменении геометрии/позиции/темы/пропсов.
  const glassUri = useMemo(() => {
    if (size.w <= 0 || size.h <= 0) return null;

    // Работаем в device-px: канва = (size + 2*pad) dp × PixelRatio.
    const pr = PixelRatio.get();
    const canvasW = size.w + pad * 2;
    const canvasH = size.h + pad * 2;
    const w = Math.max(1, Math.round(canvasW * pr));
    const h = Math.max(1, Math.round(canvasH * pr));

    const surface = Skia.Surface.Make(w, h);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color("rgba(0,0,0,0)"));
    canvas.scale(pr, pr);

    const bodyRect = rect(pad, pad, size.w, size.h);
    const body = rrect(bodyRect, radius, radius);

    // 5. Тень (под стеклом): размытый скруглённый rect со сдвигом dy,
    // обрезанный по ВНЕШНОСТИ карточки (clip Difference). Раньше здесь было
    // even-odd кольцо «внешний rect минус карточка» — оно заливало цветом
    // тени ВСЮ площадь канвы вокруг блока, и blur лишь смягчал его края:
    // вокруг карточки читался тёмный квадрат. Clip Difference даёт честную
    // внешнюю тень, начинающуюся от границы формы.
    if (shadowCfg && outlinePath) {
      canvas.save();
      canvas.clipRRect(body, ClipOp.Difference, true);
      const sp = Skia.Paint();
      sp.setAntiAlias(true);
      sp.setColor(Skia.Color(withAlpha(shadowCfg.color, shadowCfg.alpha)));
      if (shadowBlur > 0) sp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, shadowBlur, true));
      canvas.save();
      canvas.translate(0, shadowCfg.dy);
      canvas.drawPath(outlinePath, sp);
      canvas.restore();
      canvas.restore();
    }

    // 1+2. Срез фона темы со сдвигом на оконную позицию, через цепочку
    // vibrancy ⇒ blur ⇒ lens (один image filter на слое saveLayer).
    canvas.save();
    canvas.clipRRect(body, ClipOp.Intersect, true);
    const layerPaint = Skia.Paint();
    layerPaint.setAntiAlias(true);
    const filter = buildGlassFilter({ saturation, blur, lens });
    if (filter) layerPaint.setImageFilter(filter);
    canvas.saveLayer(layerPaint, bodyRect);
    if (bgImage) {
      const bgPaint = Skia.Paint();
      bgPaint.setAntiAlias(true);
      // Фон в dp: его прямоугольник = backdrop.width × backdrop.height,
      // рисуем со сдвигом (pad - win), чтобы сквозь клип попал «свой» участок.
      const bgW = backdrop?.width ?? 0;
      const bgH = backdrop?.height ?? 0;
      if (bgW > 0 && bgH > 0) {
        canvas.drawImageRect(
          bgImage,
          rect(0, 0, bgImage.width(), bgImage.height()),
          rect(pad - win.x, pad - win.y, bgW, bgH),
          bgPaint
        );
      }
    }
    canvas.restore();

    // 3. Подложка (containerColor).
    if (surfaceColor) {
      const sc = Skia.Paint();
      sc.setAntiAlias(true);
      sc.setColor(Skia.Color(surfaceColor));
      canvas.drawRRect(body, sc);
    }
    canvas.restore();

    // Обводка — поверх стекла (вместо RN-бордюра, который был бы под ним).
    // Рисуем ВНУТРИ клипа по форме и двойной толщиной: штрих по центру контура
    // наполовину уходит за границу формы и теряется, из-за чего рамка то
    // пропадала, то выглядела рваной. Clip оставляет ровно внутреннюю половину.
    if (effBorderColor && effBorderWidth > 0) {
      canvas.save();
      canvas.clipRRect(body, ClipOp.Intersect, true);
      const bp = Skia.Paint();
      bp.setAntiAlias(true);
      bp.setStyle(PaintStyle.Stroke);
      bp.setStrokeWidth(effBorderWidth * 2);
      bp.setColor(Skia.Color(effBorderColor));
      canvas.drawRRect(body, bp);
      canvas.restore();
    }

    // 4. Хайлайт: размытый штрих по контуру, blend Plus (как в оригинале).
    // Uniform-массив ПЛОСКИЙ и строго в порядке объявления в SkSL.
    if (hl && hlEffect && outlinePath) {
      const hp = Skia.Paint();
      hp.setAntiAlias(true);
      hp.setStyle(PaintStyle.Stroke);
      hp.setStrokeWidth(hl.width * 2);
      hp.setBlendMode(BlendMode.Plus);
      hp.setAlphaf(hl.alpha);
      if (hl.blur > 0) hp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, hl.blur, true));
      const radii = [radius, radius, radius, radius];
      const uniforms = hl.ambient
        ? [size.w, size.h, -pad, -pad, ...radii, hl.angle, hl.falloff]
        : [size.w, size.h, -pad, -pad, ...radii, ...rgba(hl.color), hl.angle, hl.falloff];
      const shader = hlEffect.makeShader(uniforms);
      if (shader) hp.setShader(shader);
      canvas.drawPath(outlinePath, hp);
    }

    const shot = surface.makeImageSnapshot();
    const b64 = shot.encodeToBase64(ImageFormat.PNG);
    surface.dispose();
    return { uri: `data:image/png;base64,${b64}`, w: canvasW, h: canvasH, pad };
  }, [
    size.w, size.h, win.x, win.y, pad, radius, saturation, blur, lens,
    surfaceColor, effBorderColor, effBorderWidth, hl, hlEffect, outlinePath,
    shadowCfg, shadowBlur, bgImage, backdrop?.width, backdrop?.height,
  ]);

  // Early-return ПОСЛЕ всех хуков: до первого измерения контент виден сразу
  // (стекло появится через кадр). Хук glassUri должен вызываться всегда —
  // иначе число хуков меняется между рендерами и React падает с
  // "Rendered more hooks than during the previous render".
  if ((!backdrop && !standalone) || size.w <= 0 || !outlinePath) {
    return (
      <View ref={hostRef} onLayout={onLayout} style={hostStyle}>
        {children}
      </View>
    );
  }

  const glassLayer = (
    <View pointerEvents="none" style={styles.glassHost}>
      {glassUri && (
        <RNImage
          source={{ uri: glassUri.uri }}
          style={{
            position: "absolute",
            left: -glassUri.pad,
            top: -glassUri.pad,
            width: glassUri.w,
            height: glassUri.h,
          }}
          resizeMode="stretch"
          fadeDuration={0}
        />
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        ref={hostRef as any}
        onLayout={onLayout}
        style={hostStyle}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {glassLayer}
        {children}
      </Pressable>
    );
  }

  return (
    <View ref={hostRef} onLayout={onLayout} style={hostStyle}>
      {glassLayer}
      {/* Контент поверх стекла — прямой ребёнок хоста (padding/flex работают). */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Хост стеклянной канвы: заполняет поверхность, НЕ обрезает детей — канва
  // выступает на pad (тень/блюр/рефракция), а само стекло клипается внутри
  // канвы (clip={bodyRRect}). overflow:hidden здесь срезал бы тень.
  glassHost: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "visible" },
  canvas: { position: "absolute" },
});

/** #RRGGBB/#RRGGBBAA → [r,g,b,a] 0..1 для float4-униформа. */
function rgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  const base = hex.startsWith("#") ? hex : `#${hex}`;
  return `${base.slice(0, 7)}${a}`;
}
