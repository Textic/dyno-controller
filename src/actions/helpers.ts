import streamDeck, {
	type Action,
	type DialAction,
	type KeyAction,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { dynoClient } from "../dyno-client";
import type { DynoCommand } from "../types";

export type EmptySettings = Record<string, never>;

/**
 * Base class for key actions that mirror Dyno Music's live state across all visible instances.
 */
export abstract class SyncedKeyAction<T extends JsonObject = JsonObject> extends SingletonAction<T> {
	private subscribed = false;

	constructor() {
		super();
		this.ensureSubscribed();
	}

	private ensureSubscribed(): void {
		if (this.subscribed) return;
		this.subscribed = true;
		const refreshAll = () => {
			for (const action of this.actions) {
				if (action.isKey()) {
					void this.syncAction(action);
				}
			}
		};
		dynoClient.on("state", refreshAll);
		dynoClient.on("artwork", refreshAll);
		dynoClient.on("connection", refreshAll);
	}

	override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
		if (ev.action.isKey()) {
			await this.syncAction(ev.action);
		}
	}

	protected abstract syncAction(action: KeyAction<T>, overrideSettings?: T): Promise<void> | void;
}

/** Runs a Dyno Music command and triggers Stream Deck's alert indicator if it fails. */
export async function runDynoCommand<T extends JsonObject>(
	action: KeyAction<T> | DialAction<T> | Action<T>,
	command: DynoCommand,
): Promise<boolean> {
	try {
		await dynoClient.sendCommand(command);
		return true;
	} catch (err) {
		streamDeck.logger.warn(`Command "${command.type}" failed: ${err instanceof Error ? err.message : String(err)}`);
		if (action.isKey() || action.isDial()) {
			await action.showAlert().catch(() => {});
		}
		return false;
	}
}

/** Wraps long titles across up to `maxLines` lines of `maxChars` so they fit cleanly on Stream Deck keys. */
export function wrapKeyTitle(text: string, maxChars = 13, maxLines = 2): string {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return "";

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (!current) {
			current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
			continue;
		}
		if (`${current} ${word}`.length <= maxChars) {
			current = `${current} ${word}`;
		} else {
			lines.push(current);
			if (lines.length >= maxLines) break;
			current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
		}
	}

	if (lines.length < maxLines && current) {
		lines.push(current);
	}
	return lines.slice(0, maxLines).join("\n");
}
