import {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { runDynoCommand, wrapKeyTitle } from "./helpers";

type QuickPlaySettings = {
	target?: string;
	label?: string;
};

interface WatchTarget {
	videoId?: string;
	playlistId?: string;
}

function parseWatchTarget(raw?: string): WatchTarget | null {
	const value = raw?.trim();
	if (!value) return null;

	try {
		const url = new URL(value);
		const v = url.searchParams.get("v")?.trim() || undefined;
		const list = url.searchParams.get("list")?.trim() || undefined;
		if (url.hostname === "youtu.be") {
			const id = url.pathname.replace(/^\/+/, "").split("/")[0];
			if (id) return { videoId: id, playlistId: list };
		}
		if (v || list) return { videoId: v, playlistId: list };
	} catch {
		// Not a URL — treat as a raw YouTube Music ID below.
	}

	if (/^(PL|OLAK|RD|UU|LL|FL|VL)/i.test(value)) {
		return { playlistId: value.replace(/^VL/i, "") };
	}
	return { videoId: value };
}

@action({ UUID: "com.textic.dyno-controller.quick-play" })
export class QuickPlayAction extends SingletonAction<QuickPlaySettings> {
	override async onWillAppear(ev: WillAppearEvent<QuickPlaySettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.syncTitle(ev.action, ev.payload.settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<QuickPlaySettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.syncTitle(ev.action, ev.payload.settings);
		}
	}

	private async syncTitle(act: KeyAction<QuickPlaySettings>, settings: QuickPlaySettings): Promise<void> {
		const label = settings.label?.trim();
		await act.setTitle(label ? wrapKeyTitle(label) : undefined);
	}

	override async onKeyDown(ev: KeyDownEvent<QuickPlaySettings>): Promise<void> {
		const target = parseWatchTarget(ev.payload.settings.target);
		if (!target) {
			await ev.action.showAlert();
			return;
		}
		const ok = await runDynoCommand(ev.action, {
			type: "watch",
			videoId: target.videoId ?? null,
			playlistId: target.playlistId ?? null,
		});
		if (ok) {
			await ev.action.showOk();
		}
	}
}
