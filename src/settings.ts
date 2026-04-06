import {
  AdvancedSettingTab,
  Platform,
  bracket,
  clearProperties,
  cloneAsWritable,
  createChildElement,
  createDocumentFragment,
  linkSetting,
  randomNotIn,
  removeAt,
  setTextToEnum,
  swap,
  UpdatableUI,
} from "@polyipseity/obsidian-plugin-library";
import { Modal, Setting, type App, type Hotkey } from "obsidian";
import { ProfileModal } from "./modals.js";
import { Settings } from "./settings-data.js";
import { RENDERER_NAMES, formatProfileShort, listDescription } from "./i18n-strings.js";
import type { TerminalPlugin } from "./main.js";
import {
  formatHotkeyLabel,
  hotkeySignature,
  keyboardEventToHotkey,
} from "./terminal/obsidian-pass-through.js";
import { size } from "lodash-es";
import { PROFILE_PRESETS } from "./terminal/profile-presets.js";
import { drawTerminalOptionsForm } from "./terminal-options-ui.js";

const SETTING_TAB_IDS = [
  "general",
  "profiles",
  "terminal",
  "advanced",
] as const;
type SettingTabId = (typeof SETTING_TAB_IDS)[number];

const SETTING_TAB_LABELS: Record<SettingTabId, string> = {
  profiles: "Profiles",
  terminal: "Terminal",
  general: "General",
  advanced: "Advanced",
};

export class SettingTab extends AdvancedSettingTab<Settings> {
  #activeSettingTab: SettingTabId = "profiles";

  public constructor(protected override readonly context: TerminalPlugin) {
    super(context);
  }

