import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useApp } from "../context";
import { colors, useTheme } from "../theme";
import { Button, Input, Screen, ThemedCard, Title, useScreenTopPad } from "../components/UI";
import { BugComment, BugReport, commentBug, createBug, deleteBugComment, getBug, listBugs, moderateBug, voteBug } from "../api";

const statusNames: Record<string, string> = { open: "Открыта", in_progress: "В работе", fixed: "Исправлена", pending: "На проверке", rejected: "Отклонена" };
function dateLabel(value: string) {
  const date = new Date(value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function errorLabel(error: unknown) { return error instanceof Error ? error.message : "Не удалось выполнить действие"; }
function BugMeta({ item }: { item: BugReport }) {
  return <View style={styles.meta}><Text style={[styles.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{statusNames[item.moderation_status === "approved" ? item.status : item.moderation_status] || item.status}</Text><Text style={[styles.dim, { color: colors.textDim }]}>#{item.id} · {item.author_name} · {dateLabel(item.created_at)}</Text></View>;
}
function Votes({ item, disabled, onVote }: { item: BugReport; disabled: boolean; onVote: (value: number) => void }) {
  return <View style={styles.row}>{([1, -1] as const).map(value => <Pressable key={value} disabled={disabled} accessibilityRole="button" accessibilityLabel={value === 1 ? "Нравится" : "Не нравится"} accessibilityState={{ selected: item.my_vote === value, disabled }} onPress={() => onVote(item.my_vote === value ? 0 : value)} style={[styles.vote, { backgroundColor: item.my_vote === value ? colors.accentSoft : "transparent" }]}><Ionicons name={value === 1 ? "thumbs-up-outline" : "thumbs-down-outline"} size={19} color={item.my_vote === value ? colors.accent : colors.textDim}/><Text style={{ color: colors.text }}>{value === 1 ? item.likes : item.dislikes}</Text></Pressable>)}<Ionicons name="chatbubble-outline" size={17} color={colors.textDim}/><Text style={{ color: colors.textDim }}>{item.comment_count}</Text></View>;
}

export default function BugsScreen() {
  const { isFoxcloud } = useApp();
  const theme = useTheme();
  const top = useScreenTopPad();
  const nav = useNavigation<any>();
  const [scope, setScope] = useState("published");
  const [items, setItems] = useState<BugReport[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const token = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await listBugs(scope, offset);
      if (token !== generation.current) return;
      setItems(prev => offset ? [...prev, ...result.items.filter((item: BugReport) => !prev.some(old => old.id === item.id))] : result.items);
      setHasMore(Boolean(result.has_more)); setModerator(Boolean(result.is_moderator));
    } catch (e) { if (token === generation.current) setError(errorLabel(e)); }
    finally { if (token === generation.current) setLoading(false); }
  }, [scope]);
  useFocusEffect(useCallback(() => { if (!isFoxcloud) void load(); return () => { generation.current++; }; }, [load, isFoxcloud]));
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createBug({ title: title.trim(), description: description.trim(), steps: steps.trim(), app_version: Constants.expoConfig?.version || "1.0.0", theme: theme.style });
      setTitle(""); setDescription(""); setSteps(""); setForm(false);
      Alert.alert("Отправлено", "Ошибка появится в общем списке после проверки. Следить за ней можно во вкладке «Мои».");
      setScope("mine"); if (scope === "mine") void load();
    } catch (e) { Alert.alert("Не удалось отправить", errorLabel(e)); }
    finally { setBusy(false); }
  };
  const vote = async (item: BugReport, value: number) => {
    if (busy) return; setBusy(true);
    try { await voteBug(item.id, value); await load(); } catch (e) { Alert.alert("Ошибка", errorLabel(e)); } finally { setBusy(false); }
  };
  if (isFoxcloud) return <Screen style={top}><Title>Ошибки приложения</Title><Text style={{ color: colors.textDim }}>Раздел доступен при входе в GhostCloud по логину и паролю.</Text></Screen>;
  return <Screen style={top}>
    <Title>Ошибки приложения</Title>
    <Text style={[styles.intro, { color: colors.textDim }]}>Сообщайте о проблемах и следите за исправлениями. Не указывайте пароли, ключи и личные данные.</Text>
    <Button title={form ? "Закрыть форму" : "Сообщить об ошибке"} onPress={() => setForm(!form)} disabled={busy}/>
    {form && <ThemedCard style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, marginTop: 14 }}>
      <Input label="Краткий заголовок" value={title} onChangeText={setTitle} maxLength={160}/>
      <Input label="Что произошло и что ожидалось" value={description} onChangeText={setDescription} multiline maxLength={5000}/>
      <Input label="Как повторить (необязательно)" value={steps} onChangeText={setSteps} multiline maxLength={3000}/>
      <Text style={[styles.dim, { color: colors.textDim, marginBottom: 12 }]}>Версия и тема приложения будут добавлены автоматически.</Text>
      <Button title="Отправить на проверку" onPress={submit} loading={busy} disabled={title.trim().length < 3 || description.trim().length < 10}/>
    </ThemedCard>}
    <View style={[styles.row, { flexWrap: "wrap", marginVertical: 16 }]}>{[["published", "Все"], ["mine", "Мои"], ...(moderator ? [["moderation", "Модерация"]] : [])].map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} onPress={() => { setItems([]); setScope(value); }} style={[styles.tab, { backgroundColor: scope === value ? colors.accentSoft : colors.card }]}><Text style={{ color: scope === value ? colors.accent : colors.textDim, fontWeight: "600" }}>{label}</Text></Pressable>)}</View>
    {!!error && <View style={styles.message}><Text style={{ color: colors.red }}>{error}</Text><Button title="Повторить" variant="ghost" onPress={() => void load()} disabled={loading}/></View>}
    {loading && <ActivityIndicator color={colors.accent} style={{ margin: 16 }}/ >}
    {!loading && !error && !items.length && <Text style={[styles.message, { color: colors.textDim }]}>{scope === "moderation" ? "Нет ошибок, ожидающих проверки." : scope === "mine" ? "Вы ещё не отправляли ошибок." : "Пока нет опубликованных ошибок."}</Text>}
    {items.map(item => <ThemedCard key={item.id} style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, marginBottom: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ошибку ${item.title}`} onPress={() => nav.navigate("BugDetail", { id: item.id })}><BugMeta item={item}/><Text style={[styles.heading, { color: colors.text }]}>{item.title}</Text><Text numberOfLines={2} style={[styles.body, { color: colors.textDim }]}>{item.description}</Text></Pressable>
      <Votes item={item} disabled={busy || item.moderation_status !== "approved"} onVote={value => void vote(item, value)}/>
      {item.moderation_status !== "approved" && <Button title="Подробнее" variant="ghost" size="sm" onPress={() => nav.navigate("BugDetail", { id: item.id })}/>}
    </ThemedCard>)}
    {hasMore && <Button title="Показать ещё" variant="ghost" loading={loading} onPress={() => void load(items.length)}/ >}
  </Screen>;
}

export function BugDetailScreen() {
  useTheme();
  const top = useScreenTopPad();
  const { isFoxcloud } = useApp();
  const route = useRoute<any>();
  const id = Number(route.params?.id);
  const [item, setItem] = useState<BugReport | null>(null);
  const [comments, setComments] = useState<BugComment[]>([]);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const generation = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const token = ++generation.current; setLoading(true); setError("");
    try { const result = await getBug(id, offset); if (token !== generation.current) return; setItem(result.item); setComments(prev => offset ? [...prev, ...result.comments.filter((comment: BugComment) => !prev.some(old => old.id === comment.id))] : result.comments); setHasMoreComments(Boolean(result.has_more)); setModerator(Boolean(result.is_moderator)); }
    catch (e) { if (token === generation.current) setError(errorLabel(e)); }
    finally { if (token === generation.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { if (!isFoxcloud) void load(); return () => { generation.current++; }; }, [load, isFoxcloud]));
  const action = async (task: () => Promise<unknown>, done?: () => void) => {
    if (busy) return; setBusy(true);
    try { await task(); done?.(); await load(); } catch (e) { Alert.alert("Ошибка", errorLabel(e)); } finally { setBusy(false); }
  };
  if (isFoxcloud) return <Screen style={top}><Title>Раздел недоступен</Title></Screen>;
  return <Screen style={top}>
    {!!error && <View style={styles.message}><Text style={{ color: colors.red }}>{error}</Text><Button title="Повторить" onPress={() => void load()} disabled={loading}/></View>}
    {loading && <ActivityIndicator color={colors.accent} style={{ margin: 16 }}/ >}
    {item && <>
      <BugMeta item={item}/><Title>{item.title}</Title>
      <Text selectable style={[styles.body, { color: colors.text }]}>{item.description}</Text>
      {!!item.steps && <><Text style={[styles.heading, { color: colors.text }]}>Как повторить</Text><Text selectable style={[styles.body, { color: colors.text }]}>{item.steps}</Text></>}
      <Text style={[styles.dim, { color: colors.textDim }]}>Версия: {item.app_version || "—"} · Тема: {item.theme || "—"}</Text>
      {!!item.rejection_reason && <Text style={[styles.body, { color: colors.red }]}>Причина отклонения: {item.rejection_reason}</Text>}
      <Votes item={item} disabled={busy || loading || item.moderation_status !== "approved"} onVote={value => void action(() => voteBug(id, value))}/>
      {moderator && <ThemedCard style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, marginVertical: 16 }}>
        <Text style={[styles.heading, { color: colors.text }]}>Модерация</Text>
        {item.moderation_status !== "approved" ? <>
          <Button title="Одобрить" loading={busy} onPress={() => void action(() => moderateBug(id, { moderation_status: "approved" }))}/>
          <Input label="Причина отклонения" value={reason} onChangeText={setReason} maxLength={1000} multiline/>
          <Button title="Отклонить" variant="danger" disabled={busy || !reason.trim()} onPress={() => void action(() => moderateBug(id, { moderation_status: "rejected", reason: reason.trim() }))}/>
        </> : <>{["open", "in_progress", "fixed"].map(status => <Button key={status} title={statusNames[status]} variant={item.status === status ? "primary" : "ghost"} disabled={busy || item.status === status} onPress={() => void action(() => moderateBug(id, { status }))}/>)}</>}
      </ThemedCard>}
      <Text style={[styles.heading, { color: colors.text, marginTop: 20 }]}>Комментарии · {item.comment_count}</Text>
      {!comments.length && <Text style={[styles.dim, { color: colors.textDim }]}>Комментариев пока нет.</Text>}
      {comments.map(comment => <ThemedCard key={comment.id} style={{ backgroundColor: colors.card, borderRadius: 18, padding: 14, marginVertical: 6 }}>
        <Text style={[styles.dim, { color: colors.textDim }]}>{comment.author_name} · {dateLabel(comment.created_at)}</Text>
        <Text selectable style={[styles.body, { color: colors.text }]}>{comment.text}</Text>
        {moderator && <Button title="Удалить комментарий" size="sm" variant="danger" disabled={busy} onPress={() => Alert.alert("Удалить комментарий?", "Это действие нельзя отменить.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => void action(() => deleteBugComment(id, comment.id)) }])}/ >}
      </ThemedCard>)}
      {hasMoreComments && <Button title="Ещё комментарии" variant="ghost" loading={loading} disabled={busy} onPress={() => void load(comments.length)}/>}
      {item.moderation_status === "approved" && <View style={{ marginTop: 16 }}><Input label="Ваш комментарий" value={text} onChangeText={setText} multiline maxLength={2000}/><Button title="Отправить комментарий" loading={busy} disabled={!text.trim() || loading} onPress={() => void action(() => commentBug(id, text.trim()), () => setText(""))}/></View>}
    </>}
  </Screen>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { gap: 8, marginBottom: 10 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, fontSize: 12, fontWeight: "600" },
  dim: { fontSize: 12, lineHeight: 18 },
  heading: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 23, marginVertical: 8 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 18 },
  tab: { paddingHorizontal: 16, minHeight: 44, justifyContent: "center", borderRadius: 16 },
  vote: { minWidth: 64, minHeight: 48, paddingHorizontal: 10, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  message: { paddingVertical: 16, gap: 12 },
});
