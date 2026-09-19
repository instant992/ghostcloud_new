import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { PressableScale } from "../components/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { BASE_URL, supportAvatar, supportClose, supportHistory, supportMessages, supportSend } from "../api";
import { colors, useTheme, sheetSurfaceBg } from "../theme";
import { showToast } from "../components/Toast";

export type Msg = {
  id: number;
  sender: string;
  text?: string | null;
  image_url?: string | null;
  is_read: boolean;
  created_at: string;
};

export type TicketInfo = {
  id: number;
  status: string;
  message_count: number;
  first_message?: string | null;
  created_at: string;
  updated_at: string;
};

/** Полный URL картинки: сервер отдаёт относительные пути */
export function fullImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${BASE_URL}${url}`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  } catch {
    return "";
  }
}

/** Режет текст на сегменты: обычный текст / ссылка / email.
 *  Для кликабельных ссылок в чате поддержки (раньше URL были просто текстом). */
export type LinkPart = { kind: "text" | "url" | "email"; text: string; href?: string };

export function linkParts(s: string): LinkPart[] {
  if (!s) return [];
  const re = /(https?:\/\/[^\s<>"'`\u0000-\u001f]+|www\.[^\s<>"'`\u0000-\u001f]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const parts: LinkPart[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push({ kind: "text", text: s.slice(last, m.index) });
    // не приклеиваем концевую пунктуацию к ссылке
    const raw = m[0].replace(/[.,;:!?)\]\u00bb]+$/, "");
    const trail = m[0].slice(raw.length);
    let href: string;
    let kind: "url" | "email";
    if (/^[A-Za-z0-9._%+-]+@/.test(raw)) {
      href = "mailto:" + raw;
      kind = "email";
    } else if (/^www\./i.test(raw)) {
      href = "https://" + raw;
      kind = "url";
    } else {
      href = raw;
      kind = "url";
    }
    parts.push({ kind, text: raw, href });
    if (trail) parts.push({ kind: "text", text: trail });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ kind: "text", text: s.slice(last) });
  return parts;
}

/** Открыть ссылку из чата: http(s) — во встроенном браузере, mailto — системой. */
export function openSupportLink(href: string) {
  if (!href) return;
  if (/^(https?:\/\/|mailto:)/i.test(href)) {
    WebBrowser.openBrowserAsync(href).catch(() => {});
  }
}

