import {
  NORMALIZED_LINE_FEED,
  normalizeText,
  writePromise as tWritePromise,
} from "./utils.js";
import {
  DEFAULT_ENCODING,
  DEFAULT_PYTHONIOENCODING,
  EXIT_SUCCESS,
  MAX_LOCK_PENDING,
  TERMINAL_EXIT_CLEANUP_WAIT,
  TERMINAL_RESIZER_WATCHDOG_WAIT,
  WINDOWS_CONHOST_PATH,
} from "../magic.js";
import {
  Platform,
  SI_PREFIX_SCALE,
  activeSelf,
  anyToError,
  clear,
  deepFreeze,
  deopaque,
  dynamicRequire,
  inSet,
  multireplace,
  notice2,
  printError,
  promisePromise,
  remove,
  sleep2,
  toJSONOrString,
  typedKeys,
} from "@polyipseity/obsidian-plugin-library";
import type { Terminal } from "@xterm/xterm";
import { isNil, noop } from "lodash-es";
import { spawnPromise, writePromise } from "../utils.js";

import AsyncLock from "async-lock";
import type { AsyncOrSync } from "ts-essentials";
import { BUNDLE } from "../import.js";
import { DisposerAddon } from "./emulator-addons.js";
import type { FileResult } from "tmp-promise";
import type { ChildProcessWithoutNullStreams as PipedChildProcess } from "node:child_process";
import type { TerminalPlugin } from "../main.js";
import ansi from "ansi-escape-sequences";
import unixPseudoterminalPy from "./unix_pseudoterminal.py";
import win32ResizerPy from "./win32_resizer.py";

const childProcess = dynamicRequire<typeof import("node:child_process")>(
    BUNDLE,
    "node:child_process",
  ),
  fsPromises = dynamicRequire<typeof import("node:fs/promises")>(
    BUNDLE,
    "node:fs/promises",
  ),
  process = dynamicRequire<typeof import("node:process")>(
    BUNDLE,
    "node:process",
  ),
  stream = dynamicRequire<typeof import("node:stream")>(BUNDLE, "node:stream"),
  tmpPromise = dynamicRequire<typeof import("tmp-promise")>(
    BUNDLE,
    "tmp-promise",
  );

async function clearTerminal(terminal: Terminal, keep = false): Promise<void> {
  const { rows } = terminal;
  await tWritePromise(
    terminal,
    `${
      keep ? NORMALIZED_LINE_FEED.repeat(Math.max(rows - 1, 0)) : ""
    }${ansi.erase.display(keep ? 2 : 3)}${ansi.cursor.position()}`,
  );
}

export interface Pseudoterminal {
  readonly shell?: Promise<PipedChildProcess> | undefined;
  readonly kill: () => AsyncOrSync<void>;
  readonly onExit: Promise<NodeJS.Signals | number>;
  readonly pipe: (terminal: Terminal) => AsyncOrSync<void>;
  readonly resize?: (columns: number, rows: number) => AsyncOrSync<void>;
}

export class RefPsuedoterminal<
  T extends Pseudoterminal,
