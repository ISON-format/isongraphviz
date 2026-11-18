// src/env.ts - the environment of a run, as the operating system and the runtime report it. No hostnames, no user names, no paths.
import os from "node:os";

export interface EnvInfo {
  cpuModel: string;
  logicalCores: number;
  ramGiB: number;
  os: string;
  osRelease: string;
  arch: string;
  node: string;
  v8: string;
}

export function collectEnv(): EnvInfo {
  const cpus = os.cpus();
  return {
    cpuModel: (cpus[0]?.model ?? "unknown").replace(/\s+/g, " ").trim(),
    logicalCores: cpus.length,
    ramGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    os: os.type(),
    osRelease: os.release(),
    arch: os.arch(),
    node: process.version,
    v8: process.versions.v8,
  };
}
