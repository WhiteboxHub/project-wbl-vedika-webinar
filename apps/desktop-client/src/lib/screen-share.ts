import { Room, Track } from 'livekit-client';

/**
 * Start screen sharing. Returns true if share started, false if user cancelled.
 */
export async function startScreenShare(room: Room): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return false;

    await room.localParticipant.publishTrack(videoTrack as any, {
      source: Track.Source.ScreenShare,
      simulcast: false,
    });

    // Browser stop button handler
    videoTrack.onended = () => { stopScreenShare(room).catch(() => {}); };
    return true;
  } catch (err: any) {
    if (err.name === 'NotAllowedError') return false;
    throw err;
  }
}

/**
 * Stop screen sharing.
 */
export async function stopScreenShare(room: Room): Promise<void> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  if (pub?.track) {
    await room.localParticipant.unpublishTrack(pub.track as any);
    pub.track.stop();
  }
  const audioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
  if (audioPub?.track) {
    await room.localParticipant.unpublishTrack(audioPub.track as any);
    audioPub.track.stop();
  }
}

export function isScreenSharing(room: Room): boolean {
  return !!room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
}
