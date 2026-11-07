/** Shared by browser and server. No runtime imports. */

/** Session-scoped Simli credentials. The permanent Simli API key never leaves the server. */
export type AvatarCredentials = { sessionToken: string };

export type AvatarRequest = { action: 'start'; sessionId: string };
