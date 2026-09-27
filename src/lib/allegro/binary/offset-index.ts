type OffsetBucket = {
  recordIds: Uint32Array;
  byteOffsets: Uint32Array | Float64Array;
  entryCount: number;
};

type DuplicatePolicy = "preserve" | "replace";

const MAX_UINT32 = 0xffffffff;
const BUCKET_INDEX_BITS = 8;
const BUCKET_COUNT = 1 << BUCKET_INDEX_BITS;
const BUCKET_INDEX_MASK = BUCKET_COUNT - 1;
const INITIAL_BUCKET_CAPACITY = 32;
const MAX_BUCKET_LOAD = 0.75;

/**
 * Record ID → byte offset index without decoded-record caching.
 *
 * Growth rehashes only one of 256 buckets, avoiding a full-index rebuild
 * during the parser's synchronous insertion step. IDs retain all 32 bits,
 * including high-bit legacy pointers. Offsets wider than uint32 promote
 * only their bucket to Float64 storage, preserving safe-integer precision.
 */
export class OffsetIndex {
  private readonly buckets: (OffsetBucket | undefined)[] = new Array(
    BUCKET_COUNT,
  );
  // Zero marks an empty hash slot, so record ID zero needs separate storage.
  private zeroRecordOffset: number | undefined;
  private entryCount = 0;

  get size(): number {
    return this.entryCount;
  }

  /** Allocated typed-array bytes; excludes object overhead and the zero-ID entry. */
  get storageBytes(): number {
    return this.buckets.reduce(
      (totalBytes, bucket) =>
        totalBytes +
        (bucket
          ? bucket.recordIds.byteLength + bucket.byteOffsets.byteLength
          : 0),
      0,
    );
  }

  get(recordId: number): number | undefined {
    // Unresolved source links can be undefined. They must not alias ID zero.
    if (!isValidRecordId(recordId)) return undefined;
    if (recordId === 0) return this.zeroRecordOffset;

    const recordHash = hashRecordId(recordId);
    const bucket = this.buckets[recordHash & BUCKET_INDEX_MASK];
    if (!bucket) return undefined;

    const slotIndex = findRecordSlot(bucket.recordIds, recordId, recordHash);
    return bucket.recordIds[slotIndex] === recordId
      ? bucket.byteOffsets[slotIndex]
      : undefined;
  }

  has(recordId: number): boolean {
    return this.get(recordId) !== undefined;
  }

  /** Returns false for a duplicate, preserving its original byte offset. */
  add(recordId: number, byteOffset: number): boolean {
    return this.insert(recordId, byteOffset, "preserve");
  }

  /** Inserts or replaces a byte offset and returns this index for chaining. */
  set(recordId: number, byteOffset: number): this {
    this.insert(recordId, byteOffset, "replace");
    return this;
  }

  private insert(
    recordId: number,
    byteOffset: number,
    duplicatePolicy: DuplicatePolicy,
  ): boolean {
    if (!isValidRecordId(recordId)) throw new Error("Invalid uint32 record ID");
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0)
      throw new Error("Invalid record offset");
    if (recordId === 0)
      return this.insertZeroRecord(byteOffset, duplicatePolicy);

    const recordHash = hashRecordId(recordId);
    const bucketIndex = recordHash & BUCKET_INDEX_MASK;
    let bucket = this.buckets[bucketIndex];
    if (!bucket) {
      bucket = {
        recordIds: new Uint32Array(INITIAL_BUCKET_CAPACITY),
        byteOffsets: new Uint32Array(INITIAL_BUCKET_CAPACITY),
        entryCount: 0,
      };
      this.buckets[bucketIndex] = bucket;
    }

    let slotIndex = findRecordSlot(bucket.recordIds, recordId, recordHash);
    if (bucket.recordIds[slotIndex] === recordId) {
      if (duplicatePolicy === "replace")
        storeByteOffset(bucket, slotIndex, byteOffset);
      return false;
    }

    if (bucket.entryCount >= bucket.recordIds.length * MAX_BUCKET_LOAD) {
      bucket = growBucket(bucket);
      this.buckets[bucketIndex] = bucket;
      slotIndex = findRecordSlot(bucket.recordIds, recordId, recordHash);
    }
    bucket.recordIds[slotIndex] = recordId;
    storeByteOffset(bucket, slotIndex, byteOffset);
    bucket.entryCount++;
    this.entryCount++;
    return true;
  }

  private insertZeroRecord(
    byteOffset: number,
    duplicatePolicy: DuplicatePolicy,
  ): boolean {
    const isNewRecord = this.zeroRecordOffset === undefined;
    if (isNewRecord) this.entryCount++;
    if (isNewRecord || duplicatePolicy === "replace")
      this.zeroRecordOffset = byteOffset;
    return isNewRecord;
  }
}

function isValidRecordId(recordId: number): boolean {
  return Number.isInteger(recordId) && recordId >= 0 && recordId <= MAX_UINT32;
}

/** Mix sequential IDs and aligned legacy pointers across buckets and slots. */
function hashRecordId(recordId: number): number {
  let recordHash = Math.imul(recordId ^ (recordId >>> 16), 0x45d9f3b);
  recordHash = Math.imul(recordHash ^ (recordHash >>> 16), 0x45d9f3b);
  return (recordHash ^ (recordHash >>> 16)) >>> 0;
}

/** Finds the matching ID or the first empty slot by linear probing. */
function findRecordSlot(
  recordIds: Uint32Array,
  recordId: number,
  recordHash: number,
): number {
  const slotMask = recordIds.length - 1;
  // Low hash bits select the bucket; remaining bits select its initial slot.
  let slotIndex = (recordHash >>> BUCKET_INDEX_BITS) & slotMask;
  // Capacity is a power of two, so masking wraps at the end of the array.
  // The load limit guarantees an empty slot for an ID that is not present.
  while (recordIds[slotIndex] !== 0 && recordIds[slotIndex] !== recordId) {
    slotIndex = (slotIndex + 1) & slotMask;
  }
  return slotIndex;
}

function growBucket(previousBucket: OffsetBucket): OffsetBucket {
  const nextCapacity = previousBucket.recordIds.length * 2;
  const expandedBucket: OffsetBucket = {
    recordIds: new Uint32Array(nextCapacity),
    byteOffsets:
      previousBucket.byteOffsets instanceof Uint32Array
        ? new Uint32Array(nextCapacity)
        : new Float64Array(nextCapacity),
    entryCount: previousBucket.entryCount,
  };
  // Doubling capacity changes the slot mask, so every occupied slot is rehashed.
  for (
    let sourceSlot = 0;
    sourceSlot < previousBucket.recordIds.length;
    sourceSlot++
  ) {
    const recordId = previousBucket.recordIds[sourceSlot];
    if (recordId === 0) continue;
    const targetSlot = findRecordSlot(
      expandedBucket.recordIds,
      recordId,
      hashRecordId(recordId),
    );
    expandedBucket.recordIds[targetSlot] = recordId;
    expandedBucket.byteOffsets[targetSlot] =
      previousBucket.byteOffsets[sourceSlot];
  }
  return expandedBucket;
}

function storeByteOffset(
  bucket: OffsetBucket,
  slotIndex: number,
  byteOffset: number,
): void {
  if (byteOffset > MAX_UINT32 && bucket.byteOffsets instanceof Uint32Array) {
    bucket.byteOffsets = new Float64Array(bucket.byteOffsets);
  }
  bucket.byteOffsets[slotIndex] = byteOffset;
}
