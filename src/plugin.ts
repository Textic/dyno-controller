import streamDeck from "@elgato/streamdeck";
import { DislikeAction } from "./actions/dislike";
import { LikeAction } from "./actions/like";
import { MuteAction } from "./actions/mute";
import { NextAction } from "./actions/next";
import { NowPlayingAction } from "./actions/now-playing";
import { PlayPauseAction } from "./actions/play-pause";
import { PreviousAction } from "./actions/previous";
import { QuickPlayAction } from "./actions/quick-play";
import { RepeatAction } from "./actions/repeat";
import { ShuffleAction } from "./actions/shuffle";
import { VolumeDialAction } from "./actions/volume-dial";
import { VolumeStepAction } from "./actions/volume-step";
import { dynoClient } from "./dyno-client";
import type { GlobalSettings } from "./types";

streamDeck.logger.setLevel("info");

// Register all Keypad and Stream Deck+ Encoder actions exposed in manifest.json.
streamDeck.actions.registerAction(new PlayPauseAction());
streamDeck.actions.registerAction(new NextAction());
streamDeck.actions.registerAction(new PreviousAction());
streamDeck.actions.registerAction(new NowPlayingAction());
streamDeck.actions.registerAction(new LikeAction());
streamDeck.actions.registerAction(new DislikeAction());
streamDeck.actions.registerAction(new ShuffleAction());
streamDeck.actions.registerAction(new RepeatAction());
streamDeck.actions.registerAction(new MuteAction());
streamDeck.actions.registerAction(new VolumeStepAction());
streamDeck.actions.registerAction(new VolumeDialAction());
streamDeck.actions.registerAction(new QuickPlayAction());

/** Broadcasts the live WebSocket status snapshot to any open Property Inspector. */
const pushStatusToInspector = () => {
	if (!streamDeck.ui.action) return;
	void streamDeck.ui.sendToPropertyInspector({
		type: "status",
		...dynoClient.getStatusSnapshot(),
	});
};

dynoClient.on("connection", pushStatusToInspector);
dynoClient.on("state", pushStatusToInspector);

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	dynoClient.configure(ev.settings);
});

streamDeck.ui.onDidAppear(() => {
	pushStatusToInspector();
});

streamDeck.ui.onSendToPlugin((ev) => {
	const payload = ev.payload as { type?: string } | null;
	if (payload?.type === "reconnect") {
		dynoClient.reconnect();
	} else if (payload?.type === "getStatus") {
		pushStatusToInspector();
	}
});

/** Connects to the Stream Deck host and initializes Dyno Music from saved Global Settings. */
async function start(): Promise<void> {
	await streamDeck.connect();
	const globalSettings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	dynoClient.configure(globalSettings);
}

void start();
