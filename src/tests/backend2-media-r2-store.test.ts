import { afterEach, describe, expect, it } from 'vitest'
import { createR2BindingStore, type R2BucketBinding } from '#/backend2/media/store.r2-binding'

/**
 * R2 on a Worker refuses a stream of unknown length, and an upload is exactly
 * that — so every image copied from the old site failed on the preview. This
 * bucket refuses the same way: a plain stream is rejected, only a
 * FixedLengthStream's readable side or bytes are accepted.
 */

const fixedReadables = new WeakSet<ReadableStream>()

class FakeFixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(length: number) {
    let seen = 0
    super({
      transform(chunk, controller) {
        seen += chunk.byteLength
        controller.enqueue(chunk)
      },
      flush() {
        if (seen !== length) throw new Error('FixedLengthStream did not see all expected bytes')
      },
    })
    fixedReadables.add(this.readable)
  }
}

const strictBucket = () => {
  const stored = new Map<string, Uint8Array>()
  const bucket: R2BucketBinding = {
    async put(key, value) {
      if (value instanceof ReadableStream) {
        if (!fixedReadables.has(value)) throw new TypeError('Provided readable stream must have a known length')
        stored.set(key, new Uint8Array(await new Response(value).arrayBuffer()))
      } else if (ArrayBuffer.isView(value)) {
        stored.set(key, new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)))
      } else {
        throw new TypeError('unexpected value')
      }
      return {}
    },
    async get() {
      return null
    },
    async delete() {},
  }

  return { bucket, stored }
}

const streamOf = (...chunks: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
      controller.close()
    },
  })

afterEach(() => {
  delete (globalThis as { FixedLengthStream?: unknown }).FixedLengthStream
})

describe('the R2 binding store', () => {
  it('states the length of a stream with a declared size', async () => {
    ;(globalThis as { FixedLengthStream?: unknown }).FixedLengthStream = FakeFixedLengthStream
    const { bucket, stored } = strictBucket()

    await createR2BindingStore(bucket).put({ key: 'a.jpg', body: streamOf([1, 2], [3]), contentType: 'image/jpeg', size: 3 })

    expect([...stored.get('a.jpg')!]).toEqual([1, 2, 3])
  })

  it('fails the write when the bytes do not match the declared size', async () => {
    ;(globalThis as { FixedLengthStream?: unknown }).FixedLengthStream = FakeFixedLengthStream
    const { bucket } = strictBucket()

    await expect(
      createR2BindingStore(bucket).put({ key: 'b.jpg', body: streamOf([1, 2]), contentType: 'image/jpeg', size: 5 }),
    ).rejects.toThrow()
  })

  it('reads a stream of unknown size into memory rather than handing R2 a plain stream', async () => {
    const { bucket, stored } = strictBucket()

    await createR2BindingStore(bucket).put({ key: 'c.jpg', body: streamOf([4], [5, 6]), contentType: 'image/jpeg' })

    expect([...stored.get('c.jpg')!]).toEqual([4, 5, 6])
  })

  it('stores exactly the bytes of a view, not its whole buffer', async () => {
    const { bucket, stored } = strictBucket()
    const view = new Uint8Array([9, 9, 7, 8, 9]).subarray(2, 4)

    await createR2BindingStore(bucket).put({ key: 'd.jpg', body: view, contentType: 'image/jpeg' })

    expect([...stored.get('d.jpg')!]).toEqual([7, 8])
  })
})
