import CryptoJS from 'crypto-js';

// In production, move this to your .env file as VITE_QR_SECRET_KEY
const SECRET_KEY = import.meta.env.VITE_PDF_NAME; 

/**
 * Encrypts member data into a secure string for QR generation
 */
export const encryptMemberData = (member) => {
  const payload = JSON.stringify({
    id: member.id,
    n: member.name,
    s: member.surname,
    m: member.mandal
  });
  
  return CryptoJS.AES.encrypt(payload, SECRET_KEY).toString();
};

/**
 * Decrypts QR data back into a member object
 */
export const decryptMemberData = (encryptedString) => {
  try {
    // Ensure we are working with a string
    if (typeof encryptedString !== 'string') return null;
    
    const bytes = CryptoJS.AES.decrypt(encryptedString, SECRET_KEY);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedText) return null;
    
    return JSON.parse(decryptedText);
  } catch (error) {
    return null;
  }
};