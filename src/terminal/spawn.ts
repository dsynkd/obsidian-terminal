import { EditTerminalModal, TerminalView } from "./view.js";
import {
  Platform,
  getDefaultSuggestModalInstructions,
  revealPrivate,
} from "@polyipseity/obsidian-plugin-library";
import { FuzzySuggestModal } from "obsidian";
import { Settings } from "../settings-data.js";
import type { TerminalPlugin } from "../main.js";
import { formatProfileLong } from "../i18n-strings.js";
import { noop } from "lodash-es";

export class SelectProfileModal extends FuzzySuggestModal<Settings.Profile.Entry | null> {
  public constructor(
    protected readonly context: TerminalPlugin,
    protected readonly cwd?: string,
  ) {
    super(context.app);
    const instructions = getDefaultSuggestModalInstructions(context);
    this.setInstructions([
      ...instructions.slice(0, -1),
      {
        get command(): string {
          return "ctrl ↵";
        },
        get purpose(): string {
          return "to edit before use";
        },
      },
      ...instructions.slice(-1),
    ]);
    this.scope.register(null, "Enter", (evt): boolean => {
      if (evt.isComposing) {
        return true;
      }
      revealPrivate(
        context,
        [this],
        (this0) => {
          this0.selectActiveSuggestion(evt);
        },
        noop,
      );
      return false;
    });
  }

  public override getItems(): (Settings.Profile.Entry | null)[] {
    return [
      null,
      ...Object.entries(this.context.settings.value.profiles)
        /*
				Platform filtering: Filter profiles in the selection modal to
				show only profiles compatible with the current platform
				(macOS/Windows/Linux), improving UX by hiding incompatible options.
				*/
        .filter(([, profile]) =>
          Settings.Profile.isCompatible(profile, Platform.CURRENT),
        ),
    ];
  }

  public override getItemText(item: Settings.Profile.Entry | null): string {
    if (item === null) {
      return "(Temporary profile)";
    }
    const info = Settings.Profile.info(item);
    if (Settings.Profile.isCompatible(item[1], Platform.CURRENT)) {
      return formatProfileLong(info);
    }
    return "(Incompatible) " + formatProfileLong(info);
  }

  public override onChooseItem(
    entry: Settings.Profile.Entry | null,
    evt: KeyboardEvent | MouseEvent,
  ): void {
    const { context: plugin, cwd } = this;
    spawnTerminal(plugin, entry?.[1] ?? Settings.Profile.DEFAULTS[""], {
      cwd,
      edit: entry === null || evt.getModifierState("Control"),
    });
  }
}

export function spawnTerminal(
  context: TerminalPlugin,
  profile: Settings.Profile,
  options: {
    readonly cwd?: string | undefined;
    readonly edit?: boolean | undefined;
  } = {},
): void {
  const state: TerminalView.State = {
    cwd: options.cwd ?? null,
    focus: context.settings.value.focusOnNewInstance,
    profile,
    serial: null,
  };
  if (options.edit ?? false) {
    new EditTerminalModal(context, state, async (state2) =>
      TerminalView.spawn(context, state2),
    ).open();
    return;
  }
  (async (): Promise<void> => {
    try {
      await TerminalView.spawn(context, state);
    } catch (error) {
      self.console.error(error);
    }
  })();
}
