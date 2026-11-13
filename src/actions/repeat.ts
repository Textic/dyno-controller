import { action, type KeyAction, type KeyDownEvent } from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import type { RepeatMode } from "../types";
import { runDynoCommand, type EmptySettings, SyncedKeyAction } from "./helpers";

const STATE_BY_REPEAT: Record<RepeatMode, number> = {
	NONE: 0,
	ALL: 1,
	ONE: 2,
};

@action({ UUID: "com.textic.dyno-controller.repeat" })
export class RepeatAction extends SyncedKeyAction<EmptySettings> {
	protected override async syncAction(action: KeyAction<EmptySettings>): Promise<void> {
		if (action.isInMultiAction()) return;
		const mode = dynoClient.getState()?.repeat ?? "NONE";
		await action.setState(STATE_BY_REPEAT[mode]);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await runDynoCommand(ev.action, { type: "repeat" });
	}
}
