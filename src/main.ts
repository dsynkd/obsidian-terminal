import { type App, Plugin, type PluginManifest } from "obsidian";
import { loadPatch } from "./patch.js";
import {
  LanguageManager,
  type PluginContext,
  SI_PREFIX_SCALE,
  type SemVerString,
  SettingsManager,
  StatusBarHider,
  StorageSettingsManager,
  createI18n,
  semVerString,
} from "@polyipseity/obsidian-plugin-library";
import { LocalSettings, Settings } from "./settings-data.js";
import { PLUGIN_UNLOAD_DELAY } from "./magic.js";
import { PluginLocales } from "../assets/locales.js";
import { loadIcons } from "./icons.js";
import { loadSettings } from "./settings.js";
import { loadTerminal } from "./terminal/load.js";

export class TerminalPlugin
  extends Plugin
  implements PluginContext<Settings, LocalSettings>
{
  public readonly version: SemVerString | null;
  public readonly language: LanguageManager;
  public readonly localSettings: StorageSettingsManager<LocalSettings>;
  public readonly settings: SettingsManager<Settings>;
  public readonly statusBarHider = new StatusBarHider(this);

  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    try {
      this.version = semVerString(manifest.version);
    } catch (error) {
      self.console.warn(error);
      this.version = null;
    }
    this.language = new LanguageManager(this, async () =>
      createI18n(PluginLocales.RESOURCES, PluginLocales.FORMATTERS, {
        defaultNS: PluginLocales.DEFAULT_NAMESPACE,
        fallbackLng: PluginLocales.FALLBACK_LANGUAGES,
        returnNull: PluginLocales.RETURN_NULL,
      }),
    );
    this.localSettings = new StorageSettingsManager(this, LocalSettings.fix);
    this.settings = new SettingsManager(this, Settings.fix);
  }

  public displayName(): string {
    return "Terminal";
  }

  public override onload(): void {
    (async (): Promise<void> => {
      try {
        await this.loadData();
        const { language, localSettings, settings, statusBarHider } = this,
          earlyChildren = [language, localSettings, settings],
          children = [statusBarHider];
        for (const child of earlyChildren) {
          child.unload();
        }
        for (const child of earlyChildren) {
          // Delay unloading since there are unload tasks that cannot be awaited
          this.register(() => {
            const id = self.setTimeout(() => {
              child.unload();
            }, PLUGIN_UNLOAD_DELAY * SI_PREFIX_SCALE);
            child.register(() => {
              self.clearTimeout(id);
            });
          });
          child.load();
        }
        await Promise.all(earlyChildren.map(async (child) => child.onLoaded));
        for (const child of children) {
          this.addChild(child);
        }
        await Promise.all([
          Promise.resolve().then(() => {
            loadPatch(this);
          }),
          Promise.resolve().then(() => {
            loadIcons(this);
          }),
          Promise.resolve().then(() => {
            loadSettings(this);
          }),
          Promise.resolve().then(() => {
            loadTerminal(this);
          }),
          Promise.resolve().then(() => {
            this.register(
              settings.onMutate(
                (settings0) => settings0.hideStatusBar,
                () => {
                  statusBarHider.update();
                },
              ),
            );
            statusBarHider.hide(
              () => settings.value.hideStatusBar === "always",
            );
          }),
        ]);
      } catch (error) {
        self.console.error(error);
      }
    })();
  }
}
// Needed for loading
export default TerminalPlugin;
