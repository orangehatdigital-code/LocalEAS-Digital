import { subscribeBuildStream } from "@/lib/build-queue";
import type { BuildStreamEvent } from "@/types/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatSseMessage(event: BuildStreamEvent): Uint8Array {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function GET(
  req: Request,
  context: { params: { id: string } }
) {
  const buildId = context.params.id;
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const safeClose = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (cleanup) cleanup();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      const sendEvent = (event: BuildStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(formatSseMessage(event));
          if (event.type === "done") {
            safeClose();
          }
        } catch {
          safeClose();
        }
      };

      const { build, lines, unsubscribe } = await subscribeBuildStream(
        buildId,
        sendEvent
      );
      cleanup = unsubscribe;

      if (!build) {
        sendEvent({
          type: "done",
          buildId,
        });
        safeClose();
        return;
      }

      sendEvent({
        type: "snapshot",
        buildId,
        status: build.status,
        phase: build.phase,
        lines,
        build,
      });

      if (
        build.status === "success" ||
        build.status === "failed" ||
        build.status === "cancelled"
      ) {
        sendEvent({
          type: "done",
          buildId,
          status: build.status,
          phase: build.phase,
          build,
        });
        safeClose();
        return;
      }

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          safeClose();
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        safeClose();
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

