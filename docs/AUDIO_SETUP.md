# 🎧 Audio Feedback System

This document outlines the audio feedback system for the live transcription feature, including sound requirements, file specifications, and integration guidelines.

## 📂 Folder Structure

```
/assets
  /sounds
    transcription-activated.mp3
    transcription-deactivated.mp3
    recording-start.wav
    recording-stop.wav
    confirmation-beep.ogg
    alert-error.mp3
    alert-ring.wav
```

## 🎵 Required Sound Files

### Core Transcription Sounds

| Filename | Purpose | Duration | Specifications |
|----------|---------|----------|----------------|
| `transcription-activated.mp3` | Gentle rising tone when microphone permission is granted and pipeline is live | ≈ 0.3s | 300ms sine sweep (440 Hz → 880 Hz) |
| `transcription-deactivated.mp3` | Short descending tone when user stops transcription | ≈ 0.3s | 300ms sine sweep (880 Hz → 440 Hz) |

### Recording State Sounds

| Filename | Purpose | Duration | Specifications |
|----------|---------|----------|----------------|
| `recording-start.wav` | Subtle click with faint chime confirming AudioWorklet started | ≈ 0.25s | FM synthesis: C5 triangle wave |
| `recording-stop.wav` | Complementary click after audioProcessor.stop() | ≈ 0.2s | FM synthesis: G4 triangle wave, faster release |

### UI Feedback Sounds

| Filename | Purpose | Duration | Specifications |
|----------|---------|----------|----------------|
| `confirmation-beep.ogg` | Single mid-pitch beep for UI confirmations | ≈ 0.12s | 750 Hz square tone |
| `alert-error.mp3` | Soft, low-frequency buzzer for recoverable errors | ≈ 0.5s | Low-frequency buzz, -3 dB peak |
| `alert-ring.wav` | Optional looping ring for context switching | ≈ 2.0s | Modern ring tone, loopable |

## 🎚️ Technical Specifications

### Audio Format Requirements
- **Sample Rate**: 48 kHz (maximal browser compatibility)
- **Bit Depth**: 16-bit
- **Channels**: Mono
- **Loudness**: Normalized to -14 LUFS (unobtrusive)
- **File Formats**: Provide .mp3, .ogg, and .wav variants for browser compatibility

### Browser Compatibility
- **Safari**: Prefers .mp3 and .wav
- **Firefox**: Supports .ogg natively
- **Chrome/Edge**: Supports all formats

## 🛠️ Sound Generation Methods

### Option 1: Audacity (Free)
1. Generate → Tone → Sine wave
2. Set frequency and duration as specified
3. Effect → Normalize to -14 LUFS
4. Export in required formats

### Option 2: Tone.js (Programmatic)
```javascript
// Example for recording-start.wav
const synth = new Tone.FMSynth().toDestination();
synth.triggerAttackRelease('C5', '0.25s');
```

### Option 3: Free Sound Libraries
- **Freesound.org**: CC0 and permissive licenses
  - Example activation tone: ID #640301
  - Example error buzz: ID #276251
- **Mixkit.co**: Free UI sounds
  - Example beep: ID #1102
- **Chosic.com**: Royalty-free sound effects

## 📝 License & Attribution

### Self-Generated Sounds
- Sounds created with Audacity or Tone.js are copyright-free
- Document generation parameters for reproducibility

### Third-Party Sounds
- Check individual file licenses on download
- Maintain attribution list in `SOUND_CREDITS.md` if required
- Prefer CC0 (public domain) or permissive licenses

## 🔧 Integration with audioNotificationController.js

### Basic Usage
```javascript
import { playNotificationSound } from '../modules/audio/audioNotificationController.js';

// Success feedback
async function onActivationSuccess() {
  await playNotificationSound('activated');
  showActivationStatus('Transcription enabled!');
}

// Error feedback
async function onActivationError() {
  await playNotificationSound('error');
  showActivationStatus('Failed to activate transcription', 'error');
}
```

### Advanced Usage
```javascript
import { loadAudioAssets, playNotificationSound, setMasterVolume } from '../modules/audio/audioNotificationController.js';

// Preload all sounds on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadAudioAssets();
  console.log('All audio assets loaded');
});

// Volume control and sound sequences
// Set global volume
setMasterVolume(0.8);

// Play activation sequence manually
await playNotificationSound('chime');
setTimeout(async () => {
  await playNotificationSound('start');
  setTimeout(async () => {
    await playNotificationSound('activated');
  }, 300);
}, 100);
```

## 🎯 Implementation Checklist

- [ ] Create `assets/sounds/` directory
- [ ] Generate or source all 7 required sound files
- [ ] Test sound files in target browsers
- [ ] Implement audioNotificationController.js integration
- [ ] Add sound preloading to initialization
- [ ] Test audio permissions and fallbacks
- [ ] Document any third-party sound attributions
- [ ] Add volume controls to user settings

## ⚠️ Important Notes

1. **User Interaction Required**: Modern browsers require user interaction before playing audio
2. **Permission Handling**: Test audio playback capabilities before attempting to play sounds
3. **Fallback Strategy**: Provide visual feedback when audio fails
4. **Volume Control**: Allow users to disable or adjust audio feedback
5. **Accessibility**: Don't rely solely on audio for critical feedback

## 🧪 Testing Guidelines

### Browser Testing
- Test in Chrome, Firefox, Safari, and Edge
- Verify all file formats load correctly
- Test with user gesture requirements
- Validate on mobile devices

### Error Scenarios
- Test with audio disabled in browser
- Test with missing sound files
- Test with network connectivity issues
- Verify graceful degradation

### Performance Testing
- Monitor memory usage with preloaded sounds
- Test sound playback during heavy transcription load
- Verify no audio glitches or delays