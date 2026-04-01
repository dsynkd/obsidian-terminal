import { UpdatableUI, linkSetting, Platform } from "@polyipseity/obsidian-plugin-library";
import type { DeepWritable } from "ts-essentials";
import { Settings } from "./settings-data.js";

type TerminalOpts = DeepWritable<Settings.Profile.TerminalOptions>;

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

function subsectionTitle(ui: UpdatableUI, element: HTMLElement, text: string): void {
  ui.new(
    () => {
      const d = element.ownerDocument;
      return d.createElement("div");
    },
    (ele) => {
      ele.classList.add("setting-item", "setting-item-heading");
      ele.createDiv({ cls: "setting-item-name", text });
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
  data: TerminalOpts,
  key: K,
  postMutate: () => Promise<void>,
): void {
  const d = XTERM_BOOL[key];
  ui.newSetting(element, (setting) => {
    setting.setName(name).addToggle(
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
  get: () => boolean | undefined,
  set: (v: boolean | undefined) => void,
  defaultValue: boolean,
  postMutate: () => Promise<void>,
): void {
  ui.newSetting(element, (setting) => {
    setting.setName(name).addToggle(
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
  data: TerminalOpts,
  key: K,
  limits: SliderOpts,
  postMutate: () => Promise<void>,
): void {
  const d = XTERM_NUMBER_DEFAULTS[key];
  ui.newSetting(element, (setting) => {
    setting.setName(name).addSlider(
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
  get: () => number | undefined,
  set: (v: number | undefined) => void,
  defaultValue: number,
  limits: SliderOpts,
  postMutate: () => Promise<void>,
): void {
  ui.newSetting(element, (setting) => {
    setting.setName(name).addSlider(
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
  data: TerminalOpts,
  key: K,
  enumValues: readonly T[],
  defaultValue: T,
  labelFor: (v: T) => string,
  postMutate: () => Promise<void>,
): void {
  ui.newSetting(element, (setting) => {
    setting.setName(name).addDropdown(
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

  subsectionTitle(ui, element, "Font");
  addStringOpt(
    ui,
    element,
    "Font family",
    "CSS font family list.",
    () => data.fontFamily,
    (v) => {
      data.fontFamily = v;
    },
    FONT_FAMILY_DEFAULT,
    pm,
    FONT_FAMILY_DEFAULT,
  );
  addSliderOpt(ui, element, "Font size", data, "fontSize", { min: 8, max: 36, step: 1 }, pm);
  ui.newSetting(element, (setting) => {
    setting.setName("Font weight").addDropdown(
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
    setting.setName("Bold font weight").addDropdown(
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
    data,
    "letterSpacing",
    { min: -2, max: 10, step: 0.5 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Line height",
    data,
    "lineHeight",
    { min: 0.5, max: 3, step: 0.05 },
    pm,
  );

  subsectionTitle(ui, element, "Cursor");
  addBoolOpt(ui, element, "Cursor blink", data, "cursorBlink", pm);
  addEnumOpt(
    ui,
    element,
    "Cursor style",
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
    data,
    "cursorInactiveStyle",
    ["bar", "block", "none", "outline", "underline"],
    XTERM_ENUM_DEFAULTS.cursorInactiveStyle,
    (v) => v,
    pm,
  );
  addSliderOpt(ui, element, "Cursor width", data, "cursorWidth", { min: 1, max: 10, step: 1 }, pm);

  subsectionTitle(ui, element, "Scrolling & buffer");
  addSliderOpt(
    ui,
    element,
    "Scrollback lines",
    data,
    "scrollback",
    { min: 0, max: 500_000, step: 500 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Scroll sensitivity",
    data,
    "scrollSensitivity",
    { min: 0.1, max: 10, step: 0.1 },
    pm,
  );
  addBoolOpt(ui, element, "Scroll on user input", data, "scrollOnUserInput", pm);
  addEnumOpt(
    ui,
    element,
    "Fast scroll modifier",
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
    data,
    "fastScrollSensitivity",
    { min: 1, max: 30, step: 1 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Smooth scroll duration (ms)",
    data,
    "smoothScrollDuration",
    { min: 0, max: 2000, step: 50 },
    pm,
  );

  subsectionTitle(ui, element, "Input & behavior");
  addBoolOpt(ui, element, "Convert EOL", data, "convertEol", pm);
  addBoolOpt(ui, element, "Disable stdin", data, "disableStdin", pm);
  addBoolOpt(ui, element, "Windows mode", data, "windowsMode", pm);
  addBoolOpt(ui, element, "Custom glyphs", data, "customGlyphs", pm);
  addBoolOpt(ui, element, "Draw bold in bright colors", data, "drawBoldTextInBrightColors", pm);
  addBoolOpt(ui, element, "Ignore bracketed paste mode", data, "ignoreBracketedPasteMode", pm);
  addBoolOpt(ui, element, "Allow transparency", data, "allowTransparency", pm);
  addBoolOpt(ui, element, "Allow proposed API", data, "allowProposedApi", pm);
  addBoolOpt(ui, element, "Alt-click moves cursor", data, "altClickMovesCursor", pm);
  addBoolOpt(ui, element, "Mac Option is Meta", data, "macOptionIsMeta", pm);
  addBoolOpt(ui, element, "Mac Option-click forces selection", data, "macOptionClickForcesSelection", pm);
  addBoolOptCustomDefault(
    ui,
    element,
    "Right-click selects word",
    () => data.rightClickSelectsWord,
    (v) => {
      data.rightClickSelectsWord = v;
    },
    xtermDefaultRightClickSelectsWord(),
    pm,
  );
  addBoolOpt(ui, element, "Rescale overlapping glyphs", data, "rescaleOverlappingGlyphs", pm);
  addSliderOpt(ui, element, "Tab stop width", data, "tabStopWidth", { min: 1, max: 32, step: 1 }, pm);
  addStringOpt(
    ui,
    element,
    "Word separator",
    "Characters that separate words for double-click selection.",
    () => data.wordSeparator,
    (v) => {
      data.wordSeparator = v;
    },
    WORD_SEPARATOR_DEFAULT,
    pm,
    WORD_SEPARATOR_DEFAULT,
  );

  subsectionTitle(ui, element, "Display & accessibility");
  addSliderOpt(
    ui,
    element,
    "Minimum contrast ratio",
    data,
    "minimumContrastRatio",
    { min: 1, max: 21, step: 0.5 },
    pm,
  );
  addSliderOpt(
    ui,
    element,
    "Overview ruler width",
    data,
    "overviewRulerWidth",
    { min: 0, max: 32, step: 1 },
    pm,
  );
  addBoolOpt(ui, element, "Screen reader mode", data, "screenReaderMode", pm);

  subsectionTitle(ui, element, "Debugging");
  addEnumOpt(
    ui,
    element,
    "Log level",
    data,
    "logLevel",
    ["debug", "error", "info", "off", "warn"],
    XTERM_ENUM_DEFAULTS.logLevel,
    (v) => v,
    pm,
  );

  subsectionTitle(ui, element, "Windows PTY");
  ui.newSetting(element, (setting) => {
    setting.setName("Backend").addDropdown(
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

  subsectionTitle(ui, element, "Theme colors");
  addStringOpt(
    ui,
    element,
    "Extended ANSI (comma-separated)",
    "Optional palette extension; separate colors with commas.",
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
      setting.setName(title).addText(
        linkSetting(
          () => data.theme?.[key] ?? "",
          (value) => {
            if (!data.theme) {
              data.theme = {};
            }
            if (value) {
              data.theme[key] = value;
            } else {
              Reflect.deleteProperty(data.theme, key);
            }
            if (Object.keys(data.theme).length === 0) {
              Reflect.deleteProperty(data, "theme");
            }
          },
          async () => {
            await pm();
          },
          {
            post(comp) {
              comp.setPlaceholder("CSS / hex (optional)");
            },
          },
        ),
      );
    });
  }

  subsectionTitle(ui, element, "Window options (CSI)");
  const winOptDefault = false;
  for (const key of WINDOW_OPTION_KEYS) {
    addBoolOptCustomDefault(
      ui,
      element,
      humanizeCamel(key),
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
