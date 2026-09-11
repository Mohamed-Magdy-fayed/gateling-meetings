import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runs a throwaway LiveKit server in Docker for local development, using
 * livekit.dev.yaml. Point `.env` at it:
 *   LIVEKIT_URL=ws://localhost:7880  LIVEKIT_API_KEY=devkey  LIVEKIT_API_SECRET=secret
 */
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = path.join(root, "livekit.dev.yaml");

const args = [
  "run",
  "--rm",
  "--name",
  "gateling-meetings-livekit",
  "-p",
  "7880:7880",
  "-p",
  "7881:7881",
  "-p",
  "50000-50100:50000-50100/udp",
  "-v",
  `${config}:/etc/livekit.yaml:ro`,
  "livekit/livekit-server",
  "--config",
  "/etc/livekit.yaml",
];

const child = spawn("docker", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
