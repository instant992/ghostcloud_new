import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { useApp } from "../context";

import * as stats from "../stats";
import { formatBytes } from "../theme";
import { getXrayVersion } from "../vpn/native";
import { TvFocusable } from "./TvFocusable";
import { pluralDays } from "./TvHomeScreen";

/** Профиль для Android TV: вся информация об аккаунте одним экраном —
 *  как в телефонном «Профиле», но только просмотр (действия с вводом
 *  (2FA, промокоды, подарки) остаются в мобильном приложении). */
export function TvProfileTab() {
  const { me, avatarUri, subscriptionActive, refreshMe, signOut } = useApp();
  const [weekStat, setWeekStat] = useState<stats.DayStat | null>(null);
  const [monthStat, setMonthStat] = useState<stats.DayStat | null>(null);
  const [xrayVersion, setXrayVersion] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    refreshMe().catch(() => {});
    stats.sumDays(7).then(setWeekStat).catch(() => {});
    stats.sumDays(30).then(setMonthStat).catch(() => {});
    try {
      setXrayVersion(getXrayVersion());
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const isSponsor = me?.is_sponsor === true;

  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me?.expire_at]);

  const expireLabel = useMemo(() => {
    if (!me?.expire_at) return "—";
    const d = new Date(String(me.expire_at));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  }, [me?.expire_at]);

  const appVersion = Application.nativeApplicationVersion || "?";

  if (!me) {
    return (
      <View style={s.centerWrap}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (confirmSignOut) {
    return (
      <View style={s.centerWrap}>
        <View style={s.confirmCard}>
          <Text style={s.confirmTitle}>Выйти из аккаунта?</Text>
          <Text style={s.confirmSub}>
            {me.login
              ? `Сессия «${me.login}» на этом телевизоре будет завершена.`
              : "Сессия на этом телевизоре будет завершена."}
          </Text>
          <View style={s.confirmBtnRow}>
            <TvFocusable
              autoFocus
              onPress={() => setConfirmSignOut(false)}
              style={s.confirmBtn}
              borderRadius={15}
              accessibilityLabel="Отмена"
            >
              <View style={[s.confirmBtnInner, s.confirmBtnGhost]}>
                <Text style={s.confirmBtnGhostText}>Отмена</Text>
              </View>
            </TvFocusable>
            <TvFocusable
              onPress={() => {
                setConfirmSignOut(false);
                signOut().catch(() => {});
              }}
              style={s.confirmBtn}
              borderRadius={15}
              accessibilityLabel="Выйти"
            >
              <View style={[s.confirmBtnInner, s.confirmBtnDanger]}>
                <Text style={s.confirmBtnDangerText}>Выйти</Text>
              </View>
            </TvFocusable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Шапка: аватар, ник, логин, бейджи */}
      <View style={s.heroCard}>
        {avatarUri ? (
          <Image fadeDuration={0} source={{ uri: avatarUri }} style={s.avatar} resizeMode="cover" />
        ) : (
          <Image source={{ uri: "app_icon" }} style={s.avatar} resizeMode="cover" />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.heroNameRow}>
            <Text style={s.heroName} numberOfLines={1}>
              {me.display_name || me.login || "—"}
            </Text>
            {isSponsor && (
              <View style={s.sponsorBadge}>
                <Ionicons name="heart" size={13} color="#fff" />
                <Text style={s.sponsorBadgeText}>СПОНСОР</Text>
              </View>
            )}
          </View>
          <Text style={s.heroLogin} numberOfLines={1}>
            @{me.login || "—"}
          </Text>
          <View style={s.heroMetaRow}>
            <View style={s.metaPill}>
              <Ionicons name="card-outline" size={13} color={subscriptionActive ? "#34D399" : "#F87171"} />
              <Text style={[s.metaPillText, { color: subscriptionActive ? "#34D399" : "#F87171" }]}>
                {subscriptionActive ? "Подписка активна" : "Подписка истекла"}
              </Text>
            </View>
            {!!me.plan && (
              <View style={s.metaPill}>
                <Ionicons name="star-outline" size={13} color="#A855F7" />
                <Text style={s.metaPillText}>{me.plan}</Text>
              </View>
            )}
            <View style={s.metaPill}>
              <Ionicons name={me.telegram_linked ? "paper-plane" : "close-circle-outline"} size={13} color={me.telegram_linked ? "#34D399" : "#8F84AC"} />
              <Text style={s.metaPillText}>{me.telegram_linked ? "Telegram привязан" : "Telegram не привязан"}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Подписка и баланс */}
      <View style={s.gridRow}>
        <View style={s.statCard}>
          <Text style={s.statHead}>Подписка</Text>
          <Text style={[s.statBig, { color: daysLeft <= 0 ? "#F87171" : daysLeft <= 3 ? "#FBBF24" : "#FFFFFF" }]}>
            {daysLeft > 0 ? `${daysLeft} ${pluralDays(daysLeft)}` : "истекла"}
          </Text>
          <Text style={s.statSub}>до {expireLabel}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statHead}>Баланс</Text>
          <Text style={s.statBig}>{((me.balance || 0) / 100).toFixed(0)} ₽</Text>
          <Text style={s.statSub}>продление — на телефоне или сайте</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statHead}>Устройства</Text>
          <Text style={s.statBig}>
            {me.device_count ?? "—"}
            {me.device_limit ? ` / ${me.device_limit}` : ""}
          </Text>
          <Text style={s.statSub}>подключено к аккаунту</Text>
        </View>
      </View>

      {/* Трафик */}
      <View style={s.gridRow}>
        <View style={s.statCard}>
          <Text style={s.statHead}>Трафик за 7 дней</Text>
          <Text style={s.statBig}>{weekStat ? `${formatBytes(weekStat.rx + weekStat.tx)}` : "…"}</Text>
          <Text style={s.statSub}>
            {weekStat ? `↓ ${formatBytes(weekStat.rx)} · ↑ ${formatBytes(weekStat.tx)}` : " "}
          </Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statHead}>Трафик за 30 дней</Text>
          <Text style={s.statBig}>{monthStat ? `${formatBytes(monthStat.rx + monthStat.tx)}` : "…"}</Text>
          <Text style={s.statSub}>
            {monthStat ? `↓ ${formatBytes(monthStat.rx)} · ↑ ${formatBytes(monthStat.tx)}` : " "}
          </Text>
        </View>
      </View>

      {/* Детали аккаунта */}
      <View style={s.row}>
        <Ionicons name="mail-outline" size={20} color="#A855F7" />
        <Text style={s.rowTitle}>Email</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.rowValue} numberOfLines={1}>
          {me.email || "не указан"}
        </Text>
      </View>
      <View style={s.row}>
        <Ionicons name="key-outline" size={20} color="#A855F7" />
        <Text style={s.rowTitle}>Пароль</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.rowValue}>смена — в приложении на телефоне</Text>
      </View>
      <View style={s.row}>
        <Ionicons name="information-circle-outline" size={20} color="#A855F7" />
        <Text style={s.rowTitle}>Версия</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.rowValue}>
          v{appVersion}{xrayVersion ? ` · Xray ${xrayVersion}` : ""}
        </Text>
      </View>

      {/* Выход */}
      <TvFocusable
        onPress={() => setConfirmSignOut(true)}
        style={s.signOut}
        borderRadius={17}
        scale={1.015}
        accessibilityLabel="Выйти из аккаунта"
      >
        <View style={s.signOutInner}>
          <Ionicons name="log-out-outline" size={20} color="#F87171" />
          <Text style={s.signOutText}>Выйти из аккаунта</Text>
        </View>
      </TvFocusable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  content: { gap: 12, paddingBottom: 26 },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    backgroundColor: "#1C1433",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2E2150",
    padding: 20,
  },
  avatar: { width: 84, height: 84, borderRadius: 24, backgroundColor: "#251A42" },
  heroNameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroName: { color: "#FFFFFF", fontSize: 24, fontWeight: "900", flexShrink: 1 },
  sponsorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#7C3AED",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sponsorBadgeText: { color: "#fff", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },
  heroLogin: { color: "#9C93B8", fontSize: 14, marginTop: 2 },
  heroMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#251A42",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  metaPillText: { color: "#CFC6E8", fontSize: 12, fontWeight: "700" },

  gridRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "#1C1433",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E2150",
    padding: 16,
    gap: 3,
  },
  statHead: { color: "#9C93B8", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  statBig: { color: "#FFFFFF", fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statSub: { color: "#8F84AC", fontSize: 12 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1C1433",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 17,
    paddingHorizontal: 18,
    minHeight: 60,
  },
  rowTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  rowValue: { color: "#9C93B8", fontSize: 13.5, maxWidth: 420, textAlign: "right" },

  signOut: { width: "100%" },
  signOutInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
    borderRadius: 17,
    minHeight: 58,
  },
  signOutText: { color: "#F87171", fontSize: 15.5, fontWeight: "800" },

  confirmCard: {
    backgroundColor: "#1C1433",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2E2150",
    padding: 28,
    width: 520,
    alignItems: "center",
  },
  confirmTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  confirmSub: { color: "#9C93B8", fontSize: 14, marginTop: 8, marginBottom: 6, textAlign: "center" },
  confirmBtnRow: { flexDirection: "row", gap: 12, marginTop: 18, alignSelf: "stretch" },
  confirmBtn: { flex: 1 },
  confirmBtnInner: { height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  confirmBtnGhost: { backgroundColor: "#251A42", borderWidth: 1, borderColor: "#2E2150" },
  confirmBtnGhostText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  confirmBtnDanger: { backgroundColor: "#DC2626" },
  confirmBtnDangerText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
