import { PolyphonicDetector, NoteTracker } from './detector.js';
let detector;
self.onmessage = ({ data }) => {
  if (data.type === 'init') { detector = new PolyphonicDetector(data.sampleRate); return; }
  if (data.type === 'frame') {
    const result = detector.detect(data.samples, data.sensitivity);
    self.postMessage({ type: 'frame', ...result, time: data.time });
  }
  if (data.type === 'analyze') {
    const d = new PolyphonicDetector(data.sampleRate), tracker = new NoteTracker();
    const step = Math.round(data.sampleRate * 0.075);
    for (let at = 0; at < data.samples.length; at += step) {
      const window = new Float32Array(d.size);
      const end = Math.min(data.samples.length, at + d.size);
      window.set(data.samples.subarray(at, end));
      const result = d.detect(window, data.sensitivity);
      tracker.update(result.notes, (at + d.size / 2) / data.sampleRate);
      if (at % (step * 12) === 0) self.postMessage({ type: 'progress', progress: at / data.samples.length });
    }
    self.postMessage({ type: 'complete', notes: tracker.stop(data.samples.length / data.sampleRate).filter(n => n.start < data.samples.length / data.sampleRate).map(n => ({ ...n, duration: Math.min(n.duration, data.samples.length / data.sampleRate - n.start) })) });
  }
};
