/**
 * Applies a Cloudflare Workers static-assets `_headers` file.
 *
 * This follows workers-sdk `parseHeaders` and `attachCustomHeaders`:
 * `*` is one splat, rules match in file order, the first time a header is
 * set it replaces, a later set appends, and `! Name` deletes the header
 * before that rule's sets are applied. A later Content-Security-Policy
 * without the detach is therefore a second policy, which browsers enforce
 * together with the first.
 */

export interface HeaderRule {
  path: string;
  set: Map<string, string>;
  unset: string[];
}

const UNSET = "! ";

export function parseHeaderRules(document: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let rule: HeaderRule | undefined;
  for (const raw of document.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith("/")) {
      if ((line.match(/\*/g) ?? []).length > 1) {
        rule = undefined;
        continue;
      }
      rule = { path: line, set: new Map(), unset: [] };
      rules.push(rule);
      continue;
    }
    if (!rule) continue;
    if (line.startsWith(UNSET)) {
      rule.unset.push(line.slice(UNSET.length).trim().toLowerCase());
      continue;
    }
    const split = line.indexOf(":");
    if (split === -1) continue;
    const name = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    const existing = rule.set.get(name);
    rule.set.set(name, existing ? `${existing}, ${value}` : value);
  }
  return rules;
}

function pathPattern(pattern: string): RegExp {
  const body = pattern
    .split("*")
    .map((part) => part.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .join("(?<splat>.*)");
  return new RegExp(`^${body}$`);
}

export function applyHeaders(document: string, pathname: string): Map<string, string[]> {
  const values = new Map<string, string[]>();
  const setMap = new Set<string>();
  for (const rule of parseHeaderRules(document)) {
    if (!pathPattern(rule.path).test(pathname)) continue;
    for (const name of rule.unset) values.delete(name);
    for (const [name, value] of rule.set) {
      if (setMap.has(name)) {
        const list = values.get(name) ?? [];
        list.push(value);
        values.set(name, list);
      } else {
        values.set(name, [value]);
        setMap.add(name);
      }
    }
  }
  return values;
}
