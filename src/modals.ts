import {
  CHECK_EXECUTABLE_WAIT,
  DEFAULT_PYTHONIOENCODING,
  PYTHON_REQUIREMENTS,
} from "./magic.js";
import {
  PROFILE_PRESETS,
  PROFILE_PRESET_ORDERED_KEYS,
} from "./terminal/profile-presets.js";
import {
  EditDataModal,
  ListModal,
  Platform,
  SI_PREFIX_SCALE,
  type StatusUI,
  UpdatableUI,
  activeSelf,
  anyToError,
  clearProperties,
  cloneAsWritable,
  createChildElement,
  createDocumentFragment,
  dynamicRequire,
  escapeQuerySelectorAttribute,
  inSet,
  linkSetting,
  notice2,
  printError,
  randomNotIn,
  setTextToEnum,
  unexpected,
  useSettings,
  useSubsettings,
} from "@polyipseity/obsidian-plugin-library";
import { Modal } from "obsidian";
import { constant, identity, noop } from "lodash-es";
import { BUNDLE } from "./import.js";
import type { DeepWritable } from "ts-essentials";
import { PROFILE_PROPERTIES } from "./terminal/profile-properties.js";
import { drawTerminalOptionsForm } from "./terminal-options-ui.js";
import { Pseudoterminal } from "./terminal/pseudoterminal.js";

import SemVer from "semver/classes/semver.js";
import { Settings } from "./settings-data.js";
import type { TerminalPlugin } from "./main.js";
import getPackageVersion from "./get_package_version.py";
import semverCoerce from "semver/functions/coerce.js";
import { PLATFORM_NAMES, capitalize, listDescription, profileTypeName } from "./i18n-strings.js";

const childProcess = dynamicRequire<typeof import("node:child_process")>(
    BUNDLE,
    "node:child_process",
  ),
  process = dynamicRequire<typeof import("node:process")>(
    BUNDLE,
    "node:process",
  ),
  util = dynamicRequire<typeof import("node:util")>(BUNDLE, "node:util"),
  execFileP = (async () => {
    const [childProcess2, util2] = await Promise.all([childProcess, util]);
    return util2.promisify(childProcess2.execFile);
  })();

const PROFILE_PRESET_NAMES: Record<string, string> = {
  bashIntegrated: "bash: Integrated",
  cmdExternal: "cmd: External",
  cmdIntegrated: "cmd: Integrated",
  darwinExternalDefault: "macOS default: External",
  darwinIntegratedDefault: "macOS default: Integrated",
  dashIntegrated: "dash: Integrated",
  empty: "Empty",
  gitBashIntegrated: "Git Bash: Integrated",
  gnomeTerminalExternal: "GNOME Terminal: External",
  iTerm2External: "iTerm2: External",
  konsoleExternal: "Konsole: External",
  linuxExternalDefault: "Linux default: External",
  linuxIntegratedDefault: "Linux default: Integrated",
  powershellExternal: "powershell: External",
  powershellIntegrated: "powershell: Integrated",
  pwshExternal: "pwsh: External",
  pwshIntegrated: "pwsh: Integrated",
  shIntegrated: "sh: Integrated",
  terminalMacOSExternal: "Terminal (macOS): External",
  win32ExternalDefault: "Microsoft Windows default: External",
  win32IntegratedDefault: "Microsoft Windows default: Integrated",
  wslIntegrated: "Windows Subsystem for Linux: Integrated",
  wtExternal: "Windows Terminal: External",
  xtermExternal: "xterm: External",
  zshIntegrated: "zsh: Integrated",
};

export class TerminalOptionsModal extends EditDataModal<Settings.Profile.TerminalOptions> {
  public constructor(
    context: TerminalPlugin,
    data: Settings.Profile.TerminalOptions,
    options?: TerminalOptionsModal.Options,
  ) {
    super(context, data, Settings.Profile.fixTerminalOptions, {
      ...options,
      elements: ["export", "import"],
      title: () => "Terminal options",
    });
  }

  protected override draw(
    ui: UpdatableUI,
    element: HTMLElement,
    errorEl: StatusUI,
  ): void {
    super.draw(ui, element, errorEl);
    drawTerminalOptionsForm(ui, element, this.data, () =>
      this.postMutate2(errorEl),
    );
  }

