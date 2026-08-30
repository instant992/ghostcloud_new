import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, sheetSurfaceBg, useTheme } from "../theme";
import { IconButton } from "./Foundations";

const ORANGE = "#FF9800";

/** Список преимуществ спонсора — как в эталонном приложении. */
const BENEFITS: Array<{ emoji: string; color: string; title: string; desc: string }> = [
  {
    emoji: "🏅",
    color: ORANGE,
    title: "Значок спонсора",
    desc: "Уникальный значок рядом с ником, который выделяет вас среди других пользователей.",
  },
  {
    emoji: "🎁",
    color: "#E91E63",
    title: "Ежемесячный подарок",
    desc: "1 раз в месяц вы можете подарить любому пользователю бесплатную подписку на 24 часа.",
  },
  {
    emoji: "📱",
    color: "#26C6DA",
    title: "+1 устройство бесплатно",
    desc: "Спонсор получает одно дополнительное устройство без доплаты — активируется в разделе устройств.",
  },
  {
    emoji: "🏷️",
    color: ORANGE,
    title: "Подписи для устройств",
    desc: "Возможность дать каждому устройству понятное имя («Мой телефон», «Рабочий ноутбук») — чтобы легко ориентироваться в списке.",
  },
  {
    emoji: "🌅",
    color: "#FF7043",
    title: "Смена темы по расписанию",
    desc: "Автоматическое переключение светлой/тёмной темы по времени рассвета и заката или по своему расписанию.",
  },
  {
    emoji: "✨",
    color: "#42A5F5",
    title: "Дополнительные темы оформления",
    desc: "Открываются дополнительные темы оформления: v2ray и Happ.",
  },
  {
    emoji: "🏆",
    color: "#FFD600",
    title: "Место в топе спонсоров",
    desc: "Вы отображаетесь в рейтинге спонсоров и получаете признание сообщества.",
  },
];

/** Шторка «Преимущества спонсора» — открывается по замку в настройках,
 *  из топа спонсоров (значок сверху справа) и из карточки «Стать спонсором». */
export function SponsorBenefitsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  useTheme();
  const styles = makeStyles();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {/* Шапка */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="heart" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Преимущества спонсора</Text>
            <Text style={styles.headerSub}>Пополнение от 444 ₽ за 24 часа</Text>
          </View>
          <IconButton icon="close" label="Закрыть" size={20} color={colors.textFaint} onPress={onClose} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Как стать спонсором */}
          <View style={styles.howTo}>
            <Ionicons name="flash" size={18} color={ORANGE} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.howToTitle}>Как стать спонсором</Text>
              <Text style={styles.howToText}>
                Пополните баланс на 444 ₽ или больше — статус активируется автоматически на 24 часа.
              </Text>
            </View>
          </View>

          {/* Список преимуществ */}
          {BENEFITS.map((b) => (
            <View key={b.title} style={[styles.benefit, { backgroundColor: b.color + "14", borderColor: b.color + "38" }]}>
              <View style={[styles.benefitIcon, { backgroundColor: b.color + "26" }]}>
                <Text style={{ fontSize: 18 }}>{b.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.benefitTitle, { color: b.color }]}>{b.title}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: "85%",
      backgroundColor: sheetSurfaceBg(),
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      borderTopColor: ORANGE + "4D",
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 4,
      marginBottom: 16,
    },
    headerIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: ORANGE,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: ORANGE,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    headerSub: { color: ORANGE, fontSize: 12, fontWeight: "600", marginTop: 1 },
    howTo: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: ORANGE + "1F",
      borderColor: ORANGE + "4D",
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    howToTitle: { color: ORANGE, fontSize: 13, fontWeight: "700" },
    howToText: { color: colors.textDim, fontSize: 12, lineHeight: 16, marginTop: 2 },
    benefit: {
      flexDirection: "row",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 8,
    },
    benefitIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    benefitTitle: { fontSize: 14, fontWeight: "700" },
    benefitDesc: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: 3 },
  });
