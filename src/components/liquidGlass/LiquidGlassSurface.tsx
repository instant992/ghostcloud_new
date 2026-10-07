import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Animated,
  AppState,
  Image as RNImage,
  InteractionManager,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  BlendMode,
  BlurStyle,
  ClipOp,
  ImageFormat,
  PaintStyle,
  Skia,
  rrect,
  rect,
  type SkImage,
  type SkRuntimeEffect,
} from "@shopify/react-native-skia";
import { buildGlassFilter, GLASS_PRESETS, type GlassPresetName, type LensParams } from "./effects";
import { HIGHLIGHT_SHADER, AMBIENT_HIGHLIGHT_SHADER } from "./shaders";
import { useGlassBackdrop } from "./GlassBackdrop";
import { glassTuning } from "./tuning";
import { scrollBus } from "./scrollBus";
import { isLightPalette } from "../../theme";

/**
 * Кэш готовых снимков стекла между монтированиями (модульный, не per-instance).
 * Переход между вкладками/возврат из фона перемонтирует экраны: без кэша каждая
 * карточка заново проходит путь «onLayout → Skia-рендер → PNG-encode», и рамки
 * «подгружаются резко» через 100–300 мс. С кэшем повторное монтирование того же
 * блока (та же геометрия/позиция/тема) получает готовый data-URI синхронно —
 * стекло появляется вместе с первым кадром контента.
 */
const glassUriCache = new Map<string, { uri: string; w: number; h: number; pad: number }>();
const GLASS_CACHE_MAX = 48;

function cachePut(key: string, val: { uri: string; w: number; h: number; pad: number }) {
  glassUriCache.set(key, val);
  if (glassUriCache.size > GLASS_CACHE_MAX) {
    const oldest = glassUriCache.keys().next().value;
    if (oldest !== undefined) glassUriCache.delete(oldest);
  }
}

/** Разрешение снимков стекла. PixelRatio устройства (2.625 на тестовом AVD)
 *  даёт ~7× пикселей от dp: Skia-рендер + PNG-encode одной карточки занимает
 *  100–300 мс, и десяток карточек нового экрана блокировали JS-поток на 1–3 с
 *  при каждом переключении вкладок («подгрузка дизайна секунды 3»).
 *  1.75× — компромисс: стекло всё равно размыто/преломлено, потеря разрешения
 *  не видна, а стоимость encode падает в ~2.2 раза. */
const GLASS_PX_SCALE = 1.75;

/** Все параметры одного снимка — рендер вынесен из компонента, чтобы его
 *  можно было выполнять АСИНХРОННО (очередь ниже), а не в useMemo на пути
 *  рендера React. */
interface SnapshotCfg {
  sizeW: number;
  sizeH: number;
  pad: number;
  radiusEff: number;
  saturation: number;
  blur: number;
  lens: LensParams | null;
  surfaceColor?: string | null;
  borderColor: string | null;
  borderWidth: number;
  hl: {
    width: number; blur: number; alpha: number; color: string;
    angle: number; falloff: number; ambient: boolean;
  } | null;
  hlEffect: SkRuntimeEffect | null;
  shadowCfg: { radius: number; dy: number; color: string; alpha: number } | null;
  shadowBlur: number;
  bgImage: SkImage | null;
  bgW: number;
  bgH: number;
  winX: number;
  winY: number;
  veil: number;
  light: boolean;
}

/** Синхронный рендер одного снимка стекла (Skia offscreen → PNG data-URI).
 *  Вызывается из очереди renderQueue — НИКОГДА прямо из рендера React:
 *  блокировка JS-потока на сотни мс = фризы UI при смене вкладок. */