  protected async postMutate2(errorEl: StatusUI): Promise<void> {
    errorEl.report();
    await this.postMutate();
  }
}
export namespace TerminalOptionsModal {
  type InitialOptions = EditDataModal.Options<Settings.Profile.TerminalOptions>;
  export type PredefinedOptions = {
    readonly [K in never]: InitialOptions[K];
  };
  export type Options = Omit<InitialOptions, keyof PredefinedOptions>;
}

export class ProfileModal extends Modal {
  protected readonly modalUI = new UpdatableUI();
  protected readonly ui = new UpdatableUI();
  protected readonly data;
  readonly #callback;
  readonly #presets;
  #preset = NaN;
  #setupTypedUI = noop;

  public constructor(
    protected readonly context: TerminalPlugin,
    data: Settings.Profile,
    callback: (data_: DeepWritable<typeof data>) => unknown,
    presets: readonly {
      readonly name: string;
      readonly value: Settings.Profile;
    }[] = PROFILE_PRESET_ORDERED_KEYS.map((key) => ({
      name: PROFILE_PRESET_NAMES[key] ?? key,
      value: PROFILE_PRESETS[key],
    })),
  ) {
    super(context.app);
    this.data = cloneAsWritable(data);
    this.#callback = callback;
    this.#presets = presets;
  }

