import { action, type KeyAction, type KeyDownEvent } from "@elgato/streamdeck";
import { dynoClient } from "../dyno-client";
import { runDynoCommand, type EmptySettings, SyncedKeyAction } from "./helpers";

/** Keypad action that toggles Like rating on the current track. */
@action({ UUID: "com.textic.dyno-controller.like" })
export class LikeAction extends SyncedKeyAction<EmptySettings> {
	protected override async syncAction(action: KeyAction<EmptySettings>): Promise<void> {
		if (action.isInMultiAction()) return;
		await action.setState(dynoClient.getState()?.likeStatus === "LIKE" ? 1 : 0);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const isLiked = dynoClient.getState()?.likeStatus === "LIKE";
		await runDynoCommand(ev.action, { type: "like", status: isLiked ? "INDIFFERENT" : "LIKE" });
	}
}
