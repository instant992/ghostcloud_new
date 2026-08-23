import type { VpnNode } from "../vpn/parse";

/** Краткая подпись типа подключения: "VLESS · REALITY · GRPC", "VMESS · WS+TLS" и т.п. */
export function transportLabel(node: VpnNode): string {
  const parts: string[] = [node.protocol.toUpperCase()];
  const net = (node.network || "tcp").toLowerCase();

  if (node.security === "reality") {
    parts.push("REALITY");
  } else if (node.security === "tls") {
    if (net !== "xhttp" && node.fingerprint) parts.push(node.fingerprint.toUpperCase());
    parts.push("TLS");
  }

  switch (net) {
    case "tcp":
      if (node.headerType === "http") parts.push("TCP-HTTP");
      else if (parts.length < 2) parts.push("TCP");
      break;
    case "grpc":
      parts.push("GRPC");
      break;
    case "ws":
      parts.push("WS");
      break;
    case "http":
    case "h2":
      parts.push("H2");
      break;
    case "httpupgrade":
      parts.push("HTTPUPGRADE");
      break;
    case "xhttp":
      parts.push("XHTTP");
      break;
    case "splithttp":
      parts.push("SPLITHTTP");
      break;
    case "kcp":
      parts.push("KCP");
      break;
    default:
      parts.push(net.toUpperCase());
  }

  return parts.join(" · ");
}
