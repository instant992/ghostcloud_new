import React from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, hit, typo, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";

/** Иконка-кнопка с гарантированным тач-таргетом ≥44 и доступностью.
 *  Использовать везде вместо «голого» <Pressable><Ionicons/></Pressable>. */
export function IconButton({
  icon,
  onPress,
  label,
  size = 22,
  color,
  disabled,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  /** Обязательная подпись для скринридеров */
  label: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  testID?: string;
}) {
  useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconBtn}
      hitSlop={6}
      testID={testID}
    >
      <Ionicons name={icon} size={size} color={disabled ? colors.textFaint : color || colors.text} />
    </Pressable>
  );
}

/** Единая нижняя шторка (bottom sheet): один стиль для всех модалок-шторок. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeightPct = 84,
  right,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightPct?: number;
  right?: React.ReactNode;
}) {
  useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, { maxHeight: `${maxHeightPct}%` }]} pointerEvents="box-none">
        <View style={styles.sheetHandle} />
        {!!title && (
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {right}
              <IconButton icon="close" label="Закрыть" size={18} color={colors.textFaint} onPress={onClose} />
            </View>
          </View>
        )}
        {children}
      </View>
    </Modal>
  );
}

/** Заголовок секции в карточке/экране. */
export function SectionHeader({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  useTheme();
  return (
    <View style={styles.sectionRow}>
      {!!icon && <Ionicons name={icon} size={17} color={colors.accent} />}
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

/** Состояние загрузки экрана (центрированный спиннер + подпись). */
export function LoadingState({ label }: { label?: string }) {
  useTheme();
  return (
    <View style={styles.centerFill} accessibilityRole="progressbar" accessibilityLabel={label || "Загрузка"}>
      <ActivityIndicator size="large" color={colors.accent} />
      {!!label && <Text style={styles.centerLabel}>{label}</Text>}
    </View>
  );
}

/** Пустое состояние: иконка + заголовок + подпись + опциональное действие. */
export function EmptyState({
  icon = "file-tray-outline",
  title,
  sub,
  actionLabel,
  onAction,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  useTheme();
  return (
    <View style={styles.centerFill}>
      <View style={styles.emptyIconBox}>
        <Ionicons name={icon} size={30} color={colors.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!sub && <Text style={styles.emptySub}>{sub}</Text>}
      {!!actionLabel && !!onAction && (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          style={styles.emptyAction}
        >
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </PressableScale>
      )}
    </View>
  );
}

/** Настоящий вращающийся спиннер-кольцо (заменяет статичный в оплате). */
export function SpinnerRing({ size = 76 }: { size?: number }) {
  useTheme();
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    a.start();
    return () => a.stop();
  }, [spin]);
  const r = size / 2;
  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        borderWidth: 3,
        borderColor: colors.accentSoft,
        borderTopColor: colors.accent,
        marginBottom: 24,
        transform: [
          {
            rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
          },
        ],
      }}
    />
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    minWidth: hit.min,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 26,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: { color: colors.text, ...typo.heading, fontSize: 17 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { color: colors.text, ...typo.heading, fontSize: 15 },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  centerLabel: { color: colors.textDim, ...typo.sub, marginTop: 10, textAlign: "center" },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { color: colors.text, ...typo.heading, textAlign: "center" },
  emptySub: { color: colors.textDim, ...typo.sub, textAlign: "center", marginTop: 6 },
  emptyAction: {
    marginTop: 16,
    backgroundColor: colors.accentDeep,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  emptyActionText: { color: "#fff", ...typo.bodyStrong },
});
