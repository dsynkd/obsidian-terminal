export const PROFILE_TYPE_NAMES: Record<string, string> = {
  "": "Empty",
  external: "External",
  integrated: "Integrated",
  invalid: "Invalid",
  select: "Select",
};

export const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Microsoft Windows",
};

export const RENDERER_NAMES: Record<string, string> = {
  canvas: "Canvas",
  dom: "DOM",
  webgl: "WebGL",
};

export const PROFILE_TYPE_ICONS: Record<string, string> = {
  "": "square",
  external: "terminal-square",
  integrated: "terminal",
  invalid: "x-circle",
  select: "text-cursor-input",
};

export const PLATFORM_ICONS: Record<string, string> = {
  darwin: "terminal:macos",
  linux: "terminal:linux",
  win32: "grid-2x2",
};

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function profileTypeName(type: string): string {
  return PROFILE_TYPE_NAMES[type] ?? type;
}

export function formatProfileShort(info: {
  nameOrID: string;
  profile: { type: string };
}): string {
  return `${capitalize(profileTypeName(info.profile.type))}: ${info.nameOrID}`;
}

export function formatProfileLong(info: {
  id: string;
  nameOrID: string;
  profile: { type: string };
}): string {
  return `${capitalize(profileTypeName(info.profile.type))}: ${info.nameOrID} (${info.id})`;
}

export function listDescription(count: number): string {
  if (count === 0) return "There are no items.";
  if (count === 1) return "There is 1 item.";
  return `There are ${count} items.`;
}
