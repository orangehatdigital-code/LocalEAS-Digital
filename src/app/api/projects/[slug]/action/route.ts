import { NextResponse } from "next/server";
import { runBashCommand } from "@/lib/env";
import { findProjectBySlug } from "@/lib/scanner";
import type { ProjectActionResponse } from "@/types/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: { slug: string } },
) {
  try {
    const body = (await req.json()) as {
      action?: "git-pull" | "fix-deps";
    };

    if (body.action !== "git-pull" && body.action !== "fix-deps") {
      return NextResponse.json(
        { error: "Geçersiz aksiyon. 'git-pull' veya 'fix-deps' olmalıdır." },
        { status: 400 },
      );
    }

    const scanned = await findProjectBySlug(context.params.slug);
    if (!scanned) {
      return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
    }

    if (body.action === "git-pull") {
      const res = await runBashCommand("git pull", {
        cwd: scanned.info.repoRoot,
        timeoutMs: 60_000,
      });
      const output = [res.stdout, res.stderr].filter(Boolean).join("\n").trim();
      const payload: ProjectActionResponse = {
        ok: res.exitCode === 0,
        action: "git-pull",
        output: output || "Çıktı yok.",
        exitCode: res.exitCode,
      };
      return NextResponse.json(payload, {
        status: res.exitCode === 0 ? 200 : 500,
      });
    }

    // fix-deps inside workingDir
    const checkRes = await runBashCommand("CI=1 npx expo install --check", {
      cwd: scanned.info.workingDir,
      timeoutMs: 120_000,
    });

    if (checkRes.exitCode === 0) {
      const output = [checkRes.stdout, checkRes.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      const payload: ProjectActionResponse = {
        ok: true,
        action: "fix-deps",
        output: output || "Tüm Expo bağımlılıkları uyumlu.",
        exitCode: 0,
      };
      return NextResponse.json(payload);
    }

    const installRes = await runBashCommand("npm install --legacy-peer-deps", {
      cwd: scanned.info.workingDir,
      timeoutMs: 180_000,
    });
    const combinedOutput = [
      "--- npx expo install --check ---",
      checkRes.stdout,
      checkRes.stderr,
      "--- npm install --legacy-peer-deps ---",
      installRes.stdout,
      installRes.stderr,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    const payload: ProjectActionResponse = {
      ok: installRes.exitCode === 0,
      action: "fix-deps",
      output: combinedOutput || "Bağımlılık işlemi tamamlandı.",
      exitCode: installRes.exitCode,
    };
    return NextResponse.json(payload, {
      status: installRes.exitCode === 0 ? 200 : 500,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bakım işlemi başarısız.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
