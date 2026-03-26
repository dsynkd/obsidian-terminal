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
  notice2,
} from "@polyipseity/obsidian-plugin-library";
import { SelectProfileModal, spawnTerminal } from "./spawn.js";
import { Settings } from "../settings-data.js";
import type { TerminalPlugin } from "../main.js";
import { TerminalView } from "./view.js";
import { capitalize, profileTypeName } from "../i18n-strings.js";

export function loadTerminal(context: TerminalPlugin): void {
  TerminalView.load(context);
  const
    {
      app: { vault, workspace },
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
            `No default profile for type '${capitalize(profileTypeName(type))}'`,
          context?.settings.value.errorNoticeTimeout,
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
          .setTitle("Open in terminal")
          .setIcon("terminal")
          .onClick(() => {
            const profile = defaultProfile("integrated");
            if (!profile) {
              return;
            }
            spawnTerminal(context, profile, { cwd: cwd0 });
          });
      };
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

  const openDefaultProfileInActiveFileFolder = (checking?: boolean): boolean => {
    if (!adapter) {
      return false;
    }
    const activeFile = workspace.getActiveFile();
    const folder = activeFile?.parent;
    if (!activeFile || !folder) {
      return false;
    }
    const cwdPath = adapter.getFullPath(folder.path);
    const { defaultProfile, profiles } = settings.value;
    if (defaultProfile && profiles[defaultProfile]) {
      const profile = profiles[defaultProfile];
      if (Settings.Profile.isCompatible(profile, Platform.CURRENT)) {
        if (!checking) {
          spawnTerminal(context, profile, { cwd: cwdPath });
        }
        return true;
      }
    }
    if (!checking) {
      new SelectProfileModal(context, cwdPath).open();
    }
    return true;
  };

  addRibbonIcon(
    context,
    "Open terminal",
    "terminal-square",
    () => "Open terminal",
    () => openDefaultProfile(),
  );

  addCommand(context, () => "Toggle terminal visibility", {
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
    icon: "eye",
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

  addCommand(context, () => "Open terminal: Default profile", {
    checkCallback(checking) {
      return openDefaultProfile(checking);
    },
    icon: "terminal-square",
    id: "open-terminal.default",
  });

  addCommand(
    context,
    () => "Open terminal in current folder",
    {
      checkCallback(checking) {
        return openDefaultProfileInActiveFileFolder(checking);
      },
      icon: "terminal-square",
      id: "open-terminal.current-folder",
    },
  );
}
