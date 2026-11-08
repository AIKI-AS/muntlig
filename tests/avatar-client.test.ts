import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import type { AvatarCredentials } from '../src/features/media/types';

class Track {
  readyState = 'live';
  constructor(readonly kind: 'audio' | 'video') {}
  stop() { this.readyState = 'ended'; }
}

class Stream {
  constructor(private readonly tracks: Track[]) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
}

class Element {
  srcObject: Stream | null = null;
  muted = false;
  pause() {}
}

// Only the third-party SDK and browser boundary are doubled; the avatar lifecycle is real.
class Provider {
  static instances: Provider[] = [];
  resolveStart!: () => void;
  rejectStart!: (reason: Error) => void;
  readonly pending = new Promise<void>((resolve, reject) => {
    this.resolveStart = resolve;
    this.rejectStart = reject;
  });
  failStop = false;
  constructor() { Provider.instances.push(this); }
  on() {}
  start() { return this.pending; }
  stop() { return this.failStop ? Promise.reject(new Error('provider stop failed')) : Promise.resolve(); }
}

const sdkKey = Symbol.for('muntlig.avatar-client.test-sdk');
const replacements: PropertyDescriptorMap = {
  window: { value: { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }, configurable: true },
  MediaStream: { value: Stream, configurable: true },
  WebSocket: { value: class { constructor() { throw new Error('Network is disabled in this test'); } }, configurable: true },
  [sdkKey]: { value: Provider, configurable: true },
};
const original = new Map(Reflect.ownKeys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
Object.defineProperties(globalThis, replacements);
const sdkUrl = `data:text/javascript,${encodeURIComponent(`export const LogLevel = { CRITICAL: 4 }; export const SimliClient = globalThis[Symbol.for('muntlig.avatar-client.test-sdk')];`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'simli-client' ? { url: sdkUrl, shortCircuit: true } : nextResolve(specifier, context);
  },
});
const { SimliAvatar } = await import('../src/features/media/avatar-client');
hooks.deregister();
after(() => {
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const credentials: AvatarCredentials = { sessionToken: 'synthetic-session-token' };
function elements() {
  const video = new Element();
  const speaker = new Element();
  return { video, speaker, start: (signal?: AbortSignal) => SimliAvatar.start(credentials, video as unknown as HTMLVideoElement, speaker as unknown as HTMLAudioElement, signal) };
}
function attach(video: Element, speaker: Element) {
  const picture = new Track('video');
  const voice = new Track('audio');
  video.srcObject = new Stream([picture]);
  speaker.srcObject = new Stream([voice]);
  return { picture, voice, videoStream: video.srcObject, audioStream: speaker.srcObject };
}

test('a cancelled start settling after retry cannot release the newer avatar tracks', async () => {
  const { video, speaker, start } = elements();
  const controller = new AbortController();
  const pending = start(controller.signal);
  const oldProvider = Provider.instances.at(-1);
  assert.ok(oldProvider);
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await cancelled;

  const next = start();
  const newProvider = Provider.instances.at(-1);
  assert.ok(newProvider);
  const active = attach(video, speaker);
  newProvider.resolveStart();
  const avatar = await next;
  try {
    oldProvider.rejectStart(new Error('cancelled SDK retry settled late'));
    await setImmediate();
    assert.equal(video.srcObject, active.videoStream, 'the active picture must stay attached');
    assert.equal(speaker.srcObject, active.audioStream, 'the active voice must stay attached');
    assert.equal(active.picture.readyState, 'live');
    assert.equal(active.voice.readyState, 'live');
  } finally {
    await avatar.stop();
  }
});

test('late tracks are still released after cancellation when no newer avatar owns the elements', async () => {
  const { video, speaker, start } = elements();
  const controller = new AbortController();
  const pending = start(controller.signal);
  const provider = Provider.instances.at(-1);
  assert.ok(provider);
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await cancelled;

  const late = attach(video, speaker);
  provider.failStop = true;
  provider.resolveStart();
  await setImmediate();
  assert.equal(late.picture.readyState, 'ended');
  assert.equal(late.voice.readyState, 'ended');
  assert.equal(video.srcObject, null);
  assert.equal(speaker.srcObject, null);
});
