import { action, type KeyAction, type KeyDownEvent } from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, type EmptySettings, SyncedKeyAction } from "./helpers";

/** Keypad action that toggles queue shuffle in Dyno Music. */
@action({ UUID: "com.textic.dyno-controller.shuffle" })
export class ShuffleAction extends SyncedKeyAction<EmptySettings> {
	protected override async syncAction(action: KeyAction<EmptySettings>): Promise<void> {
		if (action.isInMultiAction()) return;
		await action.setState(dynoClient.getState()?.shuffle ? 1 : 0);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await runDynoCommand(ev.action, { type: "shuffle" });
	}
}
