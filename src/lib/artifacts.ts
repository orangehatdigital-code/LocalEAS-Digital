import fs from "fs/promises";
import path from "path";
import { ARTIFACTS_DIR } from "./env";

const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Validates and resolves an artifact filename strictly inside the artifacts directory.
 */
export async function resolveArtifactFile(rawFilename: string): Promise<{
  filename: string;
  fullPath: string;
  sizeBytes: number;
} | null> {
  const filename = path.posix.basename(rawFilename);
  if (
    !filename ||
    filename !== rawFilename ||
    !SAFE_FILENAME_REGEX.test(filename)
  ) {
    return null;
  }

  const fullPath = path.posix.resolve(ARTIFACTS_DIR, filename);
  if (!fullPath.startsWith(`${ARTIFACTS_DIR}/`)) {
    return null;
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return null;
    }
    return {
      filename,
      fullPath,
      sizeBytes: stat.size,
    };
  } catch {
    return null;
  }
}
