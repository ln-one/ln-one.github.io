/**
 * The renderer bundle publishes a SharedArrayBuffer frame with a two-part
 * protocol: it reads the slot, writes all coordinates, increments the slot,
 * and sends the value observed before the increment with the message. Keeping
 * that ordering as a pure helper makes the race boundary explicit and
 * testable without starting a Worker.
 */
export function publishGraphViewSharedVersion(versionSlot: Uint32Array): number {
  const previousVersion = versionSlot[0] ?? 0;
  versionSlot[0] = (previousVersion + 1) >>> 0;
  return previousVersion;
}

/**
 * Read the version that was actually published into a shared position frame.
 *
 * The worker message contains the value observed before publishing. The
 * renderer must therefore use the trailing slot in the SharedArrayBuffer as
 * the authoritative frame identity, rather than treating the message token
 * as the frame version. This also makes duplicate messages harmless.
 */
export function readGraphViewSharedVersion(
  buffer: SharedArrayBuffer,
  lastConsumedVersion: number,
  messageVersion?: number
): number | null {
  if (buffer.byteLength < Uint32Array.BYTES_PER_ELEMENT) return null;
  const versionSlot = new Uint32Array(buffer, buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT, 1);
  const publishedVersion = versionSlot[0] ?? 0;
  if (publishedVersion === lastConsumedVersion) return null;
  // A message observed before the publish cannot represent a complete frame.
  // This branch is defensive for a host that delivers the message across a
  // shared-memory race; ordinary Worker delivery observes the increment.
  if (messageVersion !== undefined && publishedVersion === messageVersion >>> 0) return null;
  return publishedVersion;
}
