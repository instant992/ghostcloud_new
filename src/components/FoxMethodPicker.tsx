import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFoxPaymentMethods } from "../api";
import { colors, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";

export type FoxMethodOption = { id: string; title: string; icon?: string | null };
export type FoxMethod = {
  id: string;
  name: string;
  requires_amount: boolean;
  min_amount_kopeks?: number | null;
  max_amount_kopeks?: number | null;
  options: FoxMethodOption[];
};

/** Выбор способа оплаты FoxCloud (Bedolaga).
 *  value = { method, option } | null (null = авто-выбор на сервере).
 *  Методы без опций (tribute) выбираются целиком; с опциями (platega: СБП/Карты) —
 *  по опции. */
export function FoxMethodPicker({
  value,
  onChange,
  amountKopeks,
}: {
  value: { method: string; option?: string } | null;
  onChange: (v: { method: string; option?: string } | null) => void;
  /** текущая сумма в копейках — методы, не подходящие по минимуму, гасятся */
  amountKopeks?: number;
}) {
  useTheme();
  const styles = makeStyles();
  const [methods, setMethods] = useState<FoxMethod[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getFoxPaymentMethods();
        if (cancelled) return;
        const list: FoxMethod[] = Array.isArray(r?.methods) ? r.methods : [];
        setMethods(list);
        if (list.length === 0) setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || (methods && methods.length === 0)) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.label}>Способ оплаты</Text>
        <Text style={styles.hint}>
          Способ оплаты выберется автоматически при создании платежа (Bedolaga).
        </Text>
      </View>
    );
  }

  if (!methods) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.label}>Способ оплаты</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Загружаем способы оплаты…</Text>
        </View>
      </View>
    );
  }

  const isOn = (m: FoxMethod, optId?: string) =>
    !!value &&
    value.method === m.id &&
    (m.options.length === 0 ? !value.option : value.option === optId);

  const minBlocked = (m: FoxMethod) =>
    !!amountKopeks &&
    m.requires_amount &&
    !!m.min_amount_kopeks &&
    amountKopeks < m.min_amount_kopeks;

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>Способ оплаты</Text>
      {methods.map((m) => {
        const blocked = minBlocked(m);
        if (m.options.length === 0) {
          const on = isOn(m);
          return (
            <PressableScale
              key={m.id}
              style={[styles.item, on && styles.itemOn, blocked && { opacity: 0.5 }]}
              onPress={() => onChange(on ? null : { method: m.id })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: blocked }}
              accessibilityLabel={`Способ оплаты: ${m.name}`}
            >
              <View style={[styles.iconBox, on && { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="wallet-outline" size={19} color={on ? colors.accent : colors.textDim} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.itemName, on && { color: colors.accent }]}>{m.name}</Text>
                {m.min_amount_kopeks ? (
                  <Text style={styles.itemDesc}>от {Math.round(m.min_amount_kopeks / 100)} ₽</Text>
                ) : null}
              </View>
              <View style={[styles.radio, on && styles.radioOn]} />
            </PressableScale>
          );
        }
        // Метод с опциями (platega): раскрываем опции как отдельные строки
        return (
          <View key={m.id} style={{ marginBottom: 8 }}>
            {m.options.map((o) => {
              const on = isOn(m, o.id);
              return (
                <PressableScale
                  key={`${m.id}:${o.id}`}
                  style={[styles.item, on && styles.itemOn, blocked && { opacity: 0.5 }]}
                  onPress={() => onChange(on ? null : { method: m.id, option: o.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: blocked }}
                  accessibilityLabel={`Способ оплаты: ${o.title || m.name}`}
                >
                  <View style={[styles.iconBox, on && { backgroundColor: colors.accentSoft }]}>
                    {o.icon ? (
                      <Text style={{ fontSize: 18 }}>{o.icon}</Text>
                    ) : (
                      <Ionicons name="card-outline" size={19} color={on ? colors.accent : colors.textDim} />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.itemName, on && { color: colors.accent }]}>
                      {o.title || m.name}
                    </Text>
                    {m.min_amount_kopeks ? (
                      <Text style={styles.itemDesc}>от {Math.round(m.min_amount_kopeks / 100)} ₽</Text>
                    ) : null}
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]} />
                </PressableScale>
              );
            })}
          </View>
        );
      })}
      <Text style={styles.hint}>Если не выбрать — Bedolaga подставит способ оплаты автоматически.</Text>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    label: { color: colors.textDim, fontSize: 13, fontWeight: "700", marginBottom: 8 },
    hint: { color: colors.textFaint, fontSize: 11, marginTop: 6, lineHeight: 15 },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bgSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    loadingText: { color: colors.textDim, fontSize: 13 },
    item: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bgSoft,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
    },
    itemOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    itemName: { color: colors.text, fontSize: 14, fontWeight: "700" },
    itemDesc: { color: colors.textDim, fontSize: 11, marginTop: 1 },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
    },
    radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  });
