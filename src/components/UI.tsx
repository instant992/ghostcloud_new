import React from "react";
import { Button as PaperButton, TextInput as PaperInput, Surface } from "react-native-paper";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors, useTheme } from "../theme";
import { AuthIcon, type AuthIconName } from "./AuthIcon";
import { PressableScale } from "./PressableScale";
import { LiquidGlassSurface, useGlassBackdrop, GLASS_SCROLL_HANDLERS } from "./liquidGlass";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardScrollView, KeyboardFormContext } from "./KeyboardForm";

/** Контекст: экран находится во вкладках (таб-бар), а не под стековым хедером.
 *  Используется для корректных верхних отступов вместо магических чисел. */
export const TabAreaContext = React.createContext(false);
export function useInTabArea(): boolean {
  return React.useContext(TabAreaContext);
}

/** Верхний отступ экрана: во вкладках отступ добавляет сам <Screen>
 *  (safe-area + 12), а в стеке под плавающей кнопкой «назад» нужен
 *  отступ insets.top + 64 — стрелка рисуется ниже статус-бара. */
export function useScreenTopPad(): ViewStyle {
  const inTabs = useInTabArea();
  const insets = useSafeAreaInsets();
  return inTabs ? {} : { paddingTop: insets.top + 64 };
}

/**
 * Цвет фона контейнера экрана.
 *
 * В теме Liquid Glass экраны, которые живут внутри GlassBackdropProvider,
 * ДОЛЖНЫ быть прозрачными: фон темы (градиент + блобы) рисует провайдер, и
 * стеклянные карточки преломляют именно его. Непрозрачный colors.bg поверх
 * провайдера перекрывал фон — стекло семплировало «пустоту» и выглядело
 * плоской полупрозрачной коробкой, не как док-меню и блоки главной.
 *
 * Вне провайдера (авторизация, другие темы, RN-модалки) — обычный colors.bg,
 * иначе текст оказался бы на голом фоне.
 */
