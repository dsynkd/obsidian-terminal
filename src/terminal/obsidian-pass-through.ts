import type { App, Command, Hotkey, Modifier } from "obsidian";
import { Keymap, Platform } from "obsidian";
import type { Fixed } from "@polyipseity/obsidian-plugin-library";

/** Default ⌘ chords (palette, switcher, new note, graph, settings) — same as the former built-in list. */
export const DEFAULT_OBSIDIAN_PASS_THROUGH_HOTKEYS: readonly Hotkey[] = [
  { modifiers: ["Mod"], key: "p" },
  { modifiers: ["Mod"], key: "o" },
  { modifiers: ["Mod"], key: "," },
];

type CommandsApi = {
  readonly findCommand?: (id: string) => Command | undefined;
  readonly executeCommand?: (command: Command) => boolean;
  readonly executeCommandById?: (id: string) => boolean;
  readonly listCommands?: () => readonly Command[];
};

type HotkeyManagerInternal = {
  readonly defaultKeys?: Readonly<Record<string, Hotkey[]>>;
  readonly customKeys?: Readonly<Record<string, Hotkey[]>>;
};

function getCommands(app: App): CommandsApi | null {
  const c = (app as unknown as { commands?: CommandsApi }).commands;
  return c ?? null;
}

function getHotkeyManager(app: App): HotkeyManagerInternal | null {
  const hm = (app as unknown as { hotkeyManager?: HotkeyManagerInternal })
    .hotkeyManager;
  return hm ?? null;
}

function getEffectiveHotkeys(
  hm: HotkeyManagerInternal,
  commandId: string,
): readonly Hotkey[] {
  const custom = hm.customKeys?.[commandId];
  if (custom && custom.length > 0) {
    return custom;
  }
  return hm.defaultKeys?.[commandId] ?? [];
}

