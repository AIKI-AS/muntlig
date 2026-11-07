/** Shared by browser and server. No runtime imports. */

/** Hard limits for one student recording. The server enforces bytes; the browser enforces time. */
export const MAX_RECORDING_SECONDS = 90;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

/** 'mp3' is for playback in the browser, 'pcm' is raw 16-bit mono 24 kHz little-endian for LiveAvatar Lite. */
export type SpeakFormat = 'mp3' | 'pcm';

export type TranscribeResult = { text: string };

/** Session-scoped credentials. The permanent LiveAvatar key never leaves the server. */
export type AvatarCredentials = { sessionToken: string; avatarSessionId: string; handle: string };

export type AvatarRequest =
  | { action: 'start'; sessionId: string }
  | { action: 'stop'; sessionId: string; avatarSessionId: string; handle: string };
