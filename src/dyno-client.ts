import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import {
	type ConnectionStatus,
	type ConnectionTarget,
	type DynoArtwork,
	type DynoCommand,
	type DynoHello,
	type DynoPlayerState,
	type DynoQueueEntry,
	type DynoServerMessage,
	type GlobalSettings,
	resolveConnectionTarget,
} from "./types";

const COMMAND_TIMEOUT_MS = 5000;
const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 10000;

interface PendingRequest {
	resolve: () => void;
	reject: (err: Error) => void;
	timer: NodeJS.Timeout;
}

export interface ClientStatusSnapshot {
	status: ConnectionStatus;
	port: number | null;
	appVersion: string | null;
	errorMessage: string | null;
	trackTitle: string | null;
}

class DynoClient extends EventEmitter {
	private ws: WebSocket | null = null;
	private target: ConnectionTarget | null = null;
	private status: ConnectionStatus = "unconfigured";
	private errorMessage: string | null = null;
	private hello: DynoHello | null = null;
	private state: DynoPlayerState | null = null;
	private queue: DynoQueueEntry[] = [];
	private artwork: DynoArtwork | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private reconnectDelayMs = INITIAL_RECONNECT_MS;
	private nextRequestId = 1;
	private pending = new Map<number, PendingRequest>();

	public getStatus(): ConnectionStatus {
		return this.status;
	}

	public getState(): DynoPlayerState | null {
		return this.state;
	}

	public getQueue(): DynoQueueEntry[] {
		return this.queue;
	}

	public getArtwork(): DynoArtwork | null {
		return this.artwork;
	}

	public isPlaying(): boolean {
		return this.state?.status === "playing" || this.state?.status === "buffering";
	}

	public getStatusSnapshot(): ClientStatusSnapshot {
		return {
			status: this.status,
			port: this.target?.port ?? null,
			appVersion: this.hello?.version ?? null,
			errorMessage: this.errorMessage,
			trackTitle: this.state?.track?.title ?? null,
		};
	}

	/** Applies new Global Settings and (re)connects if the target changed. */
	public configure(settings: GlobalSettings): void {
		const next = resolveConnectionTarget(settings);
		if (!next) {
			this.target = null;
			this.disconnect("unconfigured", "Configure your Dyno Music token in the Property Inspector.");
			return;
		}
		const unchanged = this.target?.url === next.url;
		this.target = next;
		if (unchanged && (this.status === "connected" || this.status === "connecting")) {
			return;
		}
		this.reconnectDelayMs = INITIAL_RECONNECT_MS;
		this.connect();
	}

	/** Forces an immediate reconnection attempt using the current target. */
	public reconnect(): void {
		if (!this.target) {
			this.setStatus("unconfigured", "No token configured.");
			return;
		}
		this.reconnectDelayMs = INITIAL_RECONNECT_MS;
		this.connect();
	}

