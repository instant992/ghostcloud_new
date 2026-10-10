import React, { useMemo } from "react";
import { PaperProvider, useTheme as usePaperTheme, type MD3Theme } from "react-native-paper";
import { useTheme } from "../theme";
import { getMaterialTheme } from "./palette";

/** Mount INSIDE GhostCloud ThemeProvider so explicit/auto mode stays in sync. */
export function MaterialProvider({ children }: { children: React.ReactNode }) {
  const { dark, version } = useTheme();
  const theme = useMemo(() => getMaterialTheme(dark), [dark, version]);
  return <PaperProvider theme={theme}>{children}</PaperProvider>;
}

export function useMaterialTheme(): MD3Theme {
  return usePaperTheme<MD3Theme>();
}
