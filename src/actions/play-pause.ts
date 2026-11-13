import { action, type KeyAction, type KeyDownEvent } from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, type EmptySettings, SyncedKeyAction } from "./helpers";

@action({ UUID: "com.textic.dyno-controller.play-pause" })
export class PlayPauseAction extends SyncedKeyAction<EmptySettings> {
	protected override async syncAction(action: KeyAction<EmptySettings>): Promise<void> {
		if (action.isInMultiAction()) return;
		await action.setState(dynoClient.isPlaying() ? 1 : 0);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await runDynoCommand(ev.action, { type: "toggle" });
	}
}