  public override onOpen(): void {
    super.onOpen();
    const { context, ui, data, titleEl, modalUI } = this,
      { element: listEl, remover: listElRemover } = useSettings(this.contentEl),
      profile = data,
      { language } = context,
      { onChangeLanguage } = language;
    modalUI
      .finally(
        onChangeLanguage.listen(() => {
          modalUI.update();
        }),
      )
      .new(
        constant(titleEl),
        (ele) => {
          ele.textContent = Settings.Profile.name(profile);
        },
        (ele) => {
          ele.textContent = null;
        },
      );
    ui.finally(listElRemover).finally(
      onChangeLanguage.listen(() => {
        ui.update();
      }),
    );
    let keepPreset = false;
    ui.newSetting(listEl, (setting) => {
      setting
        .setName("Name")
        .addText(
          linkSetting(
            () => Settings.Profile.name(profile),
            (value) => {
              profile.name = value;
            },
            async () => this.postMutate(),
          ),
        );
    })
      .newSetting(listEl, (setting) => {
        if (!keepPreset) {
          this.#preset = NaN;
        }
        keepPreset = false;
        setting
          .setName("Preset")
          .addDropdown(
            linkSetting(
              () => this.#preset.toString(),
              (value) => {
                this.#preset = Number(value);
              },
              async () => {
                const preset = this.#presets[this.#preset];
                if (!preset) {
                  return;
                }
                this.replaceData(cloneAsWritable(preset.value), true);
                this.#setupTypedUI();
                keepPreset = true;
                await this.postMutate();
              },
              {
                pre: (component) => {
                  component
                    .addOption(
                      NaN.toString(),
                      "(Custom)",
                    )
                    .addOptions(
                      Object.fromEntries(
                        this.#presets.map((selection, index) => [
                          index,
                          selection.name,
                        ]),
                      ),
                    );
                },
              },
            ),
          );
      })
      .newSetting(listEl, (setting) => {
        setting
          .setName("Data")
          .addButton((button) => {
            button
              .setIcon("curly-braces")
              .setTooltip("Edit")
              .onClick(() => {
                new EditDataModal(context, profile, Settings.Profile.fix, {
                  callback: async (profileM): Promise<void> => {
                    this.replaceData(profileM);
                    this.#setupTypedUI();
                    await this.postMutate();
                  },
                  title(): string {
                    return "Data";
                  },
                }).open();
              });
          });
      })
      .embed(
        () => {
          const typedUI = new UpdatableUI(),
            ele = useSubsettings(listEl);
          this.#setupTypedUI = (): void => {
            this.setupTypedUI(typedUI, ele);
          };
          this.#setupTypedUI();
          return typedUI;
        },
        null,
        () => {
          this.#setupTypedUI = noop;
        },
      );
  }

  public override onClose(): void {
    super.onClose();
    this.modalUI.destroy();
    this.ui.destroy();
  }

  protected async postMutate(): Promise<void> {
    const { data, modalUI, ui } = this,
      cb = this.#callback(cloneAsWritable(data));
    modalUI.update();
    ui.update();
    await cb;
  }

  protected replaceData(
    profile: DeepWritable<Settings.Profile>,
    keepName = false,
  ): void {
    const { data } = this,
      { name } = data;
    clearProperties(data);
    Object.assign(data, profile);
    if (keepName) {
      data.name = name;
    }
  }

  protected setupTypedUI(ui: UpdatableUI, element: HTMLElement): void {
    const {
        context,
        data,
      } = this,
      profile = data;
    ui.destroy();
    ui.newSetting(element, (setting) => {
      setting
        .setName("Type")
        .addDropdown(
          linkSetting(
            (): string => profile.type,
            setTextToEnum(Settings.Profile.TYPES, (value) => {
              this.replaceData(
                cloneAsWritable(Settings.Profile.DEFAULTS[value]),
                true,
              );
            }),
            async () => {
              this.#setupTypedUI();
              await this.postMutate();
            },
            {
              pre: (dropdown) => {
                dropdown.addOptions(
                  Object.fromEntries(
                    Settings.Profile.TYPES.map((type) => [
                      type,
                      capitalize(profileTypeName(type)),
                    ]),
                  ),
                );
                for (const opt of Settings.Profile.TYPES.filter(
                  (type) => !PROFILE_PROPERTIES[type].valid,
                ).flatMap((type) =>
                  Array.from(
                    dropdown.selectEl.querySelectorAll<HTMLOptionElement>(
                      `option[value="${escapeQuerySelectorAttribute(type)}"]`,
                    ),
                  ),
                )) {
                  opt.hidden = true;
                  opt.disabled = true;
                }
              },
            },
          ),
        );
    });
    if (profile.type === "invalid") {
      return;
    }
    ui.newSetting(element, (setting) => {
      setting
        .setName("Terminal options")
        .addButton((button) =>
          button
            .setIcon(
              "edit",
            )
            .setTooltip("Edit")
            .onClick(() => {
              new TerminalOptionsModal(context, profile.terminalOptions, {
                callback: async (value): Promise<void> => {
                  profile.terminalOptions = value;
                  await this.postMutate();
                },
              }).open();
            }),
        );
    })
      .newSetting(element, (setting) => {
        setting
          .setName("Follow theme")
          .addToggle(
            linkSetting(
              () => profile.followTheme,
              (value) => {
                profile.followTheme = value;
              },
              async () => this.postMutate(),
            ),
          );
      })
      .newSetting(element, (setting) => {
        const { settingEl } = setting;
        setting
          .setName("Restore history")
          .setDesc(
            createDocumentFragment(settingEl.ownerDocument, (frag) => {
              createChildElement(frag, "span", (ele) => {
                ele.innerHTML = 'If enabled, history is saved to <code>.obsidian/workspace.json</code>.';
              });
            }),
          )
          .addToggle(
            linkSetting(
              () => profile.restoreHistory,
              (value) => {
                profile.restoreHistory = value;
              },
              async () => this.postMutate(),
            ),
          );
      })
      .newSetting(element, (setting) => {
        setting
          .setName("Success exit codes")
          .setDesc(
            listDescription(profile.successExitCodes.length),
          )
          .addButton((button) =>
            button
              .setIcon(
                "list",
              )
              .setTooltip("Edit")
              .onClick(() => {
                new ListModal(
                  context,
                  ListModal.stringInputter<string>({
                    back: identity,
                    forth: identity,
                  }),
                  () => "",
                  profile.successExitCodes,
                  {
                    callback: async (value): Promise<void> => {
                      profile.successExitCodes = value;
                      await this.postMutate();
                    },
                    title: (): string =>
                      "Success exit codes",
                  },
                ).open();
              }),
          );
      });
    switch (profile.type) {
      case "": {
        break;
      }
      case "external":
      case "integrated": {
        ui.newSetting(element, (setting) => {
          setting
            .setName("Executable")
            .addText(
              linkSetting(
                () => profile.executable,
                (value) => {
                  profile.executable = value;
                },
                async () => this.postMutate(),
              ),
            );
        }).newSetting(element, (setting) => {
          setting
            .setName("Arguments")
            .setDesc(
              listDescription(profile.args.length),
            )
            .addButton((button) =>
              button
                .setIcon(
                  "list",
                )
                .setTooltip(
                  "Edit",
                )
                .onClick(() => {
                  new ListModal(
                    context,
                    ListModal.stringInputter<string>({
                      back: identity,
                      forth: identity,
                    }),
                    () => "",
                    profile.args,
                    {
                      callback: async (value): Promise<void> => {
                        profile.args = value;
                        await this.postMutate();
                      },
                      title: (): string =>
                        "Arguments",
                    },
                  ).open();
                }),
            );
        });
        for (const platform of Pseudoterminal.SUPPORTED_PLATFORMS) {
          ui.newSetting(element, (setting) => {
            setting
              .setName(PLATFORM_NAMES[platform] ?? platform)
              .setDesc(
                platform === Platform.CURRENT ? "Current platform" : "",
              )
              .addToggle(
                linkSetting(
                  () =>
                    profile.platforms[platform] ??
                    Settings.Profile.DEFAULTS[profile.type].platforms[platform],
                  (value) => {
                    profile.platforms[platform] = value;
                  },
                  async () => this.postMutate(),
                ),
              );
          });
        }
        if (profile.type === "integrated") {
          let checkingPython = false;
          ui.newSetting(element, (setting) => {
            setting
              .setName("Python executable")
              .setDesc(
                `Recommend ${PYTHON_REQUIREMENTS.Python.version} or up. Required on Unix to spawn integrated terminal. Clear text field to disable Python.`,
              )
              .addText(
                linkSetting(
                  () => profile.pythonExecutable,
                  (value) => {
                    profile.pythonExecutable = value;
                  },
                  async () => this.postMutate(),
                  {
                    post: (component) => {
                      component.setPlaceholder("(Disabled)");
                    },
                  },
                ),
              )
              .addButton((button) => {
                const { buttonEl } = button;
                button
                  .setIcon(checkingPython ? "loader" : "file-check")
                  .setTooltip(checkingPython ? "Checking" : "Check")
                  .onClick(() => {
                    if (checkingPython) {
                      return;
                    }
                    checkingPython = true;
                    (async (): Promise<void> => {
                      try {
                        const [execFileP2, process2, getPackageVersion2] =
                            await Promise.all([
                              execFileP,
                              process,
                              getPackageVersion,
                            ]),
                          { stdout, stderr } = await execFileP2(
                            profile.pythonExecutable,
                            ["--version"],
                            {
                              env: {
                                ...process2.env,

                                PYTHONIOENCODING: DEFAULT_PYTHONIOENCODING,
                              },
                              timeout: CHECK_EXECUTABLE_WAIT * SI_PREFIX_SCALE,
                              windowsHide: true,
                            },
                          );
                        if (stdout) {
                          activeSelf(buttonEl).console.log(stdout);
                        }
                        if (stderr) {
                          activeSelf(buttonEl).console.error(stderr);
                        }
                        if (!stdout.trimStart().startsWith("Python ")) {
                          throw new Error("Not Python");
                        }
                        const msgs = await Promise.all(
                          Object.entries(PYTHON_REQUIREMENTS)
                            .filter(([, { platforms }]) =>
                              inSet(platforms, Platform.CURRENT),
                            )
                            .map(async ([name, { version: req }]) => {
                              let ver: SemVer | null = null;
                              try {
                                if (name === "Python") {
                                  ver = new SemVer(
                                    semverCoerce(stdout, { loose: true }) ??
                                      stdout,
                                    { loose: true },
                                  );
                                } else {
                                  const { stdout: stdout2, stderr: stderr2 } =
                                    await execFileP2(
                                      profile.pythonExecutable,
                                      ["-c", getPackageVersion2, name],
                                      {
                                        env: {
                                          ...process2.env,

                                          PYTHONIOENCODING:
                                            DEFAULT_PYTHONIOENCODING,
                                        },
                                        timeout:
                                          CHECK_EXECUTABLE_WAIT *
                                          SI_PREFIX_SCALE,
                                        windowsHide: true,
                                      },
                                    );
                                  if (stdout2) {
                                    activeSelf(buttonEl).console.log(stdout2);
                                  }
                                  if (stderr2) {
                                    activeSelf(buttonEl).console.error(stderr2);
                                  }
                                  ver = new SemVer(
                                    semverCoerce(stdout2, { loose: true }) ??
                                      stdout2,
                                    { loose: true },
                                  );
                                }
                              } catch (error) {
                                /* @__PURE__ */ activeSelf(
                                  buttonEl,
                                ).console.debug(error);
                              }
                              const satisfied = (ver?.compare(req) ?? -1) >= 0;
                              return (): string =>
                                `${name}: ${ver?.version ?? ""} (${satisfied ? "satisfied" : "unsatisfied"}: >=${req.version})`;
                            }),
                        );
                        notice2(
                          () => msgs.map((msg) => msg()).join("\n"),
                          context?.settings.value.errorNoticeTimeout,
                          context,
                        );
                      } catch (error) {
                        printError(
                          anyToError(error),
                          () => "Error checking Python",
                          context,
                        );
                      } finally {
                        checkingPython = false;
                        ui.update();
                      }
                    })();
                    ui.update();
                  });
                if (checkingPython) {
                  button.setCta();
                }
              });
          }).newSetting(element, (setting) => {
            setting
              .setName("Use Microsoft Windows 'conhost.exe'")
              .setDesc(
                "Disable if running 'conhost.exe' does not create a window. No guarantees this will work.",
              )
              .addToggle(
                linkSetting(
                  () => profile.useWin32Conhost,
                  (value) => {
                    profile.useWin32Conhost = value;
                  },
                  async () => this.postMutate(),
                ),
              );
          });
        }
        break;
      }
      // No default
    }
  }
}

