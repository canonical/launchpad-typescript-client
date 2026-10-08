import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "vitest";
import { createLaunchpadClient } from "../../index.js";

describe("redirect flow", () => {
  it("follows an HTTP 303 after POST and returns the final JSON response", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/api/devel/start" && request.method === "POST") {
        response.writeHead(303, { Location: "/api/devel/result" });
        response.end();
      } else if (
        request.url === "/api/devel/result" &&
        request.method === "GET"
      ) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ state: "completed" }));
      } else {
        response.writeHead(404);
        response.end();
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected a loopback TCP server address");
      }
      const baseUrl = `http://127.0.0.1:${address.port}/api/devel/`;
      const client = createLaunchpadClient({ baseUrl });

      const result = await client.requestRaw({ path: "start", method: "POST" });

      assert.deepEqual(result.data, { state: "completed" });
      assert.equal(result.response.status, 200);
      assert.equal(result.response.url, `${baseUrl}result`);
    } finally {
      server.closeAllConnections();
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    }
  });
});
