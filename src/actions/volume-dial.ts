import {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type TouchTapEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand } from "./helpers";

type DialPressMode = "toggle" | "mute";

type VolumeDialSettings = {
	step?: number;
	pushAction?: DialPressMode;
	touchAction?: DialPressMode;
};

@action({ UUID: "com.textic.dyno-controller.volume-dial" })
export class VolumeDialAction extends SingletonAction<VolumeDialSettings> {
	private subscribed = false;
	private optimisticVolume: number | null = null;
	private optimisticTimer: NodeJS.Timeout | null = null;

	constructor() {
		super();
		this.ensureSubscribed();
	}

	private ensureSubscribed(): void {
		if (this.subscribed) return;
		this.subscribed = true;
		const refreshAll = () => {
			for (const act of this.actions) {
				if (act.isDial()) {
					void this.updateFeedback(act);
				}
			}
		};
		dynoClient.on("state", refreshAll);
		dynoClient.on("artwork", refreshAll);
		dynoClient.on("connection", refreshAll);
	}

	override async onWillAppear(ev: WillAppearEvent<VolumeDialSettings>): Promise<void> {
		if (ev.action.isDial()) {
			await this.updateFeedback(ev.action);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<VolumeDialSettings>): Promise<void> {
		if (ev.action.isDial()) {
			await this.updateFeedback(ev.action);
		}
	}

	override async onDialRotate(ev: DialRotateEvent<VolumeDialSettings>): Promise<void> {
		const step = Math.max(1, Math.min(20, Number(ev.payload.settings.step) || 5));
		const base = this.optimisticVolume ?? dynoClient.getState()?.volume ?? 50;
		const nextVolume = Math.max(0, Math.min(100, Math.round(base + ev.payload.ticks * step)));

		this.optimisticVolume = nextVolume;
		if (this.optimisticTimer) clearTimeout(this.optimisticTimer);
		this.optimisticTimer = setTimeout(() => {
			this.optimisticVolume = null;
		}, 1200);

		await this.updateFeedback(ev.action, nextVolume, false);
		await runDynoCommand(ev.action, { type: "volume", value: nextVolume });
	}

	override async onDialDown(ev: DialDownEvent<VolumeDialSettings>): Promise<void> {
		await this.runPressAction(ev.action, ev.payload.settings.pushAction ?? "toggle");
	}

	override async onTouchTap(ev: TouchTapEvent<VolumeDialSettings>): Promise<void> {
		await this.runPressAction(ev.action, ev.payload.settings.touchAction ?? "mute");
	}

	private async runPressAction(act: DialAction<VolumeDialSettings>, mode: DialPressMode): Promise<void> {
		if (mode === "toggle") {
			await runDynoCommand(act, { type: "toggle" });
			return;
		}
		const muted = !(dynoClient.getState()?.muted ?? false);
		await runDynoCommand(act, { type: "mute", muted });
	}

	private async updateFeedback(
		act: DialAction<VolumeDialSettings>,
		overrideVolume?: number,
		overrideMuted?: boolean,
	): Promise<void> {
		const connected = dynoClient.getStatus() === "connected";
		const state = dynoClient.getState();

		if (!connected || !state) {
			await act.setFeedback({
				title: "Dyno Dial",
				value: "Offline",
				indicator: { value: 0 },
				icon: "imgs/actions/volume-dial/key",
			});
			return;
		}

		const muted = overrideMuted ?? state.muted;
		const volume = Math.round(overrideVolume ?? this.optimisticVolume ?? state.volume);
		const artwork = dynoClient.getArtwork();
		const hasTrackArtwork =
			!state.isAd && Boolean(state.track?.videoId && artwork?.videoId === state.track.videoId && artwork.image);
		const musicIcon = hasTrackArtwork ? artwork!.image : "imgs/actions/volume-dial/key";

		await act.setFeedback({
			title: state.track?.title?.trim() || "Dyno Dial",
			value: muted ? "Muted" : `${volume}%`,
			indicator: { value: muted ? 0 : volume },
			icon: muted ? "imgs/actions/mute/on" : musicIcon,
		});
	}
}
