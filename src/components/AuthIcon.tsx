import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

type AuthIconName =
  | "mail"
  | "lock"
  | "eye"
  | "eye-off"
  | "log-in"
  | "shield-check"
  | "user-plus"
  | "qr-code"
  | "send"
  | "telegram";

/**
 * Auth icon set based on the Lucide collection retrieved with Better Icons.
 * Keeping the small set local avoids shipping the whole icon catalogue.
 */
export function AuthIcon({
  name,
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
}: {
  name: AuthIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const common = {
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">
      {name === "mail" && (
        <>
          <Rect {...common} x="3" y="5" width="18" height="14" rx="2" />
          <Path {...common} d="m4 7 8 6 8-6" />
        </>
      )}
      {name === "lock" && (
        <>
          <Rect {...common} x="3" y="10" width="18" height="11" rx="2" />
          <Path {...common} d="M7 10V7a5 5 0 0 1 10 0v3" />
        </>
      )}
      {name === "eye" && (
        <>
          <Path {...common} d="M2.5 12s3.3-5 9.5-5 9.5 5 9.5 5-3.3 5-9.5 5-9.5-5-9.5-5Z" />
          <Circle {...common} cx="12" cy="12" r="2.2" />
        </>
      )}
      {name === "eye-off" && (
        <>
          <Path {...common} d="M3 3 21 21" />
          <Path {...common} d="M10.7 5.1A10.8 10.8 0 0 1 21.5 12a11 11 0 0 1-3.2 4.1M6.1 6.2A11 11 0 0 0 2.5 12s3.3 5 9.5 5c1.1 0 2.1-.2 3-.5" />
          <Path {...common} d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      )}
      {name === "log-in" && <Path {...common} d="m10 17 5-5-5-5m5 5H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />}
      {name === "shield-check" && (
        <>
          <Path {...common} d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1v7Z" />
          <Path {...common} d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "user-plus" && (
        <>
          <Circle {...common} cx="9" cy="7" r="4" />
          <Path {...common} d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M19 8v6m3-3h-6" />
        </>
      )}
      {name === "qr-code" && (
        <>
          <Rect {...common} x="3" y="3" width="5" height="5" rx="1" />
          <Rect {...common} x="16" y="3" width="5" height="5" rx="1" />
          <Rect {...common} x="3" y="16" width="5" height="5" rx="1" />
          <Path {...common} d="M16 16h2a2 2 0 0 1 2 2v3M16 21h.01M21 16h.01M12 3h.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 16h.01M12 21v-1" />
        </>
      )}
      {name === "send" && <Path {...common} d="m21.5 3.3-3.2 16.7c-.2 1.1-.9 1.5-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.9 13.7 1 12.2c-1.1-.3-1.1-1.1.2-1.6l19.2-7.5c.9-.3 1.7.2 1.1.2Z" />}
      {name === "telegram" && <Path fill={color} stroke="none" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12a12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.5.5 0 0 1 .171.325c.016.093.036.306.02.472c-.18 1.898-.962 6.502-1.36 8.627c-.168.9-.499 1.201-.82 1.23c-.696.065-1.225-.46-1.9-.902c-1.056-.693-1.653-1.124-2.678-1.8c-1.185-.78-.417-1.21.258-1.91c.177-.184 3.247-2.977 3.307-3.23c.007-.032.014-.15-.056-.212s-.174-.041-.249-.024q-.159.037-5.061 3.345q-.72.495-1.302.48c-.428-.008-1.252-.241-1.865-.44c-.752-.245-1.349-.374-1.297-.789q.04-.324.893-.663q5.247-2.286 6.998-3.014c3.332-1.386 4.025-1.627 4.476-1.635" />}
    </Svg>
  );
}

export type { AuthIconName };
