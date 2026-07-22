// Web Audio API Synthesizer for HBD Fai Puzzle Game
class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmNode = null;
    this.chordNode = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;

    // Happy Birthday Melody in C Major
    // Format: [midiNote, durationInBeats] (Quarter note = 1 beat, waltz 3/4 time)
    // Tempo: 110 BPM
    this.tempo = 115;
    this.beatDuration = 60 / this.tempo; // Duration of 1 beat in seconds

    this.melody = [
      // Hap-py Birth-day to you
      [60, 0.75], [60, 0.25], [62, 1.0], [60, 1.0], [65, 1.0], [64, 2.0],
      // Hap-py Birth-day to you
      [60, 0.75], [60, 0.25], [62, 1.0], [60, 1.0], [67, 1.0], [65, 2.0],
      // Hap-py Birth-day dear Fai
      [60, 0.75], [60, 0.25], [72, 1.0], [69, 1.0], [65, 1.0], [64, 1.0], [62, 2.0],
      // Hap-py Birth-day to you
      [70, 0.75], [70, 0.25], [69, 1.0], [65, 1.0], [67, 1.0], [65, 2.0],
      // Rest/Pause
      [0, 2.0]
    ];

    // Chords accompanying each bar of waltz (3 beats per bar)
    // Format: [chordNotesArray, barIndex]
    this.chords = [
      [[48, 55, 60], 0], // C major (C3, G3, C4) - Hap-py Birth-day
      [[48, 55, 60], 1], // to you (G-chord target, but starts C)
      [[43, 50, 55], 2], // G major (G2, D3, G3)
      [[43, 50, 55], 3], // Hap-py Birth-day
      [[43, 50, 55], 4], // to you
      [[48, 55, 60], 5], // C major
      [[48, 55, 60], 6], // Hap-py Birth-day
      [[53, 57, 60], 7], // F major (F3, A3, C4)
      [[53, 57, 60], 8], // dear Fai
      [[48, 55, 60], 9], // C major
      [[43, 50, 55], 10], // G major
      [[48, 55, 60], 11], // C major
      [[48, 55, 60], 12]  // Pause
    ];

    this.currentNoteIndex = 0;
    this.currentChordIndex = 0;
    this.nextNoteTime = 0;
    this.nextChordTime = 0;
    this.schedulerTimerId = null;
  }

  // Initialize the audio context (must be called after user interaction)
  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Setup routing: Master Gain -> Destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // BGM volume channel
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    // SFX volume channel
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
  }

  // Start playing BGM
  startBGM() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.bgmPlaying) return;

    this.bgmPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.nextChordTime = this.ctx.currentTime + 0.1;
    this.currentNoteIndex = 0;
    this.currentChordIndex = 0;

    this.schedulerLoop();
  }

  // Stop BGM
  stopBGM() {
    this.bgmPlaying = false;
    if (this.schedulerTimerId) {
      clearTimeout(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  // Convert MIDI note to Frequency
  midiToFreq(midi) {
    if (midi <= 0) return 0;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // The scheduler loop to schedule notes in advance (standard Web Audio pattern)
  schedulerLoop() {
    if (!this.bgmPlaying) return;

    const scheduleAheadTime = 0.2; // How far ahead to schedule audio (seconds)
    const currentTime = this.ctx.currentTime;

    // Schedule Melody
    while (this.nextNoteTime < currentTime + scheduleAheadTime) {
      const [midi, durationBeats] = this.melody[this.currentNoteIndex];
      const durationSeconds = durationBeats * this.beatDuration;

      if (midi > 0) {
        this.playMelodyNote(midi, this.nextNoteTime, durationSeconds);
      }

      this.nextNoteTime += durationSeconds;
      this.currentNoteIndex = (this.currentNoteIndex + 1) % this.melody.length;
    }

    // Schedule Chords (one chord every 3 beats, i.e., 1 bar of waltz)
    while (this.nextChordTime < currentTime + scheduleAheadTime) {
      const [notes] = this.chords[this.currentChordIndex];
      const durationSeconds = 3 * this.beatDuration; // 3 beats per bar

      this.playChord(notes, this.nextChordTime, durationSeconds);

      this.nextChordTime += durationSeconds;
      this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;
    }

    // Call scheduler again in 50ms
    this.schedulerTimerId = setTimeout(() => this.schedulerLoop(), 50);
  }

  // Synthesize a single melody note (Celesta/Music Box tone)
  playMelodyNote(midi, time, duration) {
    const freq = this.midiToFreq(midi);
    if (freq === 0) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    // Sine for fundamental warm tone
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);

    // Triangle for gentle harmonic chime
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, time); // Octave harmonic

    gainNode.gain.setValueAtTime(0, time);
    // Fast attack
    gainNode.gain.linearRampToValueAtTime(0.18, time + 0.02);
    // Smooth decay/release
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.05);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(this.bgmGain);

    osc1.start(time);
    osc2.start(time);

    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }

  // Synthesize a soft backing chord (glowing synth pad)
  playChord(notes, time, duration) {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.08, time + 0.5); // Slow attack for ambient pad
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.1);

    const oscillators = [];

    notes.forEach(midi => {
      const freq = this.midiToFreq(midi);
      if (freq === 0) return;

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      // Add very gentle detuning to make it sound richer
      osc.detune.setValueAtTime((Math.random() - 0.5) * 10, time);

      osc.connect(gainNode);
      osc.start(time);
      osc.stop(time + duration);
      oscillators.push(osc);
    });

    gainNode.connect(this.bgmGain);
  }

  // --- Sound Effects (SFX) ---

  // Select piece: soft chime
  playClick() {
    if (this.isMuted || !this.ctx) return;
    const time = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, time); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, time + 0.05); // Sweep up

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(time);
    osc.stop(time + 0.2);
  }

  // Correct placement: magic success chime
  playSuccess() {
    if (this.isMuted || !this.ctx) return;
    const time = this.ctx.currentTime;
    
    // Play a fast, uplifting arpeggio: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    notes.forEach((freq, index) => {
      const noteTime = time + index * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);
      
      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.25, noteTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.5);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(noteTime);
      osc.stop(noteTime + 0.6);
    });
  }

  // Incorrect placement: soft error thud
  playError() {
    if (this.isMuted || !this.ctx) return;
    const time = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.linearRampToValueAtTime(80, time + 0.25); // Sweep down
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.4, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(time);
    osc.stop(time + 0.35);
  }

  // Stage clear: triumphant brass/pad swell
  playStageClear() {
    if (this.isMuted || !this.ctx) return;
    const time = this.ctx.currentTime;
    
    // Play a lush, open chord (F major / C major mix)
    const chordFreqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5
    
    chordFreqs.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      // Slight delay for harp-like strum effect
      const noteTime = time + index * 0.04;
      
      osc.frequency.setValueAtTime(freq, noteTime);
      
      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.15, noteTime + 0.2); // Slower attack
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 1.8);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(noteTime);
      osc.stop(noteTime + 2.0);
    });
  }

  // Toggle Mute
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.6, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

export const audio = new AudioManager();
