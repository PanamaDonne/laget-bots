export type VoiceWorker = {
  transcribe(pcm: Buffer): Promise<string>;
  speak(text: string): Promise<Buffer>;
};

export class LoadedVoice {
  private worker: VoiceWorker | null = null;
  private readonly start: () => VoiceWorker;

  constructor(start: () => VoiceWorker) {
    this.start = start;
  }

  transcribe(pcm: Buffer): Promise<string> {
    return this.ensure().transcribe(pcm);
  }

  speak(text: string): Promise<Buffer> {
    return this.ensure().speak(text);
  }

  private ensure(): VoiceWorker {
    if (this.worker === null) {
      this.worker = this.start();
    }
    return this.worker;
  }
}