function collectCommandIds(hm: HotkeyManagerInternal): string[] {
  const ids = new Set<string>();
  for (const id of Object.keys(hm.defaultKeys ?? {})) {
    ids.add(id);
  }
  for (const id of Object.keys(hm.customKeys ?? {})) {
    ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Match Obsidian's hotkey against a keydown event.
 * On macOS, ⌘ registers as both Mod and Meta; hotkeys usually store only Mod — allow that pairing.
 */
export function hotkeyMatchesKeyboardEvent(
  hotkey: Hotkey,
  event: KeyboardEvent,
): boolean {
  if (event.type !== "keydown" || event.repeat) {
    return false;
  }
  const modifiers: readonly Modifier[] = [
    "Mod",
    "Ctrl",
    "Meta",
    "Alt",
    "Shift",
  ];
  for (const mod of modifiers) {
    const need = hotkey.modifiers.includes(mod);
    const have = Keymap.isModifier(event, mod);
    if (need === have) {
      continue;
    }
    if (
      mod === "Meta" &&
      !need &&
      have &&
      Platform.isMacOS &&
      hotkey.modifiers.includes("Mod") &&
      !hotkey.modifiers.includes("Meta")
    ) {
      continue;
    }
    return false;
  }
  return hotkeyKeyMatchesEvent(hotkey.key, event);
}

function hotkeyKeyMatchesEvent(hotkeyKey: string, event: KeyboardEvent): boolean {
  const k = hotkeyKey;
  if (k.length === 1 && event.key.length === 1) {
    return k.toLowerCase() === event.key.toLowerCase();
  }
  return k === event.key;
}

function findCommandIdForKeyboardEvent(app: App, event: KeyboardEvent): string | null {
  const hm = getHotkeyManager(app);
  if (!hm) {
    return null;
  }
  for (const id of collectCommandIds(hm)) {
    for (const hk of getEffectiveHotkeys(hm, id)) {
      if (hotkeyMatchesKeyboardEvent(hk, event)) {
        return id;
      }
    }
  }
  return null;
}

function tryExecuteCommandIds(app: App, ids: readonly string[]): boolean {
  const commands = getCommands(app);
  if (!commands) {
    return false;
  }
  if (typeof commands.executeCommandById === "function") {
    for (const id of ids) {
      try {
        if (commands.executeCommandById(id)) {
          return true;
        }
      } catch {
        /* missing id */
      }
    }
  }
  if (commands.findCommand && commands.executeCommand) {
    for (const id of ids) {
      const cmd = commands.findCommand(id);
      if (cmd && commands.executeCommand(cmd)) {
        return true;
      }
    }
  }
  return false;
}

export function tryExecuteObsidianShortcutForKeyEvent(
  app: App,
  event: KeyboardEvent,
  options: {
    readonly passThroughHotkeys: readonly Hotkey[];
  },
): boolean {
  const matchesRow = options.passThroughHotkeys.some((h) =>
    hotkeyMatchesKeyboardEvent(h, event),
  );
  if (!matchesRow) {
    return false;
  }
  const id = findCommandIdForKeyboardEvent(app, event);
  if (!id) {
    return false;
  }
  const ok = tryExecuteCommandIds(app, [id]);
  if (!ok) {
    return false;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

const MODIFIERS_ALL: readonly Modifier[] = [
  "Mod",
  "Ctrl",
  "Meta",
  "Alt",
  "Shift",
];

/** Build a Hotkey from a keydown event (for settings capture). Prefer Mod over Meta on macOS for ⌘. */
export function keyboardEventToHotkey(event: KeyboardEvent): Hotkey | null {
  if (event.type !== "keydown") {
    return null;
  }
  const ignore = new Set([
    "Control",
    "Meta",
    "Alt",
    "Shift",
    "OS",
    "CapsLock",
  ]);
  if (ignore.has(event.key)) {
    return null;
  }
  const modifiers: Modifier[] = [];
  if (Platform.isMacOS) {
    if (Keymap.isModifier(event, "Mod")) {
      modifiers.push("Mod");
    } else {
      if (Keymap.isModifier(event, "Ctrl")) {
        modifiers.push("Ctrl");
      }
      if (Keymap.isModifier(event, "Meta")) {
        modifiers.push("Meta");
      }
    }
  } else {
    if (Keymap.isModifier(event, "Mod")) {
      modifiers.push("Mod");
    }
    if (Keymap.isModifier(event, "Ctrl")) {
      modifiers.push("Ctrl");
    }
    if (Keymap.isModifier(event, "Meta")) {
      modifiers.push("Meta");
    }
  }
  if (Keymap.isModifier(event, "Alt")) {
    modifiers.push("Alt");
  }
  if (Keymap.isModifier(event, "Shift")) {
    modifiers.push("Shift");
  }
  let key = event.key;
  if (key.length === 1) {
    key = key.toLowerCase();
  }
  if (!key) {
    return null;
  }
  return { modifiers, key };
}

export function hotkeySignature(h: Hotkey): string {
  return `${[...h.modifiers].sort().join(",")}:${h.key.toLowerCase()}`;
}

export function formatHotkeyLabel(h: Hotkey): string {
  const parts = [...h.modifiers.map(modifierLabel), h.key];
  return parts.join(" ");
}

function modifierLabel(m: Modifier): string {
  switch (m) {
    case "Mod":
      return Platform.isMacOS ? "⌘" : "Ctrl";
    case "Ctrl":
      return "Ctrl";
    case "Meta":
      return "⌘";
    case "Alt":
      return Platform.isMacOS ? "⌥" : "Alt";
    case "Shift":
      return "⇧";
    default:
      return m;
  }
}

function cloneDefaultPassThroughHotkeys(): Hotkey[] {
  return DEFAULT_OBSIDIAN_PASS_THROUGH_HOTKEYS.map((h) => ({
    modifiers: [...h.modifiers],
    key: h.key,
  }));
}

export function fixObsidianPassThroughHotkeys(raw: unknown): Hotkey[] {
  if (!Array.isArray(raw)) {
    return cloneDefaultPassThroughHotkeys();
  }
  const out: Hotkey[] = [];
  for (const item of raw) {
    const h = ObsidianPassThroughHotkey.fix(item);
    if (h) {
      out.push({ modifiers: [...h.modifiers], key: h.key });
    }
  }
  return out;
}

export namespace ObsidianPassThroughHotkey {
  export function fix(raw: unknown): Fixed<Hotkey> | null {
    if (raw === null || typeof raw !== "object") {
      return null;
    }
    const o = raw as { modifiers?: unknown; key?: unknown };
    if (!Array.isArray(o.modifiers) || typeof o.key !== "string") {
      return null;
    }
    const mods: Modifier[] = [];
    const allowed = new Set<Modifier>(MODIFIERS_ALL);
    for (const m of o.modifiers) {
      if (typeof m === "string" && allowed.has(m as Modifier)) {
        mods.push(m as Modifier);
      }
    }
    const key = o.key.trim();
    if (!key) {
      return null;
    }
    return { modifiers: [...mods], key };
  }
}
