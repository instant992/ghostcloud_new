import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDonorLeaderboard } from "../api";
import { colors, useTheme } from "../theme";
import { PressableScale } from "../components/PressableScale";
import { IconButton, LoadingState } from "../components/Foundations";
import { SponsorBenefitsSheet } from "../components/SponsorBenefits";

const ORANGE = "#FF9800";

type Entry = {
  rank: number;
  masked_name: string;
  total_amount: number;
  is_me: boolean;
  referral_count?: number;
};

function medalFor(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
}

function rankColor(rank: number): string {
  return rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : colors.textDim;
}

/** «Топ спонсоров» — рейтинг по сумме пополнений. Как в эталонном приложении:
 *  карточка «Ваша позиция», таблица лидеров и значок «Преимущества спонсора» сверху справа. */
export default function SponsorLeaderboardScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [myAmount, setMyAmount] = useState(0);
  const [benefitsOpen, setBenefitsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getDonorLeaderboard();
      if (r?.success) {
        setEntries(Array.isArray(r.leaderboard) ? r.leaderboard : []);
        setMyPosition(typeof r.my_position === "number" ? r.my_position : null);
        setMyAmount(Number(r.my_total_amount || 0));
      }
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const posText = !myPosition || myPosition === 0 ? "—" : `#${myPosition}`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {/* Шапка: назад + заголовок + значок преимуществ */}
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Назад" onPress={() => nav.goBack()} />
        <Text style={styles.headerTitle}>Топ спонсоров</Text>
        <View style={{ flex: 1 }} />
        <PressableScale
          style={styles.infoBtn}
          onPress={() => setBenefitsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Преимущества спонсора"
        >
          <Ionicons name="information-outline" size={17} color={ORANGE} />
        </PressableScale>
      </View>

      {loading ? (
        <LoadingState label="Загружаем рейтинг…" />
      ) : (
        <View style={styles.body}>
          {/* Ваша позиция */}
          <View style={styles.myCard}>
            <View style={styles.myBadge}>
              <Text style={styles.myBadgeText}>{posText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.myTitle}>Ваша позиция</Text>
              <Text style={styles.mySub}>
                {myAmount > 0
                  ? `Всего поддержано: ${Math.round(myAmount)} ₽`
                  : "Поддержите проект пополнением баланса"}
              </Text>
            </View>
            {!!myPosition && myPosition > 0 && myPosition <= 3 && (
              <Text style={{ fontSize: 30 }}>{medalFor(myPosition)}</Text>
            )}
          </View>

          {/* Список лидеров */}
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={[styles.listHeaderText, { width: 40 }]}>#</Text>
              <Text style={[styles.listHeaderText, { flex: 1 }]}>Пользователь</Text>
              <Text style={styles.listHeaderText}>Поддержка</Text>
            </View>
            <View style={styles.listDivider} />
            {entries.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="trophy-outline" size={38} color={colors.textFaint} />
                <Text style={styles.emptyTitle}>Пока нет данных</Text>
                <Text style={styles.emptySub}>Будьте первым спонсором!</Text>
              </View>
            ) : (
              entries.map((e) => (
                <View key={`${e.rank}-${e.masked_name}`} style={[styles.row, e.is_me && styles.rowMe]}>
                  <View style={{ width: 40 }}>
                    {e.rank <= 3 ? (
                      <Text style={{ fontSize: 17 }}>{medalFor(e.rank)}</Text>
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: "600", color: rankColor(e.rank) }}>
                        {e.rank}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      style={[styles.rowName, e.is_me && { color: ORANGE, fontWeight: "800" }]}
                      numberOfLines={1}
                    >
                      {e.masked_name || "—"}
                    </Text>
                    <Ionicons name="heart" size={12} color="#FF5F93" />
                    {e.is_me && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>ВЫ</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.amountPill}>
                    <Text style={styles.amountText}>{Math.round(e.total_amount || 0)} ₽</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      )}

      <SponsorBenefitsSheet visible={benefitsOpen} onClose={() => setBenefitsOpen(false)} />
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      marginBottom: 8,
    },
    headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginLeft: 4 },
    infoBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: ORANGE + "26",
      borderWidth: 1.2,
      borderColor: ORANGE + "80",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    body: { flex: 1, padding: 16 },
    myCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.card,
      borderColor: ORANGE + "59",
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    myBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: ORANGE,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: ORANGE,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    myBadgeText: { color: "#fff", fontSize: 18, fontWeight: "800" },
    myTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    mySub: { color: colors.textDim, fontSize: 13, marginTop: 3 },
    listCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 8,
    },
    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    listHeaderText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
    listDivider: { height: 1, backgroundColor: colors.border },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    rowMe: { backgroundColor: ORANGE + "1A" },
    rowName: { color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1 },
    youBadge: {
      backgroundColor: ORANGE,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    youBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
    amountPill: {
      backgroundColor: ORANGE + "2E",
      borderColor: ORANGE + "59",
      borderWidth: 0.8,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginLeft: 8,
    },
    amountText: { color: ORANGE, fontSize: 13, fontWeight: "800" },
    empty: { alignItems: "center", paddingVertical: 28, gap: 6 },
    emptyTitle: { color: colors.textDim, fontSize: 14 },
    emptySub: { color: colors.textFaint, fontSize: 12 },
  });
