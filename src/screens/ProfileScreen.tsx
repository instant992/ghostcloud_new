import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
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
import { Button, Card, Row, useInTabArea } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { BalanceSheet } from "../components/BalanceSheet";
import { QRScannerModal } from "../components/QRScannerModal";
import { SponsorBenefitsSheet } from "../components/SponsorBenefits";
import { CustomBadge, SponsorHeart, VerifiedBadge } from "../components/Badges";
import { useApp } from "../context";
import {
  BASE_URL,
  BOT_USERNAME,
  activateGiftKey,
  applyPromo,
  claimSponsorDevice,
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
import { colors, sheetSurfaceBg, useTheme } from "../theme";
import { showToast } from "../components/Toast";

export default function ProfileScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const inTabs = useInTabArea();

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
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftKey, setGiftKey] = useState<string | null>(null);
  const [giftBusy, setGiftBusy] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);

  const avatarUri = me?.avatar_url
    ? `${BASE_URL}${me.avatar_url}?t=${String(Math.floor(Date.now() / 60000))}`
    : null;
  const isSponsor = me?.is_sponsor === true;
  // Эффективный бейдж: явный из nick_style либо автоматический «спонсор»
  const effectiveBadge = me?.nick_style?.badge_type ?? (isSponsor ? "sponsor" : null);

  const daysLeft = (() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  })();

  const openEditor = () => {
    setNick(me?.display_name || "");
    // Обычный пользователь редактирует суффикс (префикс «ghostcl_» добавляет сервер),
    // спонсор — полный ник.
    const full = me?.login || "";
    setLoginStr(!isSponsor && full.startsWith("ghostcl_") ? full.slice(8) : full);
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
      const oldLogin = me?.login || "";
      if (newLogin && newLogin !== oldLogin) {
        // Спонсор задаёт ник целиком (мин. 7 символов, без префикса),
        // обычный пользователь — суффикс, префикс «ghostcl_» добавляет сервер.
        const r = await updateLogin(newLogin, isSponsor);
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

  const unlinkTelegram = () => {
    Alert.alert("Отвязать Telegram?", "Вы сможете привязать его снова в любой момент.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Отвязать",
        style: "destructive",
        onPress: async () => {
          try {
            await telegramUnlink();
            await refreshMe();
            showToast("Telegram отвязан");
          } catch {}
        },
      },
    ]);
  };

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

  /** Промокод или подарочный ключ из одного поля */
  const applyCode = async (asGift: boolean) => {
    const code = promoCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const r = asGift ? await activateGiftKey(code) : await applyPromo(code);
      if (!r?.success) throw new Error(r?.error || "Не удалось применить код");
      setPromoCode("");
      setPromoOpen(false);
      await refreshMe();
      showToast(r?.message || (asGift ? "Подарочная подписка активирована" : "Промокод применён"));
    } catch (e: any) {
      showToast(e?.message || "Не удалось применить код");
    } finally {
      setBusy(false);
    }
  };

  /** Спонсорский подарочный ключ (1 раз в 30 дней) */
  const makeGiftKey = async () => {
    setGiftBusy(true);
    try {
      const r = await generateGiftKey();
      if (!r?.success) throw new Error(r?.error || "Не удалось создать ключ");
      setGiftKey(r.trial_key);
      showToast("Ключ создан — отправьте его другу");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/30|лимит|позже/i.test(msg)) showToast("Ключ можно создавать не чаще раза в 30 дней");
      else showToast(msg || "Не удалось создать ключ");
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
      showToast("Сначала создайте ключ");
      return;
    }
    await Clipboard.setStringAsync(key);
    showToast("Ключ скопирован в буфер обмена");
  };

  const shareGiftKey = async () => {
    let key = giftKey;
    if (!key) {
      try {
        const r = await getGiftKeyStatus();
        key = r?.active_key?.token ? `${BASE_URL}/gift/${r.active_key.token}` : null;
      } catch {}
    }
    if (!key) {
      showToast("Сначала создайте ключ");
      return;
    }
    Share.share({ message: `Держи подарок GhostCloud — 24 часа VPN-доступа.\nАктивируй по ссылке: ${key}` }).catch(
      () => {}
    );
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Закреплённая шапка: назад + «Профиль» + шестерёнка */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + 6 }]}>
        {nav.canGoBack() ? (
          <Pressable
            onPress={() => nav.goBack()}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Назад"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.headerTitle}>Профиль</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => nav.navigate("Настройки")}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Открыть настройки"
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
          bounces={false}
          overScrollMode="never"
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 66,
          paddingBottom: inTabs ? insets.bottom + 116 : insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Карточка аккаунта ─── */}
        <Card>
          <View style={styles.accRow}>
            <PressableScale onPress={openEditor} accessibilityLabel="Изменить профиль">
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatar}>
                  <Ionicons name="person" size={26} color={colors.accent} />
                </View>
              )}
            </PressableScale>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <Text style={styles.name} numberOfLines={1}>
                  {me?.display_name || me?.login || "Пользователь"}
                </Text>
                {!!effectiveBadge && <VerifiedBadge type={effectiveBadge} size={17} />}
                {(me?.badges || []).map((b) => (
                  <CustomBadge key={b.id} badge={b} size={18} />
                ))}
                {isSponsor && <SponsorHeart size={16} />}
              </View>
              {!!me?.email && (
                <Text style={styles.email} numberOfLines={1}>
                  {me.email}
                </Text>
              )}
            </View>
            <Pressable
              onPress={openEditor}
              hitSlop={10}
              style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel="Изменить имя"
            >
              <Ionicons name="pencil" size={18} color={colors.textDim} />
            </Pressable>
          </View>

          <View style={styles.rowsBlock}>
            <Row label="Тариф" value={me?.plan || "—"} compact />
            <Row
              label="Истекает через"
              value={subscriptionActive ? `${daysLeft} дн.` : "истекла"}
              valueColor={subscriptionActive ? (daysLeft <= 3 ? colors.orange : colors.text) : colors.red}
              compact
            />
            <PressableScale onPress={() => setBalanceOpen(true)} accessibilityLabel="Баланс и история операций">
              <Row
                label="Баланс"
                value={`${((me?.balance || 0) / 100).toFixed(0)} ₽  ›`}
                valueColor={colors.accent}
                compact
              />
            </PressableScale>
            <PressableScale onPress={() => nav.navigate("Devices")} accessibilityLabel="Устройства">
              <Row label="Устройства" value={`${me?.device_count ?? 0} / ${me?.device_limit ?? 6}  ›`} compact />
            </PressableScale>
            {isSponsor && !me?.sponsor_device_bonus_claimed && (
              <View style={styles.bonusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bonusTitle}>Бонусное устройство (+1)</Text>
                  <Text style={styles.bonusSub}>Спонсорам — бесплатно</Text>
                </View>
                <Button size="sm" title="Забрать" loading={busy} onPress={claimDeviceBonus} />
              </View>
            )}
          </View>

          {/* Кнопки: Продлить / Подарить (спонсорам) / Промокод */}
          <View style={styles.chipsRow}>
            <View style={{ flex: 1 }}>
              <Button size="sm" title="Продлить" onPress={() => nav.navigate("Тарифы")} />
            </View>
            {isSponsor && (
              <View style={{ flex: 1 }}>
                <Button size="sm" title="Подарить" variant="ghost" onPress={() => setGiftOpen(true)} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button size="sm" title="Промокод" variant="ghost" onPress={() => setPromoOpen(true)} />
            </View>
          </View>
        </Card>

        {/* ─── Меню ─── */}
        <View style={styles.menuCard}>
          <MenuItem
            icon="people"
            iconColor={colors.accent}
            title="Рефералы"
            sub="Пригласите друзей и получайте бонусы"
            onPress={() => nav.navigate("Referral")}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="trophy"
            iconColor="#FF9800"
            title="Топ спонсоров"
            sub="Рейтинг по сумме пополнений · преимущества"
            onPress={() => nav.navigate("SponsorLeaderboard")}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="send"
            iconColor="#2AABEE"
            title="Привязка Telegram"
            sub={me?.telegram_linked ? "Telegram подключён" : "Привяжите Telegram для удобства"}
            trailing={
              me?.telegram_linked ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.green} />
              ) : undefined
            }
            onPress={me?.telegram_linked ? unlinkTelegram : linkTelegram}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="qr-code"
            iconColor={colors.accent}
            title="QR-авторизация"
            sub="Вход на другом устройстве по QR"
            onPress={() => setScanOpen(true)}
          />
        </View>

        {/* ─── Настройки и выход ─── */}
        <PressableScale
          style={styles.settingsBtn}
          onPress={() => nav.navigate("Настройки")}
          accessibilityRole="button"
        >
          <Ionicons name="settings" size={19} color="#fff" />
          <Text style={styles.settingsBtnText}>Перейти в настройки</Text>
        </PressableScale>
        <PressableScale
          style={styles.logoutBtn}
          onPress={() => setLogoutOpen(true)}
          accessibilityRole="button"
        >
          <Ionicons name="log-out" size={19} color="#fff" />
          <Text style={styles.logoutBtnText}>Выйти из аккаунта</Text>
        </PressableScale>
      </ScrollView>

      {/* ─── Шторки и модалки ─── */}
      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={(me?.balance || 0) / 100}
        daysLeft={daysLeft}
      />
      <SponsorBenefitsSheet visible={benefitsOpen} onClose={() => setBenefitsOpen(false)} />
      <QRScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onScan={(v) => confirmQrRaw(v)} />

      {/* Редактирование профиля */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Редактирование профиля</Text>
            <PressableScale style={{ alignItems: "center", marginBottom: 14 }} onPress={pickAvatar} disabled={busy}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImageBig} />
              ) : (
                <View style={[styles.avatar, styles.avatarBig, { marginBottom: 0 }]}>
                  <Ionicons name="camera" size={30} color={colors.accent} />
                </View>
              )}
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
                Сменить фото
              </Text>
            </PressableScale>
            <Text style={styles.fieldLabel}>Ник (отображается в профиле)</Text>
            <TextInput style={styles.field} value={nick} onChangeText={setNick} maxLength={32} placeholder="Ник" placeholderTextColor={colors.textFaint} />
            <Text style={styles.fieldLabel}>Логин (для входа)</Text>
            {!isSponsor && (
              <Text style={{ color: colors.textFaint, fontSize: 11, marginBottom: 6 }}>
                К вашему нику будет добавлен префикс «ghostcl_»
              </Text>
            )}
            {isSponsor && (
              <Text style={{ color: colors.textFaint, fontSize: 11, marginBottom: 6 }}>
                Спонсорам доступен произвольный ник от 7 символов
              </Text>
            )}
            <TextInput style={styles.field} value={loginStr} onChangeText={setLoginStr} maxLength={32} autoCapitalize="none" placeholder={isSponsor ? "Ник" : "Суффикс ника"} placeholderTextColor={colors.textFaint} />
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Промокод / подарочный ключ */}
      <Modal visible={promoOpen} transparent animationType="fade" onRequestClose={() => setPromoOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPromoOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Ввести промокод</Text>
            <TextInput
              style={styles.field}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              placeholder="Промокод или подарочный ключ"
              placeholderTextColor={colors.textFaint}
            />
            <View style={{ gap: 8 }}>
              <Button title="Применить промокод" loading={busy} onPress={() => applyCode(false)} />
              <Button title="Активировать подарочный ключ (24 ч)" variant="ghost" loading={busy} onPress={() => applyCode(true)} />
              <Button size="sm" title="Отмена" variant="ghost" onPress={() => setPromoOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Подарок для друга (спонсорам) */}
      <Modal visible={giftOpen} transparent animationType="fade" onRequestClose={() => setGiftOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGiftOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Подарок для друга</Text>
            <Text style={styles.modalText}>
              Раз в 30 дней вы можете подарить любому пользователю бесплатную подписку на 24 часа.
              Сгенерируйте ключ и отправьте его другу.
            </Text>
            {!!giftKey && (
              <View style={styles.giftKeyBox}>
                <Text style={styles.giftKeyText} selectable>
                  {giftKey}
                </Text>
              </View>
            )}
            <View style={{ gap: 8, marginTop: 4 }}>
              {!giftKey && <Button title="Сгенерировать ключ" loading={giftBusy} onPress={makeGiftKey} />}
              {!!giftKey && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Скопировать" variant="ghost" onPress={copyGiftKey} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Поделиться" onPress={shareGiftKey} />
                  </View>
                </View>
              )}
              <Button size="sm" title="Закрыть" variant="ghost" onPress={() => setGiftOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Подтверждение выхода */}
      <Modal visible={logoutOpen} transparent animationType="fade" onRequestClose={() => setLogoutOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLogoutOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Выйти из аккаунта?</Text>
            <Text style={styles.modalText}>
              Вы будете перенаправлены на экран входа. Для повторного входа потребуется авторизация.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Button title="Отмена" variant="ghost" onPress={() => setLogoutOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Выйти" variant="danger" onPress={signOut} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon,
  iconColor,
  title,
  sub,
  trailing,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  title: string;
  sub?: string;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          backgroundColor: iconColor + "26",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>{title}</Text>
        {!!sub && (
          <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 2, opacity: 0.85 }} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {trailing || <Ionicons name="chevron-forward" size={19} color={colors.textFaint} />}
    </PressableScale>
  );
}

const makeStyles = () =>
  StyleSheet.create({
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
    accRow: { flexDirection: "row", alignItems: "center" },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarBig: { width: 76, height: 76, borderRadius: 38 },
    avatarImage: { width: 52, height: 52, borderRadius: 26 },
    avatarImageBig: { width: 76, height: 76, borderRadius: 38 },
    name: { color: colors.text, fontSize: 16, fontWeight: "800", flexShrink: 1 },
    email: { color: colors.textDim, fontSize: 12, marginTop: 1 },
    editBtn: { padding: 8 },
    rowsBlock: { marginTop: 4 },
    bonusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 2,
    },
    bonusTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
    bonusSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
    chipsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    menuCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      marginBottom: 12,
      overflow: "hidden",
    },
    menuDivider: { height: 1, backgroundColor: colors.border, marginLeft: 72, opacity: 0.5 },
    settingsBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.green,
      marginBottom: 8,
    },
    settingsBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.red,
    },
    logoutBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      backgroundColor: sheetSurfaceBg(),
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 14,
    },
    modalText: {
      color: colors.textDim,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 19,
      marginBottom: 12,
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
    giftKeyBox: {
      backgroundColor: colors.bgSoft,
      borderColor: colors.accent + "4D",
      borderWidth: 1.5,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    giftKeyText: { color: colors.text, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  });
