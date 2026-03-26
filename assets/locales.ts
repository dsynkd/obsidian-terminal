import {
  type AwaitResources,
  LibraryLocales,
  mergeResources,
} from "@polyipseity/obsidian-plugin-library";

export namespace PluginLocales {
  export const {
    DEFAULT_LANGUAGE,
    DEFAULT_NAMESPACE,
    FALLBACK_LANGUAGES,
    FORMATTERS,
    RETURN_NULL,
  } = LibraryLocales;
  export const RESOURCES = mergeResources(LibraryLocales.RESOURCES, {
    en: {
      [DEFAULT_NAMESPACE]: async () =>
        (await import("./locales/en/translation.json")).default,
      asset: async () => (await import("./locales/en/asset.json")).default,
    },
  });
  export type Resources = AwaitResources<
    typeof RESOURCES,
    typeof DEFAULT_LANGUAGE
  >;
  export type Namespaces = readonly ["translation", "asset"];
  export const NAMESPACES: Namespaces = ["translation", "asset"] as const;
  export type Languages = readonly ["en"];
  export const LANGUAGES: Languages = ["en"] as const;
}
