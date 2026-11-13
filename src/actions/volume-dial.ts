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

type VolumeDialSettings = {
	step?: number;
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
		const step = Math.max(1, Math.min(20, Number(ev.payload.settings.step) || 2));
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
		await this.toggleMute(ev.action);
	}

	override async onTouchTap(ev: TouchTapEvent<VolumeDialSettings>): Promise<void> {
		await this.toggleMute(ev.action);
	}

	private async toggleMute(act: DialAction<VolumeDialSettings>): Promise<void> {
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
				title: "Dyno Music",
				value: "Offline",
				indicator: { value: 0 },
				icon: "imgs/actions/mute/off",
			});
			return;
		}

		const muted = overrideMuted ?? state.muted;
		const volume = Math.round(overrideVolume ?? this.optimisticVolume ?? state.volume);
		await act.setFeedback({
			title: muted ? "Muted" : "Volume",
			value: muted ? "0%" : `${volume}%`,
			indicator: { value: muted ? 0 : volume },
			icon: muted || volume === 0 ? "imgs/actions/mute/on" : "imgs/actions/mute/off",
		});
	}
}
