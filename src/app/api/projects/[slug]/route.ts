import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { BUILDS_ROOT, EXCLUDED_PROJECT_DIRS } from "@/lib/env";
import { findProjectBySlug } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UpdateProjectBody {
  name?: string;
  slug?: string;
  version?: string;
  versionCode?: number;
  androidPackage?: string;
  folderName?: string;
}

export async function GET(
  _req: Request,
  context: { params: { slug: string } }
) {
  try {
    const scanned = await findProjectBySlug(context.params.slug);
    if (!scanned) {
      return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, project: scanned.info });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: { slug: string } }
) {
  try {
    const scanned = await findProjectBySlug(context.params.slug);
    if (!scanned) {
      return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
    }

    const body = (await req.json()) as UpdateProjectBody;
    const workingDir = scanned.info.workingDir;
    const appJsonPath = path.posix.join(workingDir, "app.json");

    // 1. Read or initialize app.json
    let appJson: Record<string, any> = {};
    try {
      const content = await fs.readFile(appJsonPath, "utf8");
      appJson = JSON.parse(content);
    } catch {
      appJson = { expo: {} };
    }

    if (!appJson.expo || typeof appJson.expo !== "object") {
      appJson.expo = {};
    }

    // 2. Apply modifications to app.json
    if (typeof body.name === "string" && body.name.trim()) {
      appJson.expo.name = body.name.trim();
    }

    if (typeof body.slug === "string" && body.slug.trim()) {
      const cleanedSlug = body.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-");
      if (cleanedSlug) {
        appJson.expo.slug = cleanedSlug;
      }
    }

    if (typeof body.version === "string" && body.version.trim()) {
      appJson.expo.version = body.version.trim();
    }

    if (typeof body.androidPackage === "string") {
      const cleanPkg = body.androidPackage.trim();
      if (!appJson.expo.android || typeof appJson.expo.android !== "object") {
        appJson.expo.android = {};
      }
      if (cleanPkg) {
        appJson.expo.android.package = cleanPkg;
      }
    }

    if (
      body.versionCode !== undefined &&
      body.versionCode !== null &&
      !isNaN(Number(body.versionCode)) &&
      Number(body.versionCode) > 0
    ) {
      if (!appJson.expo.android || typeof appJson.expo.android !== "object") {
        appJson.expo.android = {};
      }
      appJson.expo.android.versionCode = Math.floor(Number(body.versionCode));
    }

    await fs.writeFile(
      appJsonPath,
      JSON.stringify(appJson, null, 2) + "\n",
      "utf8"
    );

    // 3. Update package.json if it exists
    const pkgJsonPath = path.posix.join(workingDir, "package.json");
    try {
      const pkgContent = await fs.readFile(pkgJsonPath, "utf8");
      const pkgJson = JSON.parse(pkgContent);
      let pkgChanged = false;

      if (typeof body.version === "string" && body.version.trim()) {
        pkgJson.version = body.version.trim();
        pkgChanged = true;
      }

      if (typeof body.slug === "string" && body.slug.trim()) {
        const npmName = body.slug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "-");
        if (npmName) {
          pkgJson.name = npmName;
          pkgChanged = true;
        }
      }

      if (pkgChanged) {
        await fs.writeFile(
          pkgJsonPath,
          JSON.stringify(pkgJson, null, 2) + "\n",
          "utf8"
        );
      }
    } catch {
      // package.json may not exist or not be JSON; ignore non-fatal
    }

    // 4. Handle folder renaming if requested
    let finalSlug = appJson.expo.slug ?? scanned.info.slug;
    if (typeof body.folderName === "string" && body.folderName.trim()) {
      const sanitizedFolder = body.folderName
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "-");

      if (
        sanitizedFolder &&
        sanitizedFolder !== scanned.info.folderName &&
        !EXCLUDED_PROJECT_DIRS.has(sanitizedFolder)
      ) {
        const oldRepoRoot = scanned.info.repoRoot;
        const newRepoRoot = path.posix.join(BUILDS_ROOT, sanitizedFolder);

        try {
          await fs.access(newRepoRoot);
          return NextResponse.json(
            {
              error: `Bu klasör adı ('${sanitizedFolder}') zaten mevcut. Lütfen başka bir ad seçin.`,
            },
            { status: 409 }
          );
        } catch {
          // Destination doesn't exist, proceed with rename
          await fs.rename(oldRepoRoot, newRepoRoot);
          finalSlug = sanitizedFolder;
        }
      }
    }

    // Re-scan and return updated project info
    const updated = await findProjectBySlug(finalSlug);
    return NextResponse.json({
      ok: true,
      message: "Proje bilgileri başarıyla güncellendi.",
      project: updated?.info ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proje güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: { slug: string } }
) {
  try {
    const scanned = await findProjectBySlug(context.params.slug);
    if (!scanned) {
      return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
    }

    const repoRoot = path.posix.resolve(scanned.info.repoRoot);
    const buildsRoot = path.posix.resolve(BUILDS_ROOT);

    // Safety checks: ensure repoRoot is strictly a direct child of BUILDS_ROOT
    if (
      !repoRoot.startsWith(`${buildsRoot}/`) ||
      repoRoot === buildsRoot ||
      repoRoot.length <= buildsRoot.length + 1
    ) {
      return NextResponse.json(
        { error: "Güvenlik kuralı ihlali: Bu dizin silinemez." },
        { status: 400 }
      );
    }

    const folderName = path.posix.basename(repoRoot);
    if (EXCLUDED_PROJECT_DIRS.has(folderName)) {
      return NextResponse.json(
        { error: `'${folderName}' özel bir sistem klasörüdür ve silinemez.` },
        { status: 400 }
      );
    }

    // Delete project directory recursively
    await fs.rm(repoRoot, { recursive: true, force: true });

    return NextResponse.json({
      ok: true,
      message: `'${scanned.info.name}' (${folderName}) projesi diskten başarıyla silindi.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proje silinirken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
