import jwt from 'jsonwebtoken';

// Secret key for signing and verification
const secret = 'sk_test_ntaOfNDzZsE9BE33k6Qajn21KQ7Iv2NobAAg4ma4K8';

// Create a token
const token = jwt.sign({ sub: 'user123', role: 'user' }, secret);
console.log('Generated Token:', token);

// Decode token without verification
const decoded = jwt.decode(token, { complete: true });
console.log('Decoded Token:', decoded);

// Verify the token
try {
  const verified = jwt.verify(token, secret);
  console.log('Verification successful:', verified);
} catch (error) {
  console.error('Verification failed:', error);
}

// Create a token with RS256 algorithm (for testing)
// This would normally require a private key to sign and public key to verify
try {
  const testToken = jwt.sign({ sub: 'test123' }, 'test_secret', { algorithm: 'HS256' });
  console.log('Test Token (HS256):', testToken);
} catch (error) {
  console.error('Error creating test token:', error);
}

// This simulates a real Clerk token - just for testing
const realTokenExample = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzFhYmMxMjMiLCJpYXQiOjE2Nzg5MDQ2MDB9.signature';
console.log('Decoded Example Token:', jwt.decode(realTokenExample, { complete: true }));

// Get real token from API request (header)
const authHeader = process.argv[2]; // Pass token as argument: ts-node jwt-test.ts "Bearer token123"
const tokenFromHeader = authHeader?.split(" ")[1];
if (tokenFromHeader) {
  console.log('Token from header:', tokenFromHeader);
  const decodedHeader = jwt.decode(tokenFromHeader, { complete: true });
  console.log('Decoded Token Header:', decodedHeader);
  console.log('JWT Algorithm:', decodedHeader?.header?.alg);
}

// Public key from Clerk (for verification)
const publicKey = 'pk_test_Y2hhbXBpb24tYnVmZmFsby01LmNsZXJrLmFjY291bnRzLmRldiQ';

if (tokenFromHeader) {
  try {
    console.log('Trying to verify with RS256...');
    const verified = jwt.verify(tokenFromHeader, publicKey, { algorithms: ['RS256'] });
    console.log('RS256 Verification successful:', verified);
  } catch (error) {
    console.error('RS256 Verification failed:', error);
  }
}

/**
 * NOTE ABOUT CLERK KEYS:
 * 
 * Clerk uses RS256 algorithm which requires:
 * - Public key (JWK format) for verification (what your backend should use)
 * - Private key for signing (only on Clerk's servers)
 * 
 * The keys should be PEM formatted and may need to be properly formatted 
 * with header/footer for verification to work.
 */ 