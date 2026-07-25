import process from "node:process";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
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
  process.stdout.write(text || "null");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
