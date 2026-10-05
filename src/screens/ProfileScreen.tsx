import React, { useEffect, useState } from "react";
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
import { GlassCard, GlassButton } from "../components/liquidGlass";
import { QuickNavBar, themeHasQuickNav } from "../components/QuickNavBar";
import { getThemeName } from "../settings";
import { PressableScale } from "../components/PressableScale";
import { FoxRenew, FoxRenewSheet } from "../components/FoxRenew";
import { BalanceSheet } from "../components/BalanceSheet";
import { QRScannerModal } from "../components/QRScannerModal";
import { SponsorBenefitsSheet } from "../components/SponsorBenefits";
import { CustomBadge, SponsorHeart, VerifiedBadge } from "../components/Badges";
import QRCode from "react-native-qrcode-svg";
import { useApp } from "../context";
import {
  BASE_URL,
  BOT_USERNAME,
  activateGiftKey,
  applyPromo,
  claimSponsorDevice,
  generateGiftKey,
  getGiftKeyStatus,
  getPrices,
  giftSubscription,
  qrConfirm,
  resetPassword,
  telegramLink,
  telegramUnlink,
  twoFaConfirm,
  twoFaDisable,
  twoFaRegenerateBackup,
  twoFaSetup,
  twoFaStatus,
  updateDisplayName,
  updateLogin,
  uploadAvatar,
} from "../api";
import { colors, sheetSurfaceBg, useTheme } from "../theme";
import { showToast } from "../components/Toast";

/** Обёртки блоков экрана: в теме Liquid Glass — уникальные стеклянные блоки
 *  (те же GlassCard/GlassButton, что на главной и в меню), в остальных темах —
 *  общие Card/Button из UI.tsx. Модульные компоненты (не инлайн) — стабильная
 *  идентичность, без ремаунтов при ре-рендере. */
function ThemeCard({ glass, children, style }: { glass: boolean; children: React.ReactNode; style?: any }) {
  return glass ? <GlassCard radius={20} style={style}>{children}</GlassCard> : <Card style={style}>{children}</Card>;
}