function renderSnapshot(cfg: SnapshotCfg): { uri: string; w: number; h: number; pad: number } | null {
  const { sizeW, sizeH, pad, radiusEff } = cfg;
  const px = Math.min(PixelRatio.get(), GLASS_PX_SCALE);
  const canvasW = sizeW + pad * 2;
  const canvasH = sizeH + pad * 2;
  const w = Math.max(1, Math.round(canvasW * px));
  const h = Math.max(1, Math.round(canvasH * px));

  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color("rgba(0,0,0,0)"));
  canvas.scale(px, px);

  const bodyRect = rect(pad, pad, sizeW, sizeH);
  const body = rrect(bodyRect, radiusEff, radiusEff);
  const outlinePath = Skia.Path.Make();
  outlinePath.addRRect(body);

  // 5. Тень (под стеклом): размытый скруглённый rect со сдвигом dy,
  // обрезанный по ВНЕШНОСТИ карточки (clip Difference).
  if (cfg.shadowCfg) {
    canvas.save();
    canvas.clipRRect(body, ClipOp.Difference, true);
    const sp = Skia.Paint();
    sp.setAntiAlias(true);
    sp.setColor(Skia.Color(withAlpha(cfg.shadowCfg.color, cfg.shadowCfg.alpha)));
    if (cfg.shadowBlur > 0) sp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, cfg.shadowBlur, true));
    canvas.save();
    canvas.translate(0, cfg.shadowCfg.dy);
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
  const filter = buildGlassFilter({ saturation: cfg.saturation, blur: cfg.blur, lens: cfg.lens });
  if (filter) layerPaint.setImageFilter(filter);
  canvas.saveLayer(layerPaint, bodyRect);
  if (cfg.bgImage && cfg.bgW > 0 && cfg.bgH > 0) {
    const bgPaint = Skia.Paint();
    bgPaint.setAntiAlias(true);
    canvas.drawImageRect(
      cfg.bgImage,
      rect(0, 0, cfg.bgImage.width(), cfg.bgImage.height()),
      rect(pad - cfg.winX, pad - cfg.winY, cfg.bgW, cfg.bgH),
      bgPaint
    );
  }
  canvas.restore();

  // 3. Подложка (containerColor).
  if (cfg.surfaceColor) {
    const sc = Skia.Paint();
    sc.setAntiAlias(true);
    sc.setColor(Skia.Color(cfg.surfaceColor));
    canvas.drawRRect(body, sc);
  }
  // 3b. Вуаль Glass Playground.
  if (cfg.veil > 0.004) {
    const vp = Skia.Paint();
    vp.setAntiAlias(true);
    vp.setColor(Skia.Color(cfg.light ? `rgba(255,255,255,${cfg.veil})` : `rgba(0,0,0,${cfg.veil})`));
    canvas.drawRRect(body, vp);
  }
  canvas.restore();

  // Обводка — поверх стекла, внутри клипа по форме и двойной толщиной.
  if (cfg.borderColor && cfg.borderWidth > 0) {
    canvas.save();
    canvas.clipRRect(body, ClipOp.Intersect, true);
    const bp = Skia.Paint();
    bp.setAntiAlias(true);
    bp.setStyle(PaintStyle.Stroke);
    bp.setStrokeWidth(cfg.borderWidth * 2);
    bp.setColor(Skia.Color(cfg.borderColor));
    canvas.drawRRect(body, bp);
    canvas.restore();
  }

  // 4. Хайлайт: штрих по контуру, blend Plus, клип ВНУТРЬ контура
  // (HighlightModifier.kt), толщина ceil(width·density)·2 device-px.
  if (cfg.hl && cfg.hlEffect) {
    canvas.save();
    canvas.clipRRect(body, ClipOp.Intersect, true);
    const hp = Skia.Paint();
    hp.setAntiAlias(true);
    hp.setStyle(PaintStyle.Stroke);
    hp.setStrokeWidth((Math.ceil(cfg.hl.width * px) / px) * 2);
    hp.setBlendMode(BlendMode.Plus);
    hp.setAlphaf(cfg.hl.alpha);
    if (cfg.hl.blur > 0) hp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, cfg.hl.blur, true));
    const radii = [radiusEff, radiusEff, radiusEff, radiusEff];
    const uniforms = cfg.hl.ambient
      ? [sizeW, sizeH, -pad, -pad, ...radii, cfg.hl.angle, cfg.hl.falloff]
      : [sizeW, sizeH, -pad, -pad, ...radii, ...rgba(cfg.hl.color), cfg.hl.angle, cfg.hl.falloff];
    const shader = cfg.hlEffect.makeShader(uniforms);
    if (shader) hp.setShader(shader);
    canvas.drawPath(outlinePath, hp);
    canvas.restore();
  }

  const shot = surface.makeImageSnapshot();
  const b64 = shot.encodeToBase64(ImageFormat.PNG);
  surface.dispose();
  return { uri: `data:image/png;base64,${b64}`, w: canvasW, h: canvasH, pad };
}

