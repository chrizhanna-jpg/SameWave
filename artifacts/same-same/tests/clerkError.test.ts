import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clerkErrorCode, clerkErrorMessage } from "../lib/clerkError";

describe("clerkErrorMessage", () => {
  it("prefers the first Clerk longMessage", () => {
    const err = {
      errors: [{ code: "form_identifier_not_found", message: "short", longMessage: "Couldn't find your account." }],
    };
    assert.equal(clerkErrorMessage(err, "fallback"), "Couldn't find your account.");
    assert.equal(clerkErrorCode(err), "form_identifier_not_found");
  });

  it("falls back when the throw is empty", () => {
    assert.equal(clerkErrorMessage(null, "fallback"), "fallback");
    assert.equal(clerkErrorCode({}), undefined);
  });
});
