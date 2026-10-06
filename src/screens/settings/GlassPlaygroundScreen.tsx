import React, { useState, useSyncExternalStore } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Screen, Title, useScreenTopPad } from "../../components/UI";
import { PressableScale } from "../../components/PressableScale";
import { GlassCard, LiquidSlider, glassTuning, GLASS_PRESET_LIST, type GlassTuning } from "../../components/liquidGlass";
import { colors, useTheme } from "../../theme";
import { makeStyles } from "../settingsStyles";

/**
 * Glass Playground — живая настройка всех параметров стеклянных эффектов.
 *
 * Ползунки применяются мгновенно ко ВСЕМ стеклянным поверхностям темы Liquid
 * Glass (стор `glassTuning` → `LiquidGlassSurface`). Пресеты вверху — быстрые
 * стартовые точки; «Сброс» возвращает каталожные значения Backdrop.
 *
 * Превью ниже — настоящий `GlassCard`, поэтому пользователь видит эффект
 * на реальном компоненте приложения, а не на абстрактной картинке.
 */
export default function GlassPlaygroundScreen() {
  useTheme();
  const styles = makeStyles();
  const topPad = useScreenTopPad();
  const tuning = useSyncExternalStore(glassTuning.subscribe, glassTuning.getSnapshot);
  const [preview, setPreview] = useState<string>(() => glassTuning.getPreset());

  const set = (key: keyof GlassTuning, value: number) => {
    glassTuning.set({ ...tuning, [key]: value });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={topPad} scroll={false}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Title>Glass Playground</Title>
          <Text style={[styles.hint, { marginBottom: 16 }]}>
            Настройте скругления, размытие, преломление и другие эффекты стекла. Изменения применяются сразу ко всем блокам темы Liquid Glass.
          </Text>

          {/* Быстрые пресеты */}
          <Card>
            <Text style={styles.sectionTitle}>Пресеты</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {GLASS_PRESET_LIST.map((p) => (
                <PressableScale
                  key={p.id}
                  style={[styles.iconOption, preview === p.id && { borderColor: colors.accent }]}
                  onPress={() => {
                    glassTuning.setPreset(p.id);
                    setPreview(p.id);
                  }}
                >
                  <GlassCard radius={14} style={{ width: "100%", height: 54, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={p.icon as any} size={20} color={preview === p.id ? colors.accent : colors.textDim} />
                  </GlassCard>
                  <Text style={[styles.iconOptionText, preview === p.id && { color: colors.accent }]} numberOfLines={1}>
                    {p.label}
                  </Text>
                </PressableScale>
              ))}
            </View>
            <PressableScale
              style={{ marginTop: 12, paddingVertical: 10, alignItems: "center" }}
              onPress={() => {
                glassTuning.reset();
                setPreview("catalog");
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 14 }}>Сбросить к каталогу</Text>
            </PressableScale>
          </Card>

          {/* Живое превью */}
          <Card style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>Превью</Text>
            <GlassCard radius={28} style={{ marginTop: 12, padding: 20, alignItems: "center" }}>
              <Ionicons name="water" size={40} color={colors.accent} />
              <Text style={{ color: colors.text, fontSize: 16, marginTop: 10, fontWeight: "600" }}>
                Стеклянный блок
              </Text>
              <Text style={{ color: colors.textDim, fontSize: 13, marginTop: 4, textAlign: "center" }}>
                Двигайте ползунки ниже — изменения видны сразу
              </Text>
            </GlassCard>
          </Card>

          {/* Ползунки */}
          <Card style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>Параметры</Text>

            <SliderRow
              label="Скругление"
              value={tuning.radius}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => set("radius", v)}
            />
            <SliderRow
              label="Размытие (blur)"
              value={tuning.blur}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => set("blur", v)}
            />
            <SliderRow
              label="Насыщенность"
              value={tuning.saturation}
              min={0.5}
              max={2.5}
              step={0.1}
              onChange={(v) => set("saturation", v)}
            />
            <SliderRow
              label="Высота преломления"
              value={tuning.refractionHeight}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => set("refractionHeight", v)}
            />
            <SliderRow
              label="Сила преломления"
              value={tuning.refractionAmount}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => set("refractionAmount", v)}
            />
            <SliderRow
              label="Хроматическая аберрация"
              value={tuning.aberration}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => set("aberration", v)}
            />
            <SliderRow
              label="Блик"
              value={tuning.highlight}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => set("highlight", v)}
            />
            <SliderRow
              label="Тень"
              value={tuning.shadow}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => set("shadow", v)}
            />
            <SliderRow
              label="Подложка (вуаль)"
              value={tuning.veil}
              min={0}
              max={0.5}
              step={0.02}
              onChange={(v) => set("veil", v)}
            />
          </Card>
        </ScrollView>
      </Screen>
    </View>
  );
}

/** Строка с ползунком: метка + значение + LiquidSlider */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const styles = makeStyles();
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
        <Text style={{ color: colors.textDim, fontSize: 13, fontVariant: ["tabular-nums"] }}>
          {value.toFixed(2)}
        </Text>
      </View>
      <LiquidSlider value={value} min={min} max={max} step={step} onValueChange={onChange} />
    </View>
  );
}
