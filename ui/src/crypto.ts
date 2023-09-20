// Convert bigint to ArrayBuffer
function bigintToArrayBuffer(bi: bigint): ArrayBuffer {
  const hex = bi.toString(16);
  const len = Math.ceil(hex.length / 2);
  const buffer = new Uint8Array(len);
  let index = len - 1;

  for (let i = hex.length - 2; i >= 0; i -= 2) {
    buffer[index] = parseInt(hex.slice(i, i + 2), 16);
    index--;
  }

  return buffer.buffer;
}

export async function deriveKeyFromBigInt(bigIntKey: bigint): Promise<CryptoKey> {
  const masterKey = await window.crypto.subtle.importKey(
    "raw",
    bigintToArrayBuffer(bigIntKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(16), // A fixed salt is not ideal; for better security, use a unique salt.
      iterations: 100000,
      hash: "SHA-256",
    },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<ArrayBuffer> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(plaintext);
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encodedData
  );

  const combinedBuffer = new ArrayBuffer(iv.length + encryptedData.byteLength);
  new Uint8Array(combinedBuffer).set(iv);
  new Uint8Array(combinedBuffer).set(new Uint8Array(encryptedData), iv.length);

  return combinedBuffer;
}

export async function decrypt(
  key: CryptoKey,
  encryptedData: ArrayBuffer
): Promise<string> {
  const iv = new Uint8Array(encryptedData, 0, 12);
  const data = new Uint8Array(encryptedData, 12);

  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );

  return new TextDecoder().decode(decryptedData);
}

export function bufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBuffer(hexString: string): ArrayBuffer {
    if (hexString.length % 2 !== 0) {
        throw new Error('Invalid hex string length!');
    }

    const byteArray = new Uint8Array(hexString.length / 2);

    for (let i = 0; i < hexString.length; i += 2) {
        byteArray[i / 2] = Number.parseInt(hexString.substr(i, 2), 16);
    }

    return byteArray.buffer;
}