/** Пузырь сообщения — как в старом приложении: аватар «Жени», картинки, галочки прочтения */
export function MessageBubble({ msg, adminAvatarUrl, onImageTap }: { msg: Msg; adminAvatarUrl: string | null; onImageTap: (url: string) => void }) {
  const isUser = msg.sender === "user";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 6,
        ...(isUser ? { marginLeft: 48, justifyContent: "flex-end" } : { marginRight: 48 }),
      }}
    >
      {!isUser && (
        <View style={{ paddingTop: 16, marginRight: 6 }}>
          {adminAvatarUrl ? (
            <Image source={{ uri: adminAvatarUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />
          ) : (
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>Ж</Text>
            </View>
          )}
        </View>
      )}
      <View style={{ maxWidth: "100%" }}>
        {!isUser && (
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "600", marginLeft: 4, marginBottom: 2 }}>
            Женя
          </Text>
        )}
        <View
          style={{
            backgroundColor: isUser ? colors.accentDeep : colors.card,
            borderRadius: 16,
            borderBottomRightRadius: isUser ? 4 : 16,
            borderBottomLeftRadius: isUser ? 16 : 4,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {!!msg.image_url && (
            <PressableScale onPress={() => onImageTap(msg.image_url!)} style={{ marginBottom: 6 }}>
              <Image
                source={{ uri: fullImageUrl(msg.image_url) }}
                style={{ width: 180, height: 140, borderRadius: 8 }}
                resizeMode="cover"
              />
            </PressableScale>
          )}
          {!!msg.text && (
            <Text style={{ color: isUser ? "#fff" : colors.text, fontSize: 14 }}>
              {linkParts(msg.text).map((p, i) =>
                p.kind === "text" ? (
                  <Text key={i}>{p.text}</Text>
                ) : (
                  <Text
                    key={i}
                    style={{
                      color: isUser ? "#fff" : colors.accent,
                      textDecorationLine: "underline",
                      fontWeight: "600",
                    }}
                    onPress={() => openSupportLink(p.href!)}
                  >
                    {p.text}
                  </Text>
                )
              )}
            </Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            <Text
              style={{
                fontSize: 10,
                color: isUser ? "rgba(255,255,255,0.6)" : colors.textFaint,
              }}
            >
              {formatTime(msg.created_at)}
            </Text>
            {isUser && (
              <Ionicons
                name={msg.is_read ? "checkmark-done" : "checkmark"}
                size={13}
                color="rgba(255,255,255,0.55)"
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/** Плитка обращения в истории */
function HistoryTile({ ticket, onPress }: { ticket: TicketInfo; onPress: () => void }) {
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
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>#{ticket.id}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>Обращение #{ticket.id}</Text>
        {!!ticket.first_message && (
          <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {ticket.first_message}
          </Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
        <Text style={{ color: colors.textFaint, fontSize: 11 }}>{formatDate(ticket.created_at)}</Text>
        <View
          style={{
            backgroundColor: colors.bgSoft,
            borderRadius: 8,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginTop: 4,
          }}
        >
          <Text style={{ color: colors.textDim, fontSize: 10 }}>{ticket.message_count} сообщ.</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={{ marginLeft: 4 }} />
    </PressableScale>
  );
}

export default function SupportScreen() {
  useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<TicketInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string } | null>(null);
  const [adminAvatarUrl, setAdminAvatarUrl] = useState<string | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const firstLoad = useRef(true);

  const loadAll = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([supportMessages(), supportHistory()]);
      if (m?.success && Array.isArray(m.messages)) setMessages(m.messages);
      if (h?.success && Array.isArray(h.tickets)) setHistory(h.tickets);
    } catch {}
    if (firstLoad.current) {
      firstLoad.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    supportAvatar()
      .then((r) => {
        const url = r?.success ? r?.avatar_url : null;
        if (url) setAdminAvatarUrl(String(url).startsWith("http") ? url : `${BASE_URL}${url}`);
      })
      .catch(() => {});
    const t = setInterval(loadAll, 4000);
    return () => clearInterval(t);
  }, [loadAll]);

  const pickImage = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
      const asset = picked?.assets?.[0];
      if (!asset?.uri) return;
      let b64 = asset.base64 || "";
      if (!b64) {
        b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      setPendingImage({ uri: asset.uri, base64: b64 });
    } catch {}
  };

  const send = async () => {
    const value = text.trim();
    if ((!value && !pendingImage) || sending) return;
    setSending(true);
    try {
      const r = await supportSend(value, pendingImage?.base64);
      if (r?.success === false) {
        showToast(r?.error || "Не удалось отправить сообщение");
      } else {
        setText("");
        setPendingImage(null);
        await loadAll();
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
        await loadAll();
      }
    } catch (e: any) {
      showToast(e?.message || "Не удалось закрыть обращение");
    }
    setClosing(false);
    setConfirmClose(false);
  };

  const openHistoryTicket = (ticket: TicketInfo) => {
    nav.navigate("SupportTicket", {
      ticketId: ticket.id,
      status: ticket.status,
      updatedAt: ticket.updated_at,
      adminAvatarUrl,
    });
  };

  const hasActiveChat = messages.length > 0;
  const closedTickets = history.filter((t) => t.status === "closed");
  const VISIBLE_COUNT = 5;
  const recentTickets = historyExpanded ? closedTickets : closedTickets.slice(0, VISIBLE_COUNT);
  const hiddenCount = closedTickets.length - VISIBLE_COUNT;

  const inputBar = (
    <View>
      {pendingImage && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, alignItems: "flex-start" }}>
          <View>
            <Image source={{ uri: pendingImage.uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
            <PressableScale
              onPress={() => setPendingImage(null)}
              style={{
                position: "absolute",
                right: -6,
                top: -6,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.red,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={13} color="#fff" />
            </PressableScale>
          </View>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          padding: 10,
          paddingBottom: insets.bottom + 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          gap: 6,
        }}
      >
        <PressableScale
          onPress={pickImage}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Прикрепить скриншот"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            opacity: sending ? 0.5 : 1,
          }}
        >
          <Ionicons name="image-outline" size={24} color={colors.accent} />
        </PressableScale>
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
            maxHeight: 100,
          }}
          placeholder="Сообщение…"
          placeholderTextColor={colors.textFaint}
          multiline
          value={text}
          onChangeText={setText}
        />
        <PressableScale
          onPress={send}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Отправить сообщение"
          style={{
            width: 44,
            height: 44,
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
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </PressableScale>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 10 }}>Загружаем историю обращений…</Text>
      </View>
    );
  }

  // Активного чата нет — экран приветствия + история обращений
  if (!hasActiveChat) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          bounces={false}
          overScrollMode="never"
          data={recentTickets}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            <View style={{ alignItems: "center", marginTop: 24, marginBottom: 8 }}>
              <Ionicons name="headset-outline" size={64} color={colors.accent} style={{ opacity: 0.5 }} />
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 14 }}>
                Напишите нам!
              </Text>
              <Text style={{ color: colors.textDim, fontSize: 13, textAlign: "center", marginTop: 8 }}>
                Опишите проблему или задайте вопрос.{"\n"}Можно приложить скриншот.
              </Text>
            </View>
          }
          ListEmptyComponent={null}
          renderItem={({ item }) => <HistoryTile ticket={item} onPress={() => openHistoryTicket(item)} />}
        />
        {hiddenCount > 0 && (
          <PressableScale
            onPress={() => setHistoryExpanded((v) => !v)}
            style={{ paddingHorizontal: 16, paddingVertical: 6 }}
          >
            <Text style={{ color: colors.accent, fontSize: 14 }}>
              {historyExpanded ? "Свернуть" : `Ещё ${hiddenCount} обращений`}
            </Text>
          </PressableScale>
        )}
        {inputBar}
      </KeyboardAvoidingView>
    );
  }

  // Активный чат
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Кнопка закрытия тикета — как в старом приложении, сверху над чатом */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <PressableScale
          onPress={() => setConfirmClose(true)}
          disabled={closing}
          accessibilityRole="button"
          accessibilityLabel="Завершить обращение"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: colors.red + "26",
            borderRadius: 12,
            paddingVertical: 10,
            opacity: closing ? 0.6 : 1,
          }}
        >
          {closing ? (
            <ActivityIndicator size="small" color={colors.red} />
          ) : (
            <Ionicons name="close" size={17} color={colors.red} />
          )}
          <Text style={{ color: colors.red, fontSize: 14, fontWeight: "600" }}>Завершить обращение</Text>
        </PressableScale>
      </View>

      <FlatList
          bounces={false}
          overScrollMode="never"
        data={[...messages].reverse()}
        keyExtractor={(m) => String(m.id)}
        inverted
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
        renderItem={({ item }) => (
          <MessageBubble msg={item} adminAvatarUrl={adminAvatarUrl} onImageTap={(url) => setFullImage(fullImageUrl(url))} />
        )}
      />

      {inputBar}

      {/* Подтверждение закрытия */}
      <Modal visible={confirmClose} transparent animationType="fade" onRequestClose={() => setConfirmClose(false)}>
        <PressableScale style={modalStyles.backdrop} onPress={() => setConfirmClose(false)}>
          <PressableScale style={modalStyles.card} onPress={() => {}}>
            <Text style={modalStyles.title}>Закрыть обращение?</Text>
            <Text style={modalStyles.text}>Обращение будет закрыто и перемещено в историю.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}>
                <PressableScale style={modalStyles.btnGhost} onPress={() => setConfirmClose(false)}>
                  <Text style={modalStyles.btnGhostText}>Отмена</Text>
                </PressableScale>
              </View>
              <View style={{ flex: 1 }}>
                <PressableScale style={modalStyles.btnDanger} onPress={closeTicket}>
                  <Text style={modalStyles.btnDangerText}>Закрыть</Text>
                </PressableScale>
              </View>
            </View>
          </PressableScale>
        </PressableScale>
      </Modal>

      {/* Просмотр картинки на весь экран */}
      <Modal visible={!!fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(null)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <PressableScale
            onPress={() => setFullImage(null)}
            style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 2, padding: 8 }}
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
    </KeyboardAvoidingView>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: sheetSurfaceBg(),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  text: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  btnGhost: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: { color: colors.textDim, fontWeight: "700", fontSize: 14 },
  btnDanger: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.red,
  },
  btnDangerText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
