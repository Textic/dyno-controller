import {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
} from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, SyncedKeyAction } from "./helpers";

type VolumeStepSettings = {
	direction?: "up" | "down";
	step?: number;
	showVolume?: boolean;
};

/** Keypad action that steps Dyno Music volume up or down and optionally displays volume %. */
@action({ UUID: "com.textic.dyno-controller.volume-step" })
export class VolumeStepAction extends SyncedKeyAction<VolumeStepSettings> {
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<VolumeStepSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await this.syncAction(ev.action, ev.payload.settings);
		}
	}

	protected override async syncAction(
		action: KeyAction<VolumeStepSettings>,
		overrideSettings?: VolumeStepSettings,
	): Promise<void> {
		const settings = overrideSettings ?? (await action.getSettings());
		const direction = settings.direction ?? "up";
		if (!action.isInMultiAction()) {
			await action.setState(direction === "down" ? 1 : 0);
		}

		if (settings.showVolume === false) {
			await action.setTitle("");
			return;
		}
		const state = dynoClient.getState();
		if (dynoClient.getStatus() !== "connected" || !state) {
			await action.setTitle(direction === "down" ? "Vol -" : "Vol +");
			return;
		}
		await action.setTitle(state.muted ? "Muted" : `${Math.round(state.volume)}%`);
	}

	override async onKeyDown(ev: KeyDownEvent<VolumeStepSettings>): Promise<void> {
		const { direction = "up", step = 5 } = ev.payload.settings;
		const numericStep = Math.max(1, Math.min(50, Number(step) || 5));
		const current = dynoClient.getState()?.volume ?? 50;
		const delta = direction === "down" ? -numericStep : numericStep;
		const nextVolume = Math.max(0, Math.min(100, Math.round(current + delta)));
		await runDynoCommand(ev.action, { type: "volume", value: nextVolume });
	}
}
