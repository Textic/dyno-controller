/** Playback lifecycle states reported by Dyno Music. */
export type PlayerStatus = "idle" | "playing" | "paused" | "buffering" | "ended";
/** Repeat queue cycling modes. */
export type RepeatMode = "NONE" | "ALL" | "ONE";
/** Track rating values recognized by YouTube Music / Dyno Music. */
export type LikeStatus = "LIKE" | "DISLIKE" | "INDIFFERENT";

export interface DynoArtist {
	name: string;
	id?: string;
}

export interface DynoTrack {
	videoId: string;
	title: string;
	artists: DynoArtist[];
	album?: string;
	thumbnail: string;
	durationSec: number;
}

export interface DynoPlayerState {
	status: PlayerStatus;
	isAd: boolean;
	track: DynoTrack | null;
	positionSec: number;
	positionAt: number;
	volume: number;
	muted: boolean;
	likeStatus: LikeStatus;
	repeat: RepeatMode;
	shuffle: boolean;
}

export interface DynoQueueEntry {
	index: number;
	videoId: string;
	title: string;
	artists: string;
	thumbnail?: string;
	duration?: string;
	selected: boolean;
}

export interface DynoArtwork {
	videoId: string;
	image: string;
}

export interface DynoHello {
	type: "hello";
	app: string;
	version: string;
	protocol: number;
}

export type DynoServerMessage =
	| DynoHello
	| { type: "state"; state: DynoPlayerState }
	| { type: "queue"; queue: DynoQueueEntry[] }
	| { type: "artwork"; videoId: string; image: string }
	| { type: "result"; id: string | number | null; ok: boolean; error?: string };

export type DynoCommand =
	| { type: "play" }
	| { type: "pause" }
	| { type: "toggle" }
	| { type: "next" }
	| { type: "previous" }
	| { type: "seek"; positionSec: number }
	| { type: "volume"; value: number }
	| { type: "mute"; muted: boolean }
	| { type: "like"; status: LikeStatus }
	| { type: "repeat" }
	| { type: "shuffle" }
	| { type: "queuePlay"; index: number }
	| { type: "queueMove"; from: number; to: number }
	| { type: "queueRemove"; index: number }
	| { type: "queueAdd"; videoId?: string | null; playlistId?: string | null; next: boolean }
	| { type: "watch"; videoId?: string | null; playlistId?: string | null; params?: string | null };

export type GlobalSettings = {
	address?: string;
	port?: number;
	token?: string;
};

export type ConnectionStatus =
	| "unconfigured"
	| "connecting"
	| "connected"
	| "unauthorized"
	| "disconnected"
	| "error";

export interface ConnectionTarget {
	port: number;
	token: string;
	url: string;
}

export const DEFAULT_PORT = 26538;

/**
 * Resolves the Dyno Music WebSocket URL from Global Settings.
 * Supports pasting the full "Copy address" URL from Dyno Music or setting port & token separately.
 */
export function resolveConnectionTarget(settings: GlobalSettings): ConnectionTarget | null {
	const rawAddress = settings.address?.trim();
	if (rawAddress) {
		try {
			const parsed = new URL(rawAddress);
			if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
				const token = parsed.searchParams.get("token")?.trim() ?? "";
				const port = parsed.port ? Number(parsed.port) : DEFAULT_PORT;
				if (token && Number.isInteger(port) && port >= 1 && port <= 65535) {
					return {
						port,
						token,
						url: `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`,
					};
				}
			}
		} catch {
			// Fall back to explicit port/token fields below.
		}
	}

	const token = settings.token?.trim() ?? "";
	if (!token) return null;
	const port = Number(settings.port ?? DEFAULT_PORT);
	const validPort = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
	return {
		port: validPort,
		token,
		url: `ws://127.0.0.1:${validPort}/ws?token=${encodeURIComponent(token)}`,
	};
}
