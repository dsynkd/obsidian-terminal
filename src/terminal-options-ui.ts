import { UpdatableUI, linkSetting, Platform } from "@polyipseity/obsidian-plugin-library";
import type { DeepWritable } from "ts-essentials";
import type { Setting } from "obsidian";
import { Settings } from "./settings-data.js";

/** Fallback when no override is stored; shown in the picker only. */
const THEME_COLOR_PICKER_FALLBACK = "#000000";

type TerminalOpts = DeepWritable<Settings.Profile.TerminalOptions>;

/** Normalize a CSS color string to `#rrggbb` for Obsidian’s color picker. */
function cssColorToHex6(
  raw: string | undefined,
  doc: Document,
  parent: HTMLElement,
): string {
  if (!raw?.trim()) {
    return THEME_COLOR_PICKER_FALLBACK;
  }
  const t = raw.trim();
  const m6 = t.match(/^#([0-9a-fA-F]{6})$/i);
  const g6 = m6?.[1];
  if (g6) {
    return `#${g6.toLowerCase()}`;
  }
  const m3 = t.match(/^#([0-9a-fA-F]{3})$/i);
  const g3 = m3?.[1];
  if (g3) {
    return `#${[...g3].map((c) => c + c).join("").toLowerCase()}`;
  }
  const rgbM = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbM?.[1] !== void 0 && rgbM[2] !== void 0 && rgbM[3] !== void 0) {
    const r = Number(rgbM[1]),
      g = Number(rgbM[2]),
      b = Number(rgbM[3]);
    return `#${[r, g, b]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  const el = doc.createElement("div");
  el.style.color = t;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  parent.appendChild(el);
  const resolved = doc.defaultView?.getComputedStyle(el).color ?? "";
  el.remove();
  const m = resolved.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m?.[1] === void 0 || m[2] === void 0 || m[3] === void 0) {
    return THEME_COLOR_PICKER_FALLBACK;
  }
  const r = Number(m[1]),
    g = Number(m[2]),
    b = Number(m[3]);
  return `#${[r, g, b]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Mirrors xterm.js `DEFAULT_OPTIONS` (see `OptionsService.ts`); used to omit keys that match defaults. */
const XTERM_BOOL = {
  allowProposedApi: false,
  allowTransparency: false,
  altClickMovesCursor: true,
  convertEol: false,
  cursorBlink: false,
  customGlyphs: true,
  disableStdin: false,
  drawBoldTextInBrightColors: true,
  ignoreBracketedPasteMode: false,
  macOptionClickForcesSelection: false,
  macOptionIsMeta: false,
  rescaleOverlappingGlyphs: false,
  screenReaderMode: false,
  scrollOnUserInput: true,
  windowsMode: false,
} as const;

function xtermDefaultRightClickSelectsWord(): boolean {
  return Platform.CURRENT === "darwin";
}

const XTERM_ENUM_DEFAULTS = {
  cursorInactiveStyle: "outline" as const,
  cursorStyle: "block" as const,
  fastScrollModifier: "alt" as const,
  logLevel: "info" as const,
};

const XTERM_NUMBER_DEFAULTS = {
  cursorWidth: 1,
  fastScrollSensitivity: 5,
  fontSize: 15,
  letterSpacing: 0,
  lineHeight: 1,
  minimumContrastRatio: 1,
  overviewRulerWidth: 0,
  scrollSensitivity: 1,
  scrollback: 1000,
  smoothScrollDuration: 0,
  tabStopWidth: 8,
};

const FONT_FAMILY_DEFAULT = "monospace";
const FONT_WEIGHT_DEFAULT = "normal";
const FONT_WEIGHT_BOLD_DEFAULT = "bold";
/** Same as xterm `DEFAULT_OPTIONS.wordSeparator`. */
const WORD_SEPARATOR_DEFAULT = String.fromCharCode(
  32, 40, 41, 91, 93, 123, 125, 39, 44, 34, 96,
);

function numMatchesDefault(value: number, defaultValue: number): boolean {
  return (
    value === defaultValue ||
    (Number.isFinite(value) &&
      Number.isFinite(defaultValue) &&
      Math.abs(value - defaultValue) < 1e-5)
  );
}

function subsectionTitle(
  ui: UpdatableUI,
  element: HTMLElement,
  text: string,
  desc?: string,
): void {
  ui.new(
    () => {
      const d = element.ownerDocument;
      return d.createElement("div");
    },
    (ele) => {
      ele.classList.add("setting-item", "setting-item-heading");
      ele.createDiv({ cls: "setting-item-name", text });
      if (desc) {
        ele.createDiv({ cls: "setting-item-description", text: desc });
      }
    },
    (ele) => {
      ele.remove();
    },
  );
}

function addDocLink(ui: UpdatableUI, element: HTMLElement): void {
  ui.new(
    () => element.ownerDocument.createElement("div"),
    (ele) => {
      ele.classList.add("setting-item");
      ele.innerHTML =
        'Options map to <a aria-label="https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/" class="external-link" data-tooltip-position="top" href="https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/" rel="noopener" target="_blank"><code>ITerminalOptions</code></a>. Values equal to xterm defaults are not stored. <code>linkHandler</code>, <code>logger</code>, and other function-valued fields can still be set from the profile <strong>Data</strong> editor.';
    },
    (ele) => {
      ele.remove();
    },
  );
}

function addBoolOpt<K extends keyof typeof XTERM_BOOL>(
  ui: UpdatableUI,
  element: HTMLElement,
  name: string,
  desc: string | undefined,
  data: TerminalOpts,
  key: K,
  postMutate: () => Promise<void>,
): void {
  const d = XTERM_BOOL[key];
  ui.newSetting(element, (setting) => {
    setting.setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addToggle(
      linkSetting(
        () => data[key] ?? d,
        (value) => {
          if (value === d) {
            Reflect.deleteProperty(data, key);
          } else {
            (data as Record<string, unknown>)[key as string] = value;
          }
        },
        async () => {
          await postMutate();
        },
      ),
    );
  });
}

function addBoolOptCustomDefault(
  ui: UpdatableUI,
  element: HTMLElement,
  name: string,
  desc: string | undefined,
  get: () => boolean | undefined,
  set: (v: boolean | undefined) => void,
  defaultValue: boolean,
  postMutate: () => Promise<void>,
): void {
  ui.newSetting(element, (setting) => {
    setting.setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addToggle(
      linkSetting(
        () => get() ?? defaultValue,
        (value) => {
          if (value === defaultValue) {
            set(void 0);
          } else {
            set(value);
          }
        },
        async () => {
          await postMutate();
        },
      ),
    );
  });
}

type SliderOpts = { min: number; max: number; step: number | "any" };

function addSliderOpt<K extends keyof typeof XTERM_NUMBER_DEFAULTS>(
  ui: UpdatableUI,
  element: HTMLElement,
  name: string,
  desc: string | undefined,
  data: TerminalOpts,
  key: K,
  limits: SliderOpts,
  postMutate: () => Promise<void>,
): void {
  const d = XTERM_NUMBER_DEFAULTS[key];
  ui.newSetting(element, (setting) => {
    setting.setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addSlider(
      linkSetting(
        () => data[key] ?? d,
        (value) => {
          if (numMatchesDefault(value, d)) {
            Reflect.deleteProperty(data, key);
          } else {
            (data as Record<string, unknown>)[key as string] = value;
          }
        },
        async () => {
          await postMutate();
        },
        {
          pre(slider) {
            slider.setLimits(limits.min, limits.max, limits.step).setDynamicTooltip();
          },
        },
      ),
    );
  });
}

/** Numeric field stored on `data` but not in `XTERM_NUMBER_DEFAULTS` (slider + omit when default). */
function addSliderCustom(
  ui: UpdatableUI,
  element: HTMLElement,
  name: string,
  desc: string | undefined,
  get: () => number | undefined,
  set: (v: number | undefined) => void,
  defaultValue: number,
  limits: SliderOpts,
  postMutate: () => Promise<void>,
): void {
  ui.newSetting(element, (setting) => {
    setting.setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addSlider(
      linkSetting(
        () => get() ?? defaultValue,
        (value) => {
          if (numMatchesDefault(value, defaultValue)) {
            set(void 0);
          } else {
            set(value);
          }
        },
        async () => {
          await postMutate();
        },
        {
          pre(slider) {
            slider.setLimits(limits.min, limits.max, limits.step).setDynamicTooltip();
          },
        },
      ),
    );
  });
}

function addEnumOpt<T extends string, K extends keyof TerminalOpts>(
  ui: UpdatableUI,
  element: HTMLElement,
  name: string,
  desc: string | undefined,
  data: TerminalOpts,
  key: K,
  enumValues: readonly T[],
  defaultValue: T,
  labelFor: (v: T) => string,
  postMutate: () => Promise<void>,
): void {
  ui.newSetting(element, (setting) => {
    setting.setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addDropdown(
      linkSetting(
        () => {
          const v = data[key] as T | undefined;
          return v ?? "";
        },
        (value) => {
          if (
            value === "" ||
            !enumValues.includes(value as T) ||
            value === defaultValue
          ) {
            Reflect.deleteProperty(data, key);
          } else {
            (data as Record<string, unknown>)[key as string] = value;
          }
        },
        async () => {
          await postMutate();
        },
        {
          pre(dd) {
            dd.addOption("", `Default (${labelFor(defaultValue)})`);
            for (const e of enumValues) {
              dd.addOption(e, labelFor(e));
            }
          },
        },
      ),
    );
  });
}

function addStringOpt(
  ui: UpdatableUI,
  element: HTMLElement,
  name: string,
  desc: string,
  get: () => string | undefined,
  set: (v: string | undefined) => void,
  placeholder: string,
  postMutate: () => Promise<void>,
  omitIfMatches?: string,
): void {
  ui.newSetting(element, (setting) => {
    setting
      .setName(name)
      .setDesc(desc)
      .addText(
        linkSetting(
          () => get() ?? "",
          (value) => {
            if (
              value === "" ||
              (omitIfMatches !== void 0 && value === omitIfMatches)
            ) {
              set(void 0);
            } else {
              set(value);
            }
          },
          async () => {
            await postMutate();
          },
          {
            post(comp) {
              comp.setPlaceholder(placeholder);
            },
          },
        ),
      );
  });
}

const THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "cursor",
  "cursorAccent",
  "selectionBackground",
  "selectionForeground",
  "selectionInactiveBackground",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

const THEME_COLOR_PICK_WRAP = "terminal-theme-color-picker-wrap";
const THEME_COLOR_PICK_UNSET = "terminal-theme-color-picker-unset";
const THEME_COLOR_PICK_CHECKER = "terminal-theme-color-picker-checker";

function themeColorOverrideUnset(
  data: TerminalOpts,
  key: (typeof THEME_COLOR_KEYS)[number],
): boolean {
  const raw = data.theme?.[key];
  return raw === void 0 || String(raw).trim() === "";
}

/** Checkerboard behind the native color input when no override is stored. */
function attachThemeColorPickerChecker(setting: Setting, isUnset: boolean): void {
  const input = setting.controlEl.querySelector<HTMLInputElement>(
    "input[type=color]",
  );
  if (!input?.parentElement) {
    return;
  }
  let wrap = input.parentElement.closest<HTMLElement>(`.${THEME_COLOR_PICK_WRAP}`);
  if (!wrap || !wrap.contains(input)) {
    wrap = document.createElement("span");
    wrap.className = THEME_COLOR_PICK_WRAP;
    const checker = document.createElement("span");
    checker.className = THEME_COLOR_PICK_CHECKER;
    checker.setAttribute("aria-hidden", "true");
    const { parentElement } = input;
    parentElement.insertBefore(wrap, input);
    wrap.appendChild(checker);
    wrap.appendChild(input);
  }
  wrap.classList.toggle(THEME_COLOR_PICK_UNSET, isUnset);
}

const WINDOW_OPTION_KEYS = [
  "fullscreenWin",
  "getCellSizePixels",
  "getIconTitle",
  "getScreenSizeChars",
  "getScreenSizePixels",
  "getWinPosition",
  "getWinSizeChars",
  "getWinSizePixels",
  "getWinState",
  "getWinTitle",
  "lowerWin",
  "maximizeWin",
  "minimizeWin",
  "popTitle",
  "pushTitle",
  "raiseWin",
  "refreshWin",
  "restoreWin",
  "setWinLines",
  "setWinPosition",
  "setWinSizeChars",
  "setWinSizePixels",
] as const;

const THEME_COLOR_DESCRIPTIONS: Record<(typeof THEME_COLOR_KEYS)[number], string> = {
  background: "Default terminal background color.",
  foreground: "Default text (foreground) color.",
  cursor: "Cursor color.",
  cursorAccent: "Foreground color drawn inside a block cursor.",
  selectionBackground: "Background color of the text selection.",
  selectionForeground: "Foreground color of the text selection.",
  selectionInactiveBackground: "Selection background when the terminal is not focused.",
  black: "ANSI color 30 (black).",
  red: "ANSI color 31 (red).",
  green: "ANSI color 32 (green).",
  yellow: "ANSI color 33 (yellow).",
  blue: "ANSI color 34 (blue).",
  magenta: "ANSI color 35 (magenta).",
  cyan: "ANSI color 36 (cyan).",
  white: "ANSI color 37 (white).",
  brightBlack: "Bright ANSI color 90 (bright black).",
  brightRed: "Bright ANSI color 91 (bright red).",
  brightGreen: "Bright ANSI color 92 (bright green).",
  brightYellow: "Bright ANSI color 93 (bright yellow).",
  brightBlue: "Bright ANSI color 94 (bright blue).",
  brightMagenta: "Bright ANSI color 95 (bright magenta).",
  brightCyan: "Bright ANSI color 96 (bright cyan).",
  brightWhite: "Bright ANSI color 97 (bright white).",
};

const WINDOW_OPTION_DESCRIPTIONS: Record<(typeof WINDOW_OPTION_KEYS)[number], string> = {
  fullscreenWin: "Allow CSI sequences that toggle full-screen (Ps=10).",
  getCellSizePixels:
    "Allow reporting character cell size in pixels (Ps=16). Has a default implementation in xterm.js.",
  getIconTitle: "Allow reporting the window icon title (Ps=20).",
  getScreenSizeChars: "Allow reporting the screen size in characters (Ps=19).",
  getScreenSizePixels: "Allow reporting text area or window size in pixels (Ps=14).",
  getWinPosition: "Allow reporting window or text-area position (Ps=13).",
  getWinSizeChars: "Allow reporting text area size in characters (Ps=18).",
  getWinSizePixels: "Allow reporting text area or window size in pixels (Ps=14).",
  getWinState: "Allow reporting window iconified/normal state (Ps=11).",
  getWinTitle: "Allow reporting the window title (Ps=21).",
  lowerWin: "Allow lowering the window in the stacking order (Ps=6).",
  maximizeWin: "Allow maximize / restore window sequences (Ps=9).",
  minimizeWin: "Allow iconifying the window (Ps=2).",
  popTitle: "Allow restoring icon/window title from the stack (Ps=23).",
  pushTitle: "Allow saving icon/window title to the stack (Ps=22).",
  raiseWin: "Allow raising the window to the front (Ps=5).",
  refreshWin: "Allow refreshing the window (Ps=7).",
  restoreWin: "Allow de-iconifying the window (Ps=1).",
  setWinLines: "Allow DECSLPP / line-count resize and related behavior (Ps≥24).",
  setWinPosition: "Allow moving the window to a pixel position (Ps=3).",
  setWinSizeChars: "Allow resizing the text area in character cells (Ps=8).",
  setWinSizePixels: "Allow resizing the window in pixels (Ps=4).",
};

function humanizeCamel(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

/**
 * Renders form controls for every terminal option understood by
 * {@link Settings.Profile.fixTerminalOptions} (except function-valued fields).
 */
export function drawTerminalOptionsForm(
  ui: UpdatableUI,
  element: HTMLElement,
  data: TerminalOpts,
  postMutate: () => Promise<void>,
): void {
  const pm = postMutate;

  addDocLink(ui, element);

  subsectionTitle(
    ui,
    element,
    "Font",
    "Typography for rendered terminal text. Values matching xterm defaults are omitted from saved settings.",
  );
  addStringOpt(
    ui,
    element,
    "Font family",
    "CSS font-family list for terminal text (e.g. monospace stack).",
    () => data.fontFamily,
    (v) => {
      data.fontFamily = v;
    },
    FONT_FAMILY_DEFAULT,
    pm,
    FONT_FAMILY_DEFAULT,
  );
  addSliderOpt(
    ui,
    element,
    "Font size",
    "Height of the terminal font in pixels.",
    data,
    "fontSize",
    { min: 8, max: 36, step: 1 },
    pm,
  );
  ui.newSetting(element, (setting) => {
    setting
      .setName("Font weight")
      .setDesc("Weight for regular text (CSS font-weight names or 100–900).")
      .addDropdown(
      linkSetting(
        () =>
          data.fontWeight === void 0 ? "" : String(data.fontWeight),
        (value) => {
          if (value === "" || value === FONT_WEIGHT_DEFAULT) {
            Reflect.deleteProperty(data, "fontWeight");
          } else {
            const n = Number(value);
            data.fontWeight = Number.isFinite(n) && value === String(n) ? n : value;
          }
        },
        async () => {
          await pm();
        },
        {
          pre(dd) {
            dd.addOption("", `Default (${FONT_WEIGHT_DEFAULT})`);
            for (const w of Settings.Profile.TerminalOptions.FONT_WEIGHTS) {
              dd.addOption(w, w);
            }
          },
        },
      ),
    );
  });
  ui.newSetting(element, (setting) => {
    setting
      .setName("Bold font weight")
      .setDesc("Weight used for bold (bright) styled text.")
      .addDropdown(
      linkSetting(
        () =>
          data.fontWeightBold === void 0 ? "" : String(data.fontWeightBold),
        (value) => {
          if (value === "" || value === FONT_WEIGHT_BOLD_DEFAULT) {
            Reflect.deleteProperty(data, "fontWeightBold");
          } else {
            const n = Number(value);
            data.fontWeightBold = Number.isFinite(n) && value === String(n) ? n : value;
          }
        },
        async () => {
          await pm();
        },
        {
          pre(dd) {
            dd.addOption("", `Default (${FONT_WEIGHT_BOLD_DEFAULT})`);
            for (const w of Settings.Profile.TerminalOptions.FONT_WEIGHTS) {
              dd.addOption(w, w);
            }
          },
        },
      ),
    );
  });
  addSliderOpt(
    ui,
    element,
    "Letter spacing",
    "Extra horizontal spacing between glyphs in pixels.",
    data,
    "letterSpacing",
    { min: -2, max: 10, step: 0.5 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Line height",
    "Multiplier of the single-line height (1.0 is typical single spacing).",
    data,
    "lineHeight",
    { min: 0.5, max: 3, step: 0.05 },
    pm,
  );

  subsectionTitle(
    ui,
    element,
    "Cursor",
    "Shape and behavior of the insertion cursor.",
  );
  addBoolOpt(
    ui,
    element,
    "Cursor blink",
    "Whether the cursor blinks.",
    data,
    "cursorBlink",
    pm,
  );
  addEnumOpt(
    ui,
    element,
    "Cursor style",
    "Shape of the cursor when the terminal is focused.",
    data,
    "cursorStyle",
    ["bar", "block", "underline"],
    XTERM_ENUM_DEFAULTS.cursorStyle,
    (v) => v,
    pm,
  );
  addEnumOpt(
    ui,
    element,
    "Inactive cursor style",
    "Shape of the cursor when the terminal loses focus.",
    data,
    "cursorInactiveStyle",
    ["bar", "block", "none", "outline", "underline"],
    XTERM_ENUM_DEFAULTS.cursorInactiveStyle,
    (v) => v,
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Cursor width",
    "Width of the bar cursor in pixels (bar style only).",
    data,
    "cursorWidth",
    { min: 1, max: 10, step: 1 },
    pm,
  );

  subsectionTitle(
    ui,
    element,
    "Scrolling & buffer",
    "How scrollback, wheel scrolling, and smooth scrolling behave.",
  );
  addSliderOpt(
    ui,
    element,
    "Scrollback lines",
    "Maximum number of lines retained above the viewport.",
    data,
    "scrollback",
    { min: 0, max: 500_000, step: 500 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Scroll sensitivity",
    "Multiplier for normal (mouse wheel) scrolling speed.",
    data,
    "scrollSensitivity",
    { min: 0.1, max: 10, step: 0.1 },
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Scroll on user input",
    "Scroll to the bottom when the user types or pastes.",
    data,
    "scrollOnUserInput",
    pm,
  );
  addEnumOpt(
    ui,
    element,
    "Fast scroll modifier",
    "Modifier key that must be held for fast scroll mode.",
    data,
    "fastScrollModifier",
    ["alt", "ctrl", "none", "shift"],
    XTERM_ENUM_DEFAULTS.fastScrollModifier,
    (v) => v,
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Fast scroll sensitivity",
    "Multiplier for scrolling while the fast-scroll modifier is held.",
    data,
    "fastScrollSensitivity",
    { min: 1, max: 30, step: 1 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Smooth scroll duration (ms)",
    "Duration of animated scroll; 0 scrolls instantly.",
    data,
    "smoothScrollDuration",
    { min: 0, max: 2000, step: 50 },
    pm,
  );

  subsectionTitle(
    ui,
    element,
    "Input & behavior",
    "Keyboard, mouse, selection, and platform-specific quirks.",
  );
  addBoolOpt(
    ui,
    element,
    "Convert EOL",
    "Convert LF to CRLF on input (useful for Windows shells).",
    data,
    "convertEol",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Disable stdin",
    "When on, the terminal does not accept input (read-only view).",
    data,
    "disableStdin",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Windows mode",
    "Enable heuristics when the PTY runs on Windows (e.g. ConPTY quirks).",
    data,
    "windowsMode",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Custom glyphs",
    "Use custom box-drawing and powerline glyphs when the font supports them.",
    data,
    "customGlyphs",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Draw bold in bright colors",
    "Render bold text using the bright ANSI palette.",
    data,
    "drawBoldTextInBrightColors",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Ignore bracketed paste mode",
    "Ignore the application’s bracketed paste mode (paste as raw text).",
    data,
    "ignoreBracketedPasteMode",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Allow transparency",
    "Allow the terminal background to be transparent (theme must support it).",
    data,
    "allowTransparency",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Allow proposed API",
    "Enable experimental xterm.js APIs marked proposed.",
    data,
    "allowProposedApi",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Alt-click moves cursor",
    "When on, Alt+click moves the cursor in the buffer.",
    data,
    "altClickMovesCursor",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Mac Option is Meta",
    "Treat the Option (⌥) key as Meta on macOS.",
    data,
    "macOptionIsMeta",
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Mac Option-click forces selection",
    "On macOS, Option+click forces a column selection.",
    data,
    "macOptionClickForcesSelection",
    pm,
  );
  addBoolOptCustomDefault(
    ui,
    element,
    "Right-click selects word",
    "On a right click, select the word under the cursor (on by default on macOS).",
    () => data.rightClickSelectsWord,
    (v) => {
      data.rightClickSelectsWord = v;
    },
    xtermDefaultRightClickSelectsWord(),
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Rescale overlapping glyphs",
    "Adjust font scaling when glyphs overlap.",
    data,
    "rescaleOverlappingGlyphs",
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Tab stop width",
    "Columns between tab stops.",
    data,
    "tabStopWidth",
    { min: 1, max: 32, step: 1 },
    pm,
  );
  addStringOpt(
    ui,
    element,
    "Word separator",
    "Characters that separate words for double-click and word-wise selection.",
    () => data.wordSeparator,
    (v) => {
      data.wordSeparator = v;
    },
    WORD_SEPARATOR_DEFAULT,
    pm,
    WORD_SEPARATOR_DEFAULT,
  );

  subsectionTitle(
    ui,
    element,
    "Display & accessibility",
    "Contrast, decorations, and assistive features.",
  );
  addSliderOpt(
    ui,
    element,
    "Minimum contrast ratio",
    "Boost text/background contrast up to this ratio (1 disables boosting).",
    data,
    "minimumContrastRatio",
    { min: 1, max: 21, step: 0.5 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Overview ruler width",
    "Width in pixels of the overview ruler beside the scrollbar; 0 hides it.",
    data,
    "overviewRulerWidth",
    { min: 0, max: 32, step: 1 },
    pm,
  );
  addBoolOpt(
    ui,
    element,
    "Screen reader mode",
    "Expose buffer content to assistive technologies (may affect performance).",
    data,
    "screenReaderMode",
    pm,
  );

  subsectionTitle(
    ui,
    element,
    "Debugging",
    "Verbosity of internal xterm.js logging to the developer console.",
  );
  addEnumOpt(
    ui,
    element,
    "Log level",
    "Which messages xterm.js logs (debug, info, warn, error, or off).",
    data,
    "logLevel",
    ["debug", "error", "info", "off", "warn"],
    XTERM_ENUM_DEFAULTS.logLevel,
    (v) => v,
    pm,
  );

  subsectionTitle(
    ui,
    element,
    "Windows PTY",
    "Hints for ConPTY/winpty behavior; used by xterm.js on Windows.",
  );
  ui.newSetting(element, (setting) => {
    setting
      .setName("Backend")
      .setDesc("Which Windows pseudo-console backend to assume; automatic uses xterm.js defaults.")
      .addDropdown(
      linkSetting(
        () => data.windowsPty?.backend ?? "",
        (value) => {
          if (!data.windowsPty) {
            data.windowsPty = {};
          }
          if (value === "" || !(value === "conpty" || value === "winpty")) {
            if (data.windowsPty) {
              Reflect.deleteProperty(data.windowsPty, "backend");
              if (Object.keys(data.windowsPty).length === 0) {
                Reflect.deleteProperty(data, "windowsPty");
              }
            }
          } else {
            data.windowsPty.backend = value;
          }
        },
        async () => {
          await pm();
        },
        {
          pre(dd) {
            dd.addOption("", "Default (automatic)").addOption("conpty", "ConPTY").addOption("winpty", "winpty");
          },
        },
      ),
    );
  });
  addSliderCustom(
    ui,
    element,
    "Windows build number",
    "OS build (e.g. 19045). Used for ConPTY/reflow heuristics; 0 means unspecified.",
    () => data.windowsPty?.buildNumber,
    (v) => {
      if (!data.windowsPty) {
        data.windowsPty = {};
      }
      if (v === void 0) {
        Reflect.deleteProperty(data.windowsPty, "buildNumber");
        if (Object.keys(data.windowsPty).length === 0) {
          Reflect.deleteProperty(data, "windowsPty");
        }
      } else {
        data.windowsPty.buildNumber = v;
      }
    },
    0,
    { min: 0, max: 30_000, step: 1 },
    pm,
  );

  subsectionTitle(
    ui,
    element,
    "Theme colors",
    "Override ANSI and UI colors. The picker stores hex. With no override, the swatch shows a checker pattern; Reset clears a stored color. Extended ANSI still accepts comma‑separated CSS colors.",
  );
  addStringOpt(
    ui,
    element,
    "Extended ANSI (comma-separated)",
    "Extra colors for indices 16–255 (comma-separated CSS colors).",
    () =>
      data.theme?.extendedAnsi?.length
        ? data.theme.extendedAnsi.join(", ")
        : void 0,
    (v) => {
      if (!data.theme) {
        data.theme = {};
      }
      if (v === void 0 || v === "") {
        Reflect.deleteProperty(data.theme, "extendedAnsi");
        if (Object.keys(data.theme).length === 0) {
          Reflect.deleteProperty(data, "theme");
        }
        return;
      }
      data.theme.extendedAnsi = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (data.theme.extendedAnsi.length === 0) {
        Reflect.deleteProperty(data.theme, "extendedAnsi");
      }
      if (Object.keys(data.theme).length === 0) {
        Reflect.deleteProperty(data, "theme");
      }
    },
    "",
    pm,
  );
  for (const key of THEME_COLOR_KEYS) {
    const title = humanizeCamel(key);
    ui.newSetting(element, (setting) => {
      setting
        .setName(title)
        .setDesc(THEME_COLOR_DESCRIPTIONS[key])
        .addColorPicker(
          linkSetting(
            () =>
              cssColorToHex6(data.theme?.[key], element.ownerDocument, element),
            (value) => {
              if (!data.theme) {
                data.theme = {};
              }
              data.theme[key] = value;
            },
            async () => {
              await pm();
            },
            {
              post() {
                attachThemeColorPickerChecker(
                  setting,
                  themeColorOverrideUnset(data, key),
                );
              },
            },
          ),
        )
        .addExtraButton((button) =>
          button
            .setIcon("rotate-ccw")
            .setTooltip("Clear override (use default)")
            .onClick(async () => {
              if (data.theme) {
                Reflect.deleteProperty(data.theme, key);
                if (Object.keys(data.theme).length === 0) {
                  Reflect.deleteProperty(data, "theme");
                }
              }
              await pm();
            }),
        );
    });
  }

  subsectionTitle(
    ui,
    element,
    "Window options (CSI)",
    "Allow window manipulation and reporting sequences from the shell. Disabled by default for security; enable only if you trust the program in the terminal.",
  );
  const winOptDefault = false;
  for (const key of WINDOW_OPTION_KEYS) {
    addBoolOptCustomDefault(
      ui,
      element,
      humanizeCamel(key),
      WINDOW_OPTION_DESCRIPTIONS[key],
      () => data.windowOptions?.[key],
      (v) => {
        if (!data.windowOptions) {
          data.windowOptions = {};
        }
        if (v === void 0) {
          Reflect.deleteProperty(data.windowOptions, key);
          if (Object.keys(data.windowOptions).length === 0) {
            Reflect.deleteProperty(data, "windowOptions");
          }
        } else {
          data.windowOptions[key] = v;
        }
      },
      winOptDefault,
      pm,
    );
  }
}
