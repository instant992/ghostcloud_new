import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getPaymentProviders } from "../api";
import { colors, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";

export type PaymentProvider = {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
};

const FALLBACK: PaymentProvider[] = [
  { id: "yookassa", name: "Банковская карта", description: "Visa, Mastercard, МИР", isDefault: true },
];

/** Выбор платёжной системы — как в старом приложении.
 *  value=null означает «провайдер по умолчанию» (выбирает сервер). */
export function ProviderPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  useTheme();
  const styles = makeStyles();
  const [providers, setProviders] = useState<PaymentProvider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getPaymentProviders();
        if (cancelled) return;
        if (r?.success !== false && Array.isArray(r?.providers) && r.providers.length > 0) {
          const list: PaymentProvider[] = r.providers.map((p: any) => ({
            id: String(p.id || ""),
            name: String(p.name || p.id || ""),
            description: p.description ? String(p.description) : undefined,
            isDefault: p.default === true || p.id === r.default,
          }));
          setProviders(list.filter((p) => p.id));
          return;
        }
      } catch {}
      if (!cancelled) setProviders(FALLBACK);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultId = providers?.find((p) => p.isDefault)?.id || providers?.[0]?.id || null;
  const selected = value || defaultId;

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>Способ оплаты</Text>
      {!providers ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Загружаем способы оплаты…</Text>
        </View>
      ) : (
        providers.map((p) => {
          const on = selected === p.id;
          return (
            <PressableScale
              key={p.id}
              style={[styles.item, on && styles.itemOn]}
              onPress={() => onChange(p.id)}
            >
              <View style={[styles.iconBox, on && { backgroundColor: colors.accentSoft }]}>
                <Ionicons
                  name={p.id === "yookassa" ? "card-outline" : "wallet-outline"}
                  size={19}
                  color={on ? colors.accent : colors.textDim}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.itemName, on && { color: colors.accent }]}>{p.name}</Text>
                {!!p.description && <Text style={styles.itemDesc}>{p.description}</Text>}
              </View>
              {p.isDefault && <Text style={styles.defaultBadge}>по умолчанию</Text>}
              <View style={[styles.radio, on && styles.radioOn]} />
            </PressableScale>
          );
        })
      )}
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  label: { color: colors.textDim, fontSize: 13, fontWeight: "700", marginBottom: 8 },
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
  defaultBadge: { color: colors.textFaint, fontSize: 9, marginRight: 8 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
});
