import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { BUILDS_ROOT, runBashCommand, shellQuote } from "@/lib/env";
import { scanProjects } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_FOLDER_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeFolderNameFromUrl(url: string): string {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const base = path.posix.basename(cleanUrl).replace(/\.git$/i, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || "new-project";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      repoUrl?: string;
      branch?: string;
      folderName?: string;
      installDeps?: boolean;
    };

    if (!body.repoUrl || !body.repoUrl.trim()) {
      return NextResponse.json(
        { ok: false, error: "Git repo URL'si zorunludur." },
        { status: 400 },
      );
    }

    const repoUrl = body.repoUrl.trim();
    const folderName =
      (body.folderName && body.folderName.trim()) ||
      sanitizeFolderNameFromUrl(repoUrl);

    if (!SAFE_FOLDER_REGEX.test(folderName)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Geçersiz klasör adı. Yalnızca harf, rakam, tire (-) ve alt çizgi (_) içerebilir.",
        },
        { status: 400 },
      );
    }

    const targetDir = path.posix.join(BUILDS_ROOT, folderName);

    // Check if folder already exists
    try {
      await fs.stat(targetDir);
      return NextResponse.json(
        {
          ok: false,
          error: `'${targetDir}' klasörü zaten mevcut. Lütfen farklı bir klasör adı belirtin.`,
        },
        { status: 400 },
      );
    } catch {
      // Folder does not exist, good to proceed
    }

    // Prepare git clone command
    const branchArg = body.branch?.trim()
      ? `--branch ${shellQuote(body.branch.trim())}`
      : "";
    const cloneCmd = `git clone ${branchArg} ${shellQuote(repoUrl)} ${shellQuote(targetDir)}`;

    const cloneRes = await runBashCommand(cloneCmd, {
      cwd: BUILDS_ROOT,
      timeoutMs: 120_000,
    });

    if (cloneRes.exitCode !== 0) {
      const errMsg = [cloneRes.stderr, cloneRes.stdout]
        .filter(Boolean)
        .join("\n")
        .trim();
      return NextResponse.json(
        {
          ok: false,
          error: `Git klonlama başarısız oldu:\n${errMsg || "Bilinmeyen hata"}`,
        },
        { status: 500 },
      );
    }

    let installOutput = "";
    if (body.installDeps) {
      // Determine workingDir (check if mobile/package.json exists)
      let installDir = targetDir;
      try {
        const mobilePkg = await fs.stat(
          path.posix.join(targetDir, "mobile", "package.json"),
        );
        if (mobilePkg.isFile()) {
          installDir = path.posix.join(targetDir, "mobile");
        }
      } catch {
        // use root targetDir
      }

      const installRes = await runBashCommand("npm install", {
        cwd: installDir,
        timeoutMs: 180_000,
      });
      installOutput = [installRes.stdout, installRes.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
    }

    // Rescan projects
    const projects = await scanProjects();
    const createdProject = projects.find(
      (p) => p.slug === folderName || p.repoRoot === targetDir,
    );

    return NextResponse.json({
      ok: true,
      folderName,
      targetDir,
      project: createdProject ?? null,
      installOutput: installOutput || undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proje eklenirken hata oluştu.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
