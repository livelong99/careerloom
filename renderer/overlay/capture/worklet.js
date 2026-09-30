// Ported from Open-Cluely (owner's project), adapted for Careerloom: windows/assistant/pcm-capture-worklet.js
// Collects the mic stream into 2048-sample Float32 blocks and posts them to the page.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunkSize = 2048
    this.buffer = new Float32Array(this.chunkSize * 4)
    this.writeOffset = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel?.length) this.pushSamples(channel)
    return true
  }

  pushSamples(channelData) {
    let read = 0
    while (read < channelData.length) {
      const n = Math.min(this.buffer.length - this.writeOffset, channelData.length - read)
      this.buffer.set(channelData.subarray(read, read + n), this.writeOffset)
      this.writeOffset += n
      read += n
      while (this.writeOffset >= this.chunkSize) {
        this.port.postMessage(this.buffer.slice(0, this.chunkSize))
        const remaining = this.writeOffset - this.chunkSize
        if (remaining > 0) this.buffer.copyWithin(0, this.chunkSize, this.writeOffset)
        this.writeOffset = remaining
      }
    }
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor)
