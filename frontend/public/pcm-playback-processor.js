/**
 * AudioWorklet processor that plays back 16-bit PCM received via port.postMessage.
 * Uses a ring buffer to absorb network jitter (up to 2 seconds at 24 kHz).
 */
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._capacity = 48000; // 2 seconds at 24 kHz
    this._buffer = new Float32Array(this._capacity);
    this._readPos = 0;
    this._writePos = 0;
    this._count = 0;

    this.port.onmessage = (event) => {
      const pcm16 = new Int16Array(event.data);
      for (let i = 0; i < pcm16.length; i++) {
        const s = pcm16[i];
        this._buffer[this._writePos] = s / (s < 0 ? 0x8000 : 0x7fff);
        this._writePos = (this._writePos + 1) % this._capacity;
        if (this._count < this._capacity) {
          this._count++;
        } else {
          // overflow — advance read pointer (drop oldest)
          this._readPos = (this._readPos + 1) % this._capacity;
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    for (let i = 0; i < output.length; i++) {
      if (this._count > 0) {
        output[i] = this._buffer[this._readPos];
        this._readPos = (this._readPos + 1) % this._capacity;
        this._count--;
      } else {
        output[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);
