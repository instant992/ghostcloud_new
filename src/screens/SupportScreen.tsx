import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supportClose, supportMessages, supportSend } from "../api";
import { colors, useTheme } from "../theme";
import { showToast } from "../components/Toast";

type Msg = {
  id: number;
  sender: string;
  text: string;
  is_read: boolean;
  created_at: string;
};

export default function SupportScreen() {
  useTheme();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const insets = useSafeAreaInsets();
  const lastIdRef = useRef(0);

  // При открытии подгружаем всю историю (старые обращения), дальше — только новое
  const poll = useCallback(async () => {
    try {
      const afterId = lastIdRef.current > 0 ? lastIdRef.current : undefined;
      const r = await supportMessages(afterId);
      if (r?.success && Array.isArray(r.messages)) {
        const incoming: Msg[] = r.messages;
        if (incoming.length > 0) {
          lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
          if (afterId === undefined) {
            setMessages(incoming);
          } else {
            setMessages((prev) => {
              const known = new Set(prev.map((m) => m.id));
              const fresh = incoming.filter((m) => !known.has(m.id));
              return fresh.length ? [...prev, ...fresh] : prev;
            });
          }
        } else if (afterId === undefined) {
          setMessages([]);
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const r = await supportSend(value);
      if (r?.success === false) {
        showToast(r?.error || "Не удалось отправить сообщение");
      } else {
        setText("");
        await poll();
      }
    } catch (e: any) {
      showToast(e?.message || "Не удалось отправить сообщение");
    }
    setSending(false);
  };

  const closeTicket = async () => {
    if (closing) return;
    setClosing(true);
    try {
      const r = await supportClose();
      if (r?.success === false) {
        showToast(r?.error || "Не удалось закрыть обращение");
      } else {
        showToast("Обращение закрыто");
        lastIdRef.current = 0;
        await poll();
      }
    } catch (e: any) {
      showToast(e?.message || "Не удалось закрыть обращение");
    }
    setClosing(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Шапка: статус обращения + закрытие */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
          gap: 10,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chatbubbles-outline" size={17} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Чат поддержки</Text>
          <Text style={{ color: colors.textDim, fontSize: 11 }}>
            {messages.length > 0 ? "История обращений сохраняется" : "Опишите проблему — мы поможем"}
          </Text>
        </View>
        {messages.length > 0 && (
          <PressableScale
            onPress={closeTicket}
            disabled={closing}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: colors.red + "1A",
              borderWidth: 1,
              borderColor: colors.red + "55",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: closing ? 0.6 : 1,
            }}
          >
            {closing ? (
              <ActivityIndicator size="small" color={colors.red} />
            ) : (
              <Ionicons name="checkmark-done-outline" size={15} color={colors.red} />
            )}
            <Text style={{ color: colors.red, fontSize: 12, fontWeight: "700" }}>Закрыть</Text>
          </PressableScale>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 10 }}>
            Загружаем историю обращений…
          </Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="chatbox-ellipses-outline" size={44} color={colors.textFaint} />
          <Text style={{ color: colors.textDim, fontSize: 13, textAlign: "center", marginTop: 12 }}>
            Пока нет сообщений.{"\n"}Напишите нам — ответим в этом чате.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={[...messages].reverse()}
          keyExtractor={(m) => String(m.id)}
          inverted
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.sender === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                backgroundColor: item.sender === "user" ? colors.accentDeep : colors.card,
                borderRadius: 16,
                borderBottomRightRadius: item.sender === "user" ? 4 : 16,
                borderBottomLeftRadius: item.sender === "user" ? 16 : 4,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: item.sender === "user" ? "#fff" : colors.text, fontSize: 14 }}>
                {item.text}
              </Text>
              <Text
                style={{
                  color: item.sender === "user" ? "rgba(255,255,255,0.6)" : colors.textFaint,
                  fontSize: 10,
                  marginTop: 4,
                }}
              >
                {String(item.created_at).slice(5, 16)}
              </Text>
            </View>
          )}
        />
      )}

      <View
        style={{
          flexDirection: "row",
          padding: 12,
          paddingBottom: insets.bottom + 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          gap: 8,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            backgroundColor: colors.bgSoft,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.text,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
          placeholder="Опишите проблему…"
          placeholderTextColor={colors.textFaint}
          multiline
          value={text}
          onChangeText={setText}
        />
        <PressableScale
          onPress={send}
          disabled={sending}
          style={{
            width: 48,
            borderRadius: 12,
            backgroundColor: colors.accentDeep,
            alignItems: "center",
            justifyContent: "center",
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 18 }}>➤</Text>
          )}
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
