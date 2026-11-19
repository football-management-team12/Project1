// Execute the actual download service with controlled HTTP and DOM boundaries.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../frontend/src/services/cancellation_service.js", import.meta.url), "utf8");
const dependency = 'import { apiRequest, API_BASE_URL, getAccessToken } from "./api";';
assert.ok(source.includes(dependency));
const moduleSource = source.replace(dependency,
  'const API_BASE_URL = ""; const getAccessToken = () => "qa-test-token"; const apiRequest = () => { throw Error("Unexpected API call"); };');
const { downloadRefundEvidence } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);
const original = { fetch: globalThis.fetch, document: globalThis.document,
  createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
let downloads = [];
let objectUrls = 0;
let served;
try {
  URL.createObjectURL = blob => {
    assert.equal(blob.size, served.size);
    objectUrls++;
    return "blob:qa-evidence";
  };
  URL.revokeObjectURL = () => {};
  globalThis.document = { createElement: tag => {
    assert.equal(tag, "a");
    return { click() { downloads.push({ href: this.href, filename: this.download }); } };
  } };
  const serve = (content, type, status = 200) => {
    served = new Blob([content], { type });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/bookings/10/deposit-refund/evidence");
      assert.equal(options.headers.Authorization, "Bearer qa-test-token");
      return new Response(served, { status });
    };
  };
  for (const [mime, extension] of [["application/pdf", "pdf"], ["image/png", "png"], ["image/jpeg", "jpg"]]) {
    serve("QA-receipt", mime);
    await downloadRefundEvidence(10);
    assert.deepEqual(downloads.at(-1), { href: "blob:qa-evidence", filename: `bien-lai-hoan-coc-10.${extension}` });
  }
  assert.equal(downloads.length, 3);
  for (const [body, type] of [["", "application/pdf"], ["<html>SPA fallback</html>", "text/html"],
    ['{"message":"missing evidence"}', "application/json"], ["unknown", "application/octet-stream"]]) {
    serve(body, type);
    await assert.rejects(downloadRefundEvidence(10), /Phản hồi không chứa biên lai/);
  }
  serve('{"code":"EVIDENCE_NOT_FOUND"}', "application/json", 404);
  await assert.rejects(downloadRefundEvidence(10), /Không tải được biên lai/);
  assert.equal(downloads.length, 3, "Invalid responses must not trigger a download");
  assert.equal(objectUrls, 3, "Invalid responses must not create blob URLs");
  console.log("PASS: 3 file downloads, 4 invalid HTTP-200 responses and JSON-404 rejection");
} finally {
  globalThis.fetch = original.fetch;
  globalThis.document = original.document;
  URL.createObjectURL = original.createObjectURL;
  URL.revokeObjectURL = original.revokeObjectURL;
}
