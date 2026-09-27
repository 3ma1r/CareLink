const encoder = new TextEncoder()

function concat(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

export function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) throw new Error('Invalid base64url value')
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const decoded = atob(padded)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export function base64UrlEncode(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

async function hkdf(salt: Uint8Array, input: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmac(salt, input)
  const output = await hmac(prk, concat(info, new Uint8Array([1])))
  return output.slice(0, length)
}

function vapidJwk(publicKey: Uint8Array, privateKey: Uint8Array) {
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    throw new Error('Invalid VAPID key material')
  }
  return {
    kty: 'EC', crv: 'P-256',
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    d: base64UrlEncode(privateKey),
    ext: false,
    key_ops: ['sign'],
  } as JsonWebKey
}

function derToJose(signature: Uint8Array) {
  if (signature.length === 64) return signature
  if (signature[0] !== 0x30) throw new Error('Unexpected ECDSA signature')
  let offset = 2
  if (signature[1] & 0x80) offset = 2 + (signature[1] & 0x7f)
  if (signature[offset++] !== 0x02) throw new Error('Unexpected ECDSA signature')
  const rLength = signature[offset++]
  const r = signature.slice(offset, offset + rLength); offset += rLength
  if (signature[offset++] !== 0x02) throw new Error('Unexpected ECDSA signature')
  const sLength = signature[offset++]
  const s = signature.slice(offset, offset + sLength)
  const output = new Uint8Array(64)
  output.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length))
  output.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length))
  return output
}

async function vapidAuthorization(endpoint: string, publicKey: Uint8Array, privateKey: Uint8Array, subject: string, now: number) {
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) throw new Error('Invalid VAPID subject')
  const audience = new URL(endpoint).origin
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  })))
  const unsigned = `${header}.${payload}`
  const signingKey = await crypto.subtle.importKey('jwk', vapidJwk(publicKey, privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = derToJose(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(unsigned))))
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${base64UrlEncode(publicKey)}`
}

export type PushTarget = { endpoint: string; p256dh: string; auth_key: string }
export type VapidConfiguration = { publicKey: string; privateKey: string; subject: string }

export async function createWebPushRequest(
  target: PushTarget,
  vapid: VapidConfiguration,
  payload = JSON.stringify({ route: '/alerts' }),
  now = Date.now(),
) {
  const endpoint = new URL(target.endpoint)
  if (endpoint.protocol !== 'https:') throw new Error('Push endpoint must use HTTPS')
  const receiverPublic = base64UrlDecode(target.p256dh)
  const authSecret = base64UrlDecode(target.auth_key)
  const vapidPublic = base64UrlDecode(vapid.publicKey)
  const vapidPrivate = base64UrlDecode(vapid.privateKey)
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4 || authSecret.length < 16) {
    throw new Error('Invalid push subscription keys')
  }

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, ephemeral.privateKey, 256))
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
  const keyInfo = concat(encoder.encode('WebPush: info'), new Uint8Array([0]), receiverPublic, senderPublic)
  const inputKeyMaterial = await hkdf(authSecret, sharedSecret, keyInfo, 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const contentKey = await hkdf(salt, inputKeyMaterial, concat(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16)
  const nonce = await hkdf(salt, inputKeyMaterial, concat(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12)
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]))
  const encryptionKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, encryptionKey, plaintext))
  const recordSize = new Uint8Array([0, 0, 16, 0])
  const body = concat(salt, recordSize, new Uint8Array([senderPublic.length]), senderPublic, ciphertext)

  return {
    body,
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, vapidPublic, vapidPrivate, vapid.subject, now),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '300',
      Urgency: 'high',
    },
  }
}
