import React, { createContext, useContext, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { moderateScale, verticalScale } from "react-native-size-matters";
import { getSetting, setSetting, type CompactMode } from "./settings";

type ResponsiveContextValue = {
  mode: CompactMode;
  compact: boolean;
  scale: number;
  moderate: (size: number, factor?: number) => number;
  vertical: (size: number) => number;
  setMode: (mode: CompactMode) => void;
};

const ResponsiveContext = createContext<ResponsiveContextValue | null>(null);

function readMode(): CompactMode {
  const value = getSetting("compact_ui", "auto");
  return value === "normal" || value === "compact" ? value : "auto";
}

export function ResponsiveProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<CompactMode>(readMode);
  const { width, height, fontScale } = useWindowDimensions();
  const autoCompact = width < 360 || height < 760 || fontScale > 1.1;
  const compact = mode === "compact" || (mode === "auto" && autoCompact);
  const scale = compact ? Math.max(0.88, Math.min(1, width / 375)) : 1;

  const value = useMemo<ResponsiveContextValue>(() => ({
    mode,
    compact,
    scale,
    // Keep touch targets usable; callers can still opt into a smaller factor.
    moderate: (size, factor = 0.35) => compact ? moderateScale(size * scale, factor) : size,
    vertical: (size) => compact ? verticalScale(size * Math.max(0.92, scale)) : size,
    setMode: (next) => {
      setSetting("compact_ui", next);
      setModeState(next);
    },
  }), [mode, compact, scale]);

  return <ResponsiveContext.Provider value={value}>{children}</ResponsiveContext.Provider>;
}

export function useResponsive(): ResponsiveContextValue {
  const value = useContext(ResponsiveContext);
  if (!value) throw new Error("useResponsive must be used inside ResponsiveProvider");
  return value;
}

export function getCompactMode(): CompactMode {
  return readMode();
}

export function setCompactMode(mode: CompactMode) {
  setSetting("compact_ui", mode);
}
