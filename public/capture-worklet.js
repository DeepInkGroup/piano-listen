class PianoCapture extends AudioWorkletProcessor {
  constructor() { super(); this.remaining = sampleRate * 120; }
  process(inputs, outputs) {
    const input = inputs[0];
    if (input?.length && this.remaining > 0) {
      const mono = new Float32Array(Math.min(input[0].length, this.remaining));
      for (const channel of input) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / input.length;
      this.port.postMessage(mono, [mono.buffer]);
      this.remaining -= mono.length;
    }
    return true;
  }
}
registerProcessor('piano-capture', PianoCapture);
