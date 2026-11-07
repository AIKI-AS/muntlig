import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarAudioStream } from '../src/features/media/avatar-audio';

type Event = Buffer | 'clear';

function bridge() {
  const events: Event[] = [];
  const stream = new AvatarAudioStream({
    send: (pcm) => events.push(Buffer.from(pcm)),
    clear: () => events.push('clear'),
  });
  return { stream, events };
}

const base64 = (samples: ArrayLike<number>) => {
  const bytes = Buffer.alloc(samples.length * 2);
  for (let at = 0; at < samples.length; at++) bytes.writeInt16LE(samples[at], at * 2);
  return bytes.toString('base64');
};

const packets = (events: Event[]) => events.filter((event): event is Buffer => event !== 'clear');
const joined = (events: Event[]) => Buffer.concat(packets(events));
const read = (bytes: Buffer) => Array.from({ length: bytes.length / 2 }, (_, at) => bytes.readInt16LE(at * 2));

function noise(length: number, seed = 7) {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fff_ffff;
    return (state % 20_001) - 10_000;
  });
}

/** Feeds one speech turn in the given chunk sizes (cycled) and returns every 16 kHz packet that was sent. */
function speak(samples: number[], chunkSizes: number[]) {
  const { stream, events } = bridge();
  for (let at = 0, index = 0; at < samples.length; index++) {
    const size = chunkSizes[index % chunkSizes.length];
    stream.append(base64(samples.slice(at, at + size)));
    at += size;
  }
  stream.end();
  return events;
}

test('a 24 kHz tone arrives as the same tone at 16 kHz with the same duration', () => {
  const input = Array.from({ length: 2_400 }, (_, at) => Math.round(10_000 * Math.sin((2 * Math.PI * 1_000 * at) / 24_000)));
  const output = read(joined(speak(input, [2_400])));
  assert.equal(output.length, 1_600, '100 ms in must be 100 ms out');
  for (let at = 40; at < output.length - 40; at++) {
    const expected = 10_000 * Math.sin((2 * Math.PI * 1_000 * at) / 16_000);
    assert.ok(Math.abs(output[at] - expected) < 100, `sample ${at}: ${output[at]} vs ${expected.toFixed(1)}`);
  }
});

test('chunk boundaries never change, drop or repeat a sample', () => {
  const input = noise(5_000);
  const whole = joined(speak(input, [input.length]));
  assert.equal(whole.length / 2, Math.ceil((input.length * 2) / 3));
  for (const sizes of [[1], [2], [3], [7, 1, 100], [1_023], [4_800], [2, 4_999, 1, 3]]) {
    assert.deepEqual(joined(speak(input, sizes)), whole, `chunks ${sizes.join(',')}`);
  }
});

test('every packet is whole PCM16 samples within Simli\'s recommended chunk size', () => {
  const sent = packets(speak(noise(40_000), [9_600]));
  assert.ok(sent.length > 1);
  for (const packet of sent) {
    assert.ok(packet.length > 0 && packet.length % 2 === 0 && packet.length <= 6_000, `packet of ${packet.length} bytes`);
  }
});

test('a short final tail is flushed when the turn ends', () => {
  for (const length of [1, 2, 3, 5, 7]) {
    const { stream, events } = bridge();
    stream.append(base64(Array.from({ length }, () => 20_000)));
    stream.end();
    assert.equal(joined(events).length / 2, Math.ceil((length * 2) / 3), `${length} samples in`);
  }
  const single = read(joined(speak([20_000], [1])));
  assert.ok(single[0] > 5_000, 'the only sample must be audible, not dropped');
});

test('ending a turn twice sends nothing more and the next turn starts clean', () => {
  const input = noise(1_000);
  const { stream, events } = bridge();
  stream.append(base64(input));
  stream.end();
  const first = joined(events);
  const sentBefore = events.length;
  stream.end();
  assert.equal(events.length, sentBefore);
  stream.append(base64(input));
  stream.end();
  assert.deepEqual(joined(events), Buffer.concat([first, first]));
});

test('barge-in clears the provider buffer, drops only unsent old speech and leaves the next turn untouched', () => {
  const old = noise(4_000, 1);
  const next = noise(2_500, 2);
  const { stream, events } = bridge();
  stream.append(base64(old));
  const alreadySent = events.length;
  assert.ok(alreadySent > 0, 'speech is forwarded while it streams, not held until the turn ends');
  stream.interrupt();
  stream.end();
  assert.deepEqual(events.slice(alreadySent), ['clear'], 'an interrupted turn has no tail to flush');
  stream.append(base64(next));
  stream.end();
  const afterClear = Buffer.concat(packets(events.slice(alreadySent + 1)));
  assert.deepEqual(afterClear, joined(speak(next, [next.length])), 'the next turn must be what it would have been alone');
});

test('interrupting with nothing pending still clears audio the provider has queued', () => {
  const { stream, events } = bridge();
  stream.interrupt();
  assert.deepEqual(events, ['clear']);
});

test('odd byte counts are rejected without disturbing the stream', () => {
  const input = noise(900, 3);
  const { stream, events } = bridge();
  stream.append(base64(input.slice(0, 400)));
  assert.throws(() => stream.append(Buffer.from([1, 2, 3]).toString('base64')), /PCM16/);
  stream.append(base64(input.slice(400)));
  stream.end();
  assert.deepEqual(joined(events), joined(speak(input, [input.length])));
  const quiet = bridge();
  quiet.stream.append('');
  assert.equal(quiet.events.length, 0);
});