/**
 * Очередь снимков стекла: ОДИН Skia-рендер + PNG-encode за кадр, старт —
 * после завершения анимаций (InteractionManager: переход вкладок, открытие
 * экрана). Раньше все карточки рендерились синхронно внутри useMemo при
 * монтировании экрана: ~10 поверхностей × 100–300 мс = 1–3 с блокировки
 * JS-потока (фриз интерфейса при переключении вкладок). Теперь первый кадр
 * нового экрана показывается мгновенно (контент без стекла), стекло
 * «всплывает» покадрово. Дубликаты того же cacheKey в очередь не попадают.
 */
const renderQueue: Array<() => void> = [];
const queuedKeys = new Set<string>();
let draining = false;

function scheduleSnapshot(key: string, run: () => void) {
  if (queuedKeys.has(key)) return;
  queuedKeys.add(key);
  renderQueue.push(() => {
    queuedKeys.delete(key);
    run();
  });
  if (draining) return;
  draining = true;
  InteractionManager.runAfterInteractions(() => {
    const step = () => {
      const job = renderQueue.shift();
      if (!job) {
        draining = false;
        return;
      }
      job();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

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

  // Глобальная настройка стекла (Glass Playground): множители к пресету.
  const tuning = useSyncExternalStore(glassTuning.subscribe, glassTuning.getSnapshot);

  const presetCfg = GLASS_PRESETS[preset] ?? GLASS_PRESETS.card;
  // radius: множитель тюнинга (скругление всех блоков дизайном).
  const radiusEff = Math.max(0, radius * tuning.radius);
  const blur = (blurOverride ?? presetCfg.blur) * tuning.blur;
  const saturation = saturationOverride ?? tuning.saturation;
  // Компактный ключ тюнинга — ОБЯЗАТЕЛЬНО входит в cacheKey снимка, иначе
  // ползунки Playground двигаются, а кэш отдаёт стекло со старыми параметрами.
  const tuningKey = [
    tuning.radius, tuning.blur, tuning.saturation, tuning.refractionHeight,
    tuning.refractionAmount, tuning.aberration, tuning.highlight, tuning.shadow, tuning.veil,
  ].join(",");

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [win, setWin] = useState({ x: 0, y: 0 });
  const hostRef = useRef<View>(null);

  /** Плавное первое появление стекла: без него рамки «вспыхивают» резко через
   *  100–300 мс после контента (путь onLayout → Skia-рендер → PNG-encode).
   *  Кэш-хит (перемонтирование знакомой карточки) показываем мгновенно. */
  const fade = useRef(new Animated.Value(1)).current;
  const fadeShown = useRef(false);
  /** Последний успешный снимок: если пересчёт не удался (Skia-поверхность не
   *  создалась, фон momentarily null), держим прежнее стекло — рамки не пропадают. */
  const lastGoodUri = useRef<{ uri: string; w: number; h: number; pad: number; fromCache?: boolean } | null>(null);

  // Возврат из фона: позиция окна могла измениться (статус-бар, поворот, скролл) —
  // без перезамера стекло показывало бы «чужой» срез фона или теряло его вовсе.
  // scrollBus: скролл страницы остановился — карточки уехали со своих мест,
  // перезамеряем оконную позицию, чтобы срез фона снова совпадал (см. scrollBus.ts).
  const remeasure = useCallback(() => {
    const v = hostRef.current;
    if (!v) return;
    v.measureInWindow((x, y) => {
      setWin((p) => (Math.abs(p.x - x) > 0.5 || Math.abs(p.y - y) > 0.5 ? { x, y } : p));
    });
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      remeasure();
    });
    const unsubScroll = scrollBus.subscribe(remeasure);
    return () => {
      sub.remove();
      unsubScroll();
    };
  }, [remeasure]);

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
    lensOverride === null ? 0 : (lensOverride?.refractionHeight ?? presetCfg.refractionHeight) * tuning.refractionHeight;

  // Тень — точные значения Shadow.Default каталога (backdrop/shadow/Shadow.kt):
  // radius 24dp, offset (0, radius/6), цвет Black@0.1 (ОДИНАКОВО в светлой и
  // тёмной теме — раньше было 0.14/0.28, из-за чего блоки выглядели темнее демо).
  // Считается ДО pad: канва должна вмещать разлёт тени.
  const shadowCfg = useMemo(() => {
    if (shadow === false) return null;
    if (tuning.shadow <= 0) return null;
    const s = typeof shadow === "object" ? shadow : {};
    const r = s.radius ?? 24;
    return { radius: r, dy: s.dy ?? r / 6, color: s.color ?? "#000000", alpha: (s.alpha ?? 0.1) * tuning.shadow };
  }, [shadow, tuning.shadow]);

  // Запас канвы: максимум из блюра, высоты рефракции и радиуса тени. Без тени
  // в pad гауссов хвост Shadow(radius 24) обрезался краем PNG на ~16dp — тень
  // читалась узкой тёмной окантовкой вместо широкой мягкой, как в демо
  // (ShadowModifier.kt отводит под слой radius*4; radius+2 достаточно: за 1σ
  // остаётся <2% альфы Black@0.1 — невидимо).
  const pad = paddingOverride ?? Math.max(blur, effRefractionHeight, shadowCfg ? shadowCfg.radius : 0) + 2;

  const lens: LensParams | null = useMemo(() => {
    if (lensOverride === null) return null;
    if (size.w <= 0 || size.h <= 0) return null;
    const base: LensParams = {
      width: size.w,
      height: size.h,
      cornerRadii: [radiusEff, radiusEff, radiusEff, radiusEff],
      refractionHeight: presetCfg.refractionHeight * tuning.refractionHeight,
      refractionAmount: presetCfg.refractionAmount * tuning.refractionAmount,
      depthEffect: presetCfg.depthEffect,
      // Аберрация: ползунок Playground (>0) задаёт непрерывную силу;
      // иначе пресеты с дисперсией (ручки/индикаторы) сохраняют свои true=1.
      chromaticAberration:
        tuning.aberration > 0 ? tuning.aberration : presetCfg.chromaticAberration ? 1 : 0,
      // Канва сдвинута на (pad, pad) и позиционирована left:-pad — шейдер получает
      // координаты канвы, поэтому offset=-pad возвращает их в систему поверхности.
      // БЕЗ этого правый/нижний край попадает «за» прямоугольник и тянется клином.
      padding: pad,
    };
    return { ...base, ...(lensOverride ?? {}), width: size.w, height: size.h, padding: pad };
  }, [lensOverride, size.w, size.h, radiusEff, presetCfg, pad, tuning.refractionHeight, tuning.refractionAmount, tuning.aberration]);

  const hl = useMemo(() => {
    if (highlight === false) return null;
    if (tuning.highlight <= 0) return null;
    const h = highlight ?? {};
    // Точные значения Highlight.Default каталога (backdrop/highlight/Highlight.kt
    // + HighlightStyle.kt): width 0.5dp, blurRadius = width/2, цвет White@0.5 —
    // ОДИНАКОВО в обеих темах (раньше в тёмной alpha была 0.8 — блик толще и
    // ярче, чем в демо). Как и в оригинале, штрих клипается ВНУТРЬ контура.
    return {
      width: h.width ?? 0.5,
      blur: h.blur ?? (h.width ?? 0.5) / 2,
      alpha: (h.alpha ?? 0.5) * tuning.highlight,
      color: h.color ?? "#FFFFFF",
      angle: ((h.angle ?? 45) * Math.PI) / 180,
      falloff: h.falloff ?? 1,
      ambient: h.ambient ?? false,
    };
  }, [highlight, tuning.highlight]);

  const hlEffect = useMemo(() => {
    if (!hl) return null;
    return Skia.RuntimeEffect.Make(hl.ambient ? AMBIENT_HIGHLIGHT_SHADER : HIGHLIGHT_SHADER);
  }, [hl]);

  const bodyRRect = useMemo(
    () => rrect(rect(pad, pad, size.w, size.h), radiusEff, radiusEff),
    [size.w, size.h, radiusEff, pad]
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
    borderRadius: radiusEff,
    overflow: "visible",
    borderWidth: 0,
    borderColor: undefined,
  };

  const bgImage = backdrop?.image ?? null;

  /** Снимок стекла — теперь состояние, а не результат useMemo: рендер
   *  выполняется асинхронно через очередь (один за кадр, после анимаций).
   *  Кэш-хит синхронный — знакомая карточка появляется со стеклом сразу. */
  const [glassUri, setGlassUri] = useState<{ uri: string; w: number; h: number; pad: number } | null>(null);

  const cacheKey = useMemo(() => {
    if (size.w <= 0 || size.h <= 0) return null;
    // win квантуем до 2dp: при скролле/переходах позиция «дрожит» на доли dp,
    // и cache-miss на каждый пиксель сдвига плодил бы повторные рендеры.
    return [
      Math.round(size.w), Math.round(size.h), Math.round(win.x / 2), Math.round(win.y / 2),
      pad, radiusEff, saturation, blur, light, backdrop?.imageUri ? backdrop.imageUri.length : 0,
      surfaceColor ?? "", effBorderColor ?? "", effBorderWidth, tuningKey,
      shadowCfg ? `${shadowCfg.radius}|${shadowCfg.dy}|${shadowCfg.color}|${shadowCfg.alpha}` : "",
      hl ? `${hl.width}|${hl.blur}|${hl.alpha.toFixed(3)}|${hl.angle}|${hl.falloff}|${hl.ambient}` : "",
    ].join("|");
  }, [
    size.w, size.h, win.x, win.y, pad, radiusEff, saturation, blur, light,
    backdrop?.imageUri, surfaceColor, effBorderColor, effBorderWidth, tuningKey,
    shadowCfg, hl,
  ]);

  // Кэш-хит — синхронно, стекло видно в первом кадре (перемонтирование при
  // возврате на вкладку/из фона).
  if (cacheKey) {
    const cached = glassUriCache.get(cacheKey);
    if (cached && lastGoodUri.current !== cached) {
      fadeShown.current = true;
      fade.setValue(1);
      lastGoodUri.current = cached;
      setGlassUri(cached);
    }
  }

  // Кэш-мисс — ставим в асинхронную очередь (InteractionManager + по одной
  // задаче за кадр): переход вкладок остаётся плавным, стекло «всплывает»
  // сразу после анимации.
  useEffect(() => {
    if (!cacheKey) return;
    if (glassUriCache.has(cacheKey)) return;
    if (size.w <= 0 || size.h <= 0) return;
    if (!bgImage && !standalone) return;
    const cfg: SnapshotCfg = {
      sizeW: size.w, sizeH: size.h, pad, radiusEff, saturation, blur,
      lens, surfaceColor, borderColor: effBorderColor, borderWidth: effBorderWidth,
      hl, hlEffect, shadowCfg, shadowBlur,
      bgImage, bgW: backdrop?.width ?? 0, bgH: backdrop?.height ?? 0,
      winX: win.x, winY: win.y, veil: tuning.veil, light,
    };
    let cancelled = false;
    scheduleSnapshot(cacheKey, () => {
      if (cancelled) return;
      // Параметры могли уйти из очереди устаревшими (скролл, ресайз) —
      // свежий ключ уже в очереди/кэше, этот снимок не нужен.
      const val = renderSnapshot(cfg);
      if (!val || cancelled) return;
      cachePut(cacheKey, val);
      lastGoodUri.current = val;
      // Первое появление — плавный фейд 120 мс (нативный драйвер).
      if (!fadeShown.current) {
        fadeShown.current = true;
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      }
      setGlassUri(val);
    });
    return () => {
      cancelled = true;
    };
  }, [
    cacheKey, size.w, size.h, win.x, win.y, pad, radiusEff, saturation, blur, lens,
    surfaceColor, effBorderColor, effBorderWidth, hl, hlEffect, shadowCfg, shadowBlur,
    bgImage, backdrop?.width, backdrop?.height, standalone, tuning.veil, light, fade,
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
        <Animated.View style={{ opacity: fade, position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
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
        </Animated.View>
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
