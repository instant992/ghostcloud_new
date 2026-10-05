import React from "react";
import { Switch } from "react-native";
import { colors, useTheme } from "../theme";
import { LiquidToggle } from "./liquidGlass/LiquidControls";

/**
 * Тумблер настроек с учётом темы: в Liquid Glass — порт каталожного
 * LiquidToggle (дорожка 64×28 lerp(track→accent), белая стеклянная ручка
 * 40×24, drag-жест и «дыхание»), в остальных темах — нативный RN Switch
 * в прежнем стиле (trackColor accent, thumbColor #fff).
 *
 * Drop-in замена <Switch>: те же props value/onValueChange/disabled +
 * accessibilityLabel.
 */
export function ThemeSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { style } = useTheme();
  if (style === "glass") {
    return (
      <LiquidToggle
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor="#fff"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
