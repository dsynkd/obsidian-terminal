import {
  AdvancedSettingTab,
  Platform,
  createChildElement,
  createDocumentFragment,
  linkSetting,
  setTextToEnum,
} from "@polyipseity/obsidian-plugin-library";
import { Modal, Setting, type App, type Hotkey } from "obsidian";
import { ProfileListModal, TerminalOptionsModal } from "./modals.js";
import { Settings } from "./settings-data.js";
import { RENDERER_NAMES, formatProfileShort, listDescription } from "./i18n-strings.js";
import type { TerminalPlugin } from "./main.js";
import {
  formatHotkeyLabel,
  hotkeySignature,
  keyboardEventToHotkey,
} from "./terminal/obsidian-pass-through.js";
import { size } from "lodash-es";

export class SettingTab extends AdvancedSettingTab<Settings> {
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

    const passThroughRowRoots: HTMLElement[] = [];
    const refreshPassThroughList = (): void => {
      for (const el of passThroughRowRoots) {
        el.remove();
      }
      passThroughRowRoots.length = 0;

      const hotkeys = settings.value.obsidianPassThroughHotkeys;
      const gridEl = createChildElement(containerEl, "div", (el) => {
        el.classList.add("terminal-pass-through-hotkey-grid");
      });
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

    ui.newSetting(containerEl, (setting) => {
      setting
        .setName("Profiles")
        .setDesc(listDescription(size(settings.value.profiles)))
        .addButton((button) =>
          button
            .setIcon("list")
            .setTooltip("Edit")
            .onClick(() => {
              new ProfileListModal(
                context,
                Object.entries(settings.value.profiles),
                {
                  callback: async (data): Promise<void> => {
                    await settings.mutate((settingsM) => {
                      settingsM.profiles = Object.fromEntries(data);
                    });
                    this.postMutate();
                  },
                  description: (): string =>
                    "The first compatible profile in the list is the default for its terminal type.",
                },
              ).open();
            }),
        );
    }).newSetting(containerEl, (setting) => {
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
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName("Terminal options")
        .setDesc("Shallow-merged into every profile unless a specific profile explicitly overrides them.")
        .addButton((button) =>
          button
            .setIcon("edit")
            .setTooltip("Edit")
            .onClick(() => {
              new TerminalOptionsModal(
                context,
                settings.value.terminalOptions,
                {
                  callback: async (value): Promise<void> => {
                    await settings.mutate((settingsM) => {
                      settingsM.terminalOptions = value;
                    });
                    this.postMutate();
                  },
                },
              ).open();
            }),
        );
    });

    this.newSectionWidget(() => "Instancing");
    ui.newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
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
    this.newSectionWidget(() => "Interface");
    ui.newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
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
    this.newSectionWidget(() => "Advanced");
    ui.newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
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
      .newSetting(containerEl, (setting) => {
        setting
          .setName("macOS: Option key passthrough")
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
      .newSetting(containerEl, (setting) => {
        setting
          .setName("Hotkey pass-through")
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
        refreshPassThroughList();
      });
  }

  protected override snapshot0(): Partial<Settings> {
    return Settings.persistent(
      this.context.settings.value,
    ) as Partial<Settings>;
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
