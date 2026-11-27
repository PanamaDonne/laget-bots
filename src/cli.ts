export type RadioArgs = {
  liveChoice: boolean;
  audioDevice: string | null;
};

export function parseRadioArgs(argv: readonly string[]): RadioArgs {
  let liveChoice = false;
  let audioDevice: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") {
      liveChoice = true;
      continue;
    }
    if (arg === "--audio-device") {
      const device = argv[index + 1];
      if (device === undefined || device.startsWith("-")) {
        throw new Error("Ljudenheten saknas.");
      }
      audioDevice = device;
      index += 1;
    }
  }
  return { liveChoice, audioDevice };
}
