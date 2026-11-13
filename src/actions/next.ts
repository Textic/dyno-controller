import { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { runDynoCommand } from "./helpers";

/** Keypad action that skips to the next track in Dyno Music. */
@action({ UUID: "com.textic.dyno-controller.next" })
export class NextAction extends SingletonAction {
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await runDynoCommand(ev.action, { type: "next" });
	}
}
