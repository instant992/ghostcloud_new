import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supportReopen, supportTicketMessages } from "../api";
import { colors, useTheme } from "../theme";
import { PressableScale } from "../components/PressableScale";
import { showToast } from "../components/Toast";
import { MessageBubble, fullImageUrl, type Msg } from "./SupportScreen";

/** Просмотр закрытого обращения (только чтение). Как в старом приложении,
 *  закрытый тикет можно переоткрыть в течение 24 часов. */
export default function SupportTicketScreen() {
  useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const ticketId: number = Number(route.params?.ticketId || 0);
  const status: string = String(route.params?.status || "");
  const updatedAt: string = String(route.params?.updatedAt || "");
  const adminAvatarUrl: string | null = route.params?.adminAvatarUrl || null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [reopening, setReopening] = useState(false);
  const [fullImage, setFullImage] = useState<string | null>(null);

  const canReopen = (() => {
    if (status !== "closed") return false;
    try {
      const dt = new Date(updatedAt);
      if (Number.isNaN(dt.getTime())) return false;
      return Date.now() - dt.getTime() < 24 * 3600 * 1000;
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    nav.setOptions({ title: `Обращение #${ticketId}` });
  }, [ticketId]);

  useEffect(() => {
    (async () => {
      try {
        const r = await supportTicketMessages(ticketId);
        if (r?.success && Array.isArray(r.messages)) setMessages(r.messages);
      } catch {}
      setLoading(false);
    })();
  }, [ticketId]);

  const reopen = async () => {
    if (reopening) return;
    setReopening(true);
    try {
      const r = await supportReopen(ticketId);
      if (r?.success === false) {
        showToast(r?.error || "Не удалось открыть обращение");
      } else {
        showToast("Обращение снова открыто");
        nav.goBack();
      }
    } catch (e: any) {
      showToast(e?.message || "Не удалось открыть обращение");
    }
    setReopening(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {canReopen && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <PressableScale
            onPress={reopen}
            disabled={reopening}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: colors.accentSoft,
              borderRadius: 12,
              paddingVertical: 10,
              opacity: reopening ? 0.6 : 1,
            }}
          >
            {reopening ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh" size={17} color={colors.accent} />
            )}
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Открыть обращение</Text>
          </PressableScale>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.textDim, fontSize: 13 }}>Нет сообщений</Text>
        </View>
      ) : (
        <FlatList
          bounces={false}
          overScrollMode="never"
          data={[...messages].reverse()}
          keyExtractor={(m) => String(m.id)}
          inverted
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
          renderItem={({ item }) => (
            <MessageBubble
              msg={item}
              adminAvatarUrl={adminAvatarUrl}
              onImageTap={(url) => setFullImage(fullImageUrl(url))}
            />
          )}
        />
      )}

      <Modal visible={!!fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(null)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <PressableScale
            onPress={() => setFullImage(null)}
            style={{ position: "absolute", top: 48, right: 16, zIndex: 2, padding: 8 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </PressableScale>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {!!fullImage && (
              <Image source={{ uri: fullImage }} style={{ width: "92%", height: "80%" }} resizeMode="contain" />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
