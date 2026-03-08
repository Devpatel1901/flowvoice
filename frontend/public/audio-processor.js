class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(6000); // ~250ms at 24kHz
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset >= this._buffer.length) {
        this._flush();
      }
    }
    return true;
  }

  _flush() {
    const pcm16 = new Int16Array(this._offset);
    for (let i = 0; i < this._offset; i++) {
      const s = Math.max(-1, Math.min(1, this._buffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    this._buffer = new Float32Array(6000);
    this._offset = 0;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