	public async sendCommand(command: DynoCommand): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			if (this.status === "disconnected" || this.status === "error") {
				this.reconnect();
			}
			throw new Error(this.errorMessage ?? "Not connected to Dyno Music");
		}
		await this.sendMessage({ type: "command", command });
	}

	public async requestRefresh(): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		await this.sendMessage({ type: "get" });
	}

	private sendMessage(payload: Record<string, unknown>): Promise<void> {
		const socket = this.ws;
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("WebSocket is not open"));
		}
		const id = this.nextRequestId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("Dyno Music did not reply in time"));
			}, COMMAND_TIMEOUT_MS);

			this.pending.set(id, { resolve, reject, timer });
			try {
				socket.send(JSON.stringify({ id, ...payload }), (err) => {
					if (err) {
						const entry = this.pending.get(id);
						if (entry) {
							clearTimeout(entry.timer);
							this.pending.delete(id);
						}
						reject(err);
					}
				});
			} catch (err) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	private connect(): void {
		this.clearReconnectTimer();
		this.cleanupSocket();

		if (!this.target) {
			this.setStatus("unconfigured", "No token configured.");
			return;
		}

		this.setStatus("connecting", null);
		const socket = new WebSocket(this.target.url);
		this.ws = socket;

		socket.on("open", () => {
			if (this.ws !== socket) return;
			this.reconnectDelayMs = INITIAL_RECONNECT_MS;
			this.setStatus("connected", null);
			streamDeck.logger.info(`Connected to Dyno Music on port ${this.target?.port}`);
		});

		socket.on("unexpected-response", (_req, res) => {
			if (this.ws !== socket) return;
			res.resume();
			this.cleanupSocket();
			if (res.statusCode === 401) {
				streamDeck.logger.warn("Dyno Music rejected the token (HTTP 401)");
				this.resetPlaybackData();
				this.setStatus("unauthorized", "Invalid or regenerated token (HTTP 401).");
				return;
			}
			const msg = `Unexpected HTTP ${res.statusCode ?? "error"} from Dyno Music`;
			streamDeck.logger.warn(msg);
			this.resetPlaybackData();
			this.setStatus("error", msg);
			this.scheduleReconnect();
		});

		socket.on("message", (data) => {
			if (this.ws !== socket) return;
			this.handleRawMessage(data.toString());
		});

		socket.on("close", () => {
			if (this.ws !== socket) return;
			this.cleanupSocket();
			this.resetPlaybackData();
			if (this.status !== "unauthorized" && this.status !== "unconfigured") {
				this.setStatus("disconnected", "Disconnected from Dyno Music.");
				this.scheduleReconnect();
			}
		});

		socket.on("error", (err) => {
			if (this.ws !== socket) return;
			const message = err instanceof Error ? err.message : String(err);
			streamDeck.logger.debug(`WebSocket error: ${message}`);
			if (this.status === "connecting") {
				this.errorMessage = "Dyno Music is not running or the developer API is off.";
			}
		});
	}

	private handleRawMessage(raw: string): void {
		let msg: DynoServerMessage;
		try {
			msg = JSON.parse(raw) as DynoServerMessage;
		} catch {
			return;
		}

		switch (msg.type) {
			case "hello":
				this.hello = msg;
				this.emit("hello", msg);
				this.emit("connection", this.getStatusSnapshot());
				break;
			case "state": {
				this.state = msg.state;
				const currentVideoId = msg.state.track?.videoId;
				if (!currentVideoId || msg.state.isAd || (this.artwork && this.artwork.videoId !== currentVideoId)) {
					if (!currentVideoId || msg.state.isAd) {
						this.artwork = null;
					}
				}
				this.emit("state", msg.state);
				break;
			}
			case "queue":
				this.queue = msg.queue;
				this.emit("queue", msg.queue);
				break;
			case "artwork":
				this.artwork = { videoId: msg.videoId, image: msg.image };
				this.emit("artwork", this.artwork);
				break;
			case "result": {
				if (typeof msg.id === "number") {
					const entry = this.pending.get(msg.id);
					if (entry) {
						clearTimeout(entry.timer);
						this.pending.delete(msg.id);
						if (msg.ok) entry.resolve();
						else entry.reject(new Error(msg.error ?? "Command failed"));
					}
				}
				break;
			}
		}
	}

	private disconnect(status: ConnectionStatus, reason: string | null): void {
		this.clearReconnectTimer();
		this.cleanupSocket();
		this.resetPlaybackData();
		this.setStatus(status, reason);
	}

	private cleanupSocket(): void {
		this.rejectAllPending("Connection closed");
		if (this.ws) {
			const socket = this.ws;
			this.ws = null;
			socket.removeAllListeners();
			// Keep a no-op error listener so ws.terminate() during CONNECTING cannot emit an uncaught error.
			socket.on("error", () => {});
			try {
				if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
					socket.terminate();
				}
			} catch {
				// Ignore termination errors.
			}
		}
	}

	private rejectAllPending(reason: string): void {
		for (const entry of this.pending.values()) {
			clearTimeout(entry.timer);
			entry.reject(new Error(reason));
		}
		this.pending.clear();
	}

	private resetPlaybackData(): void {
		this.hello = null;
		this.state = null;
		this.queue = [];
		this.artwork = null;
		this.emit("state", null);
		this.emit("artwork", null);
		this.emit("queue", []);
	}

	private setStatus(status: ConnectionStatus, errorMessage: string | null): void {
		const changed = this.status !== status || this.errorMessage !== errorMessage;
		this.status = status;
		this.errorMessage = errorMessage;
		if (changed) {
			this.emit("connection", this.getStatusSnapshot());
		}
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private scheduleReconnect(): void {
		this.clearReconnectTimer();
		const delay = this.reconnectDelayMs;
		this.reconnectDelayMs = Math.min(MAX_RECONNECT_MS, Math.round(this.reconnectDelayMs * 1.6));
		this.reconnectTimer = setTimeout(() => {
			if (this.target && this.status !== "unauthorized" && this.status !== "unconfigured") {
				this.connect();
			}
		}, delay);
	}
}

export const dynoClient = new DynoClient();
