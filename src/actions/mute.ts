import { action, type KeyAction, type KeyDownEvent } from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, type EmptySettings, SyncedKeyAction } from "./helpers";

/** Keypad action that toggles audio mute in Dyno Music. */
@action({ UUID: "com.textic.dyno-controller.mute" })
export class MuteAction extends SyncedKeyAction<EmptySettings> {
	protected override async syncAction(action: KeyAction<EmptySettings>): Promise<void> {
		if (action.isInMultiAction()) return;
		await action.setState(dynoClient.getState()?.muted ? 1 : 0);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const muted = !(dynoClient.getState()?.muted ?? false);
		await runDynoCommand(ev.action, { type: "mute", muted });
	}
}
