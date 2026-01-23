import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { bus } from "@/lib/events";
import { getStatus } from "@/lib/mqtt";

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let handler: ((evt: any) => void) | null = null;
  let ping: NodeJS.Timeout | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: any) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {}
      };
      send(getStatus());
      ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`:ping\n\n`));
        } catch {}
      }, 15000);
      handler = (evt: any) => send(evt);
      bus.on("mqtt", handler);
    },
    cancel() {
      closed = true;
      if (handler) {
        bus.off("mqtt", handler);
        if (ping) {
          clearInterval(ping);
          ping = null;
        }
        handler = null;
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
