import crypto from "crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  constantTimeTokenEquals,
  generateRandomSessionToken,
  hashSessionToken,
  verifyUserJwt,
} from "./index";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("@repo/auth", () => {
  it("verifies RS256 Clerk JWT with authorizedParties", () => {
    const token = jwt.sign(
      { sub: "user_123", email: "a@example.com", azp: "https://agent.ansarisaif.com" },
      privateKey,
      { algorithm: "RS256", expiresIn: "5m" }
    );

    const claims = verifyUserJwt(token, {
      publicKey,
      authorizedParties: ["https://agent.ansarisaif.com"],
    });
    expect(claims.userId).toBe("user_123");
    expect(claims.email).toBe("a@example.com");
  });

  it("rejects mismatched authorizedParty (azp)", () => {
    const token = jwt.sign(
      { sub: "user_123", azp: "https://evil.example.com" },
      privateKey,
      { algorithm: "RS256", expiresIn: "5m" }
    );

    expect(() =>
      verifyUserJwt(token, {
        publicKey,
        authorizedParties: ["https://agent.ansarisaif.com"],
      })
    ).toThrow(/authorized party/);
  });

  it("rejects HS256 algorithm confusion", () => {
    const forged = jwt.sign({ sub: "user_123" }, "secret", {
      algorithm: "HS256",
    });
    expect(() => verifyUserJwt(forged, { publicKey })).toThrow();
  });

  it("performs constant-time internal token comparison and hashes session tokens", () => {
    expect(constantTimeTokenEquals("super-secret-token-123", "super-secret-token-123")).toBe(
      true
    );
    expect(constantTimeTokenEquals("super-secret-token-123", "wrong")).toBe(false);

    const { rawToken, tokenHash } = generateRandomSessionToken();
    expect(hashSessionToken(rawToken)).toBe(tokenHash);
  });
});
