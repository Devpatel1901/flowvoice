class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // A simple ring buffer to handle slight network jitter
    // We expect 24kHz audio
    this.buffer = new Float32Array(48000); // 2 seconds max
    this.writeOffset = 0;
    this.readOffset = 0;
    this.bufferedItems = 0;

    // Receive ArrayBuffer (Int16 PCM) from the main thread
    this.port.onmessage = (event) => {
      if (event.data === "clear") {
        this.buffer.fill(0);
        this.writeOffset = 0;
        this.readOffset = 0;
        this.bufferedItems = 0;
        return;
      }
      const pcm16 = new Int16Array(event.data);
      for (let i = 0; i < pcm16.length; i++) {
        // Convert 16-bit PCM to Float32 (-1.0 to 1.0)
        let f = pcm16[i] / 32768.0;
        
        this.buffer[this.writeOffset] = f;
        this.writeOffset = (this.writeOffset + 1) % this.buffer.length;
        
        if (this.bufferedItems < this.buffer.length) {
          this.bufferedItems++;
        } else {
          // Buffer overflow, advance read pointer
          this.readOffset = (this.readOffset + 1) % this.buffer.length;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    
    const channel = output[0];
    
    for (let i = 0; i < channel.length; i++) {
      if (this.bufferedItems > 0) {
        channel[i] = this.buffer[this.readOffset];
        this.readOffset = (this.readOffset + 1) % this.buffer.length;
        this.bufferedItems--;
      } else {
        // Underflow: output silence
        channel[i] = 0;
      }
    }
    
    return true;
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);
