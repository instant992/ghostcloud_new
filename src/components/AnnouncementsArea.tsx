import React, { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getAnnouncements, type Announcement } from "../api";
import { getJsonList, setJsonList } from "../settings";
import { colors, isLightPalette, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";

/** Объявления с сервера (/api/auth/mobile/announcements) — баннеры на главной.
 *  Перенос механики с сайта (dashboard.html): мини-разметка текста
 *  (**жирный**, _курсив__, __подчёркнутый__, ~~зачёркнутый~~), свои цвета
 *  bg/text из админки (или дефолтный фиолетовый градиент под тему),
 *  кнопки-ссылки, «скрыть» сохраняется на устройстве. */

type Style = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
type Piece = { text: string; style: Style };

/** Парсер мини-разметки — порядок как на сайте: **bold**, __underline__,
 *  _italic_, ~~strike~~, переводы строк. */
export function parseAnnText(raw: string): Piece[][] {
  const lines = raw.split("\n");
  return lines.map((line) => {
    const pieces: Piece[] = [];
    // режем по токенам разметки, сохраняя стили
    const re = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|_[^_]+_)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) pieces.push({ text: line.slice(last, m.index), style: {} });
      const tok = m[0];
      const inner = tok.slice(2, -2);
      if (tok.startsWith("**")) pieces.push({ text: inner, style: { bold: true } });
      else if (tok.startsWith("__")) pieces.push({ text: inner, style: { underline: true } });
      else if (tok.startsWith("~~")) pieces.push({ text: inner, style: { strike: true } });
      else pieces.push({ text: tok.slice(1, -1), style: { italic: true } });
      last = m.index + tok.length;
    }
    if (last < line.length) pieces.push({ text: line.slice(last), style: {} });
    if (!pieces.length) pieces.push({ text: "", style: {} });
    return pieces;
  });
}

/** Цвета баннера. Объявления не должны кричать: любой цвет из админки
 *  превращается в мягкую полупрозрачную тонировку, а сам цвет остаётся
 *  только акцентом (рамка, иконка, кнопка). Дефолт — бледный фиолетовый
 *  градиент под текущую палитру. */

