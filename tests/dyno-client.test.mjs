import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import typescript from "@rollup/plugin-typescript";
import { rollup } from "rollup";
import { WebSocketServer } from "ws";
import { resolveConnectionTarget } from "../src/types.ts";

let tempDir;
let dynoModule;

before(async () => {
	tempDir = mkdtempSync(path.join(tmpdir(), "dyno-controller-test-"));
	const bundlePath = path.join(tempDir, "dyno-client.mjs");

	const stubStreamDeck = {
		name: "stub-streamdeck",
		resolveId(id) {
			if (id === "@elgato/streamdeck") return "\0virtual:streamdeck";
			return null;
		},
		load(id) {
			if (id === "\0virtual:streamdeck") {
				return `export default { logger: { info() {}, warn() {}, error() {}, debug() {} } };`;
			}
			return null;
		},
	};

	const bundle = await rollup({
		input: path.resolve("src/dyno-client.ts"),
		external: ["node:events", "ws"],
		plugins: [
			stubStreamDeck,
			typescript({
				tsconfig: path.resolve("tsconfig.json"),
				compilerOptions: {
					outDir: tempDir,
					declaration: false,
				},
			}),
		],
	});

	const require = createRequire(import.meta.url);
	const wsUrl = pathToFileURL(require.resolve("ws")).href;

	await bundle.write({
		file: bundlePath,
		format: "esm",
		paths: {
			ws: wsUrl,
		},
	});
	await bundle.close();

	dynoModule = await import(pathToFileURL(bundlePath).href);
});

after(() => {
	dynoModule?.dynoClient?.configure({});
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

describe("resolveConnectionTarget", () => {
	it("parses pasted Dyno Music ws:// URL", () => {
		const target = resolveConnectionTarget({
			address: "ws://127.0.0.1:26539/ws?token=abc-123",
		});
		assert.deepEqual(target, {
			port: 26539,
			token: "abc-123",
			url: "ws://127.0.0.1:26539/ws?token=abc-123",
		});
	});

	it("falls back to port and token fields when address is omitted", () => {
		const target = resolveConnectionTarget({
			port: 27000,
			token: "secret",
		});
		assert.deepEqual(target, {
			port: 27000,
			token: "secret",
			url: "ws://127.0.0.1:27000/ws?token=secret",
		});
	});

	it("returns null when no token is configured", () => {
		assert.equal(resolveConnectionTarget({}), null);
		assert.equal(resolveConnectionTarget({ address: "ws://127.0.0.1:26538/ws" }), null);
	});
});

describe("DynoClient WebSocket integration", () => {
	it("receives hello, state, artwork, and resolves command acks", async () => {
		const server = http.createServer();
		const wss = new WebSocketServer({ server, path: "/ws" });
		const receivedCommands = [];

		wss.on("connection", (ws, req) => {
			const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
			if (reqUrl.searchParams.get("token") !== "valid-token") {
				ws.close(1008, "Unauthorized");
				return;
			}

			ws.send(JSON.stringify({ type: "hello", app: "Dyno Music", version: "1.4.2", protocol: 1 }));
			ws.send(
				JSON.stringify({
					type: "state",
					state: {
						status: "playing",
						isAd: false,
						track: {
							videoId: "vid1",
							title: "Midnight City",
							artists: [{ name: "M83" }],
							thumbnail: "",
							durationSec: 243,
						},
						positionSec: 12,
						positionAt: Date.now(),
						volume: 65,
						muted: false,
						likeStatus: "LIKE",
						repeat: "ALL",
						shuffle: true,
					},
				}),
			);
			ws.send(JSON.stringify({ type: "artwork", videoId: "vid1", image: "data:image/png;base64,AAAA" }));

			ws.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type === "command") {
					receivedCommands.push(msg);
					if (msg.command?.type === "pause") {
						ws.send(JSON.stringify({ type: "result", id: msg.id, ok: false, error: "Mock error" }));
					} else {
						ws.send(JSON.stringify({ type: "result", id: msg.id, ok: true }));
					}
				}
			});
		});

		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address();

		try {
			const { dynoClient } = dynoModule;
			await new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("Timed out waiting for connection")), 3000);
				const onConn = (snap) => {
					if (snap.status === "connected" && dynoClient.getState() && dynoClient.getArtwork()) {
						clearTimeout(timer);
						dynoClient.off("connection", onConn);
						dynoClient.off("artwork", onUpdate);
						resolve();
					}
				};
				const onUpdate = () => {
					if (dynoClient.getStatus() === "connected" && dynoClient.getState() && dynoClient.getArtwork()) {
						clearTimeout(timer);
						dynoClient.off("connection", onConn);
						dynoClient.off("artwork", onUpdate);
						resolve();
					}
				};
				dynoClient.on("connection", onConn);
				dynoClient.on("artwork", onUpdate);
				dynoClient.configure({ address: `ws://127.0.0.1:${port}/ws?token=valid-token` });
			});

			assert.equal(dynoModule.dynoClient.isPlaying(), true);
			assert.equal(dynoModule.dynoClient.getStatusSnapshot().trackTitle, "Midnight City");

			await dynoModule.dynoClient.sendCommand({ type: "toggle" });
			assert.equal(receivedCommands[0].command.type, "toggle");

			await assert.rejects(
				() => dynoModule.dynoClient.sendCommand({ type: "pause" }),
				/Mock error/,
			);
		} finally {
			dynoModule.dynoClient.configure({});
			await new Promise((resolve) => wss.close(() => server.close(resolve)));
		}
	});

	it("marks status unauthorized on HTTP 401 upgrade rejection", async () => {
		const server = http.createServer((_req, res) => {
			res.writeHead(401, { "Content-Type": "text/plain" });
			res.end("Unauthorized");
		});

		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address();

		try {
			const { dynoClient } = dynoModule;
			await new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("Timed out waiting for unauthorized status")), 3000);
				const onConn = (snap) => {
					if (snap.status === "unauthorized") {
						clearTimeout(timer);
						dynoClient.off("connection", onConn);
						resolve();
					}
				};
				dynoClient.on("connection", onConn);
				dynoClient.configure({ port, token: "wrong-token" });
			});

			assert.equal(dynoModule.dynoClient.getStatus(), "unauthorized");
		} finally {
			dynoModule.dynoClient.configure({});
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
