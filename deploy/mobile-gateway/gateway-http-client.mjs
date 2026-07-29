import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const [, , requestPath, responsePath] = process.argv;
if (!requestPath || !responsePath) {
  process.stderr.write("Usage: gateway-http-client.mjs <request-path> <response-path>\n");
  process.exit(2);
}

try {
  const input = await readFile(requestPath, "utf8");
  const request = JSON.parse(input);
  const response = await fetch(request.url, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${request.token}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Gateway-Id": request.gatewayId,
    },
    body: request.body === null ? undefined : JSON.stringify(request.body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`);
  }
  await writeFile(responsePath, text || "null", "utf8");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
