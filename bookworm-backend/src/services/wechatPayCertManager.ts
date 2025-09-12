// bookworm-backend/src/services/wechatPayCertManager.ts
import axios from 'axios';
import * as crypto from 'crypto';

interface Certificate {
  serial_no: string;
  effective_time: string;
  expire_time: string;
  encrypt_certificate: {
    algorithm: string;
    nonce: string;
    associated_data: string;
    ciphertext: string;
  };
}

interface CertResponse {
  data: Certificate[];
}

// 证书缓存 (内存中)
let certificateCache: Map<string, string> = new Map();
let lastUpdateTime: number = 0;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

/**
 * 解密微信支付平台证书
 */
function decryptCertificate(apiV3Key: string, cert: Certificate['encrypt_certificate']): string {
  const { algorithm, nonce, associated_data, ciphertext } = cert;
  if (algorithm !== 'AEAD_AES_256_GCM') {
    throw new Error(`Unsupported certificate algorithm: ${algorithm}`);
  }
  const authTag = Buffer.from(ciphertext.slice(-32), 'hex');
  const encryptedData = Buffer.from(ciphertext.slice(0, -32), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associated_data));
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * 从微信支付API获取并更新平台证书
 */
export async function updateCertificates(apiV3Key: string): Promise<Map<string, string>> {
  const url = 'https://api.mch.weixin.qq.com/v3/certificates';
  try {
    const response = await axios.get<CertResponse>(url);
    const newCerts = new Map<string, string>();
    for (const cert of response.data.data) {
      const publicKey = decryptCertificate(apiV3Key, cert.encrypt_certificate);
      newCerts.set(cert.serial_no, publicKey);
    }
    certificateCache = newCerts;
    lastUpdateTime = Date.now();
    console.log(`Successfully updated WeChat Pay platform certificates. Found ${newCerts.size} certificates.`);
    return certificateCache;
  } catch (error) {
    console.error('Failed to update WeChat Pay platform certificates:', (error as Error).message);
    throw error;
  }
}

/**
 * 获取证书，如果缓存过期则自动更新
 */
export async function getCertificates(apiV3Key: string): Promise<Map<string, string>> {
  if (certificateCache.size === 0 || Date.now() - lastUpdateTime > CACHE_DURATION) {
    return await updateCertificates(apiV3Key);
  }
  return certificateCache;
}

/**
 * 动态更新 wechatpay-node-v3 实例的验签公钥
 */
export function updatePayInstanceVerifier(pay: any, certs: Map<string, string>) {
  const verifiers = new Map();
  for (const [serial, publicKey] of certs.entries()) {
    verifiers.set(serial, publicKey);
  }
  pay.update_verifier(verifiers);
  console.log('WeChat Pay SDK verifiers updated.');
}