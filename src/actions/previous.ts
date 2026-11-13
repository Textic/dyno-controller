import { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { runDynoCommand } from "./helpers";

@action({ UUID: "com.textic.dyno-controller.previous" })
export class PreviousAction extends SingletonAction {
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await runDynoCommand(ev.action, { type: "previous" });
	}
}
