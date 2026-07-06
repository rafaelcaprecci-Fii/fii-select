import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

export function resolveUsersDataPath({ rootDir, configuredPath = "" }) {
  const value = String(configuredPath || "").trim();
  if (!value) return join(rootDir, "data", "users.json");
  return normalize(isAbsolute(value) ? value : resolve(rootDir, value));
}

export async function ensureUsersFile(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, "[]", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

export async function readUsersFile(filePath) {
  await ensureUsersFile(filePath);
  const data = await readFile(filePath, "utf8");
  return JSON.parse(data);
}

export async function writeUsersFile(filePath, users) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(users, null, 2));
}