> implements Pseudoterminal {
  public readonly onExit;
  protected readonly delegate: T;
  readonly #exit = promisePromise<NodeJS.Signals | number>();
  readonly #ref: [number];

  public constructor(delegate: RefPsuedoterminal<T> | T) {
    this.onExit = this.#exit.then(async ({ promise }) => promise);
    if (delegate instanceof RefPsuedoterminal) {
      this.delegate = delegate.delegate;
      this.#ref = delegate.#ref;
    } else {
      this.delegate = delegate;
      this.#ref = [0];
    }
    this.delegate.onExit.then(
      async (ret) => {
        (await this.#exit).resolve(ret);
      },
      async (error: unknown) => {
        (await this.#exit).reject(error);
      },
    );
    ++this.#ref[0];
  }

  public get shell(): Promise<PipedChildProcess> | undefined {
    return this.delegate.shell;
  }

  public dup(): RefPsuedoterminal<T> {
    return new RefPsuedoterminal(this);
  }

  public async kill(): Promise<void> {
    if (--this.#ref[0] <= 0) {
      await this.delegate.kill();
    } else {
      (await this.#exit).resolve(EXIT_SUCCESS);
    }
  }

  public pipe(terminal: Terminal): AsyncOrSync<void> {
    return this.delegate.pipe(terminal);
  }

  public resize(columns: number, rows: number): AsyncOrSync<void> {
    const { delegate } = this;
    return delegate.resize?.(columns, rows);
  }
}

abstract class PseudoPseudoterminal implements Pseudoterminal {
  public readonly onExit;
  protected readonly terminals: Terminal[] = [];
  protected exited = false;
  readonly #exit = promisePromise<NodeJS.Signals | number>();

  public constructor() {
    this.onExit = this.#exit
      .then(async ({ promise }) => promise)
      .finally(() => {
        this.exited = true;
      })
      .finally(() => {
        clear(this.terminals);
      });
  }

  public async kill(): Promise<void> {
    (await this.#exit).resolve(EXIT_SUCCESS);
  }

  public pipe(terminal: Terminal): AsyncOrSync<void> {
    if (this.exited) {
      throw new Error();
    }
    terminal.loadAddon(
      new DisposerAddon(() => {
        remove(this.terminals, terminal);
      }),
    );
    this.terminals.push(terminal);
  }
}

export class TextPseudoterminal
  extends PseudoPseudoterminal
  implements Pseudoterminal
{
  protected static readonly syncLock = "sync";
  protected readonly lock = new AsyncLock({ maxPending: MAX_LOCK_PENDING });
  #text: string;

  public constructor(text = "") {
    super();
    this.#text = text;
  }

  public get text(): string {
    return this.#text;
  }

  public set text(value: string) {
    this.rewrite(normalizeText((this.#text = value))).catch(
      (error: unknown) => {
        self.console.error(error);
      },
    );
  }

  public override async pipe(terminal: Terminal): Promise<void> {
    await super.pipe(terminal);
    await this.rewrite(normalizeText(this.text), [terminal]);
  }

  protected async rewrite(
    text: string,
    terminals: readonly Terminal[] = this.terminals,
  ): Promise<void> {
    const terminals0 = [...terminals];
    return new Promise((resolve, reject: (reason?: unknown) => void) => {
      this.lock
        .acquire(TextPseudoterminal.syncLock, async () => {
          const writers = terminals0.map(async (terminal) => {
            await clearTerminal(terminal);
            await tWritePromise(terminal, text);
          });
          resolve(Promise.all(writers).then(noop));
          await Promise.allSettled(writers);
        })
        .catch(reject);
    });
  }
}

export interface ShellPseudoterminalArguments {
  readonly executable: string;
  readonly cwd?: URL | string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly terminal?: string | undefined;
  readonly pythonExecutable?: string | undefined;
  readonly useWin32Conhost?: boolean | undefined;
}

class WindowsPseudoterminal implements Pseudoterminal {
  public readonly shell;
  public readonly conhost;
  public readonly onExit;
  protected readonly resizer;

  public constructor(
    protected readonly context: TerminalPlugin,
    {
      args,
      cwd,
      executable,
      useWin32Conhost,
      pythonExecutable,
    }: ShellPseudoterminalArguments,
  ) {
    this.conhost = useWin32Conhost ?? false;
    const { conhost } = this,
      resizerInitial = (async (): Promise<PipedChildProcess | null> => {
        if (isNil(pythonExecutable)) {
          return null;
        }
        const [childProcess2, process2, win32ResizerPy2] = await Promise.all([
            childProcess,
            process,
            win32ResizerPy,
          ]),
          ret = await spawnPromise(() =>
            childProcess2.spawn(pythonExecutable, ["-c", win32ResizerPy2], {
              env: {
                ...process2.env,

                PYTHONIOENCODING: DEFAULT_PYTHONIOENCODING,
              },
              stdio: ["pipe", "pipe", "pipe"],
              windowsHide: true,
            }),
          );
        try {
          ret
            .once("exit", (code, signal) => {
              if (code !== 0) {
                notice2(
                  () =>
                    `Terminal resizer exited unexpectedly: ${code ?? signal}`,
                  context?.settings.value.errorNoticeTimeout,
                  context,
                );
              }
            })
            .stderr.on("data", (chunk: Buffer | string) => {
              self.console.error(chunk.toString(DEFAULT_ENCODING));
            });
        } catch (error) {
          self.console.warn(error);
        }
        return ret;
      })(),
      shell = (async (): Promise<
        readonly [PipedChildProcess, FileResult, typeof resizerInitial]
      > => {
        const resizer = await resizerInitial.catch(() => null);
        try {
          const [childProcess2, fsPromises2, tmpPromise2] = await Promise.all([
              childProcess,
              fsPromises,
              tmpPromise,
            ]),
            inOutTmp = await tmpPromise2.file({
              discardDescriptor: true,
              postfix: ".bat",
            });
          try {
            /*
             * The command is written to a file because...
             * `conhost.exe` "helpfully" escapes the arguments.
             *
             * <https://github.com/microsoft/terminal/blob/cb48babe9dfee5c3e830644eb7ee48f4116d3c47/src/host/ConsoleArguments.cpp#L34>
             */
            const inOutTmpEsc = WindowsPseudoterminal.escapeArgumentForBat(
              inOutTmp.path,
            );
            /*
             * The last command is a one-liner to prevent
             * "Terminate batch job (Y/N)?" from terminating
             * writing the exit code.
             */
            await fsPromises2.writeFile(
              inOutTmp.path,
              `@echo off\r\nsetlocal EnableDelayedExpansion\r\nset q=\\"\r\n${[
                executable,
                ...(args ?? []),
              ]
                .map((arg) => WindowsPseudoterminal.escapeArgumentForBat(arg))
                .join(" ")} & echo !ERRORLEVEL! > ${inOutTmpEsc}`,
              { encoding: DEFAULT_ENCODING, flag: "w" },
            );
            const cmd = deepFreeze(
                conhost
                  ? [WINDOWS_CONHOST_PATH, inOutTmp.path]
                  : [inOutTmp.path],
              ),
              ret = await spawnPromise(() =>
                childProcess2.spawn(cmd[0], cmd.slice(1), {
                  cwd,
                  shell: !conhost,
                  stdio: ["pipe", "pipe", "pipe"],
                  windowsHide: !resizer,
                }),
              );
            return [
              ret,
              inOutTmp,
              resizerInitial
                .then(async (resizer0) => {
                  if (resizer0) {
                    try {
                      await writePromise(resizer0.stdin, `${ret.pid ?? -1}\n`);
                      const watchdog = self.setInterval(() => {
                        writePromise(resizer0.stdin, "\n").catch(
                          (error: unknown) => {
                            /* @__PURE__ */ self.console.debug(error);
                          },
                        );
                      }, TERMINAL_RESIZER_WATCHDOG_WAIT * SI_PREFIX_SCALE);
                      resizer0.once("exit", () => {
                        self.clearInterval(watchdog);
                      });
                    } catch (error) {
                      resizer0.kill();
                      throw error;
                    }
                  }
                  return resizer0;
                })
                .catch((error: unknown) => {
                  const error0 = anyToError(error);
                  printError(
                    error0,
                    () => "Error spawning terminal resizer",
                    context,
                  );
                  throw error0;
                }),
            ];
          } catch (error) {
            await inOutTmp.cleanup();
            throw error;
          }
        } catch (error) {
          resizer?.kill();
          throw error;
        }
      })();
    this.resizer = shell.then(async ([, , resizer]) => resizer);
    this.shell = shell.then(([shell0]) => shell0);
    this.onExit = shell.then(
      async ([shell0, inOutTmp]) =>
        new Promise<NodeJS.Signals | number>((resolve) => {
          shell0.once("exit", (conCode, signal) => {
            resolve(
              (async (): Promise<NodeJS.Signals | number> => {
                try {
                  const fsPromises2 = await fsPromises,
                    termCode = parseInt(
                      (
                        await fsPromises2.readFile(inOutTmp.path, {
                          encoding: DEFAULT_ENCODING,
                          flag: "r",
                        })
                      ).trim(),
                      10,
                    );
                  return isNaN(termCode)
                    ? (conCode ?? signal ?? NaN)
                    : termCode;
                } catch (error) {
                  /* @__PURE__ */ self.console.debug(error);
                  return conCode ?? signal ?? NaN;
                } finally {
                  (async (): Promise<void> => {
                    try {
                      await sleep2(self, TERMINAL_EXIT_CLEANUP_WAIT);
                      await inOutTmp.cleanup();
                    } catch (error) {
                      self.console.warn(error);
                    }
                  })();
                }
              })(),
            );
          });
        }),
    );
  }

  protected static escapeArgumentForBat(arg: string, quoteVar = "!q!"): string {
    return `"${multireplace(
      arg,
      new Map([
        ["^", "^^"],
        ["!", "^!"],
        ["%", "%%"],
        ['"', quoteVar],
      ]),
    )}"`;

    /*
     * Clusterfuck: <https://stackoverflow.com/a/31413730>
     *
     * 1. use `^` to escape `^` and `!`: <https://stackoverflow.com/a/5620353>
     * 2. use `%` to escape `%`: <https://stackoverflow.com/a/31413730>
     * 3. use `!q!` to replace `"`": <https://stackoverflow.com/a/31413730>
     * 4. enclose the argument in double quotes
     */
  }

  public async kill(): Promise<void> {
    if (!(await this.shell).kill()) {
      throw new Error("Error killing pseudoterminal");
    }
  }

  public async resize(columns: number, rows: number): Promise<void> {
    const { resizer } = this,
      resizer0 = await resizer;
    if (!resizer0) {
      throw new Error("Terminal resizer disabled");
    }
    await writePromise(resizer0.stdin, `${columns}x${rows}\n`);
  }

  public async pipe(terminal: Terminal): Promise<void> {
    let init = !this.conhost;
    const shell = await this.shell,
      reader = (chunk: Buffer | string): void => {
        if (!init) {
          init = true;
          return;
        }
        tWritePromise(terminal, chunk).catch((error: unknown) => {
          activeSelf(terminal.element).console.error(error);
        });
      };
    await clearTerminal(terminal, true);
    terminal.loadAddon(
      new DisposerAddon(
        () => {
          shell.stdout.removeListener("data", reader);
        },
        () => {
          shell.stderr.removeListener("data", reader);
        },
      ),
    );
    shell.stdout.on("data", reader);
    shell.stderr.on("data", reader);
    const writer = terminal.onData(async (data) =>
      writePromise(shell.stdin, data),
    );
    this.onExit
      .catch(noop satisfies () => unknown as () => unknown)
      .finally(() => {
        writer.dispose();
      });
  }
}

class UnixPseudoterminal implements Pseudoterminal {
  static readonly #cmdio = 3;
  public readonly shell;
  public readonly onExit;

  public constructor(
    protected readonly context: TerminalPlugin,
    {
      args,
      cwd,
      executable,
      terminal,
      pythonExecutable,
    }: ShellPseudoterminalArguments,
  ) {
    this.shell = spawnPromise(async () => {
      if (isNil(pythonExecutable)) {
        throw new Error("No Python to spawn Unix pseudoterminal");
      }
      const [childProcess2, process2, unixPseudoterminalPy2] =
          await Promise.all([childProcess, process, unixPseudoterminalPy]),
        env: NodeJS.ProcessEnv = {
          ...process2.env,

          PYTHONIOENCODING: DEFAULT_PYTHONIOENCODING,
        };
      if (!isNil(terminal)) {
        env["TERM"] = terminal;
      }
      return childProcess2.spawn(
        pythonExecutable,
        ["-c", unixPseudoterminalPy2, executable].concat(args ?? []),
        {
          cwd,
          env,
          stdio: ["pipe", "pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      );
    }).then((ret) => {
      try {
        ret.stderr.on("data", (chunk: Buffer | string) => {
          self.console.error(chunk.toString(DEFAULT_ENCODING));
        });
      } catch (error) {
        self.console.warn(error);
      }
      return ret;
    });
    this.onExit = this.shell.then(
      async (shell) =>
        new Promise<NodeJS.Signals | number>((resolve) => {
          shell.once("exit", (code, signal) => {
            resolve(code ?? signal ?? NaN);
          });
        }),
    );
  }

  public async kill(): Promise<void> {
    if (!(await this.shell).kill()) {
      throw new Error("Error killing pseudoterminal");
    }
  }

  public async pipe(terminal: Terminal): Promise<void> {
    const shell = await this.shell,
      reader = (chunk: Buffer | string): void => {
        tWritePromise(terminal, chunk).catch((error: unknown) => {
          activeSelf(terminal.element).console.error(error);
        });
      };
    await clearTerminal(terminal, true);
    terminal.loadAddon(
      new DisposerAddon(
        () => {
          shell.stdout.removeListener("data", reader);
        },
        () => {
          shell.stderr.removeListener("data", reader);
        },
      ),
    );
    shell.stdout.on("data", reader);
    shell.stderr.on("data", reader);
    const writer = terminal.onData(async (data) =>
      writePromise(shell.stdin, data),
    );
    this.onExit
      .catch(noop satisfies () => unknown as () => unknown)
      .finally(() => {
        writer.dispose();
      });
  }

  public async resize(columns: number, rows: number): Promise<void> {
    const [shell, stream2] = await Promise.all([this.shell, stream]),
      cmdio = shell.stdio[UnixPseudoterminal.#cmdio];
    if (!(cmdio instanceof stream2.Writable)) {
      throw new TypeError(toJSONOrString(cmdio));
    }
    await writePromise(cmdio, `${columns}x${rows}\n`);
  }
}

export namespace Pseudoterminal {
  export const PLATFORM_PSEUDOTERMINALS = deepFreeze({
    darwin: UnixPseudoterminal,
    linux: UnixPseudoterminal,
    win32: WindowsPseudoterminal,
  });
  export type SupportedPlatforms = readonly ["darwin", "linux", "win32"];
  export const SUPPORTED_PLATFORMS = typedKeys<SupportedPlatforms>()(
    PLATFORM_PSEUDOTERMINALS,
  );
  export const PLATFORM_PSEUDOTERMINAL = inSet(
    SUPPORTED_PLATFORMS,
    Platform.CURRENT,
  )
    ? PLATFORM_PSEUDOTERMINALS[deopaque(Platform.CURRENT)]
    : null;
}
