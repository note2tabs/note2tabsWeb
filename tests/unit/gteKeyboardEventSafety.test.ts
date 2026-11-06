import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

it("ignores keydown events without a usable key before running editor shortcuts", () => {
  const source = readFileSync("components/GteWorkspace.tsx", "utf8");
  const handler = [...source.matchAll(/const handleKeyDown = \(event: KeyboardEvent\) => \{([\s\S]*?)\n    \};/g)].find(match => match[1].includes("arrowFromLengthenControl"))![1];
  const compiled = ts.transpileModule(`(event: KeyboardEvent) => {${handler}}`, { compilerOptions: {target: ts.ScriptTarget.ES2020} }).outputText;
  const shortcutTarget = vi.fn(() => true);
  const run = vm.runInNewContext(compiled, { isShortcutTextEntryTarget: shortcutTarget });
  for (const key of [undefined, null, 42, {}, ""]) {
    expect(() => run({key, target: null})).not.toThrow();
  }
  expect(shortcutTarget).not.toHaveBeenCalled();
});
