# Radio Days — product spec v2.0

This file is the accepted product spec for Radio Days, version 2.0, on `main`. It replaces the earlier Laget Bots spec (v1.0). Linear PAN-267 tracks this spec.

**Name:** Radio Days.
**Repo:** [https://github.com/PanamaDonne/radio-days](https://github.com/PanamaDonne/radio-days). The repository rename is done.
**Visibility:** the repo stays public.
**Owner:** Daniel Hansson. **PO:** Jörgen.
**Date:** 2026-11-26.
**Language in the product:** code identifiers in English; user-facing voice and admin text in Swedish.

---

## 1. What it is

Radio Days is a voice agent inside an old radio (or cassette player). It gets to know the user and makes its own decisions. The user talks to the radio. It runs on a Raspberry Pi 4 with 4 GB, hidden in a set that Daniel finds himself.

v1 is wake word, spoken conversation with an AI that learns the user’s habits and preferences and acts on them when it is confident enough (it asks only when it is unsure), proactive speech (a morning brief is a less important example; the important unprompted utterances are calendar reminders and incoming email from senders the user has chosen, arriving with a later calendar integration and with Gmail in v2), Spotify controlled entirely by voice (play, next and previous track, choose artist, album and playlist, and playlist and favourite changes, with no approval button; a Spotify Premium account is required), long-term memory of the user, and a cloud web admin. Multi-step goal planning is not in v1. The former team engine is shut down. Work continues in the same repository.

**User:** in the first place Daniel, at home, speaking Swedish to the radio.

**User value:** The radio gets to know Daniel. When it is confident enough in a habit, it chooses for him, and it asks only when it is unsure. He can walk up to an old radio, say a wake word, talk with an AI, and control Spotify without touching a phone or a button. He can turn autonomous behaviour off, and he can correct or forget a learned habit, by voice and in the web admin. The radio may also speak first. A morning brief is a less important example. Calendar reminders, and incoming email from senders he has chosen, are the important ones; they arrive with a later calendar integration and with Gmail in v2. Unprompted speech stays out of quiet hours and within the limit on how often. Secrets and memory, including learned habits, stay on the Pi, not in the cloud. Setup is done from any computer through a simple web admin.

**Product principle: super simple.** Talking to the radio should feel as easy as talking to a person in the room. No infrastructure knowledge is needed for everyday use.

---

## 2. Scope

### 2.1 In scope for v1

* Wake word, with optional push-to-talk as a backup (not as approval).
* Spoken conversation with one AI agent.
* Voice chain: realtime speech via Berget Pianissimo (`klang/pianissimo`). Text-to-speech in v1 is local Piper on the Pi, with a Swedish voice (section 6). ReadSpeaker is the fallback if quality is not good enough.
* Spotify by voice, with no button. A Spotify Premium account is required. The user can play, skip to the next or previous track, choose artist, album and playlist by voice, and change playlists and favourites. Pause, volume and questions such as “what is playing now?” are included.
* Long-term memory of the user, stored only on the Pi (see section 8).
* Learning habits and preferences, and acting on them when the agent is confident enough. It asks only when it is unsure. This is the primary autonomous behaviour in v1 (section 5).
* Proactive speech, secondary to that learning. The radio may speak unprompted, subject to quiet hours and a limit on how often. A morning brief is a less important example. The important unprompted utterances are calendar reminders and incoming email from senders the user has chosen. Calendar reminders come with a later calendar integration. Incoming email from those senders comes with Gmail in v2.
* Turning autonomous behaviour off, and correcting or forgetting a learned habit, by voice and in the web admin.
* Learned habit data stays in the on-device encrypted memory. The cloud sees only status.
* Cloud web admin skeleton: sign-in, pairing the Pi with a device code, provider and API key, Spotify connection, connection status, viewing and deleting memory, turning autonomous behaviour off, correcting or forgetting a learned habit, and downloading an encrypted backup (see section 7).
* Secrets stored on the Pi, encrypted on disk. ATECC608 is optional in v1.
* Status lamp on the radio scale: on when listening, pulsing when thinking, idle when at rest.
* Evals for intent-to-tool accuracy and memory; latency is logged (see section 11).
* A token cap per conversation. A provider key alone does not start a paid call; an explicit choice is required.

### 2.2 In scope for v2

* Gmail (sending mail and similar serious actions). Telling the user about incoming email from senders the user has chosen is proactive speech and comes with this (section 5). Sending mail still requires the physical approval button.
* A physical approval button on the radio for those serious actions (see section 10).
* Approval evals: no mail or similar action with consequences outside the radio without a physical button press, including when the agent is acting on its own.
* ATECC608 required, including the option to lock the memory-database key in the chip.
* Lamp wait-state for approval, in addition to the v1 lamp states.

Weather and other later services may follow after v2; they are not committed in this spec. A calendar integration is also later, and is not a v1 or v2 milestone. When it arrives, calendar reminders are one of the important things the radio may say unprompted (section 5).

### 2.3 Out of scope

* Further work on the Laget Bots team engine (roles, handoff contracts, questions between agents, the PO/dev/reviewer development flow, MAST collaboration metrics as CI gates).
* PR #13 and the remaining Laget Bots stage-1 work stay paused.
* A local admin UI as the primary surface (replaced by the hosted web admin).
* Mobile apps.
* Multi-step goal planning in v1. The radio does not set a goal of its own and carry out a chain of steps to reach it. No later version of that behaviour is committed here.
* A local model on the Pi (optional later, not v1).
* Bluetooth speakers (avoided because of latency).
* Mounting in the radio cabinet, HiFiBerry or other amplifier fitting, and volume or channel knobs: these wait until Daniel has found a radio. A desk prototype with Pi and microphone is enough for v1 software milestones.
* Secrets, keys, device identifiers or personal data in the repository — ever. The repo stays public.

---

## 3. What is kept, changed and removed from v1.0

### Kept

* TypeScript, the same GitHub repository (`PanamaDonne/radio-days`), `AGENTS.md`, CI (typecheck, lint, tests), and the workflow: Daniel builds and opens the PR; Vera reviews and Lazek QA-tests the same sha and posts a verdict in the PR; only Daniel merges. Linear issue ids belong in branch names and PR titles.
* The user brings their own key and may use any OpenAI-compatible provider. EU and Swedish providers come first and are the defaults (Berget, then Mistral). Grok and OpenAI are allowed and clearly marked as non-EU.
* The existing provider-client idea, and the rule that a key alone does not start a paid call.
* The idea of human approval before serious actions. It does not apply to Spotify and is not in v1. It returns in v2 with a physical button, when mail can be sent. Any action with consequences outside the radio requires that button, including when the agent is acting on its own.
* Evals in CI, with new metrics that fit voice, Spotify and memory. The approval eval comes with mail in v2.
* Secrets never go in config, code, traces or the public repo.
* A token cap per conversation (formerly per team run).

### Changed

* The product is a voice assistant in a radio, not an engine for collaborating development agents. The assistant gets to know the user and makes its own decisions (section 5).
* One agent with tools, not PO, dev and reviewer agents. The team engine is shut down in this repo, not kept as a side track.
* Runtime moves to a Pi 4 (4 GB), always on, with voice as the interface and a wake word.
* Admin becomes a hosted web app (Next.js on Vercel, with Supabase). In v1.0 a hosted admin UI was out of scope.
* Keys and OAuth tokens are stored encrypted on disk on the Pi. The cloud forwards ciphertext only and shows connection status. Memory is also read and deleted through the Pi; the cloud keeps no copy.
* The first test bench is conversation plus Spotify by voice, plus memory, not a development flow against a sandbox repo.
* Evals shift to intent-to-tool accuracy, latency (logged in v1), and memory quality. Button approval is a v2 requirement.
* The repo stays public (v1.0 was already open; a later proposal to make it private is not followed).
* Cost changes. v1.0 assumed 0 SEK/month in infrastructure. A hosted admin, voice models, embeddings and Spotify calls add cost. The running-cost estimate is in section 14.
* The product name is Radio Days, not Laget Bots. The repository is `PanamaDonne/radio-days`.

### Removed from the v1.0 spec

* A team of collaborating agents, handoff contracts, questions between agents, and the development flow (PO, dev, reviewer, merge).
* The simple **local** administration UI as the primary surface.
* The decision that hosted admin is out of v1.
* MAST metrics for collaboration between agents, as primary CI requirements.
* Gmail, calendar and weather in v1 (mail returns in v2; calendar and weather stay later).
* Physical approval button and button evals in v1.
* A required security chip in v1 (ATECC608 is optional in v1, required in v2).

Spotify, memory, the voice chain and the hosted admin are new. They were not in v1.0.

---

## 4. Hardware

Daniel finds the radio or cassette player himself. No shop prices are listed here. Compatibility between the Pi 4, the chosen amplifier, the microphone and the set Daniel finds is not verified here. For a desk prototype, the Pi and a microphone are enough.

* Raspberry Pi 4 with 4 GB, official power supply, and a new microSD card. A Pi 5 is optional, not required.
* The radio’s or cassette player’s own speaker, driven by a small amplifier or a HiFiBerry board (for example Amp4). Bluetooth speakers are avoided because of latency.
* Microphone: Jabra Speak 410 or ReSpeaker USB Mic Array, with echo cancellation. The Jabra is speaker and microphone in one and can be used on the desk before the cabinet is ready; in the finished radio, the radio’s speaker is used.
* No approval button in v1. An optional push-to-talk button may sit as a backup to the wake word. Volume and channel knobs are not required in the first cut.
* Scale lamp as status in v1: on when listening, pulsing when thinking, idle or dim when at rest. A wait-state for approval is added in v2.
* ATECC608 is optional in v1 (Daniel is buying one) and required in v2, when mail and physical approval arrive. In v1, encrypted secrets on disk (including SQLCipher for the memory database) are enough. In v2 the memory-database key can be locked in the ATECC608.

---

## 5. An agent that learns and decides

Radio Days gets to know its user and makes its own decisions. It is not only a device that waits for the next order. Over time it knows the person well enough to choose, and it asks only when it needs to.

Daniel set the v1 scope of this autonomy on 2026-11-26.

**Primary: habits and preferences.** The radio learns the user’s habits and preferences, for example what they usually want to hear in the morning, or how they like to be answered. It learns so it can decide on its own instead of asking every time. It acts on what it has learned when it is confident enough, and it asks only when it is unsure. It does not invent a preference to fill the gap.

**Secondary: proactive speech.** The radio may also speak without being asked. This is secondary to learning habits. The important things it says unprompted are calendar reminders, and incoming email from senders the user has chosen. Calendar reminders come with a later calendar integration, which is not part of v1 or v2. Incoming email from those senders comes with Gmail in v2. Saying that such mail has arrived is speech. Sending mail still requires the physical approval button (section 10). A morning brief is an example of a less important unprompted utterance. Proactive speech follows the guardrails below.

**Not in v1.** Multi-step goal planning is not in v1. The radio does not set a goal of its own and carry out a chain of steps to reach it.

### Guardrails

* **Quiet hours.** The radio does not speak unprompted during quiet hours. When the user talks to it during those hours, it still answers.
* **How often.** There is a limit on how often the radio may speak unprompted. A reply the user asked for does not count toward that limit.
* **Off, correct, forget.** The user can turn autonomous behaviour off, and can correct or forget a learned habit, by voice and in the web admin. While autonomous behaviour is off, the radio does not act on a learned habit on its own and does not speak unprompted. It still answers when spoken to. A correction replaces the habit the radio uses from then on. A forgotten habit is not used again.
* **On the device.** Learned habit data stays on the device, in the on-device encrypted memory (section 8). The cloud sees only status.
* **Outside the radio.** Any action with consequences outside the radio always requires the physical approval button. Sending email in v2 is an example. A learned habit, confidence, or the radio deciding on its own does not replace that press (section 10). Actions inside the radio, including Spotify, do not need the button.

The clock times for quiet hours, and the maximum number of unprompted turns, are open (section 15).

---

## 6. Voice agent and everyday use

The user says the wake word. The Pi listens with a local wake-word detector (openWakeWord). Optional push-to-talk is only a backup, never an approval.

Realtime speech goes through Berget: **Pianissimo** (`klang/pianissimo`). Spoken replies are in Swedish. **Text-to-speech in v1 is local Piper on the Raspberry Pi**, with a Swedish voice such as `sv_SE-nst-medium` or `sv_SE-alma-medium` (decision 2026-11-26, Daniel). ReadSpeaker is the fallback if that quality is not good enough. Berget’s Sten text-to-speech is not available and is not the v1 choice.

Checked against Berget’s public catalogue on 2026-11-26 ([models page](https://berget.ai/en/models) and [`GET https://api.berget.ai/v1/models`](https://api.berget.ai/v1/models)). Daniel also confirmed the same day that Sten is not listed in his logged-in [Berget console](https://console.berget.ai/models).

* Pianissimo is listed and active. Model id: `klang/pianissimo`. Type: speech-to-text. Licence: CC-BY-4.0. Realtime use is the OpenAI-compatible WebSocket at `wss://api.berget.ai/v1/realtime?intent=transcription`, as documented in Berget’s [API reference](https://api.berget.ai/) and the [realtime transcription announcement](https://berget.ai/en/blog/realtime-transcription-launch). List price in the catalogue is €0.00005833333 per second (the announcement states €3.50 per 1,000 minutes of audio). The announcement also cites Klang’s own throughput figure of around 3,600× real time; that is a model benchmark, not a measured end-to-end latency for this product.

**Text-to-speech for v1.** There is no TTS model or `/v1/audio/speech` path in Berget’s public catalogue or [OpenAPI](https://api.berget.ai/openapi.json) as of that check. A Hugging Face card for [`bergetai/sten`](https://huggingface.co/bergetai/sten) describes a hosted API, but Sten is not in the catalogue or in Daniel’s console, so Sten is not available and is not used.

1. **Chosen: local Piper on the Pi 4, Swedish voice.** The official Piper CLI documents an arm64 binary for a 64-bit Raspberry Pi 4 ([CLI.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md)). The engine is GPL-3.0-or-later ([piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), [PyPI](https://pypi.org/project/piper-tts/)). Official Swedish voices in [piper-voices](https://huggingface.co/rhasspy/piper-voices) include `sv_SE-nst-medium` (quality: medium; dataset licence CC0; trained from scratch by KBLab) and `sv_SE-alma-medium` (quality: medium; model weights CC BY 4.0; trained on the NST Swedish TTS dataset, which the card describes as high-quality studio recordings of Swedish speech). Official cards: [nst](https://huggingface.co/rhasspy/piper-voices/blob/main/sv/sv_SE/nst/medium/MODEL_CARD), [alma](https://huggingface.co/rhasspy/piper-voices/blob/main/sv/sv_SE/alma/medium/MODEL_CARD). Samples: [piper-samples](https://rhasspy.github.io/piper-samples/). The CLI document says running Piper once per request can be slow because the voice is loaded each time, and recommends the web server for repeated use. No official end-to-end latency figure for a Pi 4 with 4 GB was found. Incremental running cost is €0 (no hosted TTS fee).
2. **Fallback: ReadSpeaker speechCloud API (EU).** Used only if Piper’s quality is not good enough. ReadSpeaker AB is headquartered in Sweden (Uppsala). The [speechCloud API](https://www.readspeaker.com/products/speechcloud-api/) is described as EU-based, GDPR compliant and ISO/IEC 27001:2022 certified, and as generating “natural-sounding synthetic speech”. The [Swedish voice list](https://www.readspeaker.com/languages-voices/swedish/) has six neural sv-SE voices: Fredrik, Karin, Linnea, Maja, Majsan and Sven. Pricing is a credits model (1 credit = 1 character excluding whitespace); production credits are ordered through an account manager, and no public unit price in euro was published on that page. Latency is not stated there.

v1 uses local Piper. ReadSpeaker is only that quality fallback. The cost principle in section 14 is to take the cheapest option that meets the quality and latency evals; Piper has no hosted fee.

One always-on voice agent runs on the Pi (TypeScript). It gets to know the user and makes its own decisions (section 5). It holds a conversation with the AI, controls Spotify by voice, and uses long-term memory (section 8). The user chooses the conversation model through their AI provider (section 9). Every conversation has a token cap.

Spotify is controlled entirely by voice, with no button. A **Spotify Premium** account is required. This matches Spotify’s own rule that Web API playback-control endpoints work only for Premium users, for example [Start/Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback).

By voice the user can play, skip to the next or previous track, and choose artist, album and playlist, and can change playlists and favourites. Pause, volume and questions such as “what is playing now?” are included. When the agent is confident in a learned habit, it may choose Spotify on its own, still with no approval button (section 5). Playback uses Spotify Connect (raspotify) together with the Spotify Web API.

---

## 7. Web admin

The web admin is a cloud app: Next.js on Vercel, with Supabase. It works from any computer or phone.

In the admin the user:

* signs in
* pairs the Pi with a device code, in the same way as a smart TV
* chooses an AI provider and enters an API key
* connects Spotify
* sees connection status (never secrets in cleartext)
* views and deletes long-term memory (section 8)
* turns autonomous behaviour off and on
* corrects or forgets a learned habit
* downloads an encrypted backup of memory

The API key is encrypted in the browser with the Pi’s public key. The cloud forwards only ciphertext that only the Pi can open. Spotify uses OAuth with PKCE; the token exchange happens on the Pi. Refresh tokens are stored on the Pi, encrypted on disk. The cloud sees status only, never secrets.

Turning autonomous behaviour off, and correcting or forgetting a learned habit, are done here as well as by voice. Both go through the Pi. Learned habit data stays on the device. The cloud sees only status.

In v1 a skeleton is enough: sign-in, pairing, provider and key, Spotify connection, status, memory view and delete, turning autonomous behaviour off, correcting or forgetting a learned habit, and encrypted backup download. Those habit controls are part of milestone 4, together with long-term memory.

---

## 8. Long-term memory

The agent has long-term memory about the user, for example name, music taste, habits and earlier conversations. Habits and preferences the agent learns (section 5) are part of this memory. Learned habit data stays on the device, in the on-device encrypted memory. The cloud sees only status. Daniel has prior experience of memory and RAG from Präpp; that experience may inform the work, but this product’s rules are the ones below.

Memory is stored only on the Pi, in SQLite with sqlite-vec for semantic search. The v1 default for embeddings is Berget’s E5, model id `intfloat/multilingual-e5-large-instruct` (PO recommendation, 2026-11-26; Daniel can still object). Rationale: the instruct model is the documented default on Berget’s embeddings API; a large E5 model is heavy to run with good latency on a Pi 4 with 4 GB; conversation already goes via Berget in the EU; only short extracted fact texts are sent; vectors and memory stay encrypted on the Pi. A small local embedding model may be added later as an optional offline fallback; it is not required in v1. Berget’s public catalogue on 2026-11-26 also lists `intfloat/multilingual-e5-large` (both active, MIT). Sources: [catalogue](https://api.berget.ai/v1/models), [OpenAPI](https://api.berget.ai/openapi.json), [model chains](https://docs.berget.ai/models/model-chains). After each conversation, facts are extracted. The 5–10 most relevant memories are retrieved into each new conversation.

The database file is encrypted with SQLCipher. Its key can later be locked in the ATECC608 (required path in v2; optional if the chip is fitted in v1).

The web admin reads and deletes memory via the Pi. No copy of memory is kept in the cloud. Memory content must never appear in cloud storage or in cloud or repo logs. The admin can also download an encrypted backup. A backup must be encrypted and restorable on the Pi.

---

## 9. Privacy, security and providers

**Public repository.** The repo stays public, as `PanamaDonne/radio-days`. Because of that, secrets, keys, device identifiers and personal data must never be committed, logged into the repo, or otherwise placed in the repository.

**Secrets live on the Pi**, encrypted on disk. The cloud does not store API keys, OAuth tokens, memory content, or learned habit data. It may store only what it needs to sign the user in, pair a device, and show status.

**Providers, EU first.** The user brings their own key. Any OpenAI-compatible provider can be added. EU and Swedish providers are listed first and are the defaults: Berget (Swedish), then Mistral (EU). Non-EU providers such as Grok and OpenAI are allowed and clearly flagged as non-EU. Realtime speech in v1 is Berget Pianissimo (`klang/pianissimo`). Text-to-speech in v1 is local Piper on the Pi with a Swedish voice; ReadSpeaker is the fallback if quality is not good enough (section 6). Sten is not available and is not used. A key in the environment or in the admin is not enough on its own to start a paid call; an explicit choice is required.

**ATECC608** is optional in v1 and required in v2 (see section 4).

---

## 10. Physical approval for serious actions (v2)

The button is not in v1. Spotify, including playlists and favourites, is then controlled entirely by voice. The agent may also act on a learned habit inside the radio, including Spotify, without the button (section 5).

In v2, when the radio can send mail and similar, a press on a physical button on the radio is required for those serious actions. A spoken “yes” or a click in the admin is not enough.

Any action with consequences outside the radio always requires the physical approval button. Sending email in v2 is an example. This holds when the user has just asked and when the agent is acting on its own, from a learned habit or from proactive speech. Confidence does not replace the press.

**Serious in v2 (requires the button):**

* Sending mail, and other actions with consequences outside the radio, including when the agent would otherwise take them on its own.

**Not serious (the agent may do them when the user asks, and when it acts on a learned habit it is confident about), already in v1:**

* Conversation with the AI.
* All Spotify control: play, next and previous track, choose artist, album and playlist, pause, volume, and changes to playlists and favourites.
* Questions such as “what is playing now?”.

**Flow in v2, for example when sending mail:**

1. The agent says briefly what will happen, for example: “Jag skickar mejlet till Anna. Tryck på knappen för att godkänna.”
2. The lamp enters a wait state: a clear, slow blink that cannot be confused with “listening” or “thinking”.
3. The user presses the approval button once. The action runs, the lamp gives a short confirmation blink, and the radio says a short “klart”.
4. If the button is not pressed within about 15 seconds, the action is cancelled. The radio says so, and the lamp returns to idle. Nothing is carried out.
5. A press when the radio is not waiting for approval does nothing serious. The same button may work as push-to-talk when it is not waiting.

**Lamp in v2:** off or dim when idle, steady when listening after the wake word, pulsing when thinking, slow blink when waiting for the button, short double blink when approved, back to idle on cancel or timeout. In v1 only idle, listening and thinking are used.

---

## 11. Evals

| Eval | Metric | Gate |
| -- | -- | -- |
| Intent to tool | Share of utterances that lead to the right tool (or to no tool, when the turn is only conversation) | Threshold after the first baseline |
| Latency | Time from end of speech after the wake word to first audio in the reply | Logged in v1; threshold after a baseline |
| Memory recall | Stored facts that should be recalled are recalled correctly in a later turn | Threshold after the first baseline |
| Memory invention | The agent must not present invented personal facts as memory | 0 invented “memories” on the test set |
| Memory deletion | A fact or learned habit the user deleted, or told the radio to forget, is no longer retrievable or spoken | 100 % |
| Memory privacy | Memory content must not appear in cloud storage or in cloud or repo logs | 0 leaks on the test set |
| Encrypted backup | A downloaded backup is encrypted (not readable as cleartext) and restorable on the Pi | 100 % |
| Approval safety (v2) | Mail or any other action with consequences outside the radio, including when the agent is acting on its own, without a physical button press | 0 (100 %) |

Handoff-contract survival and MAST metrics between agents are removed as v1 requirements. The approval eval arrives in v2 together with mail.

Thresholds that are not already 100 % or 0 are set after a first baseline. Evals run in CI and fail the build when a gate is not met.

---

## 12. Plan (milestones, no fixed timeline)

The plan takes the time it takes. Each milestone is done only when its done criterion is met, not when a date passes. PR #13 and remaining Laget Bots stage-1 work stay paused. The team engine is not developed further.

A first thin slice should still be possible to wake, talk to, and use for Spotify, with admin and memory following as their own milestones. Milestone 1 already includes an agent that decides from what it knows (section 5). Storing learned habits on the device, and correcting them in the web admin, are part of milestone 4. Mounting in the radio cabinet is outside the software milestones and waits until Daniel has a radio.

Every frontend or backend item below is done only when the stated outcome is true **and** it is covered by unit tests, with CI green.

**Milestone 1: Wake word, conversation, and an agent that decides**

* Local wake word, with optional push-to-talk as backup.
* Voice chain: Berget Pianissimo (`klang/pianissimo`) for realtime speech, and local Piper on the Pi for text-to-speech with a Swedish voice (section 6). Spoken replies in Swedish.
* One voice agent that gets to know the user (section 5). It learns habits and preferences. When it is confident enough, it acts on what it has learned. When it is unsure, it asks. Proactive speech is secondary. A morning brief is a less important example. Calendar reminders and incoming email from senders the user has chosen are the important unprompted utterances; they arrive with a later calendar integration and with Gmail in v2. The radio does not speak unprompted during quiet hours, and unprompted speech stays within the limit on how often.
* Multi-step goal planning is not in v1.
* The user can turn autonomous behaviour off, and can correct or forget a learned habit, by voice. The same controls are in the web admin (milestone 4). Learned habit data stays on the device. Any action with consequences outside the radio waits for the physical approval button (v2).
* One provider, with a token cap and the rule that a key alone does not start a paid call.
* Scale lamp: idle, listening, thinking.
* Done when: after the wake word, the user can have a short spoken conversation and hear the reply from the speaker. When the agent is confident enough in a learned habit, it acts without asking; when it is unsure, it asks. It does not speak unprompted during quiet hours or beyond the limit on how often, and it does not carry out multi-step goal planning. Covered by unit tests, CI green.

**Milestone 2: Spotify by voice**

* A Spotify Premium account is required.
* Playback via Spotify Connect (raspotify) and the Web API.
* By voice, with no button: play, next and previous track, choose artist, album and playlist, pause, volume, playlist and favourite changes, and “what is playing now?”.
* Done when: the user can control Spotify by voice, including play, next and previous, choosing artist, album and playlist, and playlist and favourite changes, and can ask what is playing. Covered by unit tests, CI green.

**Milestone 3: Web admin skeleton**

* Hosted admin (Next.js on Vercel, with Supabase): sign-in from any computer, pairing the Pi with a device code, provider and API key, Spotify connection, and status.
* The key is encrypted in the browser with the Pi’s public key. Spotify OAuth uses PKCE, with token exchange on the Pi. The cloud shows status, never secrets in cleartext.
* Done when: the user can sign in, pair the Pi, set a key, and connect Spotify, and secrets are not stored in the cloud in cleartext. Covered by unit tests, CI green.

**Milestone 4: Long-term memory**

* SQLite on the Pi with sqlite-vec; embeddings via Berget E5, default `intfloat/multilingual-e5-large-instruct`. A small local embedding model is an optional offline fallback, not required in v1.
* Facts extracted after each conversation; the 5–10 most relevant memories retrieved into each conversation.
* Database encrypted with SQLCipher. Admin reads and deletes memory via the Pi; no copy in the cloud. Encrypted backup can be downloaded and restored.
* Learned habits and preferences (section 5) are stored in that on-device encrypted memory. The user can turn autonomous behaviour off in the web admin, and can correct or forget a learned habit there, as well as by voice. The cloud sees only status.
* Done when: facts persist and are recalled in a later conversation; the user can view and delete memory in admin; deletion is effective; a backup is encrypted and restorable; memory content never appears in cloud storage or logs. The user can turn autonomous behaviour off, and can correct or forget a learned habit, in the admin and by voice. A forgotten habit is not used again. The cloud sees only status. Covered by unit tests, CI green.

**Milestone 5: Evals and CI gate**

* Test set and eval runner for intent-to-tool, logged latency, memory recall, memory invention, memory deletion, memory privacy, and encrypted backup.
* CI gate on PRs.
* Done when: CI turns red on a planted memory leak, a failed deletion, or a wrong tool choice in the test set, and green again when it is fixed. Covered by unit tests, CI green.

**v2 (after v1):** Gmail; physical approval button and lamp wait-state for every action with consequences outside the radio, including when the agent would otherwise act on its own; ATECC608 required, with the memory-database key lockable in the chip; approval eval (zero such actions without a button press). Each of those items is done when its behaviour holds and it is covered by unit tests, with CI green.

---

## 13. Process and workflow

These rules are unchanged from v1.0, except that the product and the repository are now Radio Days / `PanamaDonne/radio-days`.

* `AGENTS.md` stays the short project guide for commands and decisions that are not visible in the code. Confirm work with `npm run check` (typecheck, lint, tests) before calling work done.
* Daniel builds in Cursor and opens a PR. Vera (code review) and Lazek (QA, same sha) review and test every PR and always post their verdict (with sha) as a comment in the PR. Only Daniel merges.
* Every branch and PR title contains the Linear issue id.
* Done criterion for all code issues: covered by unit tests, CI green, Vera approved and Lazek QA on the same sha before merge.
* Skills continue to come from Daniel’s `~/Desktop/skills` into the repo with `npm run sync-skills`, with project adaptations kept separate, as in v1.0.
* Live model calls with real keys only with Daniel’s yes. QA uses fake keys and mocks only. Secrets never go in chat or code.

---

## 14. Running cost

The product should be cheap and good. **Principle:** use the cheapest option that still meets the quality and latency evals (section 11).

**Proposed cap (proposal, not locked):** €25 per device per month, excluding VAT, for Radio Days’ own cloud and model usage (Berget, with local Piper for text-to-speech). Spotify Premium is the user’s own subscription and sits outside the cap. Hardware, electricity and one-off purchases are also outside it.

### 14.1 Sources (checked 2026-11-26)

* Berget list prices and plans: [`GET /v1/models`](https://api.berget.ai/v1/models), [pricing](https://berget.ai/en/pricing), Pianissimo also in the [realtime announcement](https://berget.ai/en/blog/realtime-transcription-launch). All Berget prices below are **excluding VAT**. Swedish consumers are charged 25% VAT ([pricing FAQ](https://berget.ai/en/pricing)).
* Vercel Hobby (free): [Hobby plan](https://vercel.com/docs/plans/hobby).
* Supabase Free: [pricing](https://supabase.com/pricing); free projects may pause after a week of low activity ([project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
* Spotify Premium Individual, Sweden: 149 SEK per month after any trial ([spotify.com/se/premium](https://www.spotify.com/se/premium/)).
* Piper, the v1 text-to-speech choice: no hosted fee (section 6). ReadSpeaker speechCloud is the quality fallback and has no public unit price, so it is not in this estimate.

Berget’s [pricing FAQ](https://berget.ai/en/pricing) states that Trial includes €5 starting credits and €0 per month, and that **continued API access requires an active plan from €25 per month in prepaid credits** (Starter: €25 per month, with a €25 monthly top-up). Unused credits roll over and remain valid for 12 months. Plans include prepaid tokens at a discount to list price; this estimate uses **list prices** for usage, because the size of the plan discount is not published.

### 14.2 Usage assumptions (labelled, not measured)

For **one household, one device, 30 days**:

* 15 minutes of user speech per day is sent to Pianissimo after the wake word (local wake-word listening is not billed). That is 450 minutes of STT audio per month.
* 15 minutes of assistant speech per day (TTS).
* Unprompted speech, such as a morning brief (section 5), is not included in these minutes. A household that uses it every day will be above the figures here. Calendar reminders and incoming-email notices are also outside this estimate; they arrive with later services.
* 20 conversational turns per day (600 turns per month).
* Per turn, the conversation model is assumed to use 2,000 input tokens and 300 output tokens (system prompt, memories, recent turns, user text, and a short spoken reply). This is an assumption, not a measurement.
* Embeddings: 100 input tokens to embed the query on each turn, plus 200 input tokens of extracted facts after 10 conversations per day (120,000 input tokens per month). Catalogue output price for E5 is not applied in this estimate.
* The conversation model used for the estimate is `google/gemma-4-31B-it` (€0.25 input / €0.50 output per million tokens). The price is taken from Berget’s suggested starting point for Swedish or Scandinavian applications in [Choose a language model](https://docs.berget.ai/models/choosing-a-model). That id is only an input to this estimate. This repository does not configure a conversation model; the user chooses one (section 9). If evals later show that a cheaper model is good enough, the cost principle says to switch.
* Web admin stays within Vercel Hobby and Supabase Free. If a Free Supabase project is paused for inactivity, that is a product risk, not a monthly fee in this estimate.
* Electricity, the Pi, the radio and other hardware are not included.

### 14.3 Estimate at list prices (usage)

| Item | Basis | Monthly estimate (excl. VAT) |
| -- | -- | -- |
| STT, Pianissimo | 450 min × €3.50 / 1,000 min | ≈ €1.58 |
| Conversation model, `google/gemma-4-31B-it` | 1.20M input × €0.25 + 0.18M output × €0.50 | ≈ €0.39 |
| Embeddings, `intfloat/multilingual-e5-large-instruct` | 0.12M input × €0.03 | ≈ €0.004 |
| TTS, local Piper (v1) | No hosted fee | €0 |
| TTS fallback, ReadSpeaker speechCloud | Not in the v1 estimate; no public unit price | Not estimated |
| Web admin, Vercel Hobby + Supabase Free | Assumed within free tiers | €0 |
| **Metered usage subtotal (Piper TTS)** | | **≈ €1.97** |

At these assumptions, metered usage is about €2 per month excluding VAT (about €2.46 including 25% Swedish consumer VAT). That sits well inside Starter’s €25 prepaid credits.

### 14.4 What the household actually pays

| Item | Monthly | Notes |
| -- | -- | -- |
| Berget Starter (required for continued API access after Trial) | €25 excl. VAT (€31.25 incl. 25% VAT for a Swedish private individual) | Includes a €25 credit top-up, which covers the ≈ €2 list-price usage above. [Pricing](https://berget.ai/en/pricing). |
| Vercel Hobby + Supabase Free | €0 (assumption: within free limits) | [Hobby](https://vercel.com/docs/plans/hobby), [Supabase Free](https://supabase.com/pricing). |
| **Radio Days running cost (proposed cap)** | **€25 excl. VAT** | Dominated by Berget’s minimum paid plan, not by metered usage. |
| Spotify Premium Individual (SE), outside the cap | 149 SEK | The user’s own subscription. [spotify.com/se/premium](https://www.spotify.com/se/premium/). |

Trial (€0 / month, €5 starting credits) can cover a short test period at this usage, but is not the plan for ongoing household use.

ReadSpeaker is the fallback if Piper’s quality is not good enough. If that fallback is used, its price must be added when a quote exists; the cap may then need to be revisited.

## 15. Decisions and open questions

**Decided (2026-11-26):**

* The product is called Radio Days. The repository is [`PanamaDonne/radio-days`](https://github.com/PanamaDonne/radio-days). The repository rename is done.
* A voice agent in an old radio on a Raspberry Pi 4 with 4 GB. It gets to know the user and makes its own decisions. The team engine is shut down. The pivot happens in the same repo.
* v1: wake word, conversation with an AI that learns habits and preferences and acts on them when it is confident enough (it asks only when it is unsure), proactive speech (a morning brief is a less important example; calendar reminders and incoming email from senders the user has chosen are the important unprompted utterances, with a later calendar integration and with Gmail in v2), Spotify controlled by voice with no button (play, next and previous track, choose artist, album and playlist, and playlist and favourite changes), long-term memory, and a cloud web admin skeleton. Multi-step goal planning is not in v1. Gmail and the physical approval button come in v2. Any action with consequences outside the radio always requires that button.
* Autonomy (Daniel, 2026-11-26): the radio gets to know the user and makes its own decisions. Primary: it learns habits and preferences, acts when it is confident enough, and asks only when it is unsure. Secondary: proactive speech. The important unprompted utterances are calendar reminders and incoming email from senders the user has chosen; a morning brief is a less important example. Not in v1: multi-step goal planning. Guardrails: quiet hours, a limit on how often it may speak unprompted, the user can turn autonomous behaviour off and can correct or forget a learned habit by voice and in the web admin, learned habit data stays in the on-device encrypted memory and the cloud sees only status, and any action with consequences outside the radio (email in v2) always requires the physical approval button. See section 5.
* A Spotify Premium account is required for that voice control. This follows Spotify’s Web API rule that playback-control endpoints work only for Premium users ([Start/Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)).
* Voice chain: Berget Pianissimo (`klang/pianissimo`) for realtime speech. User-facing voice text is Swedish. Pianissimo was confirmed in Berget’s public catalogue on 2026-11-26. Text-to-speech for v1 is local Piper on the Raspberry Pi with a Swedish voice (`sv_SE-nst-medium` or `sv_SE-alma-medium`), decided 2026-11-26. ReadSpeaker is the fallback if quality is not good enough. Berget Sten is not available and is not the v1 choice.
* Web admin in the cloud (Next.js on Vercel, with Supabase); secrets live on the Pi, encrypted on disk. The key is encrypted in the browser with the Pi’s public key. Spotify OAuth uses PKCE, with token exchange on the Pi. The cloud sees status, never secrets.
* ATECC608 is optional in v1 and required in v2 (when mail and approval arrive). Daniel is buying one.
* The repo stays public. No secrets, keys, device identifiers or personal data in the repo ever.
* PR #13 and Laget Bots stage 1 are paused.
* Long-term memory: SQLite on the Pi with sqlite-vec; embeddings default to Berget E5, `intfloat/multilingual-e5-large-instruct` (PO recommendation, 2026-11-26; Daniel can still object). A small local embedding model is an optional offline fallback, not required in v1. Catalogue also lists `intfloat/multilingual-e5-large`. facts extracted after each conversation; 5–10 most relevant memories retrieved into each conversation; database encrypted with SQLCipher; the key can later be locked in the ATECC608; admin reads and deletes memory via the Pi, with no copy in the cloud; the admin can download an encrypted backup. Memory content must never appear in cloud storage or logs. A backup must be encrypted and restorable.
* Daniel finds the radio himself. A desk prototype with Pi and microphone is enough until then.
* Running-cost principle: use the cheapest option that meets the quality and latency evals. v1 text-to-speech is local Piper, with no hosted fee. Proposed cap: €25 per device per month, excluding VAT, for Radio Days’ own cloud and model usage (Berget Starter). Spotify Premium is outside the cap. See section 14. This cap is a proposal, not locked.
* TypeScript, `AGENTS.md`, CI, Vera and Lazek on every PR, only Daniel merges.

**Open:**

1. **Exact wake word.** A wake word is in v1; the phrase itself is not chosen.
2. **Proposed cost cap.** Section 14 estimates about €2 per month in metered usage (list prices, stated assumptions) and €25 per month excluding VAT as the amount actually paid on Berget Starter. The €25 cap is a proposal, pending Daniel’s ok. Those assumptions leave out unprompted speech.
3. **Hardware fit.** Compatibility of the Pi 4, amplifier, microphone and the radio Daniel finds is not verified. It is not a blocker for the desk prototype.
4. **Quiet hours and how often.** Quiet hours, and a limit on how often the radio may speak unprompted, are required (section 5). The clock times and the maximum number of unprompted turns are still open.
