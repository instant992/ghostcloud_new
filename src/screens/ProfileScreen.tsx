import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { Button, Card, Row, Screen, Title } from "../components/UI";
import { useApp } from "../context";
import { BASE_URL, BOT_USERNAME, telegramLink, telegramUnlink } from "../api";
import { colors } from "../theme";

export default function ProfileScreen() {
  const nav = useNavigation<any>();
  const { me, signOut, refreshMe } = useApp();

  const linkTelegram = async () => {
    try {
      const r = await telegramLink();
      if (r?.success) {
        await WebBrowser.openBrowserAsync(`https://t.me/${r.bot_username || BOT_USERNAME}?start=link_${r.code}`);
      }
    } catch {}
    setTimeout(() => refreshMe().catch(() => {}), 8000);
  };

  const unlinkTelegram = async () => {
    try {
      await telegramUnlink();
      await refreshMe();
    } catch {}
  };

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Профиль</Title>

      <Card style={{ alignItems: "center", paddingVertical: 22 }}>
        <View style={styles.avatar}>
          <Text style={{ fontSize: 34 }}>👤</Text>
        </View>
        <Text style={styles.name}>{me?.display_name || me?.login || "Пользователь"}</Text>
        {!!me?.email && <Text style={styles.email}>{me.email}</Text>}
        <View
          style={{
            marginTop: 10,
            backgroundColor: colors.accentSoft,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>
            {me?.plan || "Без подписки"}
          </Text>
        </View>
      </Card>

      <Card>
        <Row label="Баланс" value={`${((me?.balance || 0) / 100).toFixed(0)} ₽`} valueColor={colors.accent} />
        <Row label="Действует до" value={String(me?.expire_at || "—").slice(0, 16)} />
        <Row label="Устройства" value={`${me?.device_count ?? 0} / ${me?.device_limit ?? 6}`} />
      </Card>

      <MenuItem icon="📱" label="Устройства и HWID" onPress={() => nav.navigate("Devices")} />
      <MenuItem icon="💰" label="Пополнить баланс" onPress={() => nav.navigate("TopUp")} />
      <MenuItem icon="🎁" label="Реферальная программа" onPress={() => nav.navigate("Referral")} />
      <MenuItem icon="💬" label="Поддержка" onPress={() => nav.navigate("Support")} />

      <Card>
        <Row label="Telegram" value={me?.telegram_linked ? "привязан" : "не привязан"} />
        {me?.telegram_linked ? (
          <Button title="Отвязать Telegram" variant="ghost" onPress={unlinkTelegram} />
        ) : (
          <Button title="Привязать Telegram" variant="ghost" onPress={linkTelegram} />
        )}
      </Card>

      <Card>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${BASE_URL}/offer`)}>
          <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 6 }}>
            Пользовательское соглашение
          </Text>
        </Pressable>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${BASE_URL}/privacy`)}>
          <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 6 }}>
            Политика конфиденциальности
          </Text>
        </Pressable>
      </Card>

      <Button title="Выйти из аккаунта" variant="danger" onPress={signOut} />
    </Screen>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <Text style={{ fontSize: 20, marginRight: 12 }}>{icon}</Text>
      <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textFaint }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentSoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 8,
  },
  name: { color: colors.text, fontSize: 18, fontWeight: "800" },
  email: { color: colors.textDim, fontSize: 13, marginTop: 2 },
});




