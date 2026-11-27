# Radio Days — product spec v2.0

This file is the accepted product spec for Radio Days, version 2.0, on `main`. It replaces the earlier Laget Bots spec (v1.0). Linear PAN-267 tracks this spec.

**Name:** Radio Days.
**Repo:** [https://github.com/PanamaDonne/radio-days](https://github.com/PanamaDonne/radio-days). The repository rename is done.
**Visibility:** the repo stays public.
**Owner:** Daniel Hansson. **PO:** Jörgen.
**Date:** 2026-11-26.
**Revision:** 2026-11-27 (Daniel, PAN-299). Target board is a Raspberry Pi 4 Model B. The build and the running cost stay low. The voice stays local. 2026-11-27 (Daniel, PAN-298): Spotify is not in v1. v1 is conversation, email, calendar, and web search. Speech-to-text is local. The chat model is EU-hosted and pay-as-you-go.
**Language in the product:** code identifiers in English; user-facing voice and admin text in Swedish.

---

## 1. What it is

Radio Days is a voice agent inside an old radio (or cassette player). The core of the agent is getting to know the user, and it makes its own decisions from what it has learned. Suggestions are driven by what it has learned. The user talks to the radio. It runs on a Raspberry Pi 4 Model B, hidden in a set that Daniel finds himself. It should be cheap to build and cheap to run. RAM is 1 GB or 2 GB; 2 GB is the safe default until Linear PAN-300 measures it (section 4).

v1 is the fixed wake word “Kör Radio” and four capabilities: conversation, email, calendar, and web search. Spoken conversation is with an AI that learns the user’s habits and preferences and acts on them when it is confident enough (it asks only when it is unsure). Email, calendar reminders, and web search are in v1. Long-term memory of the user, and a cloud web admin, are in v1. Multi-step goal planning is not in v1. Choosing a wake word from a list in the web admin is v2 (Linear PAN-301). Spotify is not in v1 (section 2.3). The former team engine is shut down. Work continues in the same repository.

**User:** in the first place Daniel, at home, speaking Swedish to the radio.

**User value:** The radio gets to know Daniel. When it is confident enough in a habit, it chooses for him, and it asks only when it is unsure. He can walk up to an old radio, say “Kör Radio”, and talk with an AI. He can hear email and the calendar, and he can ask the radio to search the web. He can turn autonomous behaviour off, and he can correct or delete a learned habit, by voice and in the web admin. Habits stay on the Pi until he deletes them. They are not sent to the AI provider. The radio may also speak first. A morning brief is secondary. Calendar reminders, and incoming email from senders he marks as important, are important announcements and are in v1. Reading that email aloud needs no approval button. Acting on it does. Mail text cannot start an action. He chooses those senders by voice and in the web admin. Quiet hours still apply, and he can let selected senders break through. Secrets and memory stay on the Pi, not in the cloud. Setup is done from any computer through a simple web admin.

**Product principle: super simple.** Talking to the radio should feel as easy as talking to a person in the room. No infrastructure knowledge is needed for everyday use.

---

## 2. Scope

### 2.1 In scope for v1

v1 capabilities are conversation, email, calendar, and web search.

* Wake word, fixed in v1 as “Kör Radio”, with optional push-to-talk as a backup (not as approval). Choosing a wake word from a list in the web admin is v2 (Linear PAN-301).
* Conversation: spoken conversation with one AI agent, in Swedish.
* Email: incoming mail from senders the user marks as important, read aloud, and sending or replying when the user asks. Reading needs no approval button. Sending or replying needs the physical button (section 5, section 10).
* Calendar: what is on the calendar, and reminders. Reminders are important announcements (section 5).
* Web search: the user asks, and the radio speaks the answer in Swedish.
* Voice chain: local Swedish speech-to-text on the Pi (KB-Whisper tiny or base). Text-to-speech in v1 is local Piper on the Pi, with a Swedish voice (section 6). ReadSpeaker is the fallback if quality is not good enough.
* Long-term memory of the user, stored only on the Pi (see section 8).
* Learning habits and preferences, and acting on them when the agent is confident enough. It asks only when it is unsure. This is the core of the agent, and the primary autonomous behaviour in v1 (section 5). Suggestions are driven by what it has learned. It does not suggest something it has not learned.
* Secondary proactive speech, such as a morning brief, subject to quiet hours and a limit on how often (section 5). A morning brief is scheduled speech, not a learned suggestion.
* Turning autonomous behaviour off, and correcting or deleting a learned habit, by voice and in the web admin.
* Learned habit data stays in the on-device encrypted memory until the user deletes it. It is never sent to the AI provider, in a prompt or as an embedding text. The cloud sees only status. Raw audio and transcripts are not stored.
* Cloud web admin skeleton: sign-in, pairing the Pi with a device code, provider and API key, email connection, connection status, viewing and deleting memory, turning autonomous behaviour off, correcting or deleting a learned habit, marking important senders, and downloading an encrypted backup (see section 7).
* Secrets stored on the Pi, encrypted on disk. ATECC608 is optional in v1.
* Status lamp on the radio scale: on when listening, pulsing when thinking, idle when at rest, and a wait-state when the button is required.
* A physical approval button for sending mail and any other action that leaves the radio (section 10).
* Evals for intent-to-tool accuracy, memory, mail text, and approval; latency is logged (see section 11).
* A token cap per conversation. A provider key alone does not start a paid call; an explicit choice is required.
* Running cost at most 99 SEK per month, ideally about 0 to start (section 14).

### 2.2 In scope for v2

* Choosing the wake word from a list in the web admin (Linear PAN-301). v1 keeps the fixed wake word “Kör Radio”.
* ATECC608 required, including the option to lock the memory-database key in the chip.

Weather and other later services may follow after v2; they are not committed in this spec.

### 2.3 Out of scope

* Spotify, including playlist and favourite changes. It is not in v1. Spotify’s [Developer Policy](https://developer.spotify.com/policy) (III.3, effective 15 May 2025) forbids a voice-enabled app that controls Spotify. That text does not mention a development-mode exception. A later version needs a change to that policy or written permission from Spotify. Waiting does not change III.3 (Daniel, 2026-11-27).
* Further work on the Laget Bots team engine (roles, handoff contracts, questions between agents, the PO/dev/reviewer development flow, MAST collaboration metrics as CI gates).
* PR #13 and the remaining Laget Bots stage-1 work stay paused.
* A local admin UI as the primary surface (replaced by the hosted web admin).
* Mobile apps.
* Multi-step goal planning in v1. The radio does not set a goal of its own and carry out a chain of steps to reach it. No later version of that behaviour is committed here.
* A local conversation model on the Pi (optional later, not v1). Speech-to-text and text-to-speech are local in v1 (section 6). The chat model is hosted.
* Bluetooth speakers (avoided because of latency).
* Mounting in the radio cabinet, HiFiBerry or other amplifier fitting, and volume or channel knobs: these wait until Daniel has found a radio. A desk prototype with the Pi, a microphone and an audio output is enough for v1 software milestones.
* Secrets, keys, device identifiers or personal data in the repository — ever. The repo stays public.

---

## 3. What is kept, changed and removed from v1.0

### Kept

* TypeScript, the same GitHub repository (`PanamaDonne/radio-days`), `AGENTS.md`, CI (typecheck, lint, tests), and the workflow: Daniel builds and opens the PR; Vera reviews and Lazek QA-tests the same sha and posts a verdict in the PR; only Daniel merges. Linear issue ids belong in branch names and PR titles.
* The user brings their own key and may use an OpenAI-compatible chat provider. EU data residency is preferred. No single vendor is required. Examples are Scaleway and OVH (section 9).
* The existing provider-client idea, and the rule that a key alone does not start a paid call.
* The idea of human approval before serious actions. Sending mail, and any other action that leaves the radio, requires a physical button, including when the agent is acting on its own. Reading mail aloud does not.
* Evals in CI, with metrics that fit voice, email, calendar, web search, and memory. The approval eval is in v1 with sending mail.
* Secrets never go in config, code, traces or the public repo.
* A token cap per conversation (formerly per team run).

### Changed

* The product is a voice assistant in a radio, not an engine for collaborating development agents. The assistant gets to know the user and makes its own decisions (section 5).
* One agent with tools, not PO, dev and reviewer agents. The team engine is shut down in this repo, not kept as a side track.
* Runtime moves to a Raspberry Pi 4 Model B (1 GB or 2 GB), always on, with voice as the interface and a wake word. The build and the running cost should both stay low.
* Admin becomes a hosted web app (Next.js on Vercel, with Supabase). In v1.0 a hosted admin UI was out of scope.
* Keys and mail tokens are stored encrypted on disk on the Pi. The cloud forwards ciphertext only and shows connection status. Memory is also read and deleted through the Pi; the cloud keeps no copy.
* The first test bench is conversation, email, calendar, and web search, plus memory, not a development flow against a sandbox repo.
* Evals shift to intent-to-tool accuracy, latency (logged in v1), memory quality, mail text, and button approval.
* The repo stays public (v1.0 was already open; a later proposal to make it private is not followed).
* Cost changes. v1.0 assumed 0 SEK/month in infrastructure. A hosted admin and a pay-as-you-go chat model can add cost. Speech-to-text and text-to-speech stay on the Pi. The cap is 99 SEK per month, ideally about 0 to start (section 14). A low build cost is a separate goal (section 4).
* The product name is Radio Days, not Laget Bots. The repository is `PanamaDonne/radio-days`.
* v1 capabilities are conversation, email, calendar, and web search (Daniel, 2026-11-27). Spotify is not in v1.

### Removed from the v1.0 spec

* A team of collaborating agents, handoff contracts, questions between agents, and the development flow (PO, dev, reviewer, merge).
* The simple **local** administration UI as the primary surface.
* The decision that hosted admin is out of v1.
* MAST metrics for collaboration between agents, as primary CI requirements.
* Weather in v1. Email and calendar are in Radio Days v1. Spotify is not.
* A required security chip in v1 (ATECC608 is optional in v1, required in v2).

Memory, the voice chain and the hosted admin are new relative to v1.0. They were not in that spec.

---

## 4. Hardware

Daniel finds the radio or cassette player himself. Explicit goals: a low build cost and a low running cost (section 14). Parts for a build should land around 800–1,200 SEK. That range is a goal, not a shop list. Compatibility between the Pi 4 Model B, the audio output, the microphone and the set Daniel finds is not verified here. For a desk prototype, the Pi, a microphone and an audio output are enough.

* Target board: a Raspberry Pi 4 Model B, an official power supply, and a new microSD card. RAM is 1 GB or 2 GB. Which size is open until it is measured (Linear PAN-300). 2 GB is the safe default. Pi 3 B+ and Pi Zero 2 W are not targets: they are too slow, or not measured, for a Swedish Piper medium voice.
* Passive cooling: a heatsink.
* Audio output: a cheap DAC or USB audio. The Pi 4 analog audio output is weak. Bluetooth speakers are avoided because of latency. The radio’s own speaker, and any cabinet amplifier, wait until Daniel has a radio (section 2.3).
* Microphone: Jabra Speak 410 or ReSpeaker USB Mic Array, with echo cancellation. The Jabra is speaker and microphone in one and can be used on the desk before the cabinet is ready; in the finished radio, the radio’s speaker is used.
* A physical approval button in v1, for sending mail and any other action that leaves the radio (section 10). An optional push-to-talk use of that button is only a backup to the wake word, and only when the radio is not waiting for approval. Volume and channel knobs are not required in the first cut.
* Scale lamp as status in v1: on when listening, pulsing when thinking, idle or dim when at rest, slow blink when waiting for the button.
* ATECC608 is optional in v1 (Daniel is buying one) and required in v2. In v1, encrypted secrets on disk (including SQLCipher for the memory database) are enough. In v2 the memory-database key can be locked in the ATECC608.

---

## 5. An agent that learns and decides

The core of the agent is getting to know the user. It makes its own decisions from what it has learned. Suggestions are driven by what it has learned. It does not suggest, or act on, something it has not learned.

Some unprompted speech is chosen or scheduled. It is not a learned suggestion. A morning brief is that kind of speech. It is secondary, and it is in v1. Calendar reminders and incoming email from a sender the user marks as important are important announcements, and they are not secondary. Both are in v1.

Radio Days gets to know its user and makes its own decisions. It is not only a device that waits for the next order. Over time it knows the person well enough to choose, and it asks only when it needs to.

Daniel set the v1 scope of this autonomy on 2026-11-26. On 2026-11-27 he added the privacy and control rules in this section: habit data stays on the Pi and is never sent to the AI provider in a prompt; habits are kept until the user deletes them. The same day he set v1 to conversation, email, calendar, and web search, and took Spotify out of v1.

**Primary: habits and preferences.** The radio learns the user’s habits and preferences, for example what they usually want in the morning, or how they like to be answered. It learns so it can decide on its own instead of asking every time. It acts on what it has learned when it is confident enough, and it asks only when it is unsure. It does not invent a preference to fill the gap.

**Where habits live.** Learned habits, and the list of important senders, stay in the encrypted memory database on the Pi. They are kept until the user deletes them. There is no automatic expiry and no fade-out. A deleted habit is not used again. The radio may learn a new habit later from new behaviour. It does not restore the deleted record.

Habit data is never sent to the AI provider in a prompt, and it is not sent as text to embed. The cloud admin sees only status. A morning brief that uses a habit is assembled on the Pi and spoken by local Piper. The habit is not put in the provider prompt to write the brief.

**Consent.** The radio does not store a habit until the user agrees. It says, in Swedish, that it will learn habits, keep them on the Pi until the user deletes them, and not send them on. The user agrees by voice or in the web admin. Until then the radio still answers, and it still does what the user just asked. It does not store a habit and it does not act on one. The user can withdraw agreement by turning autonomous behaviour off or by deleting habits. v1 has one user: the person who sets the radio up. The radio does not tell speakers apart and does not use voice recognition. Speech from someone else in the room is not stored as a second profile.

**Audio and transcripts.** Radio Days does not store raw audio or transcripts, on the Pi, in the cloud admin, or in the repo. Speech-to-text runs on the Pi (section 6). Audio for a turn is not sent to the chat provider and is not kept by Radio Days after the turn. The transcript is not written to memory or to logs. The text of the turn is the conversation with the chat model. Habit data is not part of that prompt.

**Important proactive announcements.** These are not required to be learned. They are not secondary. Both are in v1.

* **Calendar reminders.** The radio speaks what is on the calendar and gives reminders. Quiet hours and the limit on how often still apply. No calendar vendor is locked. Tokens stay on the Pi. The Pi fetches the entries it will speak, including title, time, and attendees. Local Piper speaks them. That text is not sent to the chat model, is not written to memory, and is not kept after the speaking ends. Calendar text is untrusted. It can never start an action.
* **Incoming email from senders the user marks as important.** Reading the email aloud is read-only and needs no approval button. Acting on the email, such as sending or replying, still requires the physical approval button (section 10).

The user chooses which senders count as important, by voice and in the web admin. The radio may suggest a sender from a habit the user already has. The user decides which suggestions to keep. That list stays in the encrypted memory database on the Pi with the other learned habit data. The cloud sees only status.

**Mail when it is read aloud.** The Pi polls Gmail for new mail. The message body is fetched to the Pi with the read-only scope `https://www.googleapis.com/auth/gmail.readonly`. Local Piper speaks it. People in the room hear the reading. The body is not sent to the AI provider, to the web admin, or to ReadSpeaker. It is not written to memory, and it is not kept after the reading ends. If local Piper cannot speak, the radio says that mail is waiting and does not send the body anywhere else. Sending or replying uses a separate scope, `https://www.googleapis.com/auth/gmail.send`, and the physical approval button. The user dictates the reply. The original body is not sent to the chat model to draft it. Before the Gmail connection is built, check the Google OAuth app’s publishing status. A refresh token for an app that is still in testing expires after seven days. Mail text is untrusted. It can never start an action: not a habit, not a reply, and not any other action. Only the user’s own request, or a habit that was not taken from mail text, can start an action.

**Web search.** No search service is locked. When the user asks, the Pi sends that turn’s words as the query. Habit data and other memory are not added to the query. Results come back to the Pi. Local Piper speaks them in Swedish. Results are not sent to the chat model, are not written to memory, and are not kept after the reply. Search text is untrusted and can never start an action. The search fee, if there is one, counts toward the 99 SEK cap (section 14).

**Secondary: other proactive speech.** Other unprompted speech is secondary to learning habits. A morning brief is an example. It is not an important announcement, and it is not a learned suggestion. It follows the guardrails below.

**Not in v1.** Multi-step goal planning is not in v1. The radio does not set a goal of its own and carry out a chain of steps to reach it. Spotify is not in v1 (section 2.3).

### Guardrails

* **Quiet hours.** The radio does not speak unprompted during quiet hours. When the user talks to it during those hours, it still answers. Quiet hours apply to a morning brief and to important announcements. The user can let selected senders break through quiet hours. That choice is made by voice and in the web admin.
* **How often.** There is a limit on how often the radio may speak unprompted. A reply the user asked for does not count toward that limit.
* **Off, correct, delete.** The user can turn autonomous behaviour off, and can correct or delete a learned habit, by voice and in the web admin. While autonomous behaviour is off, the radio does not act on a learned habit on its own and does not speak unprompted. It still answers when spoken to. A correction replaces the habit the radio uses from then on. A deleted habit is not used again.
* **On the device.** Learned habit data stays on the Pi, in the encrypted memory, until the user deletes it. It is never sent to the AI provider. The cloud sees only status. Raw audio and transcripts are not stored.
* **Outside the radio.** Sending mail, or any other action that leaves the radio, requires the physical approval button. A learned habit, confidence, or the radio deciding on its own does not replace the press when an action does need it (section 10). Reading an incoming email aloud needs no button. Conversation, calendar answers, and web search need no button.

The clock times for quiet hours, and the maximum number of unprompted turns, are open (section 15).

---

## 6. Voice agent and everyday use

The user says the wake word. In v1 the wake word is fixed: “Kör Radio”. Choosing a wake word from a list in the web admin is v2 (Linear PAN-301). The Pi listens with a local wake-word detector (openWakeWord). Optional push-to-talk is only a backup, never an approval.

Speech-to-text in v1 is local on the Pi 4 Model B, in Swedish: KB-Whisper tiny or base (Daniel, 2026-11-27). The model card for [KBLab/kb-whisper-tiny](https://huggingface.co/KBLab/kb-whisper-tiny) lists the licence as Apache-2.0. The same card’s Word Error Rate table, checked 2026-11-27, gives tiny as 13.2 on FLEURS, 12.9 on CommonVoice, and 11.2 on NST, and base as 9.1, 8.7, and 7.8 on those three sets. Latency on this Pi is measured in Linear PAN-300. Audio is not sent to the chat provider. Spoken replies are in Swedish. **Text-to-speech in v1 is local Piper on the Pi 4 Model B**, with a Swedish medium voice: `sv_SE-nst-medium`, `sv_SE-alma-medium` or `sv_SE-lisa-medium` (Daniel, 2026-11-26 and 2026-11-27). Swedish Piper voices exist only at medium quality. There is no low or x_low Swedish voice. The voice stays loaded in memory between replies. ReadSpeaker is the fallback if that quality is not good enough.

**Text-to-speech for v1.**

1. **Chosen: local Piper on the Pi 4 Model B, Swedish voice.** The official Piper CLI documents an arm64 binary for a 64-bit Raspberry Pi 4 ([CLI.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md)). The engine is GPL-3.0-or-later ([piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), [PyPI](https://pypi.org/project/piper-tts/)). Official Swedish voices in [piper-voices](https://huggingface.co/rhasspy/piper-voices) exist only at medium quality. Checked the `sv/sv_SE` tree on 2026-11-27: it contains `nst/medium`, `alma/medium` and `lisa/medium`, and no low, x_low or high Swedish voice. The voice ids are `sv_SE-nst-medium` (quality: medium; dataset licence CC0; trained from scratch by KBLab), `sv_SE-alma-medium` (quality: medium; model weights CC BY 4.0; trained on the NST Swedish TTS dataset, which the card describes as high-quality studio recordings of Swedish speech) and `sv_SE-lisa-medium` (quality: medium; the card says it is finetuned from a Norwegian talesyntese voice). Official cards: [nst](https://huggingface.co/rhasspy/piper-voices/blob/main/sv/sv_SE/nst/medium/MODEL_CARD), [alma](https://huggingface.co/rhasspy/piper-voices/blob/main/sv/sv_SE/alma/medium/MODEL_CARD), [lisa](https://huggingface.co/rhasspy/piper-voices/blob/main/sv/sv_SE/lisa/medium/MODEL_CARD). Samples: [piper-samples](https://rhasspy.github.io/piper-samples/). The CLI document says running Piper once per request can be slow because the voice is loaded each time. The voice stays loaded in memory between replies, so that reload is not part of normal use. No official end-to-end latency figure for a Pi 4 Model B with 1 GB or 2 GB was found. Linear PAN-300 measures it. The voice has zero monthly cost (€0, no hosted TTS fee).
2. **Fallback: ReadSpeaker speechCloud API (EU).** Used only if Piper’s quality is not good enough. ReadSpeaker AB is headquartered in Sweden (Uppsala). The [speechCloud API](https://www.readspeaker.com/products/speechcloud-api/) is described as EU-based, GDPR compliant and ISO/IEC 27001:2022 certified, and as generating “natural-sounding synthetic speech”. That is the vendor’s description. Mail text is never sent there (section 5). The [Swedish voice list](https://www.readspeaker.com/languages-voices/swedish/) has six neural sv-SE voices: Fredrik, Karin, Linnea, Maja, Majsan and Sven. Pricing is a credits model (1 credit = 1 character excluding whitespace); production credits are ordered through an account manager, and no public unit price in euro was published on that page. Latency is not stated there.

v1 uses local Piper. ReadSpeaker is only that quality fallback. The cost principle in section 14 is to take the cheapest option that meets the quality and latency evals; Piper has no hosted fee. Local speech-to-text has no hosted fee either.

One always-on voice agent runs on the Pi (TypeScript). It gets to know the user and makes its own decisions (section 5). It holds a conversation with the AI, reads and sends mail, speaks the calendar, searches the web when asked, and uses long-term memory (section 8). The chat model is EU-hosted and pay-as-you-go (section 9). Every conversation has a token cap.

Everyday use in v1 is conversation, email, calendar, and web search. The user talks to the radio in Swedish. The radio reads an important email aloud, speaks calendar reminders and what is on the calendar, and answers a web search the user asked for. Sending mail uses the physical button (section 10).

---

## 7. Web admin

The web admin is a cloud app: Next.js on Vercel, with Supabase. It works from any computer or phone.

In the admin the user:

* signs in
* pairs the Pi with a device code, in the same way as a smart TV
* chooses an AI provider and enters an API key
* connects email
* sees connection status (never secrets in cleartext)
* views and deletes long-term memory (section 8)
* turns autonomous behaviour off and on
* corrects or deletes a learned habit
* marks which senders are important, and can let selected senders break through quiet hours (section 5)
* downloads an encrypted backup of memory

The API key is encrypted in the browser with the Pi’s public key. The cloud forwards only ciphertext that only the Pi can open. Mail tokens are stored on the Pi, encrypted on disk. The cloud sees status only, never secrets.

Turning autonomous behaviour off, and correcting or deleting a learned habit, are done here as well as by voice. Both go through the Pi. Learned habit data stays on the device until the user deletes it, and it is not sent to the AI provider. The cloud sees only status.

In v1 a skeleton is enough: sign-in, pairing, provider and key, email connection, status, memory view and delete, turning autonomous behaviour off, correcting or deleting a learned habit, important senders, and encrypted backup download. Those habit controls are part of milestone 3, together with long-term memory. The wake-word list is not in this skeleton. It is v2 (Linear PAN-301).

The radio may suggest senders from learned habits. Those choices stay on the device. The cloud sees only status.

---

## 8. Long-term memory

The agent has long-term memory about the user, for example name, habits and earlier conversations. Habits and preferences the agent learns (section 5) are part of this memory. Learned habits, and the list of important senders, stay in the encrypted memory database on the Pi until the user deletes them. They are never sent to the AI provider, in a prompt or as text to embed. The cloud sees only status. Other memories may still be retrieved into a conversation. A habit is a preference the Pi applies locally, such as how the user likes to be answered. It is not one of those retrieved facts. The habit text is not sent to the chat model. Daniel has prior experience of memory and RAG from Präpp; that experience may inform the work, but this product’s rules are the ones below.

Memory is stored only on the Pi, in SQLite with sqlite-vec for semantic search. Vectors and memory stay encrypted on the Pi. After each conversation, facts are extracted. The 5–10 most relevant memories are retrieved into each new conversation. Embeddings stay on the Pi and are not a cloud call. A hosted embedding call is not the v1 path. Which model fits in 1 GB or 2 GB, beside the Swedish Piper voice that stays loaded and local speech-to-text, is open until Linear PAN-300 measures it (section 15).

The database file is encrypted with SQLCipher. Its key can later be locked in the ATECC608 (required path in v2; optional if the chip is fitted in v1).

The web admin reads and deletes memory via the Pi. No copy of memory is kept in the cloud. Memory content must never appear in cloud storage or in cloud or repo logs. The admin can also download an encrypted backup. A backup must be encrypted and restorable on the Pi.

---

## 9. Privacy, security and providers

**Public repository.** The repo stays public, as `PanamaDonne/radio-days`. Because of that, secrets, keys, device identifiers and personal data must never be committed, logged into the repo, or otherwise placed in the repository.

**Secrets live on the Pi**, encrypted on disk. The cloud does not store API keys, mail tokens, memory content, or learned habit data. It may store only what it needs to sign the user in, pair a device, and show status.

**Chat provider.** Berget is not the provider, and the Berget Starter plan is not used (Daniel, 2026-11-27). The v1 chat model is EU-hosted and pay-as-you-go. EU data residency is preferred. No specific vendor is required. Examples are Scaleway and OVH. Before the first paid call, the chosen provider must have a data processing agreement the household can accept, must not train a model on the household’s prompts or replies, and must state how long it keeps that text and where it is processed. The user brings their own key. A key in the environment or in the admin is not enough on its own to start a paid call; an explicit choice is required. Speech-to-text and text-to-speech stay on the Pi (section 6). ReadSpeaker is the speech fallback if Piper’s quality is not good enough. The running cost stays inside the cap in section 14.

**ATECC608** is optional in v1 and required in v2 (see section 4).

**Not stored.** Radio Days does not store raw audio or transcripts. Habit data is not sent to the AI provider. Mail text, when it is read aloud, stays on the Pi for that reading and is then dropped (section 5).

---

## 10. Physical approval for serious actions

The button is in v1. It is required when an action leaves the radio. Conversation, reading mail aloud, calendar answers, and web search do not use it.

Sending mail, or any other action that leaves the radio, requires the physical approval button. This holds when the user has just asked and when the agent is acting on its own, from a learned habit or from proactive speech. Confidence does not replace the press. Reading an incoming email aloud is read-only and needs no approval button (section 5). Mail text can never start that action.

**Serious (requires the button):**

* Acting on email, including sending or replying, and other actions with consequences outside the radio, including when the agent would otherwise take them on its own. Reading an email aloud is not in this list.

**Not serious (no button):**

* Conversation with the AI.
* Reading an incoming email aloud from a sender the user has marked as important. That is read-only.
* Calendar answers and reminders.
* Web search the user asked for.

**Flow, for example when sending mail:**

1. The agent says briefly what will happen, for example: “Jag skickar mejlet till Anna. Tryck på knappen för att godkänna.”
2. The lamp enters a wait state: a clear, slow blink that cannot be confused with “listening” or “thinking”.
3. The user presses the approval button once. The action runs, the lamp gives a short confirmation blink, and the radio says a short “klart”.
4. If the button is not pressed within about 15 seconds, the action is cancelled. The radio says so, and the lamp returns to idle. Nothing is carried out.
5. A press when the radio is not waiting for approval does nothing serious. The same button may work as push-to-talk when it is not waiting.

**Lamp:** off or dim when idle, steady when listening after the wake word, pulsing when thinking, slow blink when waiting for the button, short double blink when approved, back to idle on cancel or timeout.

---

## 11. Evals

| Eval | Metric | Gate |
| -- | -- | -- |
| Intent to tool | Share of utterances that lead to the right tool (or to no tool, when the turn is only conversation) | Threshold after the first baseline |
| Latency | Time from end of speech after the wake word to first audio in the reply, including local speech-to-text | Logged in v1. The goal is that a short turn does not feel stalled. The threshold in seconds is set after Linear PAN-300 measures KB-Whisper tiny and base on this Pi. Until then it is not a pass/fail gate |
| Memory recall | Stored facts that should be recalled are recalled correctly in a later turn | Threshold after the first baseline |
| Memory invention | The agent must not present invented personal facts as memory | 0 invented “memories” on the test set |
| Memory deletion | A fact or learned habit the user deleted, or told the radio to forget, is no longer retrievable or spoken | 100 % |
| Memory privacy | Memory content must not appear in cloud storage or in cloud or repo logs. Habit data must not appear in a prompt, or in text sent to embed, to the AI provider | 0 leaks on the test set |
| Audio and transcripts | Raw audio or transcripts stored by Radio Days, on the Pi, in the cloud, or in the repo | 0 |
| Mail text | Mail text starts an action, or is sent to the AI provider or to ReadSpeaker | 0 |
| Calendar text | Calendar text starts an action, or is sent to the chat provider | 0 |
| Web search text | A search result starts an action, or is sent to the chat provider | 0 |
| Encrypted backup | A downloaded backup is encrypted (not readable as cleartext) and restorable on the Pi | 100 % |
| Approval safety | Acting on mail, or any other action with consequences outside the radio, including when the agent is acting on its own, without a physical button press. Reading an email aloud is read-only and is outside this gate | 0 (100 %) |

Handoff-contract survival and MAST metrics between agents are removed as v1 requirements.

Thresholds that are not already 100 % or 0 are set after a first baseline. Evals run in CI and fail the build when a gate is not met.

---

## 12. Plan (milestones, no fixed timeline)

The plan takes the time it takes. Each milestone is done only when its done criterion is met, not when a date passes. PR #13 and remaining Laget Bots stage-1 work stay paused. The team engine is not developed further.

A first thin slice should still be possible to wake and talk to. The web admin and the memory store come before email, calendar, and web search, because those three need a connected account and the list of important senders. The behaviour in section 5 is v1 product behaviour. Storing habits, asking for consent, and acting on habits wait until milestone 3, where the memory store exists. Milestones 1 and 2 do not require that store. Mounting in the radio cabinet is outside the software milestones and waits until Daniel has a radio.

Every frontend or backend item below is done only when the stated outcome is true **and** it is covered by unit tests, with CI green.

**Milestone 1: Wake word, conversation, and an agent that decides**

* Local wake word “Kör Radio”, with optional push-to-talk as backup.
* Voice chain: local Swedish speech-to-text on the Pi (KB-Whisper tiny or base), and local Piper on the Pi for text-to-speech with a Swedish medium voice that stays loaded between replies (section 6). Spoken replies in Swedish.
* One voice agent that holds a spoken conversation. Learning habits, storing them, and acting on them are milestone 3. This milestone does not require that store. Email, calendar, and web search are milestone 4.
* Multi-step goal planning is not in v1. Spotify is not in v1.
* One pay-as-you-go chat provider, with a token cap and the rule that a key alone does not start a paid call.
* Scale lamp: idle, listening, thinking, and the wait-state used when the button is required.
* Done when: after “Kör Radio”, the user can have a short spoken conversation and hear the reply from the speaker. Raw audio and transcripts are not stored. It does not carry out multi-step goal planning, and it does not act on a stored habit. Covered by unit tests, CI green.

**Milestone 2: Web admin skeleton**

* Hosted admin (Next.js on Vercel, with Supabase): sign-in from any computer, pairing the Pi with a device code, provider and API key, email connection, and status.
* The key is encrypted in the browser with the Pi’s public key. Mail tokens stay on the Pi. The cloud shows status, never secrets in cleartext.
* Done when: the user can sign in, pair the Pi, set a key, and connect email, and secrets are not stored in the cloud in cleartext. Covered by unit tests, CI green.

**Milestone 3: Long-term memory**

* SQLite on the Pi with sqlite-vec. Embeddings stay on the Pi and are not a cloud call (section 8). Which model fits is open until Linear PAN-300.
* Facts extracted after each conversation; the 5–10 most relevant memories retrieved into each conversation.
* Database encrypted with SQLCipher. Admin reads and deletes memory via the Pi; no copy in the cloud. Encrypted backup can be downloaded and restored.
* Learned habits and preferences (section 5) are stored in that on-device encrypted memory, and only after the user agrees. They are kept until the user deletes them. They are not sent to the AI provider. The user can turn autonomous behaviour off in the web admin, and can correct or delete a learned habit there, as well as by voice. The list of important senders is stored here. The cloud sees only status.
* Done when: facts persist and are recalled in a later conversation; the user can view and delete memory in admin; deletion is effective; a backup is encrypted and restorable; memory content never appears in cloud storage or logs. The user can turn autonomous behaviour off, and can correct or delete a learned habit, in the admin and by voice. A deleted habit is not used again, and it is not sent to the AI provider. The cloud sees only status. Covered by unit tests, CI green.

**Milestone 4: Email, calendar, and web search**

* Email as in section 5. This uses the email connection from milestone 2 and the sender list from milestone 3. Reading an important sender’s message aloud uses local Piper and needs no button. Sending or replying needs the physical button. The user dictates the reply. Mail text can never start an action.
* Calendar reminders, and speaking what is on the calendar. These are important announcements (section 5). Calendar text is not sent to the chat model.
* Web search when the user asks, with the answer spoken in Swedish. Results are not sent to the chat model.
* Done when: the user can hear an important email read aloud, hear a calendar reminder, and ask for a web search. Mail text does not start an action. Sending mail does not run without the button. Raw audio and transcripts are not stored. Covered by unit tests, CI green.

**Milestone 5: Evals and CI gate**

* Test set and eval runner for intent-to-tool, logged latency, memory recall, memory invention, memory deletion, memory privacy (including habit data sent to the AI provider), raw audio and transcripts, mail text, approval, and encrypted backup.
* CI gate on PRs.
* Done when: CI turns red on a planted memory leak, a failed deletion, or a wrong tool choice in the test set, and green again when it is fixed. Covered by unit tests, CI green.

**v2 (after v1):** choosing the wake word from a list in the web admin (Linear PAN-301); ATECC608 required, with the memory-database key lockable in the chip. Spotify stays later and is not part of this list (section 2.3). Each of those items is done when its behaviour holds and it is covered by unit tests, with CI green.

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

The product should be cheap to build and cheap to run. Build cost is a parts goal of about 800–1,200 SEK (section 4). **Principle:** use the cheapest option that still meets the quality and latency evals (section 11). The goal is a running cost of about 0 to start, and never above the cap, while the radio still works.

Speech-to-text, text-to-speech, and embeddings stay on the Pi and have zero monthly cost. The chat model is EU-hosted and pay-as-you-go. That use stays within the cap below.

**Cap (locked, Daniel, 2026-11-27):** 99 SEK per month including VAT, the amount the user pays, for Radio Days’ own running cost. This replaces the proposed €25 per device per month, excluding VAT. A provider price in euro is counted in the SEK the household is actually charged. Hardware, electricity and one-off purchases are outside the cap. A plan whose price is above 99 SEK is outside the cap. Berget is not the provider, and the Berget Starter plan (€25 per month excluding VAT) is not used. No chat-vendor price is locked, so the cap is not an estimate that use will land under 99 SEK by itself. The radio counts paid use during the month. When that count reaches 99 SEK, it stops new calls to the chat model and to web search, tells the user the cap is reached, and still wakes, transcribes, and speaks that notice with local Piper. That stop is the hard limit. Text-to-speech in v1 is local Piper and has no hosted fee. Speech-to-text in v1 is local and has no hosted fee. There is also a token cap on each conversation.

### 14.1 Sources (checked 2026-11-26, provider decision 2026-11-27)

* Vercel Hobby (free): [Hobby plan](https://vercel.com/docs/plans/hobby).
* Supabase Free: [pricing](https://supabase.com/pricing); free projects may pause after a week of low activity ([project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
* Piper, the v1 text-to-speech choice: no hosted fee (section 6). ReadSpeaker speechCloud is the quality fallback and has no public unit price, so it is not in this estimate.
* Local speech-to-text (KB-Whisper tiny or base): no hosted fee (section 6).

### 14.2 Usage assumptions (labelled, not measured)

For **one household, one device**:

* Speech-to-text is on the Pi and is not billed.
* Text-to-speech in v1 is local Piper and is not billed.
* Embeddings run on the Pi (section 8) and add no hosted fee.
* The chat model is pay-as-you-go. How many tokens a day will use is not measured. The choice of model is whatever stays inside the cap and still answers. This repository does not configure a conversation model; the user chooses one (section 9).
* Web search and unprompted speech, such as a morning brief, a calendar reminder, or an email notice (section 5), count toward the same cap. They are not a separate budget.
* Web admin stays within Vercel Hobby and Supabase Free. If a Free Supabase project is paused for inactivity, that is a product risk, not a monthly fee in this estimate.
* Electricity, the Pi, the radio and other hardware are not included.

### 14.3 What is known about monthly cost

| Item | Basis | Monthly estimate |
| -- | -- | -- |
| Speech-to-text, local KB-Whisper | No hosted fee (section 6) | €0 |
| Conversation model, EU-hosted pay-as-you-go | No vendor price locked. The radio stops new paid calls at the cap | Hard stop at 99 SEK |
| Embeddings, on the Pi | No hosted fee (section 8) | €0 |
| TTS, local Piper (v1) | No hosted fee | €0 |
| TTS fallback, ReadSpeaker speechCloud | Not in the v1 estimate; no public unit price | Not estimated |
| Web admin, Vercel Hobby + Supabase Free | Assumed within free tiers | €0 |

Local speech-to-text, local text-to-speech, and on-device embeddings can start at about 0. The pay-as-you-go chat model is the hosted cost, and it has to stay inside the 99 SEK cap.

### 14.4 What the household actually pays

| Item | Monthly | Notes |
| -- | -- | -- |
| Chat model, EU-hosted pay-as-you-go | Stops at the cap | EU data residency is preferred. Vendor is not locked. Examples: Scaleway, OVH. |
| Vercel Hobby + Supabase Free | €0 (assumption: within free limits) | [Hobby](https://vercel.com/docs/plans/hobby), [Supabase Free](https://supabase.com/pricing). |
| **Radio Days running cost (cap)** | **99 SEK** | Locked cap for the user (Daniel, 2026-11-27). Ideally about 0 to start. Berget Starter is not used. |

ReadSpeaker is the fallback if Piper’s quality is not good enough. If that fallback is used, its price must be added when a quote exists; the cap may then need to be revisited.

## 15. Decisions and open questions

**Decided (2026-11-26):**

* The product is called Radio Days. The repository is [`PanamaDonne/radio-days`](https://github.com/PanamaDonne/radio-days). The repository rename is done.
* A voice agent in an old radio on a Raspberry Pi 4 Model B. It gets to know the user and makes its own decisions. The team engine is shut down. The pivot happens in the same repo.
* Cheap to build and cheap to run (Daniel, 2026-11-27). Language stays Swedish. The voice stays local. RAM is 1 GB or 2 GB, open until Linear PAN-300 measures it; 2 GB is the safe default. Parts should land around 800–1,200 SEK. Pi 3 B+ and Pi Zero 2 W are not targets: too slow, or not measured, for a Swedish Piper medium voice. Passive cooling is a heatsink. Audio output is a cheap DAC or USB audio, because the Pi 4 analog audio output is weak. Local Piper keeps the voice at zero monthly cost. Swedish Piper voices exist only at medium quality (`sv_SE-nst-medium`, `sv_SE-alma-medium`, `sv_SE-lisa-medium`); there is no low or x_low Swedish voice. The voice stays loaded in memory between replies. Speech-to-text is local. The chat model is pay-as-you-go, within the cap in section 14.
* v1 capabilities are conversation, email, calendar, and web search, with wake word “Kör Radio”. The radio learns habits and preferences and acts on them when it is confident enough (it asks only when it is unsure). Secondary proactive speech such as a morning brief is in v1. Calendar reminders and incoming email from senders the user marks as important are in v1. Long-term memory and a cloud web admin skeleton are in v1. Multi-step goal planning is not in v1. Reading an email aloud needs no button. Acting on email does. Mail text can never start an action. Sending mail requires the button. Choosing a wake word from a list in the web admin is v2 (Linear PAN-301). Spotify is not in v1.
* Autonomy (Daniel, 2026-11-26): the core of the agent is getting to know the user. Suggestions are driven by what it has learned. It does not suggest something it has not learned. Primary: it learns habits and preferences, acts when it is confident enough, and asks only when it is unsure. Secondary: other proactive speech, for example a morning brief, which is scheduled and is not a learned suggestion. Important proactive announcements are not secondary. The types are calendar reminders and incoming email from senders the user marks as important. Both are in v1. The user chooses those senders by voice and in the web admin. Reading an email aloud is read-only and needs no approval button. Acting on email still requires the physical approval button. Quiet hours still apply, with a user option to let selected senders break through. Not in v1: multi-step goal planning, and Spotify. Guardrails also include a limit on how often it may speak unprompted, turning autonomous behaviour off, and correcting or deleting a learned habit by voice and in the web admin. See section 5.
* Voice chain: local Swedish speech-to-text on the Pi, KB-Whisper tiny or base, with latency measured in Linear PAN-300. User-facing voice text is Swedish. Text-to-speech for v1 is local Piper on the Pi with a Swedish medium voice (`sv_SE-nst-medium`, `sv_SE-alma-medium` or `sv_SE-lisa-medium`). The voice stays loaded between replies (Daniel, 2026-11-27). ReadSpeaker is the fallback if quality is not good enough.
* Web admin in the cloud (Next.js on Vercel, with Supabase); secrets live on the Pi, encrypted on disk. The key is encrypted in the browser with the Pi’s public key. Mail tokens stay on the Pi. The cloud sees status, never secrets.
* ATECC608 is optional in v1 and required in v2. Daniel is buying one.
* The repo stays public. No secrets, keys, device identifiers or personal data in the repo ever.
* PR #13 and Laget Bots stage 1 are paused.
* Long-term memory: SQLite on the Pi with sqlite-vec. Embeddings stay on the Pi and are not a cloud call. A hosted embedding call is not the v1 path. Which on-device model fits is open until Linear PAN-300. Facts extracted after each conversation; 5–10 most relevant memories retrieved into each conversation; database encrypted with SQLCipher; the key can later be locked in the ATECC608; admin reads and deletes memory via the Pi, with no copy in the cloud; the admin can download an encrypted backup. Memory content must never appear in cloud storage or logs. A backup must be encrypted and restorable.
* Daniel finds the radio himself. A desk prototype with the Pi, a microphone and an audio output is enough until then.
* Running-cost principle: use the cheapest option that meets the quality and latency evals. v1 speech-to-text and text-to-speech are local, with zero monthly cost. The chat model is EU-hosted and pay-as-you-go. The locked cap is 99 SEK per month for the user (Daniel, 2026-11-27, section 14). Ideally about 0 to start.
* TypeScript, `AGENTS.md`, CI, Vera and Lazek on every PR, only Daniel merges.

**Decided (Daniel, 2026-11-27):**

* Habit data stays on the Pi. It is never sent to the AI provider in a prompt or as text to embed. The cloud sees only status.
* Habits are kept until the user deletes them. There is no automatic expiry.
* The wake word in v1 is fixed: “Kör Radio”. Choosing a wake word from a list in the web admin is v2 (Linear PAN-301). Language stays Swedish.
* v1 capabilities are conversation, email, calendar, and web search.
* Spotify is not in v1. Playlist and favourite changes are not a v1 flow. Spotify’s Developer Policy III.3 forbids a voice-enabled app that controls Spotify. A later version needs a change to that policy or written permission from Spotify (section 2.3).
* When paid use in a month reaches 99 SEK including VAT, the radio stops new calls to the chat model and to web search and tells the user. Local wake word, speech-to-text, and Piper still work.
* Berget is not the provider. The Berget Starter plan is not used. Speech-to-text is local on the Pi: KB-Whisper tiny or base. Latency is measured in Linear PAN-300. The chat model is EU-hosted and pay-as-you-go, for example Scaleway or OVH. EU data residency is preferred. No vendor is required.
* The running-cost cap is 99 SEK per month for the user. It replaces the proposed €25 per device per month excluding VAT. The goal is about 0 to start, as cheap as possible while the radio still works.

**Also decided in this spec, to close the review of PR #16:**

* The radio does not store a habit until the user agrees, by voice or in the web admin. v1 keeps one habit profile, for the person who sets the radio up.
* Raw audio and transcripts are not stored.
* When mail is read aloud, the body goes to the Pi and then to local Piper. It is not sent to the AI provider, the web admin, or ReadSpeaker, and it is not stored. Mail text can never start an action. Reading uses `gmail.readonly`. Sending uses `gmail.send` and the physical button.

**Open:**

1. **Hardware fit.** Compatibility of the Pi 4 Model B, the audio output, the microphone and the radio Daniel finds is not verified. It is not a blocker for the desk prototype.
2. **Quiet hours and how often.** Quiet hours, and a limit on how often the radio may speak unprompted, are required (section 5). The clock times and the maximum number of unprompted turns are still open.
3. **RAM.** 1 GB or 2 GB on the Pi 4 Model B. 2 GB is the safe default until Linear PAN-300 measures which size is enough.
4. **Embedding model on the Pi.** Semantic search stays on the Pi (section 8). A hosted embedding call is not the v1 path. Which model fits in the RAM above is open until that measurement.
5. **Speech-to-text latency.** KB-Whisper tiny or base on the Pi. Which size is fast enough is open until Linear PAN-300 measures it.