export class ProfileListModal extends ListModal<
  DeepWritable<Settings.Profile>
> {
  protected readonly dataKeys;

  public constructor(
    context: TerminalPlugin,
    data: readonly Settings.Profile.Entry[],
    options?: ProfileListModal.Options,
  ) {
    const dataW = cloneAsWritable(data),
      dataKeys = new Map(dataW.map(([key, value]) => [value, key])),
      callback = options?.callback ?? ((): void => {}),
      keygen = options?.keygen ?? ((): string => self.crypto.randomUUID());
    super(
      context,
      (setting, editable, getter, setter) => {
        setting.addButton((button) =>
          button
            .setIcon("edit")
            .setTooltip("Edit")
            .onClick(() => {
              new ProfileModal(context, getter(), async (value) => {
                await setter((item) => {
                  clearProperties(item);
                  Object.assign(item, value);
                });
              }).open();
            })
            .setDisabled(!editable),
        );
      },
      unexpected,
      dataW.map(([, value]) => value),
      {
        ...options,
        ...({
          async callback(data0): Promise<void> {
            await callback(
              data0.map((profile) => {
                let id = dataKeys.get(profile);
                if (id === void 0) {
                  dataKeys.set(
                    profile,
                    (id = randomNotIn([...dataKeys.values()], keygen)),
                  );
                }
                return [id, cloneAsWritable(profile)];
              }),
            );
          },
        } satisfies ProfileListModal.PredefinedOptions),
        descriptor:
          options?.descriptor ??
          ((profile): string => {
            const id = dataKeys.get(profile) ?? "",
              info = Settings.Profile.info([id, profile]);
            return Settings.Profile.isCompatible(profile, Platform.CURRENT)
              ? info.id
              : "(Incompatible) " + info.id;
          }),
        namer:
          options?.namer ??
          ((profile): string => {
            const id = dataKeys.get(profile) ?? "";
            return Settings.Profile.info([id, profile]).name;
          }),
        presetPlaceholder:
          options?.presetPlaceholder ??
          ((): string => "(Unselected)"),
        presets:
          options?.presets ??
          PROFILE_PRESET_ORDERED_KEYS.map((key) => ({
            name: PROFILE_PRESET_NAMES[key] ?? key,
            get value(): DeepWritable<Settings.Profile> {
              return cloneAsWritable(PROFILE_PRESETS[key]);
            },
          })),
        title:
          options?.title ??
          ((): string => "Profiles"),
      },
    );
    this.dataKeys = dataKeys;
  }
}
export namespace ProfileListModal {
  type InitialOptions = ListModal.Options<DeepWritable<Settings.Profile>>;
  export type PredefinedOptions = {
    readonly [K in "callback"]: InitialOptions[K];
  };
  export interface Options extends Omit<
    InitialOptions,
    keyof PredefinedOptions
  > {
    readonly callback?: (
      data: DeepWritable<Settings.Profile.Entry>[],
    ) => unknown;
    readonly keygen?: () => string;
  }
}