export function useScreenBgColor(): string {
  const theme = useTheme();
  const backdrop = useGlassBackdrop();
  return theme.style === "glass" && backdrop ? "transparent" : colors.bg;
}

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children?: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  useTheme();
  const inTabs = useInTabArea();
  const insets = useSafeAreaInsets();
  const styles = makeStyles();
  const screenBg = useScreenBgColor();
  // Во вкладках контент начинается сразу под статус-баром — добавляем
  // безопасный отступ вместо магических чисел (вне вкладок отступ задаёт экран).
  const safeTop = inTabs ? { paddingTop: insets.top + 12 } : null;
  // Во вкладках внизу плавающий таб-бар (~96) — контент не должен под него залезать.
  const safeBottom = inTabs ? { paddingBottom: insets.bottom + 116 } : null;
  if (scroll) {
    return (
      <KeyboardScrollView
          bounces={false}
          overScrollMode="never"
        style={[styles.screen, { backgroundColor: screenBg }]}
        contentContainerStyle={[styles.content, safeTop, safeBottom, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={GLASS_SCROLL_HANDLERS.onMomentumScrollEnd}
        onScrollEndDrag={GLASS_SCROLL_HANDLERS.onScrollEndDrag}
      >
        {children}
      </KeyboardScrollView>
    );
  }
  return (
    <View style={[styles.screen, { backgroundColor: screenBg }, styles.content, safeTop, safeBottom, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  useTheme();
  const styles = makeStyles();
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  useTheme();
  const styles = makeStyles();
  return <Text style={styles.subtitle}>{children}</Text>;
}

/**
 * Карточка/секция, «тематическая»: в теме Liquid Glass — НАСТОЯЩЕЕ стекло
 * (порт ScrollContainer каталога Backdrop), в остальных темах — плоский View
 * со стилем вызывающей стороны.
 *
 * Зачем единый компонент: раньше разделы (Настройки, Статистика, Тарифы…)
 * рисовали `backgroundColor: colors.card` + бордюр, то есть полупрозрачную
 * коробку. Она (а) не преломляет фон и потому выглядит иначе, чем док-меню и
 * блоки главной, и (б) не реагирует на Glass Playground — тюнинг применяется
 * только к LiquidGlassSurface. Теперь все карточки темы идут одним путём.
 *
 * Безопасность: стекло требует фон темы из GlassBackdropProvider. Вне него
 * (экраны авторизации, RN-модалки — отдельное окно) компонент остаётся
 * плоским View: иначе карточка стала бы прозрачной и текст потерял бы фон.
 */
export function ThemedCard({
  children,
  style,
  radius,
  preset = "scroll",
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Переопределение радиуса; по умолчанию берётся из style.borderRadius. */
  radius?: number;
  preset?: Parameters<typeof LiquidGlassSurface>[0]["preset"];
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const backdrop = useGlassBackdrop();
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;

  if (theme.style === "material") return <Surface elevation={0} style={[style, { borderRadius: radius ?? Number(flat?.borderRadius ?? 24), backgroundColor: colors.card }]}>{onPress ? <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>{children}</Pressable> : children}</Surface>;

  if (theme.style === "glass" && backdrop) {
    const {
      backgroundColor: _bg,
      borderColor: rawBorder,
      borderWidth: bwRaw,
      borderRadius: rawRadius,
      overflow: _ov,
      ...rest
    } = flat ?? {};
    // Бордюр вызывающей стороны: обычный colors.border убираем — край блока
    // читается бликом, как в ScrollContainerContent (drawBackdrop без бордюра).
    // Цветную рамку (выбранный тариф, опасность, акцент) сохраняем и рисуем
    // обводкой поверх стекла — тонировка исказила бы преломление.
    const effBorder =
      typeof rawBorder === "string" && rawBorder !== colors.border ? rawBorder : null;
    const effRadius = radius ?? Number(rawRadius ?? 32);
    return (
      <LiquidGlassSurface
        radius={effRadius}
        preset={preset}
        borderColor={effBorder}
        borderWidth={effBorder ? Number(bwRaw ?? 1) || 1 : 0}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        style={rest as ViewStyle}
      >
        {children}
      </LiquidGlassSurface>
    );
  }

  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={style} accessibilityLabel={accessibilityLabel}>
        {children}
      </PressableScale>
    );
  }
  return <View style={style}>{children}</View>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const styles = makeStyles();
  return (
    <ThemedCard style={[styles.card, style] as unknown as ViewStyle}>
      {children}
    </ThemedCard>
  );
}

type BtnProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: AuthIconName;
};

export function Button({ title, onPress, loading, disabled, variant = "primary", size = "md", icon }: BtnProps) {
  useTheme();
  const styles = makeStyles();
  const material = useTheme().style === "material";
  const isDisabled = disabled || loading;
  const compact = size === "sm";
  const paperIcon = icon === "mail" ? "email-outline" : icon === "lock" ? "lock-outline" : icon === "eye" ? "eye-outline" : icon === "eye-off" ? "eye-off-outline" : icon === "log-in" ? "login" : icon === "shield-check" ? "shield-check-outline" : icon === "user-plus" ? "account-plus-outline" : icon === "qr-code" ? "qrcode-scan" : icon === "send" ? "send" : undefined;
  if (material) return <PaperButton mode={variant === "ghost" ? "text" : "contained"} onPress={onPress} loading={loading} disabled={isDisabled} compact={compact} icon={paperIcon} buttonColor={variant === "danger" ? colors.red : undefined} style={{ marginVertical: 4 }} contentStyle={{ minHeight: compact ? 40 : 48 }}>{title}</PaperButton>;
  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.btn,
        compact && styles.btnSm,
        variant === "primary" && styles.btnPrimary,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <View style={styles.btnContent}>
          {icon && <AuthIcon name={icon} size={compact ? 17 : 19} color={variant === "primary" ? "#fff" : variant === "danger" ? colors.red : colors.text} />}
          <Text
            style={[
              styles.btnText,
              compact && styles.btnTextSm,
              variant !== "primary" && { color: variant === "danger" ? colors.red : colors.text },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

export function Input({ label, icon, style, onFocus, onContentSizeChange, ...props }: TextInputProps & { label?: string; icon?: AuthIconName }) {
  const material = useTheme().style === "material";
  const reveal = React.useContext(KeyboardFormContext);
  useTheme();
  const styles = makeStyles();
  if (material) return <PaperInput {...props} selectionColor={typeof props.selectionColor === "string" ? props.selectionColor : undefined} cursorColor={typeof props.cursorColor === "string" ? props.cursorColor : undefined} label={label} mode="outlined" left={icon ? <PaperInput.Icon icon={icon === "mail" ? "email-outline" : icon === "lock" ? "lock-outline" : "shield-check-outline"} /> : undefined} style={[{ marginBottom: 12 }, style]} onFocus={event => { onFocus?.(event); reveal?.(); }} onContentSizeChange={event => { onContentSizeChange?.(event); reveal?.(); }} />;
  return (
    <View>
      {!!label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={icon ? styles.inputIconWrap : undefined}>
        {icon && <View style={styles.inputLeftIcon}><AuthIcon name={icon} size={19} color={colors.textDim} /></View>}
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, icon && styles.inputWithIcon, props.multiline && { minHeight: 96, maxHeight: 180, textAlignVertical: "top" }, style]}
          onFocus={event => { onFocus?.(event); reveal?.(); }}
          onContentSizeChange={event => { onContentSizeChange?.(event); reveal?.(); }}
          accessibilityLabel={label || (props.placeholder as string | undefined)}
          {...props}
        />
      </View>
    </View>
  );
}

export function PasswordInput({ label, icon, style, onFocus, ...props }: TextInputProps & { label?: string; icon?: AuthIconName }) {
  const reveal = React.useContext(KeyboardFormContext);
  useTheme();
  const styles = makeStyles();
  const [show, setShow] = React.useState(false);
  return (
    <View>
      {!!label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={styles.passwordWrap}>
        {icon && <View style={styles.passwordLeftIcon}><AuthIcon name={icon} size={19} color={colors.textDim} /></View>}
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { marginBottom: 0, paddingRight: 48 }, icon && styles.inputWithIcon, style]}
          onFocus={event => { onFocus?.(event); reveal?.(); }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label || (props.placeholder as string | undefined)}
          {...props}
        />
        <Pressable
          onPress={() => setShow((s) => !s)}
          hitSlop={6}
          style={styles.eyeBtn}
          accessibilityRole="button"
          accessibilityLabel={show ? "Скрыть пароль" : "Показать пароль"}
        >
          <AuthIcon
            name={show ? "eye-off" : "eye"}
            size={22}
            color={colors.textDim}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function Row({ label, value, valueColor, compact }: { label: string; value: string; valueColor?: string; compact?: boolean }) {
  useTheme();
  const styles = makeStyles();
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  useTheme();
  const styles = makeStyles();
  if (!children) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 6 },
  subtitle: { color: colors.textDim, fontSize: 14, marginBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  btn: {
    borderRadius: 24,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  btnSm: {
    borderRadius: 16,
    height: 36,
    paddingHorizontal: 14,
    marginVertical: 4,
  },
  btnPrimary: {
    backgroundColor: colors.accentDeep,
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDanger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.red + "55",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnTextSm: { fontSize: 13 },
  input: {
    backgroundColor: colors.bgSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 10,
  },
  inputIconWrap: { position: "relative" },
  inputLeftIcon: { position: "absolute", zIndex: 1, left: 14, top: 0, bottom: 10, justifyContent: "center" },
  passwordLeftIcon: { position: "absolute", zIndex: 1, left: 14, top: 0, bottom: 0, justifyContent: "center" },
  inputWithIcon: { paddingLeft: 44 },
  inputLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  passwordWrap: {
    marginBottom: 10,
    position: "relative",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
  },
  rowCompact: { paddingVertical: 5 },
  rowLabel: { color: colors.textDim, fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
  eyeBtn: {
    position: "absolute",
    right: 2,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    backgroundColor: colors.red + "18",
    borderColor: colors.red + "44",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  errorText: { color: colors.red, fontSize: 13 },
});