  protected override onLoad(): void {
    super.onLoad();
    const {
      containerEl,
      context,
      context: { settings },
      ui,
    } = this;

    const tabsRoot = createChildElement(containerEl, "div", (el) => {
      el.classList.add("terminal-setting-tabs-root");
    });
    const tabHeader = createChildElement(tabsRoot, "nav", (el) => {
      el.classList.add("linter-setting-header");
      el.setAttribute("aria-label", "Settings sections");
      el.setAttribute("role", "tablist");
    });
    const tabGroup = createChildElement(tabHeader, "div", (el) => {
      el.classList.add("linter-setting-tab-group");
    });
    const tabPanels = createChildElement(tabsRoot, "div", (el) => {
      el.classList.add("terminal-setting-tab-panels");
    });
    const panels: Record<SettingTabId, HTMLDivElement> = {
      general: createChildElement(tabPanels, "div", (el) => {
        el.classList.add("terminal-setting-tab-panel");
        el.dataset.tab = "general";
      }),
      profiles: createChildElement(tabPanels, "div", (el) => {
        el.classList.add("terminal-setting-tab-panel");
        el.dataset.tab = "profiles";
      }),
      terminal: createChildElement(tabPanels, "div", (el) => {
        el.classList.add("terminal-setting-tab-panel");
        el.dataset.tab = "terminalOptions";
      }),
      advanced: createChildElement(tabPanels, "div", (el) => {
        el.classList.add("terminal-setting-tab-panel");
        el.dataset.tab = "advanced";
      }),
    };

    const doc = containerEl.ownerDocument;
    const tabButtons: Record<SettingTabId, HTMLButtonElement> = {
      profiles: doc.createElement("button"),
      terminal: doc.createElement("button"),
      general: doc.createElement("button"),
      advanced: doc.createElement("button"),
    };

    const setActiveSettingTab = (id: SettingTabId): void => {
      this.#activeSettingTab = id;
      for (const tabId of SETTING_TAB_IDS) {
        const active = tabId === id;
        panels[tabId].classList.toggle(
          "terminal-setting-tab-panel--hidden",
          !active,
        );
        const btn = tabButtons[tabId];
        btn.classList.toggle("linter-tab-settings-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      }
    };

    for (const tabId of SETTING_TAB_IDS) {
      const btn = tabButtons[tabId];
      btn.type = "button";
      btn.textContent = SETTING_TAB_LABELS[tabId];
      btn.classList.add("linter-tab-settings");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-controls", `terminal-setting-tab-${tabId}`);
      btn.addEventListener("click", () => {
        setActiveSettingTab(tabId);
      });
      tabGroup.appendChild(btn);
      panels[tabId].id = `terminal-setting-tab-${tabId}`;
      panels[tabId].setAttribute("role", "tabpanel");
      panels[tabId].setAttribute("aria-labelledby", `terminal-setting-tab-btn-${tabId}`);
      btn.id = `terminal-setting-tab-btn-${tabId}`;
    }
    setActiveSettingTab(this.#activeSettingTab);

    const passThroughRowRoots: HTMLElement[] = [];
    let passThroughInsertAfter: HTMLElement | null = null;
    const refreshPassThroughList = (): void => {
      for (const el of passThroughRowRoots) {
        el.remove();
      }
      passThroughRowRoots.length = 0;

      const hotkeys = settings.value.obsidianPassThroughHotkeys;
      const parentEl =
        passThroughInsertAfter?.parentElement ?? panels.advanced;
      const gridEl = createChildElement(parentEl, "div", (el) => {
        el.classList.add("terminal-pass-through-hotkey-grid");
      });
      if (passThroughInsertAfter) {
        passThroughInsertAfter.insertAdjacentElement("afterend", gridEl);
      }
      passThroughRowRoots.push(gridEl);

      if (hotkeys.length === 0) {
        new Setting(gridEl).setDesc(
          "No pass-through chords. Use Add hotkey above; new installs start with ⌘P, ⌘O, ⌘N, ⌘G, ⌘,.",
        );
      }
      hotkeys.forEach((hk, index) => {
        new Setting(gridEl)
          .setName(formatHotkeyLabel(hk as Hotkey))
          .addExtraButton((button) =>
            button
              .setIcon("trash")
              .setTooltip("Remove")
              .onClick(async () => {
                await settings.mutate((settingsM) => {
                  settingsM.obsidianPassThroughHotkeys =
                    settingsM.obsidianPassThroughHotkeys.filter(
                      (_h, i) => i !== index,
                    );
                });
                this.postMutate();
              }),
          );
      });
    };

    let appendNewProfile: () => Promise<void> = async () => {};

    ui.newSetting(panels.profiles, (setting) => {
      setting
        .setName("Default profile")
        .setDesc("Profile to open when clicking the ribbon icon. Leave empty to show profile selector.")
        .addDropdown(
          linkSetting(
            (): string => settings.value.defaultProfile ?? "",
            async (value) =>
              settings.mutate((settingsM) => {
                // Unfortunately we have to use the empty string as a sentinel value for "no default profile" because the dropdown component doesn't allow null/undefined values. So we have to coerce it back to null here.
                settingsM.defaultProfile =
                  value === "" ? null : (value as Settings.DefaultProfile);
              }),
            () => {
              this.postMutate();
            },
            {
              pre: (dropdown) => {
                dropdown
                  .addOption("", "(Unselected)")
                  .addOptions(
                    Object.fromEntries(
                      Object.entries(settings.value.profiles).map(
                        ([id, profile]) => [
                          id,
                          Settings.Profile.isCompatible(
                            profile,
                            Platform.CURRENT,
                          )
                            ? formatProfileShort(Settings.Profile.info([id, profile]))
                            : "(Incompatible) " + formatProfileShort(Settings.Profile.info([id, profile])),
                        ],
                      ),
                    ),
                  );
              },
            },
          ),
        );
    });
    ui.newSetting(panels.profiles, (setting) => {
      setting
        .setName("Profiles")
        .setHeading()
        .addButton((button) =>
          button
            .setIcon("plus")
            .setTooltip("Add profile")
            .setCta()
            .onClick(() => {
              void appendNewProfile();
            }),
        );
    });
    appendNewProfile = this.#setupProfileListSection(
      ui,
      panels.profiles,
      Object.entries(settings.value.profiles),
    ).appendNewProfile;

    const terminalOpts = cloneAsWritable(settings.value.terminalOptions);
    const persistTerminalOptions = async (): Promise<void> => {
      const fixed = Settings.Profile.fixTerminalOptions(terminalOpts).value;
      await settings.mutate((settingsM) => {
        settingsM.terminalOptions = fixed;
      });
      clearProperties(terminalOpts);
      Object.assign(terminalOpts, cloneAsWritable(fixed));
      this.postMutate();
    };
    drawTerminalOptionsForm(ui, panels.terminal, terminalOpts, persistTerminalOptions);

    ui.newSetting(panels.general, (setting) => {
      setting
        .setName("New instance behavior")
        .addDropdown(
          linkSetting(
            (): string => settings.value.newInstanceBehavior,
            setTextToEnum(Settings.NEW_INSTANCE_BEHAVIORS, async (value) =>
              settings.mutate((settingsM) => {
                settingsM.newInstanceBehavior = value;
              }),
            ),
            () => {
              this.postMutate();
            },
            {
              pre: (dropdown) => {
                dropdown.addOptions(
                  Object.fromEntries(
                    Settings.NEW_INSTANCE_BEHAVIORS.map((value) => [
                      value,
                      Settings.NEW_INSTANCE_BEHAVIOR_LABELS[value],
                    ]),
                  ),
                );
              },
            },
          ),
        );
    })
      .newSetting(panels.general, (setting) => {
        setting
          .setName("Create instance near existing ones")
          .setDesc(
            "Overrides 'New instance behavior' when instance exists if true.",
          )
          .addToggle(
            linkSetting(
              () => settings.value.createInstanceNearExistingOnes,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.createInstanceNearExistingOnes = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      })
      .newSetting(panels.general, (setting) => {
        setting
          .setName("Focus on new instance")
          .addToggle(
            linkSetting(
              () => settings.value.focusOnNewInstance,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.focusOnNewInstance = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      })
      .newSetting(panels.general, (setting) => {
        setting
          .setName("Pin new instance")
          .addToggle(
            linkSetting(
              () => settings.value.pinNewInstance,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.pinNewInstance = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      })
      .newSetting(panels.general, (setting) => {
        setting
          .setName("Open in root folder")
          .setDesc(
            "Open in vault root as the working directory instead of the current file's folder.",
          )
          .addToggle(
            linkSetting(
              () => settings.value.openInRootFolder,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.openInRootFolder = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      });

    const HIDE_STATUS_BAR_OPTION_NAMES: Record<string, string> = {
      always: "Always",
      focused: "When terminal is focused",
      never: "Never",
      running: "When terminal is running",
    };
    ui.newSetting(panels.general, (setting) => {
      setting
        .setName("Hide status bar")
        .addDropdown(
          linkSetting(
            (): string => settings.value.hideStatusBar,
            setTextToEnum(Settings.HIDE_STATUS_BAR_OPTIONS, async (value) =>
              settings.mutate((settingsM) => {
                settingsM.hideStatusBar = value;
              }),
            ),
            () => {
              this.postMutate();
            },
            {
              pre: (dropdown) => {
                dropdown.addOptions(
                  Object.fromEntries(
                    Settings.HIDE_STATUS_BAR_OPTIONS.map((value) => [
                      value,
                      HIDE_STATUS_BAR_OPTION_NAMES[value] ?? value,
                    ]),
                  ),
                );
              },
            },
          ),
        );
    })
      .newSetting(panels.general, (setting) => {
        setting
          .setName("Add context menu")
          .setDesc(
            "Add 'Open in terminal' to the file explorer and editor context menus.",
          )
          .addToggle(
            linkSetting(
              () => settings.value.addContextMenu,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.addContextMenu = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      });
     ui.newSetting(panels.advanced, (setting) => {
        setting
          .setName("Preferred renderer")
          .addDropdown(
            linkSetting(
              (): string => settings.value.preferredRenderer,
              setTextToEnum(
                Settings.PREFERRED_RENDERER_OPTIONS,
                async (value) =>
                  settings.mutate((settingsM) => {
                    settingsM.preferredRenderer = value;
                  }),
              ),
              () => {
                this.postMutate();
              },
              {
                pre: (dropdown) => {
                  dropdown.addOptions(
                    Object.fromEntries(
                      Settings.PREFERRED_RENDERER_OPTIONS.map((type) => [
                        type,
                        RENDERER_NAMES[type] ?? type,
                      ]),
                    ),
                  );
                },
              },
            ),
          );
      })
    .newSetting(panels.advanced, (setting) => {
      const { settingEl } = setting;
      setting
        .setName("Expose internal modules")
        .setDesc(
          createDocumentFragment(settingEl.ownerDocument, (frag) => {
            createChildElement(frag, "span", (ele) => {
              ele.innerHTML = '<code>obsidian</code>, <code>@codemirror/*</code>, <code>@lezer/*</code>\u2026';
            });
          }),
        )
        .addToggle(
          linkSetting(
            () => settings.value.exposeInternalModules,
            async (value) =>
              settings.mutate((settingsM) => {
                settingsM.exposeInternalModules = value;
              }),
            () => {
              this.postMutate();
            },
          ),
        );
    })
      .newSetting(panels.advanced, (setting) => {
        setting
          .setName("Option key passthrough (macOS)")
          .setDesc("Allow Option+key combinations to reach the terminal for typing special characters (e.g., @ on Scandinavian/German keyboards).")
          .addToggle(
            linkSetting(
              () => settings.value.macOSOptionKeyPassthrough,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.macOSOptionKeyPassthrough = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      })
      .newSetting(panels.advanced, (setting) => {
        setting
          .setName("Hotkey passthrough")
          .setDesc(
            "Allow key combinations to pass through to Obsidian as hotkeys.",
          )
          .addButton((button) =>
            button
              .setIcon("plus")
              .setCta()
              .onClick(() => {
                const modal = new PassThroughHotkeyCaptureModal(
                  context.app,
                  (captured) => {
                    const sig = hotkeySignature(captured);
                    void settings
                      .mutate((settingsM) => {
                        const existing = settingsM.obsidianPassThroughHotkeys;
                        if (existing.some((h) => hotkeySignature(h) === sig)) {
                          return;
                        }
                        settingsM.obsidianPassThroughHotkeys = [
                          ...existing,
                          captured,
                        ];
                      })
                      .then(() => {
                        this.postMutate();
                      });
                  },
                );
                modal.open();
              }),
          );
        passThroughInsertAfter = setting.settingEl;
        refreshPassThroughList();
      });
  }

  protected override snapshot0(): Partial<Settings> {
    return Settings.persistent(
      this.context.settings.value,
    ) as Partial<Settings>;
  }

  #setupProfileListSection(
    ui: UpdatableUI,
    parentEl: HTMLElement,
    initialEntries: readonly Settings.Profile.Entry[],
  ): { readonly appendNewProfile: () => Promise<void> } {
    const { context, context: { settings } } = this;
    const dataW = cloneAsWritable(initialEntries);
    const dataKeys = new Map(
      dataW.map(([key, value]: Settings.Profile.Entry) => [value, key]),
    );
    const profiles = dataW.map(([, value]) => value);
    const keygen = (): string => self.crypto.randomUUID();
    const { value: i18n } = context.language;

    let setupListSubUI: () => void = () => {};

    const persist = async (): Promise<void> => {
      const entries = profiles.map((profile) => {
        let id = dataKeys.get(profile);
        if (id === void 0) {
          dataKeys.set(
            profile,
            (id = randomNotIn([...dataKeys.values()], keygen)),
          );
        }
        return [id, cloneAsWritable(profile)] as const;
      });
      await settings.mutate((settingsM) => {
        settingsM.profiles = Object.fromEntries(entries);
      });
      this.postMutate();
      ui.update();
    };

    const appendNewProfile = async (): Promise<void> => {
      profiles.push(cloneAsWritable(PROFILE_PRESETS.empty));
      setupListSubUI();
      await persist();
    };

    const setupProfileRows = (
      subUI: UpdatableUI,
      element: HTMLElement,
    ): void => {
      subUI.destroy();
      const descriptor = (profile: Settings.Profile): string => {
        const id = dataKeys.get(profile) ?? "";
        const info = Settings.Profile.info([id, profile]);
        return Settings.Profile.isCompatible(profile, Platform.CURRENT)
          ? info.id
          : "(Incompatible) " + info.id;
      };
      const namer = (profile: Settings.Profile): string => {
        const id = dataKeys.get(profile) ?? "";
        return Settings.Profile.info([id, profile]).name;
      };
      for (const [index] of profiles.entries()) {
        subUI.newSetting(element, (setting) => {
          const { valid, value: item } = bracket(profiles, index);
          if (!valid) {
            throw new Error(String(index));
          }
          setting.setName(namer(item)).setDesc(descriptor(item));
          setting.addButton((button) =>
            button
              .setIcon("edit")
              .setTooltip("Edit")
              .onClick(() => {
                new ProfileModal(context, item, async (value) => {
                  clearProperties(item);
                  Object.assign(item, value);
                  await persist();
                }).open();
              }),
          );
          setting.addButton((button) =>
            button
              .setTooltip(i18n.t("components.list.remove"))
              .setIcon(i18n.t("asset:components.list.remove-icon"))
              .onClick(async () => {
                removeAt(profiles, index);
                setupListSubUI();
                await persist();
              }),
          );
          setting.addExtraButton((button) =>
            button
              .setTooltip(i18n.t("components.list.move-up"))
              .setIcon(i18n.t("asset:components.list.move-up-icon"))
              .onClick(async () => {
                if (index <= 0) {
                  return;
                }
                swap(profiles, index - 1, index);
                setupListSubUI();
                await persist();
              }),
          );
          setting.addExtraButton((button) =>
            button
              .setTooltip(i18n.t("components.list.move-down"))
              .setIcon(i18n.t("asset:components.list.move-down-icon"))
              .onClick(async () => {
                if (index >= profiles.length - 1) {
                  return;
                }
                swap(profiles, index, index + 1);
                setupListSubUI();
                await persist();
              }),
          );
        });
      }
    };

    ui.embed(
      () => {
        const subUI = new UpdatableUI();
        setupListSubUI = (): void => {
          setupProfileRows(subUI, parentEl);
        };
        setupListSubUI();
        return subUI;
      },
      null,
      (subUI) => {
        subUI.destroy();
      },
    );

    return { appendNewProfile };
  }
}

class PassThroughHotkeyCaptureModal extends Modal {
  readonly #onCapture: (h: Hotkey) => void;
  #keydown: ((e: KeyboardEvent) => void) | null = null;

  public constructor(app: App, onCapture: (h: Hotkey) => void) {
    super(app);
    this.#onCapture = onCapture;
  }

  public onOpen(): void {
    const { contentEl } = this;
    contentEl.replaceChildren();
    createChildElement(contentEl, "p", (el) => {
      el.textContent =
        "Press the key combination to forward to Obsidian. It should match a chord in Settings → Hotkeys.";
    });
    this.#keydown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const h = keyboardEventToHotkey(e);
      if (h) {
        this.#onCapture(h);
        this.close();
      }
    };
    window.addEventListener("keydown", this.#keydown, true);
  }

  public onClose(): void {
    if (this.#keydown) {
      window.removeEventListener("keydown", this.#keydown, true);
    }
  }
}

export function loadSettings(context: TerminalPlugin): void {
  context.addSettingTab(new SettingTab(context));
}
