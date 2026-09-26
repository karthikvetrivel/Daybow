import { describe, expect, it } from "vitest";
import { decrypt, encrypt, sign, verify } from "../lib/crypto";

describe("crypto", () => {
  it("round-trips encryption", () => {
    const secret = "a-very-long-app-secret-for-tests";
    const blob = encrypt("1//refresh-token", secret);
    expect(blob).not.toContain("refresh");
    expect(decrypt(blob, secret)).toBe("1//refresh-token");
    expect(() => decrypt(blob, "wrong-secret-wrong-secret")).toThrow();
  });

  it("signs and verifies tokens", () => {
    const secret = "another-secret-value-for-tests";
    const t = sign("user-1", secret);
    expect(verify(t, secret)).toBe("user-1");
    expect(verify(t + "x", secret)).toBeNull();
    expect(verify(t, "other-secret-value-for-tests")).toBeNull();
    expect(verify(undefined, secret)).toBeNull();
  });
});
