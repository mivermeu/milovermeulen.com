let _ctx: AudioContext | undefined;
let _noiseBuffer: AudioBuffer | undefined;
let _warm = false;

function getCtx(): AudioContext {
    if (!_ctx) _ctx = new AudioContext({ latencyHint: 'interactive' });
    if (_ctx.state === 'suspended') {
        _ctx.onstatechange = () => {
            if (_ctx!.state === 'running') {
                _ctx!.onstatechange = null;
                scheduleWarmUp();
            }
        };
        _ctx.resume();
    } else {
        scheduleWarmUp();
    }
    return _ctx;
}

function scheduleWarmUp(): boolean {
    if (_warm) return false;
    _warm = true;
    const c = _ctx!;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.frequency.value = 1000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.001);
    osc.start(t);
    osc.stop(t + 0.001);
    return true;
}

export function attachAutoResume() {
    const handler = () => getCtx();
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, handler));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
}

export interface TickOptions {
    duration?: number;
    gain?: number;
    freq?: number;
}

export function playTick({ duration = 0.002, gain = 0.3, freq = 4200 }: TickOptions = {}) {
    const wasWarm = _warm;
    const audioCtx = getCtx();
    if (audioCtx.state !== 'running') return;
    if (!wasWarm && _warm) return;

    if (!_noiseBuffer) {
        _noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
        const data = _noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    const t = audioCtx.currentTime;
    const offset = Math.random() * (_noiseBuffer.duration - duration);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    g.connect(audioCtx.destination);

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + duration);

    const noise = audioCtx.createBufferSource();
    noise.buffer = _noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq;

    noise.connect(filter);
    filter.connect(g);
    noise.start(t, offset, duration);
    noise.stop(t + duration);
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.12) {
    const c = getCtx();
    if (c.state !== 'running') return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
}

export function playClick() {
    playTone(800, 0.04, 'square');
}

export function playChime() {
    playTone(1200, 0.08);
    playTone(1800, 0.08, 'sine', 0.06);
}
