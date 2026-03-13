import {
  FileSystemAdapter,
  MarkdownView,
  type MenuItem,
  TFolder,
} from "obsidian";
import {
  Platform,
  addCommand,
  addRibbonIcon,
  deepFreeze,
  notice2,
} from "@polyipseity/obsidian-plugin-library";
import { SelectProfileModal, spawnTerminal } from "./spawn.js";
import { PROFILE_PROPERTIES } from "./profile-properties.js";
import { Settings } from "../settings-data.js";
import type { TerminalPlugin } from "../main.js";
import { TerminalView } from "./view.js";

export function loadTerminal(context: TerminalPlugin): void {
  TerminalView.load(context);
  const PROFILE_TYPES = deepFreeze(
      (
        ["select", "integrated", "external"] satisfies readonly (
          | keyof typeof PROFILE_PROPERTIES
          | "select"
        )[]
      ).filter(
        (type) => type === "select" || PROFILE_PROPERTIES[type].available,
      ),
    ),
    CWD_TYPES = deepFreeze(["", "root", "current"]),
    EXCLUDED_TYPES = deepFreeze([
      { cwd: "", profile: "integrated" },
      { cwd: "", profile: "external" },
    ]),
    {
      app: { vault, workspace },
      language: { value: i18n },
      settings,
    } = context,
    defaultProfile = (type: Settings.Profile.Type): Settings.Profile | null => {
      const ret = Settings.Profile.defaultOfType(
        type,
        settings.value.profiles,
        Platform.CURRENT,
      );
      if (!ret) {
        notice2(
          () =>
            i18n.t("notices.no-default-profile", {
              interpolation: { escapeValue: false },
              type,
            }),
          settings.value.errorNoticeTimeout,
          context,
        );
      }
      return ret;
    },
    adapter = vault.adapter instanceof FileSystemAdapter ? vault.adapter : null,
    openInIntegratedTerminalMenuItem = (
      cwd?: TFolder,
    ): ((item: MenuItem) => void) | null => {
      const cwd0 = cwd ? (adapter ? adapter.getFullPath(cwd.path) : null) : cwd;
      if (cwd0 === null) {
        return null;
      }
      return (item: MenuItem) => {
        item
          .setTitle(i18n.t("menus.open-in-terminal"))
          .setIcon(
            i18n.t("asset:menus.open-terminal-icon", {
              interpolation: { escapeValue: false },
              type: "integrated",
            }),
          )
          .onClick(() => {
            const profile = defaultProfile("integrated");
            if (!profile) {
              return;
            }
            spawnTerminal(context, profile, { cwd: cwd0 });
          });
      };
    },
    command =
      (
        type: Settings.Profile.Type | "select",
        cwd: (typeof CWD_TYPES)[number],
      ) =>
      (checking: boolean): boolean => {
        const cwd0 = ((): string | null | undefined => {
          if (!cwd) {
            return void 0;
          }
          if (!adapter) {
            return null;
          }
          switch (cwd) {
            case "root":
              return adapter.getBasePath();
            case "current": {
              const active = workspace.getActiveFile();
              if (active?.parent) {
                return adapter.getFullPath(active.parent.path);
              }
              return null;
            }
            // No default
          }
        })();
        if (cwd0 === null) {
          return false;
        }
        if (!checking) {
          if (type === "select") {
            new SelectProfileModal(context, cwd0).open();
            return true;
          }
          const profile = defaultProfile(type);
          if (profile) {
            spawnTerminal(context, profile, { cwd: cwd0 });
          }
        }
        return true;
      };

  const openDefaultProfile = (checking?: boolean): boolean => {
    const { defaultProfile, profiles } = settings.value;
    if (defaultProfile && profiles[defaultProfile]) {
      const profile = profiles[defaultProfile];
      if (Settings.Profile.isCompatible(profile, Platform.CURRENT)) {
        if (!checking) {
          spawnTerminal(context, profile, { cwd: adapter?.getBasePath() });
        }
        return true;
      }
    }
    if (!checking) {
      new SelectProfileModal(context, adapter?.getBasePath()).open();
    }
    return true;
  };

  addRibbonIcon(
    context,
    i18n.t("asset:ribbons.open-terminal-id"),
    i18n.t("asset:ribbons.open-terminal-icon"),
    () => i18n.t("ribbons.open-terminal"),
    () => openDefaultProfile(),
  );

  addCommand(context, () => i18n.t("commands.toggle-terminal-visibility"), {
    checkCallback(checking) {
      const doc = context.app.workspace.containerEl.ownerDocument;
      const tabs = Array.from(
        doc.querySelectorAll<HTMLElement>(
          '.workspace-tabs:has(.workspace-leaf-content[data-type*="terminal"])',
        ),
      );
      if (tabs.length === 0) {
        return false;
      }
      if (!checking) {
        for (const tab of tabs) {
          const hidden = tab.dataset.terminalHidden === "true";
          if (hidden) {
            tab.style.removeProperty("display");
            delete tab.dataset.terminalHidden;
          } else {
            tab.style.display = "none";
            tab.dataset.terminalHidden = "true";
          }
        }
      }
      return true;
    },
    icon: i18n.t("commands.toggle-terminal-visibility"),
    id: "open-terminal.toggle-visibility",
  });
  context.registerEvent(
    workspace.on("file-menu", (menu, file) => {
      const folder = file instanceof TFolder ? file : file.parent;
      if (!folder) {
        return;
      }
      const item = openInIntegratedTerminalMenuItem(folder);
      if (!item) {
        return;
      }
      menu.addSeparator();
      menu.addItem(item);
    }),
  );
  context.registerEvent(
    workspace.on("editor-menu", (menu, _0, info) => {
      const { file } = info;
      if (info instanceof MarkdownView || !file?.parent) {
        return;
      }
      const { parent } = file;
      const item = openInIntegratedTerminalMenuItem(parent);
      if (!item) {
        return;
      }
      menu.addSeparator();
      menu.addItem(item);
    }),
  );

  /* Always register command for interop with other plugins */

  addCommand(context, () => i18n.t("commands.open-terminal-default-profile"), {
    checkCallback(checking) {
      return openDefaultProfile(checking);
    },
    icon: i18n.t("asset:commands.open-terminal-default-icon"),
    id: "open-terminal.default",
  });

  for (const type of PROFILE_TYPES) {
    for (const cwd of CWD_TYPES) {
      if (
        EXCLUDED_TYPES.some(
          ({ cwd: cwd0, profile }) => cwd0 === cwd && profile === type,
        )
      ) {
        continue;
      }
      addCommand(
        context,
        () =>
          i18n.t(`commands.open-terminal-${cwd}`, {
            interpolation: { escapeValue: false },
            type,
          }),
        {
          checkCallback(checking) {
            return command(type, cwd)(checking);
          },
          icon: i18n.t(`asset:commands.open-terminal-${cwd}-icon`),
          id: `open-terminal.${type}.${cwd}`,
        },
      );
    }
  }
}
