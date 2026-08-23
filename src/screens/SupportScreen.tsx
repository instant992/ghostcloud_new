import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supportMessages, supportSend } from "../api";
import { colors } from "../theme";

type Msg = {
  id: number;
  sender: string;
  text: string;
  is_read: boolean;
  created_at: string;
};

export default function SupportScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const insets = useSafeAreaInsets();

  const poll = useCallback(async () => {
    try {
      let all: Msg[] = messages;
      let afterId: number | undefined = undefined;
      // Первая загрузка — берём всё
      if (messages.length === 0) {
        const first = await supportMessages();
        if (first?.success && first.messages) {
          setMessages(first.messages);
          return;
        }
      } else {
        afterId = Math.max(...messages.map((m) => m.id));
      }
      if (afterId !== undefined) {
        const r = await supportMessages(afterId);
        if (r?.success && r.messages?.length) {
          setMessages((prev) => [...prev, ...r.messages]);
        }
      }
    } catch {}
  }, [messages]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await supportSend(value);
      setText("");
      await poll();
    } catch {}
    setSending(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
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
            <Text style={{ color: "#fff", fontSize: 14 }}>{item.text}</Text>
            <Text style={{ color: colors.textFaint, fontSize: 10, marginTop: 4 }}>
              {String(item.created_at).slice(5, 16)}
            </Text>
          </View>
        )}
      />
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
        <Pressable
          onPress={send}
          disabled={sending}
          style={{
            width: 48,
            borderRadius: 12,
            backgroundColor: colors.accentDeep,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 18 }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
