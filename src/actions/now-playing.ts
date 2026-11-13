import {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, SyncedKeyAction, wrapKeyTitle } from "./helpers";

type NowPlayingSettings = {
	titleMode?: "titleArtist" | "title" | "none";
	pressAction?: "toggle" | "next" | "none";
};

/** Keypad action showing live track artwork and title/artist with configurable press behavior. */
@action({ UUID: "com.textic.dyno-controller.now-playing" })
export class NowPlayingAction extends SyncedKeyAction<NowPlayingSettings> {
	private cache = new Map<string, { title?: string; image?: string }>();

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<NowPlayingSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.syncAction(ev.action, ev.payload.settings);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<NowPlayingSettings>): void {
		this.cache.delete(ev.action.id);
	}

	protected override async syncAction(
		action: KeyAction<NowPlayingSettings>,
		overrideSettings?: NowPlayingSettings,
	): Promise<void> {
		const settings = overrideSettings ?? (await action.getSettings());
		const titleMode = settings.titleMode ?? "titleArtist";
		const status = dynoClient.getStatus();
		const state = dynoClient.getState();
		const artwork = dynoClient.getArtwork();

		let nextTitle: string | undefined;
		let nextImage: string | undefined;

		if (status === "unauthorized") {
			nextTitle = "Invalid\nToken";
		} else if (status === "unconfigured") {
			nextTitle = "Set\nToken";
		} else if (status !== "connected") {
			nextTitle = "Dyno\nOffline";
		} else if (state?.isAd) {
			nextTitle = "Ad";
		} else if (state?.track) {
			if (artwork && artwork.videoId === state.track.videoId) {
				nextImage = artwork.image;
			}
			if (titleMode === "none") {
				nextTitle = "";
			} else if (titleMode === "title") {
				nextTitle = wrapKeyTitle(state.track.title);
			} else {
				const artist = state.track.artists.map((a) => a.name).join(", ");
				const titleLine = wrapKeyTitle(state.track.title, 13, 1);
				const artistLine = artist ? wrapKeyTitle(artist, 13, 1) : "";
				nextTitle = artistLine ? `${titleLine}\n${artistLine}` : titleLine;
			}
		} else {
			nextTitle = "Nothing\nPlaying";
		}

		const prev = this.cache.get(action.id) ?? {};
		if (prev.title !== nextTitle) {
			prev.title = nextTitle;
			await action.setTitle(nextTitle);
		}
		if (prev.image !== nextImage) {
			prev.image = nextImage;
			await action.setImage(nextImage);
		}
		this.cache.set(action.id, prev);
	}

	override async onKeyDown(ev: KeyDownEvent<NowPlayingSettings>): Promise<void> {
		if (dynoClient.getStatus() !== "connected") {
			dynoClient.reconnect();
			await ev.action.showAlert();
			return;
		}
		const pressAction = ev.payload.settings.pressAction ?? "toggle";
		if (pressAction === "none") return;
		await runDynoCommand(ev.action, { type: pressAction });
	}
}
