import React, { useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { Button, Card, Row, Screen, Title } from "../components/UI";
import { useApp } from "../context";
import {
  BASE_URL,
  BOT_USERNAME,
  claimSponsorDevice,
  generateGiftKey,
  getGiftKeyStatus,
  getSponsorNewsMirror,
  resetPassword,
  telegramLink,
  telegramUnlink,
  updateDisplayName,
  updateLogin,
  uploadAvatar,
} from "../api";
import { colors, useTheme } from "../theme";

export default function ProfileScreen() {
  useTheme();
  const styles = makeStyles();

  const nav = useNavigation<any>();
  const { me, signOut, refreshMe } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [nick, setNick] = useState("");
  const [loginStr, setLoginStr] = useState("");
  const [busy, setBusy] = useState(false);

  const avatarUri = me?.avatar_url ? `${BASE_URL}${me.avatar_url}?t=${Date.now()}` : null;

  const openEditor = () => {
    setNick(me?.display_name || "");
    setLoginStr(me?.login || "");
    setEditOpen(true);
  };

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Нет доступа", "Разреши доступ к фото в настройках");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setBusy(true);
      const r = await uploadAvatar(res.assets[0].uri);
      if (!r?.success) throw new Error(r?.error || "Ошибка загрузки");
      await refreshMe();
      Alert.alert("Готово", "Аватар обновлён");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось загрузить аватар");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const newNick = nick.trim();
      const newLogin = loginStr.trim();
      if (newNick && newNick !== (me?.display_name || "")) {
        const r = await updateDisplayName(newNick);
        if (!r?.success) throw new Error(r?.error || "Ошибка сохранения ника");
      }
      if (newLogin && newLogin !== (me?.login || "")) {
        const r = await updateLogin(newLogin);
        if (!r?.success) throw new Error(r?.error || "Ошибка сохранения логина");
      }
      await refreshMe();
      setEditOpen(false);
      Alert.alert("Готово", "Профиль обновлён");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!me?.email) {
      Alert.alert("Нет email", "Смена пароля доступна через сброс на почту");
      return;
    }
    try {
      await resetPassword({ email: me.email });
      Alert.alert("Проверь почту", "Туда отправлен новый пароль");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось отправить");
    }
  };

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

  const [giftBusy, setGiftBusy] = useState(false);
  const [giftKey, setGiftKey] = useState<string | null>(null);

  const isSponsor = me?.is_sponsor === true;

  const claimDeviceBonus = async () => {
    setBusy(true);
    try {
      const r = await claimSponsorDevice();
      if (!r?.success) throw new Error(r?.error || "Не удалось получить бонус");
      await refreshMe();
      Alert.alert("Готово", `Лимит устройств увеличен до ${r?.new_limit ?? "—"}`);
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось получить бонус");
    } finally {
      setBusy(false);
    }
  };

  const loadGiftKey = async () => {
    setGiftBusy(true);
    try {
      const r = await generateGiftKey();
      if (!r?.success) throw new Error(r?.error || "Не удалось создать ключ");
      setGiftKey(r.trial_key);
      Alert.alert("Готово", "Ключ доступа создан — отправьте его другу");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/30|лимит|позже/i.test(msg)) {
        Alert.alert("Ограничение", "Ключ можно создавать не чаще раза в 30 дней");
      } else {
        Alert.alert("Ошибка", msg || "Не удалось создать ключ");
      }
    } finally {
      setGiftBusy(false);
    }
  };

  const copyGiftKey = async () => {
    let key = giftKey;
    if (!key) {
      try {
        const r = await getGiftKeyStatus();
        key = r?.active_key?.token ? `${BASE_URL}/gift/${r.active_key.token}` : null;
      } catch {}
    }
    if (!key) {
      Alert.alert("Нет ключа", "Сначала создайте ключ доступа");
      return;
    }
    await Clipboard.setStringAsync(key);
    Alert.alert("Скопировано", "Ключ в буфере обмена");
  };

  const openNewsMirror = async () => {
    try {
      const r = await getSponsorNewsMirror();
      if (!r?.success || !r?.url) throw new Error(r?.error || "Зеркало не настроено");
      await WebBrowser.openBrowserAsync(r.url);
    } catch (e: any) {
      Alert.alert("Недоступно", e?.message || "Зеркало новостей не настроено");
    }
  };

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Профиль</Title>

      <Card style={{ alignItems: "center", paddingVertical: 22 }}>
        <View>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={{ fontSize: 34 }}>👤</Text>
            </View>
          )}
          <Pressable style={styles.editBadge} onPress={openEditor}>
            <Text style={{ fontSize: 13 }}>✏️</Text>
          </Pressable>
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
        {isSponsor && (
          <View
            style={{
              marginTop: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(255,140,90,0.12)",
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,140,90,0.4)",
            }}
          >
            <Image
              source={{ uri: "sponsor_heart" }}
              style={{ width: 18, height: 18 }}
              resizeMode="contain"
            />
            <Text style={{ color: "#FF9C6B", fontWeight: "800", fontSize: 12 }}>
              СПОНСОР
            </Text>
          </View>
        )}
      </Card>

      {isSponsor ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Image
              source={{ uri: "sponsor_heart" }}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
            <Text style={styles.sectionTitle}>Спонсорские привилегии</Text>
          </View>
          <Row
            label="Бонусное устройство (+1)"
            value={me?.sponsor_device_bonus_claimed ? "получен" : "доступен"}
            valueColor={me?.sponsor_device_bonus_claimed ? colors.textDim : colors.green}
          />
          {!me?.sponsor_device_bonus_claimed && (
            <Button title="Забрать +1 устройство" loading={busy} onPress={claimDeviceBonus} />
          )}
          <Button
            title={giftKey ? "Создать новый ключ" : "Ключ доступа для друга"}
            variant="ghost"
            loading={giftBusy}
            onPress={loadGiftKey}
          />
          <Button title="Скопировать ключ" variant="ghost" onPress={copyGiftKey} />
          <Button title="Зеркало новостей" variant="ghost" onPress={openNewsMirror} />
          <Text style={styles.perksHint}>
            Спасибо за поддержку сервиса! Статус спонсора действует навсегда.
          </Text>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Image
              source={{ uri: "sponsor_heart" }}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
            <Text style={styles.sectionTitle}>Стать спонсором</Text>
          </View>
          <Text style={styles.perkLine}>🎁 Бонусные месяцы — подписка добивается до 3 месяцев при покупке 1 или 2</Text>
          <Text style={styles.perkLine}>📱 +1 устройство — лимит растёт с 6 до 7</Text>
          <Text style={styles.perkLine}>🌅 Авто-тема по времени суток</Text>
          <Text style={styles.perkLine}>✨ Дополнительные темы оформления</Text>
          <Text style={styles.perkLine}>🎨 Кастомная иконка приложения</Text>
          <Text style={styles.perkLine}>🔑 Подарочный ключ — доступ для друга на 24 часа, раз в месяц</Text>
          <Text style={styles.perkLine}>🏆 Место в публичном топе спонсоров</Text>
          <Text style={styles.perksHint}>
            Статус выдаётся навсегда после пополнения от 444 ₽ одной транзакцией.
          </Text>
          <Button title="Пополнить баланс" onPress={() => nav.navigate("TopUp")} />
        </Card>
      )}

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

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Редактирование профиля</Text>

            <Pressable style={{ alignItems: "center", marginBottom: 14 }} onPress={pickAvatar} disabled={busy}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatar, { marginBottom: 0 }]}>
                  <Text style={{ fontSize: 34 }}>📷</Text>
                </View>
              )}
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
                Сменить фото
              </Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Ник (отображается в профиле)</Text>
            <TextInput style={styles.field} value={nick} onChangeText={setNick} maxLength={32} placeholder="Ник" placeholderTextColor={colors.textFaint} />

            <Text style={styles.fieldLabel}>Логин (для входа)</Text>
            <TextInput style={styles.field} value={loginStr} onChangeText={setLoginStr} maxLength={32} autoCapitalize="none" placeholder="Логин" placeholderTextColor={colors.textFaint} />

            <Pressable onPress={sendPasswordReset}>
              <Text style={{ color: colors.accent, fontSize: 12, marginBottom: 14 }}>
                🔑 Сменить пароль — отправим новый на почту
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button title="Отмена" variant="ghost" onPress={() => setEditOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Сохранить" loading={busy} onPress={saveProfile} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

const makeStyles = () => StyleSheet.create({
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentSoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 8,
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 8,
  },
  editBadge: {
    position: "absolute",
    right: -4,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  modalCard: {
    width: "100%" as const,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center" as const,
    marginBottom: 16,
  },
  fieldLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  field: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    marginBottom: 14,
  },
  name: { color: colors.text, fontSize: 18, fontWeight: "800" },
  email: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  sectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 10,
  },
  perksHint: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
  perkLine: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 20,
  },
});




