const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  createDownloadToken,
  normalizeOrigin,
  parsePositiveInteger,
  resolveFilePath,
  verifyDownloadToken
} = require("./index");

test("parsePositiveInteger returns valid positive integers", () => {
  assert.equal(parsePositiveInteger("48", 1), 48);
  assert.equal(parsePositiveInteger(99, 1), 99);
});

test("parsePositiveInteger falls back for invalid values", () => {
  assert.equal(parsePositiveInteger("0", 48), 48);
  assert.equal(parsePositiveInteger("-5", 48), 48);
  assert.equal(parsePositiveInteger("abc", 48), 48);
  assert.equal(parsePositiveInteger("10.5", 48), 48);
});

test("normalizeOrigin trims trailing slashes and whitespace", () => {
  assert.equal(normalizeOrigin(" https://productprompts.netlify.app/// "), "https://productprompts.netlify.app");
  assert.equal(normalizeOrigin(""), "");
  assert.equal(normalizeOrigin(undefined), "");
});

test("resolveFilePath keeps absolute paths and resolves relative paths from server folder", () => {
  const absolutePath = path.resolve(__dirname, "file.pdf");
  assert.equal(resolveFilePath(absolutePath, "fallback.pdf"), absolutePath);
  assert.equal(resolveFilePath("../client/product.pdf", "fallback.pdf"), path.resolve(__dirname, "../client/product.pdf"));
  assert.equal(resolveFilePath("", absolutePath), absolutePath);
});

test("download tokens verify when valid", () => {
  const token = createDownloadToken({
    orderId: "order_test",
    paymentId: "pay_test",
    exp: Date.now() + 60_000
  });

  const payload = verifyDownloadToken(token);
  assert.equal(payload.orderId, "order_test");
  assert.equal(payload.paymentId, "pay_test");
});

test("download tokens reject tampering", () => {
  const token = createDownloadToken({
    orderId: "order_test",
    paymentId: "pay_test",
    exp: Date.now() + 60_000
  });

  assert.throws(() => verifyDownloadToken(`${token}abc`), /Invalid token/);
});

test("download tokens reject expiry", () => {
  const token = createDownloadToken({
    orderId: "order_test",
    paymentId: "pay_test",
    exp: Date.now() - 1
  });

  assert.throws(() => verifyDownloadToken(token), /expired/);
});
