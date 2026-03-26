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
      context: {
        language: { value: i18n },
        settings,
      },
      ui,
    } = this;
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.profiles"))
        .setDesc(
          i18n.t("settings.profiles-description", {
            count: size(settings.value.profiles),
            interpolation: { escapeValue: false },
          }),
        )
        .addButton((button) =>
          button
            .setIcon(i18n.t("asset:settings.profiles-edit-icon"))
            .setTooltip(i18n.t("settings.profiles-edit"))
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
                    i18n.t("settings.profile-list.description"),
                },
              ).open();
            }),
        );
    }).newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.default-profile"))
        .setDesc(i18n.t("settings.default-profile-description"))
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
                  .addOption("", i18n.t("components.dropdown.placeholder"))
                  .addOptions(
                    Object.fromEntries(
                      Object.entries(settings.value.profiles).map(
                        ([id, profile]) => [
                          id,
                          i18n.t(
                            `settings.default-profile-name-${
                              Settings.Profile.isCompatible(
                                profile,
                                Platform.CURRENT,
                              )
                                ? ""
                                : "incompatible"
                            }`,
                            {
                              info: Settings.Profile.info([id, profile]),
                              interpolation: { escapeValue: false },
                            },
                          ),
                        ],
                      ),
                    ),
                  );
              },
            },
          ),
        );
    });

    // profile defaults section
    this.newSectionWidget(() => i18n.t("settings.profile-defaults"));
    ui.new(
      () => createChildElement(containerEl, "div"),
      (ele) => {
        ele.classList.add(DOMClasses.SETTING_ITEM);
        ele.textContent = i18n.t("settings.profile-defaults-description");
      },
      (ele) => {
        ele.remove();
      },
    );
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.terminal-options"))
        .setDesc(i18n.t("settings.terminal-options-description"))
        .addButton((button) =>
          button
            .setIcon(i18n.t("asset:settings.terminal-options-edit-icon"))
            .setTooltip(i18n.t("settings.terminal-options-edit"))
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

    this.newSectionWidget(() => i18n.t("settings.instancing"));
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.new-instance-behavior"))
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
                      i18n.t(`settings.new-instance-behaviors.${value}`),
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
          .setName(i18n.t("settings.create-instance-near-existing-ones"))
          .setDesc(
            i18n.t("settings.create-instance-near-existing-ones-description"),
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
          .setName(i18n.t("settings.focus-on-new-instance"))
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
          .setName(i18n.t("settings.pin-new-instance"))
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

    this.newSectionWidget(() => i18n.t("settings.interface"));
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.hide-status-bar"))
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
                      i18n.t(`settings.hide-status-bar-options.${value}`),
                    ]),
                  ),
                );
              },
            },
          ),
        );
    });
    this.newSectionWidget(() => i18n.t("settings.advanced"));
    ui.newSetting(containerEl, (setting) => {
      const { settingEl } = setting;
      setting
        .setName(i18n.t("settings.expose-internal-modules"))
        .setDesc(
          createDocumentFragment(settingEl.ownerDocument, (frag) => {
            createChildElement(frag, "span", (ele) => {
              ele.innerHTML = i18n.t(
                "settings.expose-internal-modules-description-HTML",
              );
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
          .setName(i18n.t("settings.intercept-logging"))
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
          .setName(i18n.t("settings.macOS-option-key-passthrough"))
          .setDesc(i18n.t("settings.macOS-option-key-passthrough-description"))
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
          .setName(i18n.t("settings.preferred-renderer"))
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
                        i18n.t("settings.preferred-renderer-options", {
                          interpolation: { escapeValue: false },
                          type,
                        }),
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
