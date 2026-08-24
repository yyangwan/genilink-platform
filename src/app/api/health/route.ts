import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    deployment: process.env.DEPLOYMENT_VERSION ?? "unknown",
    timestamp: new Date().toISOString(),
  });
}
