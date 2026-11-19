import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { page404 } from "../src/csp.js";
import { publicNotice } from "../notice-build.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return [path];
  });
}

describe("public site copy", () => {
  it("does not mention a code host or Presidio on the page", () => {
    const paths = [
      ...filesIn(join(root, "site", "src")),
      ...filesIn(join(root, "site", "public")),
      join(root, "site", "index.html"),
      join(root, "site", "privacy.html"),
    ];
    const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source.toLowerCase()).not.toContain("github.com");
    expect(source.toLowerCase()).not.toContain("presidio");
    expect(page404().toLowerCase()).not.toContain("github");
    expect(page404().toLowerCase()).not.toContain("presidio");
  });

  it("ships the MIT notices without a code host", () => {
    const source = readFileSync(join(root, "NOTICE"), "utf8");
    expect(source).toContain("https://github.com/data-privacy-stack/presidio");
    expect(source).toContain("Copyright (c) Presidio Contributors");
    const shipped = publicNotice(source);
    expect(shipped).toContain("Copyright (c) Presidio Contributors");
    expect(shipped).toContain("Madison May");
    expect(shipped).toContain("Andrew Dillon");
    expect(shipped).toContain("Permission is hereby granted");
    expect(shipped.toLowerCase()).not.toContain("github.com");
  });
});
