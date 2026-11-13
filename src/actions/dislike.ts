import { action, type KeyAction, type KeyDownEvent } from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, type EmptySettings, SyncedKeyAction } from "./helpers";

/** Keypad action that toggles Dislike rating on the current track. */
@action({ UUID: "com.textic.dyno-controller.dislike" })
export class DislikeAction extends SyncedKeyAction<EmptySettings> {
	protected override async syncAction(action: KeyAction<EmptySettings>): Promise<void> {
		if (action.isInMultiAction()) return;
		await action.setState(dynoClient.getState()?.likeStatus === "DISLIKE" ? 1 : 0);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const isDisliked = dynoClient.getState()?.likeStatus === "DISLIKE";
		await runDynoCommand(ev.action, { type: "like", status: isDisliked ? "INDIFFERENT" : "DISLIKE" });
	}
}
