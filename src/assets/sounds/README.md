# Audio Files Directory

This directory contains the audio feedback files for the live transcription system.

## 🔊 Required Files

The following audio files need to be added to this directory:

- `transcription-activated.mp3` - Rising tone (440Hz → 880Hz, 0.3s)
- `transcription-deactivated.mp3` - Descending tone (880Hz → 440Hz, 0.3s)  
- `recording-start.wav` - Subtle click/chime (C5 triangle, 0.25s)
- `recording-stop.wav` - Complementary click (G4 triangle, 0.2s)
- `confirmation-beep.ogg` - UI confirmation beep (750Hz square, 0.12s)
- `alert-error.mp3` - Error buzz (low frequency, 0.5s)
- `alert-ring.wav` - Looping ring tone (2.0s)

## 📋 File Specifications

- **Format**: Mono, 48kHz, 16-bit
- **Loudness**: -14 LUFS normalized
- **Browser Support**: Provide .mp3, .ogg, .wav variants

## 🎵 Sources

1. **Generate with Audacity**: Use Generate → Tone for sine/square waves
2. **Download from Freesound**: CC0 licensed sounds
3. **Use Tone.js**: Programmatically generate FM synthesis sounds

See `AUDIO_SETUP.md` in the project root for detailed generation instructions.

## ⚠️ Note

The audio files are not included in the repository due to size constraints. 
Generate or source them using the specifications in `AUDIO_SETUP.md`.