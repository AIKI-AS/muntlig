/** Shared by browser and server. No runtime imports. */

/** Session-scoped credentials. The permanent LiveAvatar key never leaves the server. */
export type AvatarCredentials = { sessionToken: string; avatarSessionId: string; handle: string };

export type AvatarRequest =
  | { action: 'start'; sessionId: string }
  | { action: 'stop'; sessionId: string; avatarSessionId: string; handle: string };
