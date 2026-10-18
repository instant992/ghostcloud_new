import type { VpnNode } from "./parse";
import { splitNameFlag } from "../theme";
import { isLteNode } from "./autoSelect";

/** Subscription-level url-test aggregate; it is not a selectable ordinary node. */
export function isBestServerAggregate(node: VpnNode): boolean {
  return node.source !== "lte" && /лучший\s+сервер/i.test(splitNameFlag(node.name).name);
}

export type ServerGroup = {
  key: string;
  node: VpnNode;
  nodes: VpnNode[];
  duplicate: boolean;
};

/** Collapse same-name/same-country ordinary nodes, while keeping LTE untouched. */
export function groupServerNodes(nodes: VpnNode[]): ServerGroup[] {
  const groups = new Map<string, ServerGroup>();
  for (const node of nodes) {
    if (isBestServerAggregate(node)) continue;
    const info = splitNameFlag(node.name);
    const key = isLteNode(node)
      ? `lte:${node.id}`
      : `${info.flag}|${info.name.trim().toLocaleLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.nodes.push(node);
      existing.duplicate = true;
    } else {
      groups.set(key, { key, node, nodes: [node], duplicate: false });
    }
  }
  return [...groups.values()];
}
