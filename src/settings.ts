import {
  AdvancedSettingTab,
  Platform,
  cloneAsWritable,
  createChildElement,
  createDocumentFragment,
  linkSetting,
  setTextToEnum,
  DOMClasses,
} from "@polyipseity/obsidian-plugin-library";
import { ProfileListModal, TerminalOptionsModal } from "./modals.js";
import { Settings } from "./settings-data.js";
import { RENDERER_NAMES, formatProfileShort, listDescription } from "./i18n-strings.js";
import type { TerminalPlugin } from "./main.js";
import type { loadDocumentations } from "./documentations.js";
import { size } from "lodash-es";

export class SettingTab extends AdvancedSettingTab<Settings> {
  public constructor(
    protected override readonly context: TerminalPlugin,
    protected readonly docs: loadDocumentations.Loaded,
  ) {
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
          .setName("Add commands")
          .setDesc(
            'Add a command palette entry for each new instance behavior.',
          )
          .addToggle(
            linkSetting(
              () => settings.value.addNewInstanceBehaviorCommands,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.addNewInstanceBehaviorCommands = value;
                }),
              () => {
                this.postMutate();
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
          .setName("Intercept logging")
          .addToggle(
            linkSetting(
              () => settings.value.interceptLogging,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.interceptLogging = value;
                }),
              () => {
                this.postMutate();
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
      });
  }

  protected override snapshot0(): Partial<Settings> {
    return Settings.persistent(this.context.settings.value);
  }
}

export function loadSettings(
  context: TerminalPlugin,
  docs: loadDocumentations.Loaded,
): void {
  context.addSettingTab(new SettingTab(context, docs));
}
