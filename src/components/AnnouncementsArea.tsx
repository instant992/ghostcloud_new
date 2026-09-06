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

/** Цвета баннера: свои из админки или дефолтный градиент под текущую тему */
function bannerColors(a: Announcement): { gradient: [string, string]; text: string; custom: boolean } {
  const light = isLightPalette();
  const defText = light ? "#1a1a2e" : "#f5f5f5";
  const bg = (a.bg_color || "").trim();
  const text = (a.text_color || "").trim() || (bg ? "#fff" : defText);
  if (bg) {
    // свой цвет (solid) — градиент из него же
    return { gradient: [bg, bg], text, custom: true };
  }
  return light
    ? {
        gradient: ["rgba(168,85,247,0.16)", "rgba(124,58,237,0.07)"],
        text: colors.text,
        custom: false,
      }
    : {
        gradient: ["rgba(168,85,247,0.22)", "rgba(124,58,237,0.10)"],
        text: colors.text,
        custom: false,
      };
}

const DISMISSED_KEY = "announcements_dismissed_v1";

function AnnBanner({ a, onDismiss }: { a: Announcement; onDismiss: (id: number) => void }) {
  useTheme();
  const lines = useMemo(() => parseAnnText(a.text || ""), [a.text]);
  const { gradient, text, custom } = bannerColors(a);
  const buttons = (a.buttons || []).filter((b) => (b.url || "").trim());
  // is_dismissible приходит числом 0/1 из SQLite (или булем); по умолчанию можно скрыть
  const dismissible = a.is_dismissible === undefined ? true : !!Number(a.is_dismissible);

  return (
    <View style={styles.banner}>
      {/* Фон: градиент через SVG (работает во всех темах) */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <SvgGradient id={`ann${a.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient[0]} />
            <Stop offset="1" stopColor={gradient[1]} />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={16} fill={`url(#ann${a.id})`} />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: custom ? "rgba(255,255,255,0.12)" : "rgba(168,85,247,0.25)",
          },
        ]}
      />

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="megaphone" size={16} color={text} />
        </View>
        <View style={{ flex: 1 }}>
          {lines.map((pieces, li) => (
            <Text key={li} style={[styles.text, { color: text }]}>
              {pieces.map((p, pi) => (
                <Text
                  key={pi}
                  style={{
                    fontWeight: p.style.bold ? "800" : "500",
                    fontStyle: p.style.italic ? "italic" : "normal",
                    textDecorationLine: p.style.underline
                      ? "underline"
                      : p.style.strike
                        ? "line-through"
                        : "none",
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
                  style={[styles.linkBtn, custom && { borderColor: "rgba(255,255,255,0.3)" }]}
                  onPress={() => Linking.openURL((b.url || "").trim()).catch(() => {})}
                  accessibilityRole="link"
                >
                  <Text style={[styles.linkText, { color: text }]} numberOfLines={1}>
                    {(b.label || b.text || "Ссылка").trim()}
                  </Text>
                  <Ionicons name="open-outline" size={12} color={text} />
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
            <Ionicons name="close" size={15} color={text} />
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
    backgroundColor: "rgba(168,85,247,0.18)",
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
  linkText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(128,128,140,0.14)",
  },
});
