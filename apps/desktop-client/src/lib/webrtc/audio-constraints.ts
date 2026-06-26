/** Production-grade microphone capture constraints for WebRTC getUserMedia. */
export const AUDIO_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 2,
  sampleRate: 48000,
  sampleSize: 16,
};

/** LiveKit setMicrophoneEnabled options (matches audioCaptureDefaults). */
export const LIVEKIT_MIC_OPTIONS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 2,
} as const;
