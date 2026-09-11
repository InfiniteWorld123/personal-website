import { describe, expect, it } from 'vitest'
import { canonicalPath, signRequest } from '#/backend/shared/image-storage/sigv4'
import type { Bytes } from '#/backend/shared/image-storage/sigv4'

/**
 * The two worked examples from AWS's own documentation for signing S3
 * requests. A signature is either byte-for-byte right or useless, and R2
 * credentials are not needed to prove it — so this is checked here rather
 * than discovered as a 403 against a live bucket.
 *
 * Source: "Signature Calculations for the Authorization Header:
 * Transferring Payload in a Single Chunk (AWS Signature Version 4)".
 */
const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3',
}

const signedAt = new Date('2013-05-24T00:00:00Z')
const origin = 'https://examplebucket.s3.amazonaws.com'

const signatureOf = (authorization: string) =>
  authorization.match(/Signature=([0-9a-f]+)$/)?.[1]

const signedHeadersOf = (authorization: string) =>
  authorization.match(/SignedHeaders=([^,]+)/)?.[1]

describe('AWS Signature Version 4', () => {
  it('signs a GET with a range header and an empty payload', async () => {
    const headers = await signRequest({
      method: 'GET',
      url: new URL(origin + canonicalPath('test.txt')),
      headers: { range: 'bytes=0-9' },
      credentials,
      now: signedAt,
    })

    expect(headers['x-amz-date']).toBe('20130524T000000Z')
    expect(headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(signedHeadersOf(headers.Authorization)).toBe(
      'host;range;x-amz-content-sha256;x-amz-date',
    )
    expect(signatureOf(headers.Authorization)).toBe(
      'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })

  it('signs a PUT whose key needs percent-encoding, with a real payload', async () => {
    const body = new TextEncoder().encode('Welcome to Amazon S3.') as Bytes

    const headers = await signRequest({
      method: 'PUT',
      url: new URL(origin + canonicalPath('test$file.text')),
      headers: {
        date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      body,
      credentials,
      now: signedAt,
    })

    expect(headers['x-amz-content-sha256']).toBe(
      '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
    )
    expect(signedHeadersOf(headers.Authorization)).toBe(
      'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
    )
    expect(signatureOf(headers.Authorization)).toBe(
      '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    )
  })

  it('encodes each key segment without swallowing the separators', () => {
    expect(canonicalPath('test$file.text')).toBe('/test%24file.text')
    expect(canonicalPath('bucket', 'projects/a b.jpg')).toBe('/bucket/projects/a%20b.jpg')
    expect(canonicalPath('projects/(1).jpg')).toBe('/projects/%281%29.jpg')
  })
})
