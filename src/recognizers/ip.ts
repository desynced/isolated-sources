import { PatternRecognizer, type PatternDef } from "../pattern-recognizer.js";
import { Entity } from "../types.js";

/**
 * Ported from Microsoft Presidio (MIT), IpRecognizer.
 * Source: presidio_analyzer/predefined_recognizers/generic/ip_recognizer.py
 * Copyright (c) Presidio Contributors. See NOTICE.
 * Patterns cover IPv4, IPv6, and the embedded forms Presidio ships.
 * Validation stays in the regex so the package does not depend on Node's net module.
 */
const PATTERNS: readonly PatternDef[] = [
  {
    name: "IPv4_mapped",
    regex: new RegExp(
      String.raw`(?<![\w:])::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:/(?:12[0-8]|1[01]\d|[1-9]?\d))?\b`,
    ),
    score: 0.6,
  },
  {
    name: "IPv4_embedded",
    regex: new RegExp(
      String.raw`(?<![\w:])(?:(?:[0-9A-Fa-f]{1,4}:){1,5}:(?:[0-9A-Fa-f]{1,4}:){0,4}|(?:[0-9A-Fa-f]{1,4}:){6})(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:/(?:12[0-8]|1[01]\d|[1-9]?\d))?\b`,
    ),
    score: 0.6,
  },
  {
    name: "IPv4",
    regex: new RegExp(
      String.raw`\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:/(?:[0-2]?\d|3[0-2]))?\b`,
    ),
    score: 0.6,
  },
  {
    name: "IPv6",
    regex: new RegExp(
      String.raw`(?<![\w:])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|:(?::[0-9A-Fa-f]{1,4}){1,7}|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}|:(?::[0-9A-Fa-f]{1,4}){1,6})(?:%[0-9a-zA-Z]+)?(?:/(?:12[0-8]|1[01]\d|[1-9]?\d))?(?![\w:]|\.\d)`,
    ),
    score: 0.6,
  },
  {
    name: "IPv6_unspecified",
    regex: new RegExp(String.raw`(?<![\w:])::(?:/(?:12[0-8]|1[01]\d|[1-9]?\d))?(?![\w:])`),
    score: 0.1,
  },
];

export class IpRecognizer extends PatternRecognizer {
  readonly id = "ip";
  readonly entityType = Entity.IP_ADDRESS;
  readonly context = ["ip", "ipv4", "ipv6"];
  readonly patterns = PATTERNS;
}
