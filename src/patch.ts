import {
  aroundIdentityFactory,
  dynamicRequireSync,
  patchWindows,
} from "@polyipseity/obsidian-plugin-library";
import type { TerminalPlugin } from "./main.js";
import { around } from "monkey-around";

function patchRequire(
  context: TerminalPlugin,
  self0: typeof globalThis,
): () => void {
  const { settings } = context;
  return around(self0, {
    require(next) {
      return function fn(
        this: typeof self0 | undefined,
        ...args: Parameters<typeof next>
      ): ReturnType<typeof next> {
        try {
          return next.apply(this, args);
        } catch (error) {
          if (!settings.value.exposeInternalModules) {
            throw error;
          }
          /* @__PURE__ */ self0.console.debug(error);
          return dynamicRequireSync(new Map(), ...args);
        }
      } as NodeJS.Require;
    },
    toString: aroundIdentityFactory(),
  });
}

export function loadPatch(context: TerminalPlugin): void {
  const {
    app: { workspace },
  } = context;
  context.register(
    patchWindows(workspace, (self0) => patchRequire(context, self0)),
  );
}
