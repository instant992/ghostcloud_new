import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { Button, Card, Row } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { BalanceSheet } from "../components/BalanceSheet";
import { QRScannerModal } from "../components/QRScannerModal";
import { useApp } from "../context";
import {
  BASE_URL,
  BOT_USERNAME,
  activateGiftKey,
  applyPromo,
  claimSponsorDevice,
  getDonorLeaderboard,
  getReferralLeaderboard,
  generateGiftKey,
  getGiftKeyStatus,
  qrConfirm,
  resetPassword,
  telegramLink,
  telegramUnlink,
  updateDisplayName,
  updateLogin,
  uploadAvatar,
} from "../api";
import { colors, useTheme } from "../theme";
import { formatDateTime } from "../utils/formatDate";
import { showToast } from "../components/Toast";

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
  const insets = useSafeAreaInsets();

  const nav = useNavigation<any>();
  const { me, signOut, refreshMe, subscriptionActive } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [nick, setNick] = useState("");
  const [loginStr, setLoginStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const avatarUri = me?.avatar_url
    ? `${BASE_URL}${me.avatar_url}?t=${String(Math.floor(Date.now() / 60000))}`
    : null;

  const daysLeft = (() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  })();

  const openEditor = () => {
    setNick(me?.display_name || "");
    setLoginStr(me?.login || "");
    setEditOpen(true);
  };

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast("Разрешите доступ к фото в настройках");
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
      showToast("Аватар обновлён");
    } catch (e: any) {
      showToast(e?.message || "Не удалось загрузить аватар");
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
      showToast("Профиль обновлён");
    } catch (e: any) {
      showToast(e?.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!me?.email) {
      showToast("Смена пароля доступна через сброс на почту");
      return;
    }
    try {
      await resetPassword({ email: me.email });
      showToast("Новый пароль отправлен на почту");
    } catch (e: any) {
      showToast(e?.message || "Не удалось отправить");
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
      showToast("Telegram отвязан");
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
      showToast(`Лимит устройств увеличен до ${r?.new_limit ?? "—"}`);
    } catch (e: any) {
      showToast(e?.message || "Не удалось получить бонус");
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
      showToast("Ключ доступа создан — отправьте его другу");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/30|лимит|позже/i.test(msg)) {
        showToast("Ключ можно создавать не чаще раза в 30 дней");
      } else {
        showToast(msg || "Не удалось создать ключ");
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
      showToast("Сначала создайте ключ доступа");
      return;
    }
    await Clipboard.setStringAsync(key);
    showToast("Ключ скопирован в буфер обмена");
  };

  const [promoCode, setPromoCode] = useState("");
  const [giftActivateCode, setGiftActivateCode] = useState("");
  const [lbOpen, setLbOpen] = useState(false);
  const [lbData, setLbData] = useState<{ leaderboard: any[]; my_position: number | null } | null>(null);
  const [lbBusy, setLbBusy] = useState(false);
  const [refLbOpen, setRefLbOpen] = useState(false);
  const [refLbData, setRefLbData] = useState<any[] | null>(null);
  const [refLbBusy, setRefLbBusy] = useState(false);

  const applyPromoCode = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const r = await applyPromo(code);
      if (!r?.success) throw new Error(r?.error || "Не удалось активировать промокод");
      setPromoCode("");
      await refreshMe();
      showToast(r?.message || "Промокод активирован");
    } catch (e: any) {
      showToast(e?.message || "Не удалось активировать промокод");
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
      showToast(r?.message || "Подарочная подписка на 24 часа активирована");
    } catch (e: any) {
      showToast(e?.message || "Не удалось активировать ключ");
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
      showToast(e?.message || "Не удалось загрузить рейтинг");
    } finally {
      setLbBusy(false);
    }
  };

  const openRefLeaderboard = async () => {
    setRefLbOpen(true);
    setRefLbBusy(true);
    try {
      const r = await getReferralLeaderboard();
      if (!r?.success) throw new Error(r?.error || "Ошибка загрузки");
      setRefLbData(r.leaderboard || []);
    } catch (e: any) {
      setRefLbOpen(false);
      showToast(e?.message || "Не удалось загрузить рейтинг");
    } finally {
      setRefLbBusy(false);
    }
  };

  /** QR-авторизация: подтвердить вход другого устройства по коду из QR */
  const confirmQrRaw = async (raw: string) => {
    const value = raw.trim();
    if (!value || qrBusy) return;
    const m = value.match(/qr-auth\/([A-Za-z0-9_-]+)/);
    const sessionId = m ? m[1] : value;
    setQrBusy(true);
    try {
      const r = await qrConfirm(sessionId);
      if (!r?.success) throw new Error(r?.error || "Не удалось подтвердить вход");
      setQrCode("");
      setQrOpen(false);
      setScanOpen(false);
      showToast("Устройство успешно авторизовано!");
    } catch (e: any) {
      showToast(e?.message || "Не удалось подтвердить вход");
    } finally {
      setQrBusy(false);
    }
  };

  const confirmQr = () => confirmQrRaw(qrCode);

  /** Отсканировали QR — сразу подтверждаем (как в старом приложении, без диалога) */
  const handleScanned = (value: string) => {
    confirmQrRaw(value);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Закреплённая шапка: назад + «Профиль» + шестерёнка */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + 6 }]}>
        {nav.canGoBack() ? (
          <Pressable onPress={() => nav.goBack()} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.headerTitle}>Профиль</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => nav.navigate("Настройки")} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 68, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        {/* Подписка: тариф, дни, баланс, устройства */}
        <Card>
          <Row label="Тариф" value={me?.plan || "—"} />
          <Row
            label="Истекает через"
            value={subscriptionActive ? `${daysLeft} дн.` : "истекла"}
            valueColor={subscriptionActive ? (daysLeft <= 3 ? colors.orange : colors.text) : colors.red}
          />
          <PressableScale onPress={() => setBalanceOpen(true)}>
            <Row
              label="Баланс"
              value={`${((me?.balance || 0) / 100).toFixed(0)} ₽  ›`}
              valueColor={colors.accent}
            />
          </PressableScale>
          <PressableScale onPress={() => nav.navigate("Devices")}>
            <Row label="Устройства" value={`${me?.device_count ?? 0} / ${me?.device_limit ?? 6}  ›`} />
          </PressableScale>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button size="sm" title="Продлить" onPress={() => nav.navigate("Тарифы")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button size="sm" title="Пополнить" variant="ghost" onPress={() => nav.navigate("TopUp")} />
            </View>
          </View>
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
              <Button size="sm" title="Забрать +1 устройство" loading={busy} onPress={claimDeviceBonus} />
            )}
            <Button
              size="sm"
              title={giftKey ? "Создать новый ключ" : "Ключ доступа для друга"}
              variant="ghost"
              loading={giftBusy}
              onPress={loadGiftKey}
            />
            <Button size="sm" title="Скопировать ключ" variant="ghost" onPress={copyGiftKey} />
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
            <Button size="sm" title="Пополнить баланс" onPress={() => nav.navigate("TopUp")} />
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
            <Button size="sm" title="ОК" loading={busy} onPress={applyPromoCode} />
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
            <Button size="sm" title="ОК" loading={busy} onPress={activateGift} />
          </View>
        </Card>

        <MenuItem icon="🏆" label="Топ спонсоров" onPress={openLeaderboard} />
        <MenuItem icon="🎖️" label="Топ рефералов" onPress={openRefLeaderboard} />
        <MenuItem icon="🎁" label="Реферальная программа" onPress={() => nav.navigate("Referral")} />
        <MenuItem icon="📱" label="Устройства и HWID" onPress={() => nav.navigate("Devices")} />
        <MenuItem icon="💰" label="Пополнить баланс" onPress={() => nav.navigate("TopUp")} />
        <MenuItem icon="📷" label="QR-авторизация" sub="Отсканировать код с другого устройства" onPress={() => setScanOpen(true)} />
        <PressableScale onPress={() => setQrOpen(true)} style={{ marginHorizontal: 4, marginBottom: 10, paddingVertical: 4 }}>
          <Text style={{ color: colors.textDim, fontSize: 12, textDecorationLine: "underline" }}>
            Или ввести код вручную
          </Text>
        </PressableScale>
        <MenuItem icon="💬" label="Поддержка" onPress={() => nav.navigate("Support")} />

        <Card>
          <Row label="Telegram" value={me?.telegram_linked ? "привязан" : "не привязан"} />
          {me?.telegram_linked ? (
            <Button size="sm" title="Отвязать Telegram" variant="ghost" onPress={unlinkTelegram} />
          ) : (
            <Button size="sm" title="Привязать Telegram" variant="ghost" onPress={linkTelegram} />
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

        <Button
          size="sm"
          title="Перейти в настройки"
          variant="ghost"
          onPress={() => nav.navigate("Настройки")}
        />
        <Button size="sm" title="Выйти из аккаунта" variant="danger" onPress={signOut} />
      </ScrollView>

      {/* Мини-шторка баланса */}
      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={(me?.balance || 0) / 100}
        daysLeft={daysLeft}
      />

      {/* Топ спонсоров */}
      <Modal visible={lbOpen} transparent animationType="fade" onRequestClose={() => setLbOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setLbOpen(false)}>
          <PressableScale style={[styles.modalCard, { maxHeight: "80%" }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>🏆 Топ спонсоров</Text>
            {lbBusy ? (
              <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 24 }}>Загрузка…</Text>
            ) : lbData ? (
              <ScrollView style={{ maxHeight: 420 }}>
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
              </ScrollView>
            ) : null}
            <Button size="sm" title="Закрыть" variant="ghost" onPress={() => setLbOpen(false)} />
          </PressableScale>
        </PressableScale>
      </Modal>

      {/* Топ рефералов */}
      <Modal visible={refLbOpen} transparent animationType="fade" onRequestClose={() => setRefLbOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setRefLbOpen(false)}>
          <PressableScale style={[styles.modalCard, { maxHeight: "80%" }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>🎖️ Топ рефералов</Text>
            {refLbBusy ? (
              <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 24 }}>Загрузка…</Text>
            ) : refLbData ? (
              refLbData.length === 0 ? (
                <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 20 }}>
                  Пока нет данных — пригласите друзей!
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 420 }}>
                  {refLbData.map((e: any, i: number) => (
                    <View key={i} style={[styles.lbRow, e.is_me && styles.lbRowMe]}>
                      <Text style={{ width: 34, fontSize: 15 }}>
                        {i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}`}
                      </Text>
                      <Text
                        style={{ flex: 1, color: e.is_me ? colors.accent : colors.text, fontWeight: e.is_me ? "800" : "500" }}
                        numberOfLines={1}
                      >
                        {e.masked_name || e.name || "—"}
                        {e.is_me ? "  (ВЫ)" : ""}
                      </Text>
                      <View style={[styles.lbAmount, { backgroundColor: colors.accentSoft, borderColor: colors.accent + "55" }]}>
                        <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}>
                          {e.count ?? e.referrals_count ?? e.invited ?? 0} чел.
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )
            ) : null}
            <Button size="sm" title="Закрыть" variant="ghost" onPress={() => setRefLbOpen(false)} />
          </PressableScale>
        </PressableScale>
      </Modal>

      {/* QR-авторизация */}
      <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setQrOpen(false)}>
          <PressableScale style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>📷 QR-авторизация</Text>
            <Text style={{ color: colors.textDim, fontSize: 13, textAlign: "center", marginBottom: 12 }}>
              Введите код из QR на другом устройстве, чтобы подтвердить вход в этот аккаунт.
            </Text>
            <TextInput
              style={styles.field}
              value={qrCode}
              onChangeText={setQrCode}
              autoCapitalize="none"
              placeholder="Код или ссылка из QR"
              placeholderTextColor={colors.textFaint}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button size="sm" title="Отмена" variant="ghost" onPress={() => setQrOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button size="sm" title="Подтвердить" loading={qrBusy} onPress={confirmQr} />
              </View>
            </View>
          </PressableScale>
        </PressableScale>
      </Modal>

      {/* Сканер QR (подтверждение входа другого устройства) */}
      <QRScannerModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={handleScanned}
      />

      {/* Редактирование профиля */}
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
                <Button size="sm" title="Отмена" variant="ghost" onPress={() => setEditOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button size="sm" title="Сохранить" loading={busy} onPress={saveProfile} />
              </View>
            </View>
          </PressableScale>
        </PressableScale>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
}) {
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
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{label}</Text>
        {!!sub && <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 1 }}>{sub}</Text>}
      </View>
      <Text style={{ color: colors.textFaint }}>›</Text>
    </PressableScale>
  );
}

const makeStyles = () => StyleSheet.create({
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 42,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginLeft: 2 },
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