function ThemeButton(p: {
  glass: boolean;
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  const { glass, ...rest } = p;
  return glass ? <GlassButton {...rest} /> : <Button {...rest} />;
}

/** Оболочка без внутреннего отступа (меню): glass → GlassCard radius 16,
 *  иначе — обычный View со стилями menuCard вызывающей стороны. */
function ShellBlock({
  glass,
  children,
  plainStyle,
}: {
  glass: boolean;
  children: React.ReactNode;
  plainStyle?: any;
}) {
  return glass ? (
    <GlassCard radius={16} style={{ marginBottom: 12 }}>{children}</GlassCard>
  ) : (
    <View style={plainStyle}>{children}</View>
  );
}

export default function ProfileScreen() {
  const { style: themeStyle } = useTheme();
  const isGlass = themeStyle === "glass";
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const inTabs = useInTabArea();

  const nav = useNavigation<any>();
  const { me, refreshMe, subscriptionActive, isFoxcloud } = useApp();

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
  // Платный подарок подписки (кнопка «Подарить»)
  const [paidGiftOpen, setPaidGiftOpen] = useState(false);
  const [paidRecipient, setPaidRecipient] = useState("");
  const [paidPlan, setPaidPlan] = useState<string | null>(null);
  const [paidPrices, setPaidPrices] = useState<Record<string, number>>({});
  const [paidNames, setPaidNames] = useState<Record<string, string>>({});
  const [paidDays, setPaidDays] = useState<Record<string, number>>({});
  const [paidBusy, setPaidBusy] = useState(false);
  // Двухфакторная аутентификация (TOTP)
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [twoFaBackupLeft, setTwoFaBackupLeft] = useState(0);
  const [twoFaSetupData, setTwoFaSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [twoFaBackupCodes, setTwoFaBackupCodes] = useState<string[] | null>(null);
  const [twoFaBusy, setTwoFaBusy] = useState(false);
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

  // Статус 2FA для подписи пункта меню (вкл/выкл) — грузим один раз при входе
  useEffect(() => {
    twoFaStatus()
      .then((r) => {
        setTwoFaEnabled(!!r?.enabled);
        setTwoFaBackupLeft(r?.backup_codes_remaining ?? 0);
      })
      .catch(() => setTwoFaEnabled(false));
  }, []);

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
      setGiftKey(r.deeplink || (r.token ? `${BASE_URL}/gift/${r.token}` : null));
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

  /** Платный подарок подписки: открыть модалку и загрузить цены */
  const openPaidGift = async () => {
    setPaidGiftOpen(true);
    setPaidRecipient("");
    setPaidPlan(null);
    try {
      const r = await getPrices();
      if (r?.success) {
        setPaidPrices(r.prices || {});
        setPaidNames(r.names || {});
        setPaidDays(r.days || {});
      }
    } catch {}
  };

  const sendPaidGift = async () => {
    const recipient = paidRecipient.trim();
    if (!recipient) {
      showToast("Укажите email или логин получателя");
      return;
    }
    if (!paidPlan) {
      showToast("Выберите тариф");
      return;
    }
    const price = paidPrices[paidPlan] ?? 0;
    Alert.alert(
      "Подарить подписку?",
      `${paidNames[paidPlan] || paidPlan} (${paidDays[paidPlan] || "?"} дн.) пользователю ${recipient} за ${price} ₽. Сумма спишется с вашего баланса.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: `Подарить за ${price} ₽`,
          onPress: async () => {
            setPaidBusy(true);
            try {
              const r = await giftSubscription(recipient, paidPlan);
              if (!r?.success) throw new Error(r?.error || "Не удалось подарить");
              setPaidGiftOpen(false);
              await refreshMe();
              showToast(r?.message || "Подписка подарена!");
            } catch (e: any) {
              showToast(e?.message || "Не удалось подарить");
            } finally {
              setPaidBusy(false);
            }
          },
        },
      ]
    );
  };

  /** 2FA: открыть модалку и загрузить статус */
  const openTwoFa = async () => {
    setTwoFaOpen(true);
    setTwoFaSetupData(null);
    setTwoFaCode("");
    setTwoFaPassword("");
    setTwoFaBackupCodes(null);
    try {
      const r = await twoFaStatus();
      setTwoFaEnabled(!!r?.enabled);
      setTwoFaBackupLeft(r?.backup_codes_remaining ?? 0);
    } catch {
      setTwoFaEnabled(false);
    }
  };

  const twoFaStart = async () => {
    setTwoFaBusy(true);
    try {
      const r = await twoFaSetup();
      if (!r?.success) throw new Error(r?.error || "Не удалось начать настройку");
      setTwoFaSetupData({ secret: r.secret, otpauth_url: r.otpauth_url });
      setTwoFaCode("");
    } catch (e: any) {
      showToast(e?.message || "Не удалось начать настройку");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const twoFaConfirmCode = async () => {
    const code = twoFaCode.trim();
    if (!code) {
      showToast("Введите код из приложения");
      return;
    }
    setTwoFaBusy(true);
    try {
      const r = await twoFaConfirm(code);
      if (!r?.success) throw new Error(r?.error || "Неверный код");
      setTwoFaEnabled(true);
      setTwoFaSetupData(null);
      setTwoFaBackupCodes(r.backup_codes || []);
      setTwoFaBackupLeft((r.backup_codes || []).length);
      showToast("Двухфакторная аутентификация включена");
    } catch (e: any) {
      showToast(e?.message || "Неверный код");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const twoFaOff = async () => {
    if (!twoFaCode.trim() && !twoFaPassword.trim()) {
      showToast("Введите код из приложения или пароль");
      return;
    }
    setTwoFaBusy(true);
    try {
      const r = await twoFaDisable(twoFaCode.trim(), twoFaPassword.trim() || undefined);
      if (!r?.success) throw new Error(r?.error || "Не удалось отключить");
      setTwoFaEnabled(false);
      setTwoFaCode("");
      setTwoFaPassword("");
      setTwoFaBackupCodes(null);
      setTwoFaBackupLeft(0);
      showToast("Двухфакторная аутентификация отключена");
    } catch (e: any) {
      showToast(e?.message || "Не удалось отключить");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const twoFaRegen = async () => {
    if (!twoFaCode.trim() && !twoFaPassword.trim()) {
      showToast("Введите код из приложения или пароль");
      return;
    }
    setTwoFaBusy(true);
    try {
      const r = await twoFaRegenerateBackup(twoFaCode.trim(), twoFaPassword.trim() || undefined);
      if (!r?.success) throw new Error(r?.error || "Не удалось перевыпустить коды");
      setTwoFaBackupCodes(r.backup_codes || []);
      setTwoFaBackupLeft((r.backup_codes || []).length);
      setTwoFaCode("");
      showToast("Новые резервные коды выпущены");
    } catch (e: any) {
      showToast(e?.message || "Не удалось перевыпустить коды");
    } finally {
      setTwoFaBusy(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: isGlass ? "transparent" : colors.bg }}>
      {/* Закреплённая шапка: назад + «Профиль» + шестерёнка */}
      <View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top + 6 },
          isGlass ? { backgroundColor: "transparent", borderBottomWidth: 0 } : null,
        ]}
      >
        {nav.canGoBack() ? (
          <Pressable
            onPress={() => (themeHasQuickNav(getThemeName()) ? nav.goBack() : nav.popToTop())}
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
          paddingBottom: inTabs ? insets.bottom + 116 : themeHasQuickNav(getThemeName()) ? insets.bottom + 96 : insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Карточка аккаунта ─── */}
        <ThemeCard glass={isGlass}>
          <View style={styles.accRow}>
            <PressableScale onPress={isFoxcloud ? undefined : openEditor} accessibilityLabel="Изменить профиль">
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
                {/* FoxiCloud: профиль из Bedolaga — локальные бейджи/ник не применяются */}
                {!isFoxcloud && (
                  <>
                    {!!effectiveBadge && <VerifiedBadge type={effectiveBadge} size={17} />}
                    {(me?.badges || []).map((b) => (
                      <CustomBadge key={b.id} badge={b} size={18} />
                    ))}
                    {isSponsor && <SponsorHeart size={16} />}
                  </>
                )}
              </View>
              {!!me?.email && !isFoxcloud && (
                <Text style={styles.email} numberOfLines={1}>
                  {me.email}
                </Text>
              )}
              {isFoxcloud && (
                <Text style={styles.email} numberOfLines={1}>
                  FoxCloud · вход через Telegram
                </Text>
              )}
            </View>
            {!isFoxcloud && (
              <Pressable
                onPress={openEditor}
                hitSlop={10}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel="Изменить имя"
              >
                <Ionicons name="pencil" size={18} color={colors.textDim} />
              </Pressable>
            )}
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
                <ThemeButton glass={isGlass} size="sm" title="Забрать" loading={busy} onPress={claimDeviceBonus} />
              </View>
            )}
          </View>

          {/* Кнопки: Продлить / Подарить (за деньги, всем) / Промокод.
              FoxiCloud: баннер «Пополнить баланс / Продлить» — продление
              открывается всплывающим окном с тарифами из Bedolaga API. */}
          {isFoxcloud ? (
            <FoxRenewSheet />
          ) : (
            <View style={styles.chipsRow}>
              <View style={{ flex: 1 }}>
                <ThemeButton glass={isGlass} size="sm" title="Продлить" onPress={() => nav.navigate("Тарифы")} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemeButton glass={isGlass} size="sm" title="Подарить" variant="ghost" onPress={openPaidGift} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemeButton glass={isGlass} size="sm" title="Промокод" variant="ghost" onPress={() => setPromoOpen(true)} />
              </View>
            </View>
          )}
        </ThemeCard>

        {/* ─── Меню ─── */}
        <ShellBlock glass={isGlass} plainStyle={styles.menuCard}>
          {!isFoxcloud && (
            <>
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
            </>
          )}
          {isSponsor && !isFoxcloud && (
            <>
              <MenuItem
                icon="gift"
                iconColor="#F472B6"
                title="Спонсорский подарок"
                sub="24 часа VPN другу — раз в 30 дней бесплатно"
                onPress={() => setGiftOpen(true)}
              />
              <View style={styles.menuDivider} />
            </>
          )}
          {!isFoxcloud && (
            <>
              <MenuItem
                icon="shield-checkmark"
                iconColor={colors.green}
                title="Двухфакторная аутентификация"
                sub={twoFaEnabled === null ? "Проверка…" : twoFaEnabled ? "Включена — защита аккаунта" : "Защитите аккаунт кодом из приложения"}
                trailing={
                  twoFaEnabled ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                  ) : undefined
                }
                onPress={openTwoFa}
              />
              <View style={styles.menuDivider} />
              <MenuItem
                icon="qr-code"
                iconColor={colors.accent}
                title="QR-авторизация"
                sub="Вход на другом устройстве по QR"
                onPress={() => setScanOpen(true)}
              />
            </>
          )}
          {isFoxcloud && (
            <MenuItem
              icon="paper-plane"
              iconColor="#2AABEE"
              title="Аккаунт FoxCloud"
              sub="Вход через Telegram · управление в @foxicloudbot"
              trailing={<Ionicons name="checkmark-circle" size={22} color={colors.green} />}
              onPress={() => {}}
            />
          )}
        </ShellBlock>

        {/* ─── Переход в настройки (кнопка выхода перенесена в Настройки → Прочее) ─── */}
        {isGlass ? (
          <GlassButton
            title="Перейти в настройки"
            variant="primary"
            onPress={() => nav.navigate("Настройки")}
            icon={<Ionicons name="settings" size={19} color="#DDD6FE" />}
            style={{ marginBottom: 8 }}
            accessibilityLabel="Перейти в настройки"
          />
        ) : (
          <PressableScale
            style={styles.settingsBtn}
            onPress={() => nav.navigate("Настройки")}
            accessibilityRole="button"
          >
            <Ionicons name="settings" size={19} color="#fff" />
            <Text style={styles.settingsBtnText}>Перейти в настройки</Text>
          </PressableScale>
        )}
      </ScrollView>

      {/* Быстрое нижнее меню — видно когда экран открыт стеком поверх темы
          (в таб-зоне основной темы компонент сам себя скрывает) */}
      <QuickNavBar />

      {/* ─── Шторки и модалки (условный рендер: не монтируются, пока закрыты —
           ускоряет перерисовку при смене темы) ─── */}
      {balanceOpen && <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={(me?.balance || 0) / 100}
        daysLeft={daysLeft}
      />}
      {benefitsOpen && <SponsorBenefitsSheet visible={benefitsOpen} onClose={() => setBenefitsOpen(false)} />}
      {scanOpen && <QRScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onScan={(v) => confirmQrRaw(v)} />}

      {/* Редактирование профиля */}
      {editOpen && <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
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
                </Modal>}

                {/* Промокод / подарочный ключ */}
                {promoOpen && <Modal visible={promoOpen} transparent animationType="fade" onRequestClose={() => setPromoOpen(false)}>
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
      </Modal>}

      {/* Подарок для друга (спонсорам) */}
      {giftOpen && <Modal visible={giftOpen} transparent animationType="fade" onRequestClose={() => setGiftOpen(false)}>
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
      </Modal>}

      {/* Платный подарок подписки (любому пользователю) */}
      {paidGiftOpen && <Modal visible={paidGiftOpen} transparent animationType="fade" onRequestClose={() => setPaidGiftOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPaidGiftOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>🎁 Подарить подписку</Text>
            <Text style={styles.modalText}>
              Подписка будет активирована у получателя сразу, сумма спишется с вашего баланса.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={paidRecipient}
              onChangeText={setPaidRecipient}
              placeholder="Email или логин получателя"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.planGrid}>
              {Object.keys(paidPrices).map((p) => {
                const on = paidPlan === p;
                return (
                  <PressableScale
                    key={p}
                    style={[styles.planCard, on && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                    onPress={() => setPaidPlan(p)}
                  >
                    <Text style={[styles.planName, on && { color: colors.accent }]}>
                      {paidNames[p] || p}
                    </Text>
                    <Text style={styles.planPrice}>{paidPrices[p]} ₽</Text>
                  </PressableScale>
                );
              })}
            </View>
            {!!paidPlan && (
              <View style={styles.giftPriceRow}>
                <Text style={styles.modalText}>
                  К списанию: {paidPrices[paidPlan]} ₽ · Ваш баланс: {((me?.balance || 0) / 100).toFixed(0)} ₽
                </Text>
              </View>
            )}
            <View style={{ gap: 8, marginTop: 4 }}>
              <Button title="Подарить" loading={paidBusy} onPress={sendPaidGift} />
              <Button size="sm" title="Отмена" variant="ghost" onPress={() => setPaidGiftOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>}

      {/* Двухфакторная аутентификация (TOTP) */}
      {twoFaOpen && <Modal visible={twoFaOpen} transparent animationType="fade" onRequestClose={() => setTwoFaOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTwoFaOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 560 }}>
              <Text style={styles.modalTitle}>🔐 Двухфакторная аутентификация</Text>

              {/* Резервные коды — показать один раз */}
              {!!twoFaBackupCodes && (
                <View style={styles.backupBox}>
                  <Text style={styles.backupTitle}>Резервные коды — сохраните сейчас!</Text>
                  <Text style={styles.backupHint}>
                    Показываются один раз. Используйте их, если потеряете доступ к приложению-аутентификатору.
                  </Text>
                  <View style={styles.backupGrid}>
                    {twoFaBackupCodes.map((c) => (
                      <Text key={c} style={styles.backupCode} selectable>
                        {c}
                      </Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        title="Скопировать"
                        variant="ghost"
                        onPress={async () => {
                          await Clipboard.setStringAsync(twoFaBackupCodes.join("\n"));
                          showToast("Коды скопированы");
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        title="Поделиться"
                        variant="ghost"
                        onPress={() => {
                          Share.share({ message: `Резервные коды 2FA GhostCloud:\n${twoFaBackupCodes.join("\n")}` }).catch(() => {});
                        }}
                      />
                    </View>
                  </View>
                  <View style={{ marginTop: 10 }}>
                    <Button size="sm" title="Я сохранил(а) коды" onPress={() => setTwoFaBackupCodes(null)} />
                  </View>
                </View>
              )}

              {/* Шаг 1: настройка QR */}
              {!twoFaBackupCodes && twoFaEnabled === false && !twoFaSetupData && (
                <View style={{ gap: 10 }}>
                  <Text style={styles.modalText}>
                    Дополнительная защита аккаунта: при входе потребуется код из приложения
                    Google Authenticator, Authy или аналогичного.
                  </Text>
                  <Button title="Начать настройку" loading={twoFaBusy} onPress={twoFaStart} />
                </View>
              )}

              {/* Шаг 2: QR + код подтверждения */}
              {!twoFaBackupCodes && !!twoFaSetupData && (
                <View style={{ gap: 10 }}>
                  <Text style={styles.modalText}>
                    Отсканируйте QR-код в приложении-аутентификаторе и введите код оттуда.
                  </Text>
                  <View style={styles.qrBox}>
                    <QRCode value={twoFaSetupData.otpauth_url} size={180} backgroundColor="#fff" color="#111" />
                  </View>
                  <PressableScale
                    style={styles.secretRow}
                    onPress={async () => {
                      await Clipboard.setStringAsync(twoFaSetupData.secret);
                      showToast("Секрет скопирован");
                    }}
                  >
                    <Text style={styles.secretText} numberOfLines={1}>
                      Секрет: {twoFaSetupData.secret}
                    </Text>
                  </PressableScale>
                  <TextInput
                    style={styles.modalInput}
                    value={twoFaCode}
                    onChangeText={(t) => setTwoFaCode(t.replace(/\D/g, "").slice(0, 10))}
                    placeholder="6-значный код"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                  />
                  <Button title="Подтвердить и включить" loading={twoFaBusy} onPress={twoFaConfirmCode} />
                </View>
              )}

              {/* Включена: управление */}
              {!twoFaBackupCodes && twoFaEnabled === true && (
                <View style={{ gap: 10 }}>
                  <View style={styles.twoFaOnRow}>
                    <Ionicons name="shield-checkmark" size={20} color={colors.green} />
                    <Text style={styles.modalText}>
                      2FA включена. Резервных кодов осталось: {twoFaBackupLeft}.
                    </Text>
                  </View>
                  <TextInput
                    style={styles.modalInput}
                    value={twoFaCode}
                    onChangeText={(t) => setTwoFaCode(t.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Код из приложения (или резервный)"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={styles.modalInput}
                    value={twoFaPassword}
                    onChangeText={setTwoFaPassword}
                    placeholder="Или пароль аккаунта"
                    placeholderTextColor={colors.textFaint}
                    secureTextEntry
                  />
                  <Button title="Перевыпустить резервные коды" variant="ghost" loading={twoFaBusy} onPress={twoFaRegen} />
                  <Button title="Отключить 2FA" variant="danger" loading={twoFaBusy} onPress={twoFaOff} />
                </View>
              )}
            </ScrollView>
            <View style={{ marginTop: 10 }}>
              <Button size="sm" title="Закрыть" variant="ghost" onPress={() => setTwoFaOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>}
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
    // Платный подарок
    modalInput: {
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      marginBottom: 10,
    },
    planGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 10,
    },
    planCard: {
      flexGrow: 1,
      flexBasis: "45%",
      backgroundColor: colors.bgSoft,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: "center",
    },
    planName: { color: colors.text, fontSize: 13, fontWeight: "700" },
    planPrice: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    giftPriceRow: { marginBottom: 10 },
    // 2FA
    qrBox: {
      backgroundColor: "#fff",
      borderRadius: 14,
      padding: 12,
      alignSelf: "center",
      marginBottom: 4,
    },
    secretRow: {
      backgroundColor: colors.bgSoft,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 4,
    },
    secretText: { color: colors.textFaint, fontSize: 11.5, fontFamily: "monospace" },
    twoFaOnRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
    backupBox: {
      backgroundColor: colors.orange + "14",
      borderWidth: 1,
      borderColor: colors.orange + "55",
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    backupTitle: { color: colors.orange, fontSize: 14, fontWeight: "800", textAlign: "center", marginBottom: 6 },
    backupHint: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: "center", marginBottom: 10 },
    backupGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
    backupCode: {
      backgroundColor: sheetSurfaceBg(),
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      fontFamily: "monospace",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      overflow: "hidden",
    },
  });