/** #rgb / #rrggbb → [r,g,b]; null если формат не распознан */
function hexToRgb(s: string): [number, number, number] | null {
  const m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Относительная яркость 0..1 (по формуле WCAG) */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Смешать цвет с белым/чёрным, чтобы акцент был виден на бледной подложке */
function mix(rgb: [number, number, number], target: [number, number, number], k: number): string {
  const c = rgb.map((v, i) => Math.round(v + (target[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

type BannerColors = {
  /** градиент дефолтного фона: пары [цвет, прозрачность] — ВАЖНО: альфа
   *  внутри rgba() в stopColor react-native-svg игнорируется, поэтому
   *  прозрачность передаётся отдельным атрибутом stopOpacity */
  gradient: [{ color: string; opacity: number }, { color: string; opacity: number }];
  /** свой цвет из админки → тонировка: цвет + прозрачность вместо сплошной заливки */
  tint: { color: string; opacity: number } | null;
  text: string;
  accent: string;
  border: string;
};

function bannerColors(a: Announcement): BannerColors {
  const light = isLightPalette();
  const bg = (a.bg_color || "").trim();
  const rgb = bg ? hexToRgb(bg) : null;

  // Дефолт: бледный фиолетовый градиент, акцент — цвет темы
  const defGradient: BannerColors["gradient"] = light
    ? [
        { color: "#A855F7", opacity: 0.1 },
        { color: "#7C3AED", opacity: 0.045 },
      ]
    : [
        { color: "#A855F7", opacity: 0.15 },
        { color: "#7C3AED", opacity: 0.07 },
      ];

  if (!bg || !rgb) {
    return {
      gradient: defGradient,
      tint: null,
      text: colors.text,
      accent: colors.accent,
      border: light ? "rgba(168,85,247,0.16)" : "rgba(168,85,247,0.18)",
    };
  }

  // Свой цвет из админки: бледная тонировка + акцент этим же цветом.
  // В светлой теме акцент затемняем, в тёмной — осветляем, чтобы был виден.
  const lum = luminance(rgb);
  const accent = light
    ? lum > 0.55
      ? mix(rgb, [40, 30, 60], 0.55)
      : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    : lum < 0.45
      ? mix(rgb, [255, 255, 255], 0.45)
      : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  // Явный цвет текста из админки применяем, только если он контрастен
  // бледной подложке текущей темы (иначе текст слился бы с фоном)
  const tc = (a.text_color || "").trim();
  const tcRgb = tc ? hexToRgb(tc) : null;
  let text = colors.text;
  if (tcRgb) {
    const tcLum = luminance(tcRgb);
    if (light ? tcLum < 0.62 : tcLum > 0.38) text = tc;
  }

  return {
    gradient: defGradient,
    tint: { color: bg, opacity: light ? 0.11 : 0.17 },
    text,
    accent,
    border: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${light ? 0.22 : 0.26})`,
  };
}

const DISMISSED_KEY = "announcements_dismissed_v1";

function AnnBanner({ a, onDismiss }: { a: Announcement; onDismiss: (id: number) => void }) {
  useTheme();
  const lines = useMemo(() => parseAnnText(a.text || ""), [a.text]);
  const { gradient, tint, text, accent, border } = bannerColors(a);
  const buttons = (a.buttons || []).filter((b) => (b.url || "").trim());
  // is_dismissible приходит числом 0/1 из SQLite (или булем); по умолчанию можно скрыть
  const dismissible = a.is_dismissible === undefined ? true : !!Number(a.is_dismissible);

  return (
    <View style={styles.banner}>
      {/* Фон: бледный градиент через SVG (альфа — отдельным stopOpacity!) */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <SvgGradient id={`ann${a.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient[0].color} stopOpacity={gradient[0].opacity} />
            <Stop offset="1" stopColor={gradient[1].color} stopOpacity={gradient[1].opacity} />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={16} fill={`url(#ann${a.id})`} />
      </Svg>
      {/* Цвет из админки — мягкая тонировка поверх градиента, не сплошная заливка */}
      {!!tint && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: 16, backgroundColor: tint.color, opacity: tint.opacity }]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: border,
          },
        ]}
      />

      <View style={styles.content}>
        <View style={[styles.iconBox, { backgroundColor: "transparent" }]}>
          <Ionicons name="megaphone" size={16} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          {lines.map((pieces, li) => (
            <Text key={li} style={[styles.text, { color: text }]}>
              {pieces.map((p, pi) => (
                <Text
                  key={pi}
                  style={{
                    fontWeight: p.style.bold ? "700" : "400",
                    fontStyle: p.style.italic ? "italic" : "normal",
                    textDecorationLine: p.style.underline
                      ? "underline"
                      : p.style.strike
                        ? "line-through"
                        : "none",
                    color: p.style.bold ? accent : undefined,
                  }}
                >
                  {p.text}
                </Text>
              ))}
            </Text>
          ))}
          {buttons.length > 0 && (
            <View style={styles.btnRow}>
              {buttons.map((b, i) => (
                <PressableScale
                  key={i}
                  style={[styles.linkBtn, { borderColor: border }]}
                  onPress={() => Linking.openURL((b.url || "").trim()).catch(() => {})}
                  accessibilityRole="link"
                >
                  <Text style={[styles.linkText, { color: accent }]} numberOfLines={1}>
                    {(b.label || b.text || "Ссылка").trim()}
                  </Text>
                  <Ionicons name="open-outline" size={12} color={accent} />
                </PressableScale>
              ))}
            </View>
          )}
        </View>
        {dismissible && (
          <PressableScale
            style={styles.closeBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onDismiss(a.id);
            }}
            accessibilityRole="button"
            accessibilityLabel="Скрыть объявление"
            hitSlop={6}
          >
            <Ionicons name="close" size={15} color={colors.textFaint} />
          </PressableScale>
        )}
      </View>
    </View>
  );
}

/** Лента объявлений для главной. Пустая, если объявлений нет или все скрыты. */
export function AnnouncementsArea({ style }: { style?: any }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => getJsonList(DISMISSED_KEY));

  useEffect(() => {
    let alive = true;
    getAnnouncements()
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const visible = items.filter((a) => !dismissed.includes(String(a.id)));
  if (!visible.length) return null;

  const dismiss = (id: number) => {
    const next = [...dismissed, String(id)];
    setDismissed(next);
    setJsonList(DISMISSED_KEY, next);
  };

  return (
    <View style={[styles.area, style]}>
      {visible.map((a) => (
        <AnnBanner key={a.id} a={a} onDismiss={dismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { gap: 10 },
  banner: {
    borderRadius: 16,
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  text: { fontSize: 13, lineHeight: 18.5 },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 240,
  },
  linkText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(128,128,140,0.10)",
  },
});
