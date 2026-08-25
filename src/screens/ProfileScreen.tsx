import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { Button, Card, Row, Screen, Title } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { useApp } from "../context";
import {
  BASE_URL,
  BOT_USERNAME,
  activateGiftKey,
  applyPromo,
  claimSponsorDevice,
  getDonorLeaderboard,
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

/** Пульсирующее сердечко спонсора — свечение в духе кнопки VPN */
function SponsorHeart({ size = 20 }: { size?: number }) {
  useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  return (
    <View style={{ width: size * 1.9, height: size * 1.9, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size * 1.5,
          height: size * 1.5,
          borderRadius: size,
          backgroundColor: "rgba(255,140,90,0.3)",
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.5] }) }],
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        }}
      />
      <Animated.Image
        source={{ uri: "sponsor_heart" }}
        style={{
          width: size,
          height: size,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
        }}
        resizeMode="contain"
      />
    </View>
  );
}

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

  const [promoCode, setPromoCode] = useState("");
  const [giftActivateCode, setGiftActivateCode] = useState("");
  const [lbOpen, setLbOpen] = useState(false);
  const [lbData, setLbData] = useState<{ leaderboard: any[]; my_position: number | null } | null>(null);
  const [lbBusy, setLbBusy] = useState(false);

  const applyPromoCode = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const r = await applyPromo(code);
      if (!r?.success) throw new Error(r?.error || "Не удалось активировать промокод");
      setPromoCode("");
      await refreshMe();
      Alert.alert("Готово", r?.message || "Промокод активирован");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось активировать промокод");
    } finally {
      setBusy(false);
    }
  };

  const activateGift = async () => {
    const code = giftActivateCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const r = await activateGiftKey(code);
      if (!r?.success) throw new Error(r?.error || "Не удалось активировать ключ");
      setGiftActivateCode("");
      await refreshMe();
      Alert.alert("Готово", r?.message || "Подарочная подписка на 24 часа активирована");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось активировать ключ");
    } finally {
      setBusy(false);
    }
  };

  const openLeaderboard = async () => {
    setLbOpen(true);
    setLbBusy(true);
    try {
      const r = await getDonorLeaderboard();
      if (!r?.success) throw new Error(r?.error || "Ошибка загрузки");
      setLbData({ leaderboard: r.leaderboard || [], my_position: r.my_position ?? null });
    } catch (e: any) {
      setLbOpen(false);
      Alert.alert("Ошибка", e?.message || "Не удалось загрузить рейтинг");
    } finally {
      setLbBusy(false);
    }
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
          <PressableScale style={styles.editBadge} onPress={openEditor}>
            <Text style={{ fontSize: 13 }}>✏️</Text>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.name}>{me?.display_name || me?.login || "Пользователь"}</Text>
          {isSponsor && <SponsorHeart size={20} />}
        </View>
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
            <SponsorHeart size={22} />
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
            <SponsorHeart size={22} />
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: 20 }}>🎁</Text>
          <Text style={styles.sectionTitle}>Подарки и бонусы</Text>
        </View>
        <Text style={styles.fieldLabel}>Промокод</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TextInput
            style={[styles.field, { flex: 1, marginBottom: 0 }]}
            value={promoCode}
            onChangeText={setPromoCode}
            autoCapitalize="none"
            placeholder="Введите промокод"
            placeholderTextColor={colors.textFaint}
          />
          <Button title="ОК" loading={busy} onPress={applyPromoCode} />
        </View>
        <Text style={styles.fieldLabel}>Активировать подарочный ключ (24 ч.)</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            style={[styles.field, { flex: 1, marginBottom: 0 }]}
            value={giftActivateCode}
            onChangeText={setGiftActivateCode}
            autoCapitalize="none"
            placeholder="Ключ от друга"
            placeholderTextColor={colors.textFaint}
          />
          <Button title="ОК" loading={busy} onPress={activateGift} />
        </View>
      </Card>

      <MenuItem icon="🏆" label="Топ спонсоров" onPress={openLeaderboard} />

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
        <PressableScale onPress={() => WebBrowser.openBrowserAsync(`${BASE_URL}/offer`)}>
          <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 6 }}>
            Пользовательское соглашение
          </Text>
        </PressableScale>
        <PressableScale onPress={() => WebBrowser.openBrowserAsync(`${BASE_URL}/privacy`)}>
          <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 6 }}>
            Политика конфиденциальности
          </Text>
        </PressableScale>
      </Card>

      <Button title="Выйти из аккаунта" variant="danger" onPress={signOut} />

      <Modal visible={lbOpen} transparent animationType="fade" onRequestClose={() => setLbOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setLbOpen(false)}>
          <PressableScale style={[styles.modalCard, { maxHeight: "80%" }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>🏆 Топ спонсоров</Text>
            {lbBusy ? (
              <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 24 }}>Загрузка…</Text>
            ) : lbData ? (
              <>
                <View style={styles.lbMyCard}>
                  <View style={styles.lbMyBadge}>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
                      {lbData.my_position ? `#${lbData.my_position}` : "—"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>Ваша позиция</Text>
                    <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}>
                      Поддержите проект пополнением баланса
                    </Text>
                  </View>
                  {!!lbData.my_position && lbData.my_position <= 3 && (
                    <Text style={{ fontSize: 28 }}>{["🥇", "🥈", "🥉"][lbData.my_position - 1]}</Text>
                  )}
                </View>
                {lbData.leaderboard.length === 0 ? (
                  <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 20 }}>
                    Пока нет данных — будьте первым спонсором!
                  </Text>
                ) : (
                  lbData.leaderboard.map((e: any, i: number) => (
                    <View key={i} style={[styles.lbRow, e.is_me && styles.lbRowMe]}>
                      <Text style={{ width: 34, fontSize: 15 }}>
                        {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : `${e.rank}`}
                      </Text>
                      <Text style={{ flex: 1, color: e.is_me ? "#FF9C6B" : colors.text, fontWeight: e.is_me ? "800" : "500" }} numberOfLines={1}>
                        {e.masked_name || "—"}
                        {e.is_me ? "  (ВЫ)" : ""}
                      </Text>
                      <View style={styles.lbAmount}>
                        <Text style={{ color: "#FF9C6B", fontWeight: "800", fontSize: 12 }}>
                          {e.total_amount || 0} ₽
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            ) : null}
            <Button title="Закрыть" variant="ghost" onPress={() => setLbOpen(false)} />
          </PressableScale>
        </PressableScale>
      </Modal>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <PressableScale style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Редактирование профиля</Text>

            <PressableScale style={{ alignItems: "center", marginBottom: 14 }} onPress={pickAvatar} disabled={busy}>
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
            </PressableScale>

            <Text style={styles.fieldLabel}>Ник (отображается в профиле)</Text>
            <TextInput style={styles.field} value={nick} onChangeText={setNick} maxLength={32} placeholder="Ник" placeholderTextColor={colors.textFaint} />

            <Text style={styles.fieldLabel}>Логин (для входа)</Text>
            <TextInput style={styles.field} value={loginStr} onChangeText={setLoginStr} maxLength={32} autoCapitalize="none" placeholder="Логин" placeholderTextColor={colors.textFaint} />

            <PressableScale onPress={sendPasswordReset}>
              <Text style={{ color: colors.accent, fontSize: 12, marginBottom: 14 }}>
                🔑 Сменить пароль — отправим новый на почту
              </Text>
            </PressableScale>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button title="Отмена" variant="ghost" onPress={() => setEditOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Сохранить" loading={busy} onPress={saveProfile} />
              </View>
            </View>
          </PressableScale>
        </PressableScale>
      </Modal>
    </Screen>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <PressableScale
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
    </PressableScale>
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
  lbMyCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: "rgba(255,140,90,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,140,90,0.35)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  lbMyBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF9C6B",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  lbRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  lbRowMe: {
    backgroundColor: "rgba(255,140,90,0.10)",
  },
  lbAmount: {
    backgroundColor: "rgba(255,140,90,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,140,90,0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
});




