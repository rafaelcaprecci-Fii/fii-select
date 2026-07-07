import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

export function resolveJsonDataPath({ rootDir, configuredPath = "", fallbackRelativePath }) {
  const value = String(configuredPath || "").trim();
  if (!value) return join(rootDir, fallbackRelativePath);
  return normalize(isAbsolute(value) ? value : resolve(rootDir, value));
}

export async function ensureJsonFile(filePath, defaultValue) {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, JSON.stringify(defaultValue, null, 2), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

export async function readJsonFile(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJsonFileAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2));
  await rename(temporaryPath, filePath);
}
