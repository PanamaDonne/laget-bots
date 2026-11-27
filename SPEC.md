# Radio Days — product spec v2.1

Approved by Daniel on 2026-11-27. This file is opened as a pull request to replace [`SPEC.md`](https://github.com/PanamaDonne/radio-days/blob/main/SPEC.md) on `main`. Until that PR is merged, the accepted file on `main` remains v2.0 (Linear PAN-267, tightened in PAN-298). PAN-297 is absorbed here.

This revision drops the Raspberry Pi. An ESP32-S3 thin client talks to a house server (Daniel’s Mac mini) over the local network. Every backend part is swappable through a common provider interface. The default is local on the Mac mini. The fallback is the cloud.

**Name:** Radio Days.
**Repo:** [https://github.com/PanamaDonne/radio-days](https://github.com/PanamaDonne/radio-days).
**Visibility:** the repo stays public. Secrets, keys, device identifiers, pairing keys and personal data must never appear in the code or the repository.
**Owner:** Daniel Hansson. **PO:** Jörgen.
**Date of accepted v2.0:** 2026-11-26.
**This revision:** 2026-11-27 (v2.1, ESP32-S3 thin client, Mac mini local-first, cloud fallback, English by default in v1).
**Language in the product:** code identifiers in English. User-facing voice and admin text are English by default in v1. Swedish is a language option via the swappable providers, and is not part of v1.

---

## 1. What it is

Radio Days is a voice agent built into an old cassette player. English by default in v1: the user talks to the radio in English. The device is a thin client: an ESP32-S3, a microphone, and the cassette player’s own speaker. Wake word detection runs on the chip, with microWakeWord and a ready-made English wake word for the first demo (for example “Hey Jarvis”). A custom wake word (“Kör Radio”) and Swedish come later. After the wake word, the chip streams audio over a WebSocket on the local network to Daniel’s Mac mini, which runs speech-to-text, the language model, streaming text-to-speech, memory and scheduled agent jobs. Spoken replies stream back over the same WebSocket.

Every backend part is built behind a common provider interface. Configuration chooses the provider for each part. The default is local on the Mac mini. The fallback is the cloud.

The core of the agent is getting to know the user, and acting on what it has learned. v1 is wake word, voice chat, long-term memory, web search that can also start web radio or music (“turn on P1”), a web admin served from the Mac mini, and proactive agent jobs.

**User:** in the first place Daniel, at home, speaking English to the radio. The household is one user.

**User value:** Daniel can walk up to an old cassette player, say the wake word, and talk with an AI that remembers him. He can ask it to search the web and to put on the radio. In the morning it can brief him and then turn the radio on. It can watch for things, remind him, suggest from what it knows, research a question, and sum up the evening. He sets it up, and can see and edit what it remembers, from any computer through a simple web admin reached over Tailscale. In the default local mode, speech and memory stay in the house.

**Product principle: super simple.** Talking to the radio should feel as easy as talking to a person in the room. No infrastructure knowledge is needed for everyday use.

**Build and run cheap.** One working radio unit should cost at most 500 SEK, including microphone and speaker. The Mac mini is existing household hardware and is outside that parts budget. The running-cost cap is 99 SEK per month including VAT, and it holds with the local default (section 10).

---

## 2. Scope

### 2.1 In scope for v1

1. **Wake word** on the chip, with **microWakeWord** and a ready-made English wake word for the first demo, for example “Hey Jarvis”. A custom wake word (“Kör Radio”) and Swedish come later. Optional push-to-talk remains a backup, not an approval. Choosing a wake word from a list in the web admin stays after v1 (Linear PAN-301).
2. **Voice chat.** Spoken conversation with one AI agent, in English, through the house pipeline: ESP32-S3 over the local WebSocket to the Mac mini (section 5).
3. **Memory that gets to know the user.** Long-term memory and learned habits live in Postgres with pgvector on the Mac mini by default. The user can view and edit what the radio remembers, by voice and in the web admin. A habit is not stored until the user agrees, by voice or in the web admin. Supabase is only the cloud fallback for memory, and is not used in the local default.
4. **Web search as an agent tool**, which can also start web radio or music (for example “turn on P1”). Search is via a self-hosted SearXNG or a search API. Favourite stations are picked in the web admin. The radio starts a station only from the user’s saved favourites or a curated allowlist of stream URLs. It never starts a URL taken from search results or other untrusted text.
5. **Calendar.** Google Calendar is a source for the morning broadcast and a connection in the web admin. Standalone “what is on my calendar?” by voice may use that same connection.
6. **Proactive agent jobs**, run by a local scheduler on the Mac mini by default (the Mac mini must be on around the clock for these jobs):
   * a morning broadcast with weather, Google Calendar and news, ending by turning the radio on
   * background watch (“tell me when …”)
   * context-aware reminders
   * proactive suggestions from memory
   * multi-step research
   * an evening summary
7. **Web admin**, in v1. Built in Next.js and **served from the Mac mini**, reached via Tailscale. In it the user can: onboard and pair the device (Wi-Fi, device linking, and the pairing key); manage keys and connections such as Google Calendar; view and edit what the radio remembers; manage watches and reminders; pick favourite radio stations; and turn automatic cloud fallback on or off (off by default). Secrets are handled server-side or encrypted, and never placed in the public code. Memory stays at home. Supabase Pro is not needed. Vercel is not the host.

**Quiet hours and how often (decided):** quiet hours are 22:00–07:00 Europe/Stockholm. The cap is at most three unprompted proactive suggestions per day. Only unprompted proactive suggestions count toward that cap. User-requested reminders and watches, and the scheduled morning and evening broadcasts, do not count. Those still respect quiet hours, except an alarm the user set. Important, time-bound reminders may break through if the user has allowed that.

Mail text (if email returns in v2), calendar invitations and events, and web search results stay untrusted. They are never treated as instructions and can never start an action.

A token cap per conversation remains. A provider key alone does not start a paid call; an explicit choice is required.

### 2.2 Out of scope for v1

* **Email**, including reading mail aloud and the unlock method. It was in the accepted v2.0 spec (PAN-302, PAN-307). It is parked until v2 (Daniel, 2026-11-27). A physical approval button is not required in v1; it returns with sending mail in v2.
* **Spotify**, including playlist and favourite changes. Web radio replaces it in v1. Spotify’s [Developer Policy](https://developer.spotify.com/policy) (III.3, effective 15 May 2025) forbids a voice-enabled app that controls Spotify without written permission. A later version requires that permission. If Spotify returns, playlist and favourite changes must be undoable.
* Swedish as the product language, and a custom wake word (“Kör Radio”). English is the v1 default. Swedish, including KB-Whisper for speech-to-text, is a later language option via the swappable providers.
* Raspberry Pi as the runtime, and on-device SQLite memory on the radio.
* A cloud-only voice chain as the default, and a Vercel-hosted web admin as the default.
* Automatic cloud fallback as the default when the Mac mini is unreachable (it is an opt-in in the admin).
* Further work on the Laget Bots team engine. PR #13 and remaining Laget Bots stage-1 work stay paused.
* A local admin UI as a separate primary surface, and mobile apps.
* Secrets, keys, device identifiers, pairing keys or personal data in the repository — ever. The repo stays public.

Choosing the wake word from a list in the web admin remains after v1 (PAN-301). A custom wake word (“Kör Radio”) and Swedish come later.

---

## 3. What changes from the accepted v2.0 on `main`

The accepted spec on `main` is a voice agent on a Raspberry Pi 4 Model B. Speech-to-text is local KB-Whisper. Text-to-speech is local Piper. Memory is SQLite on the Pi. v1 is conversation, email, calendar and web search. Secrets and memory stay on the Pi. The running-cost cap is 99 SEK per month including VAT.

This revision changes that as follows.

| Area | Accepted v2.0 on `main` | This revision (v2.1) |
| -- | -- | -- |
| Hardware | Raspberry Pi 4 Model B. Parts goal about 800–1,200 SEK | ESP32-S3 thin client, at most 500 SEK for one working radio unit, including microphone and speaker, built into an old cassette player, reusing its speaker. House backend: Daniel’s Mac mini (M4, 16 GB), on around the clock |
| Wake word | openWakeWord on the Pi, phrase “Kör Radio” | microWakeWord on the chip, with a ready-made English wake word for the first demo (for example “Hey Jarvis”). A custom wake word (“Kör Radio”) and Swedish come later |
| Device link | The agent runs on the Pi | A WebSocket on the local network, audio in both directions, encrypted (TLS or equivalent). Both ends authenticate with a pairing key. The device verifies the paired Mac mini. The backend rejects an unpaired device. The radio finds the Mac mini via mDNS (`radio-days.local`) or a fixed IP. Re-pairing in the web admin revokes the old key |
| Backend | Everything runs on the Pi | A common provider interface; configuration picks the provider per part. Default is local on the Mac mini. Fallback is the cloud |
| Speech and model, default | Local KB-Whisper and local Piper on the Pi. Audio stays on the device | ESP32-S3 streams audio to the Mac mini. STT: Whisper or Parakeet, English. LLM: Qwen 2.5 7B or Llama 3.1 8B via Ollama or MLX, with tool calling. TTS: Piper with an English voice, or Kokoro. Speech stays in the house. KB-Whisper is the Swedish speech-to-text option later, not the v1 default |
| Speech and model, fallback | Not applicable | STT: Soniox, streaming. LLM: Berget. TTS: Cartesia or Soniox, chosen after a listening test |
| Memory | SQLite with sqlite-vec on the Pi | Default: Postgres with pgvector on the Mac mini. Fallback only: Supabase |
| Agent jobs | On the always-on Pi. Multi-step goal planning was out of v1 | Default: a local scheduler on the Mac mini, which must stay on. Multi-step research is in v1 |
| Web search | A search service, vendor open | Own SearXNG or a search API |
| Web admin | Next.js on Vercel with Supabase; secrets and memory stayed on the Pi | Next.js served from the Mac mini, reached via Tailscale. Memory stays at home. Supabase Pro is not needed. Supabase is only a cloud fallback |
| v1 capabilities | Conversation, email, calendar, web search | Wake word, voice chat, memory, calendar, web search plus web radio, proactive jobs, web admin. Email is parked until v2. English is the default language |
| Quiet hours | Required, times unset | 22:00–07:00 Europe/Stockholm. The cap is at most three unprompted proactive suggestions per day. User-requested reminders and watches, and the scheduled morning and evening broadcasts, do not count |
| Cost cap | 99 SEK per month including VAT, assuming local speech on the Pi at 0 SEK hosted | 99 SEK per month including VAT, on cloud fallback spend. Local mode costs 0 in provider spend. At 90 % the radio tells the user. At 100 % paid cloud calls pause. A local cost ledger on the Mac mini resets at the start of each calendar month. A spend cap or prepaid limit is set at each provider |
| Latency | First audio within 3 seconds, measured on a Pi 4 in PAN-300 | First audio within 3 seconds, measured against the Mac mini, from the ESP32-S3 over the home network |
| When the Mac mini is unreachable | Not applicable | The radio says an error out loud, by default. Automatic cloud fallback is an opt-in toggle in the admin |
| Chat provider | EU-hosted, pay-as-you-go. The accepted file still says Berget is not the provider | Local Qwen 2.5 7B or Llama 3.1 8B is the default. Berget is the cloud fallback for the LLM (PAN-306). A cloud provider requires an EU region and a data processing agreement before the first use. Live calls require an explicit `--live` opt-in |

Workflow is unchanged: TypeScript, `AGENTS.md`, CI, Vera and Lazek on every PR, only Daniel merges, no secrets in chat or code, live model calls only with Daniel’s yes.

In-flight work decided with this revision: PR #20 (PAN-308) will be merged and then adapted (Daniel merges). PR #21 (PAN-289) is stopped; the issue is rescoped. PAN-297 is absorbed in this file.

---

## 4. Hardware

The Raspberry Pi is out. The radio is an ESP32-S3 used as a thin client. The house backend is Daniel’s Mac mini (Apple M4, 16 GB).

* Radio budget: at most 500 SEK for one working unit, including microphone and speaker. The Mac mini is not part of that budget.
* Enclosure: an old cassette player that Daniel finds. The player’s speaker is reused.
* The component list for the radio is produced separately. It is not part of this spec.
* A desk or bench prototype of the same chip, microphone and a speaker is enough for software milestones until the cabinet is ready.
* After the wake word, the ESP32-S3 streams audio over the local WebSocket to the Mac mini, and plays streamed speech and web radio on the speaker.
* The Mac mini must be on around the clock for scheduled agent jobs. If it is unreachable, the radio says an error out loud. Automatic cloud fallback is off by default unless the user turns it on in the web admin.
* A simple status indicator (listening, thinking, idle) is still desirable. A physical approval button is not required in v1.

ATECC608 and locking a memory-database key in a chip on the radio no longer fit a thin client. They are dropped from v1 unless Daniel brings them back.

---

## 5. Architecture

The backend is built so that every part can be swapped through a common provider interface. Configuration selects the provider for each part. There is no hard-wired cloud path and no hard-wired local path in the product code.

| Part | Default (local, Mac mini) | Cloud fallback |
| -- | -- | -- |
| Speech-to-text | Whisper or Parakeet, English | Soniox, streaming |
| Language model | Qwen 2.5 7B or Llama 3.1 8B via Ollama or MLX, with tool calling | Berget |
| Text-to-speech | Piper with an English voice, or Kokoro | Cartesia or Soniox, chosen after a listening test |
| Memory | Postgres with pgvector on the Mac mini | Supabase |
| Agent jobs | Local scheduler on the Mac mini | A scheduled process in the cloud, when that fallback is in use |
| Web search | Own SearXNG, or a search API | A search API, if that is the chosen search provider |

Swedish, including KB-Whisper and a Swedish voice, is a later language option through the same provider interface. It is not part of v1 and it is not the cloud fallback.

**Device and house server**

* **On the chip:** microWakeWord with a ready-made English wake word, microphone capture, a WebSocket client for audio in both directions, playback of streamed speech, and starting web radio on the speaker.
* **Discovery:** the radio finds the Mac mini via mDNS (`radio-days.local`) or a fixed IP.
* **Pairing:** a pairing key is set in the web admin. Both ends authenticate with that key. The device verifies that it is talking to the paired Mac mini. The backend rejects a device that does not present the current key. The audio stream is encrypted (TLS or equivalent). Re-pairing from the admin rotates the key and revokes the old key. The key is never committed to the public repository or to committed firmware.
* **On the Mac mini, by default:** STT, the language model, text-to-speech, long-term memory, web search, the web admin (Next.js), and scheduled agent jobs.
* **Web admin access:** Next.js served from the Mac mini, reached via Tailscale. Being on the tailnet is not enough; sign-in must prove an allowlisted identity (section 7).

A provider key alone does not start a paid fallback call; an explicit choice is required. Live provider calls also require an explicit `--live` opt-in. Switching a part to the cloud fallback is a configuration change, not a rewrite. Automatic fallback when the Mac mini is unreachable stays off by default unless the user opts in.

Whether Qwen 2.5 7B or Llama 3.1 8B is good enough in English with tool calling, and whether STT, the model and TTS can run at the same time in 16 GB while meeting the 3 second gate, is a measurement in milestone 6 / PAN-300. It is not a product decision in this file.

---

## 6. The agent, memory and proactive jobs

The radio gets to know Daniel. When it is confident enough in a habit, it may choose for him, and it asks only when it is unsure. He can turn autonomous behaviour off, and he can correct or delete a learned habit or a memory, by voice and in the web admin.

A habit is a pattern the radio detects itself. A memory is something the user explicitly asks it to remember. The radio does not invent personal facts. A deleted item is not used again.

**Household.** The household is one user. The radio does not distinguish people. Other people in the home can hear the radio and use it. Memory is per household. Anyone in the room can give consent and can delete a habit or a memory.

**Consent and retention (PAN-297).** The radio does not store a habit until the user agrees, by voice or in the web admin. Raw audio and transcripts are not stored by Radio Days, on the Mac mini, in the cloud, or in the repo. Memory and habits live in Postgres with pgvector on the Mac mini by default. They do not leave the house unless a cloud fallback is explicitly chosen, or unless the user has turned on automatic cloud fallback and the Mac mini is unreachable.

**What is sent to a model.** In the local default, conversation, retrieved memories the user asked the radio to remember, and tool results stay on the Mac mini and are not sent to a cloud AI provider. Habit records are not sent to a cloud provider in a prompt or as embedding text. If the LLM fallback (Berget) is used, only conversation may be sent until a DPA exists; calendar, search results, memory and habits must not be sent in the meantime. After a DPA, what may be sent is still limited to what that turn needs, with no training on household data and with minimal retention.

Proactive jobs in v1:

* **Morning broadcast:** weather, Google Calendar and news, then the radio is turned on.
* **Background watch:** “tell me when …”
* **Context-aware reminders.**
* **Proactive suggestions** from memory.
* **Multi-step research.**
* **Evening summary.**

These jobs run on a local scheduler on the Mac mini by default. Quiet hours are 22:00–07:00 Europe/Stockholm. The cap is at most three unprompted proactive suggestions per day. Only unprompted proactive suggestions count toward that cap. User-requested reminders and watches, and the scheduled morning and evening broadcasts, do not count. Those still respect quiet hours, except an alarm the user set. Important, time-bound reminders may break through if the user has allowed that.

---

## 7. Web admin

Decided for v1. Framework: Next.js. Host: the Mac mini. Access: Tailscale. Being on the tailnet is not enough.

Sign-in requires proof of identity: the Tailscale identity of an allowlisted user, verified server-side, plus an app session. Sign-in without that proof is refused. Sessions are server-side, with expiry and logout. CSRF protection applies to every state-changing request.

The service binds to the tailnet interface or localhost only. It does not listen on the LAN or on a public address. Tailscale Funnel is not used for the admin.

The user can:

* onboard and pair the device (Wi-Fi, device linking, and the pairing key)
* rotate the pairing key; re-pairing revokes the old key
* manage keys and connections, such as Google Calendar
* view and edit what the radio remembers about the user
* manage watches and reminders
* pick favourite radio stations
* turn automatic cloud fallback on or off (off by default)

Secrets are handled server-side or encrypted. They never go into the public repository, into client-side source that is committed, or onto the screen in cleartext. Memory stays at home. Supabase Pro is not needed. Supabase is only a cloud fallback for memory, if that fallback is chosen.

Connection status is visible. Turning autonomous behaviour off belongs with memory and watches.

The accepted skeleton (PR #21 / PAN-289) assumed a Pi device code, keys encrypted to a key that only the Pi holds, and later a Vercel plus Supabase host. That work is stopped. The issue is rescoped to this admin.

User-facing admin text is English in v1. Swedish comes later as a language option.

---

## 8. Privacy, security and providers

The repo stays public. No secrets, pairing keys or personal data in code.

**Local default (decided).** In local mode, no speech leaves the house. Audio goes from the ESP32-S3 over the home network to the Mac mini, and is processed there. Memory stays in local Postgres. Under the GDPR, Radio Days processes this household data on a machine in the home for the purpose of running the radio for that household; it is not sent to a cloud processor unless a fallback is in use.

**Cloud fallback.** Before the first use of any cloud provider, that provider must be in an EU region and must have a data processing agreement. That applies to Berget (LLM), to Soniox (streaming STT, and TTS if chosen), to Cartesia (TTS if chosen), and to Supabase if memory is stored there. No training on household data, and minimal retention, remain required. Live provider calls require an explicit `--live` opt-in. QA uses fake keys and mocks only. A provider key alone does not start a paid call. This matches PAN-68 / PAN-306.

**At rest.** Memory and secrets are encrypted at rest on the Mac mini. A backup of memory is encrypted. No unencrypted copy of memory is kept off the Mac mini. Supabase holds memory only when that cloud fallback is explicitly chosen.

**Logs.** Logs must not contain raw audio, transcripts, or secrets.

**Web search.** A self-hosted SearXNG keeps queries in the house. A third-party search API is a cloud processor and needs the same fallback rules.

**Untrusted text (PAN-297).** Calendar invitations and events, and web search results, are never treated as instructions and can never start an action. The radio starts a station only from the user’s saved favourites or a curated allowlist of stream URLs, never from a URL taken from search results or other untrusted text. The same rule will apply to email content when email returns in v2. Email is not in v1.

---

## 9. Latency

**Gate (decided):** at most 3 seconds from when the user stops speaking until the first audio on the cassette player’s speaker. It is measured against the Mac mini, with the ESP32-S3 on the home network, not in CI. For a turn that needs a tool, that first audio may be a short spoken acknowledgement, and the answer follows.

The accepted measurement in PAN-300 was on a Pi 4. That setup is obsolete. PAN-300 is rescoped to this Mac mini plus ESP32-S3 measurement (section 13). The same measurement records whether STT, Qwen 2.5 7B or Llama 3.1 8B, and Piper or Kokoro can run together in 16 GB, and how the English quality and tool calling hold up. Those results do not change the 3 second gate; they tell us whether the default stack meets it.

---

## 10. Running cost

**Cap (locked, Daniel, 2026-11-27, confirmed the same day with the local default):** 99 SEK per month including 25 % VAT. The cap applies to cloud fallback spend. Hardware, electricity, the Mac mini, Tailscale and one-off purchases are outside the cap. Local mode costs 0 in provider spend. Local STT, the local model, local Piper or Kokoro, local Postgres, the local scheduler, the Next.js admin on the Mac mini, and (if chosen) own SearXNG have no hosted fee. Supabase Pro is not needed in the default.

**What counts.** Every paid provider call counts: STT, LLM, TTS, a search API, and Supabase. Local mode costs 0 in provider spend.

**Price.** The price is the provider’s published price list, recorded in config with the date.

**Counter.** A local cost ledger on the Mac mini holds the counter. It resets at the start of each calendar month in Europe/Stockholm. At 90 % the radio tells the user. At 100 % paid cloud calls pause until the next month. The wake word still works. A spend cap or prepaid limit is set at each provider, as a backstop to the ledger.

**Principle:** use the cheapest option that meets the quality and latency evals. Prefer the local default. A provider key alone does not start a paid call. Automatic fallback, if the user has opted in, also counts toward the cap.

**Cloud fallback, for context only, not the default bill.** Sourced list prices checked 2026-11-27, with the Sveriges Riksbank USD rate for 2026-11-26 (10.20729 SEK per USD, [Riksbank statistics](https://www.riksbank.se/sv/statistik/)) and 25 % VAT, under a labelled example of 30 short conversations a day plus short morning and evening speech (about 3.75 hours of STT and 5–6.5 hours of TTS per month):

* Soniox real-time STT at 0.12 USD per hour and TTS at about 0.70 USD per hour of speech ([soniox.com/pricing](https://soniox.com/pricing)): about 50–65 SEK including VAT for speech alone, before the chat model.
* Cartesia TTS at about 1 credit per character, 750–800 credits per minute ([docs.cartesia.ai/pricing](https://docs.cartesia.ai/pricing), [cartesia.ai/pricing](https://www.cartesia.ai/pricing)), on the 5 USD plan plus overage at 65 USD per 1M credits: about 180–240 SEK including VAT for the same speech, already above the cap. The 49 USD and 299 USD plans are themselves above the cap.
* Berget pay-as-you-go for the fallback LLM: unit prices depend on the chosen model; not estimated here.
* Supabase, if memory fallback is used: Free is 0 USD but may pause after a week of inactivity; Pro starts at 25 USD per month, about 319 SEK including VAT, which alone exceeds the cap ([supabase.com/pricing](https://supabase.com/pricing)).

Those fallback figures are why everyday use stays on the Mac mini. They do not reopen the cap.

---

## 11. Plan (milestones, no fixed timeline)

The plan takes the time it takes. Each milestone is done only when its done criterion is met, and the work is covered by unit tests, with CI green. Mounting in the cassette player waits for the separate component list and for a set Daniel has. The provider interface is part of the work from the first milestone, so a part can be pointed at a fallback later without a rewrite.

**Milestone 1: Wake word and voice chat**

On-chip microWakeWord with a ready-made English wake word for the first demo (for example “Hey Jarvis”). A custom wake word (“Kör Radio”) and Swedish come later. Audio streams over the local WebSocket, with mDNS (`radio-days.local`) or a fixed IP, and a pairing key. Both ends authenticate with that key, and the audio stream is encrypted. Default local chain: Whisper or Parakeet, English; Qwen 2.5 7B or Llama 3.1 8B with tool calling; and Piper with an English voice, or Kokoro. After the wake word, the user can have a short spoken conversation and hear the reply from the speaker. A token cap is in place. Raw audio and transcripts are not stored. Done when that conversation works from the ESP32-S3 against the Mac mini (a bench prototype is enough). Covered by unit tests, CI green.

**Milestone 2: Web admin and pairing**

Next.js admin served from the Mac mini and reached via Tailscale: sign-in that proves an allowlisted Tailscale identity, verified server-side, plus an app session. Sign-in without that proof is refused. The service binds to the tailnet interface or localhost only. Tailscale Funnel is not used for the admin. Sessions are server-side, with expiry and logout, and CSRF protection applies to every state-changing request. Onboard and pair the device (Wi-Fi, device linking, pairing key), keys and connections such as Google Calendar, status, favourite stations, and the automatic-fallback toggle (off by default). Secrets handled server-side or encrypted, never in the public code. Memory stays at home. User-facing admin text is English in v1. Done when the user can sign in over Tailscale, put the device on Wi-Fi, pair it, and set connections, without secrets appearing in cleartext or in the repo. Covered by unit tests, CI green.

**Milestone 3: Memory**

Postgres with pgvector on the Mac mini, behind the provider interface (Supabase remains a fallback only). Memory and secrets are encrypted at rest. A backup of memory is encrypted. The radio remembers what it is told and what it has learned, and can use that in a later turn. A habit is stored only after the user agrees. The user can view and edit memory in the admin and by voice. Deletion is effective. Done when those behaviours hold and memory is not leaked into the repo or into logs. Covered by unit tests, CI green.

**Milestone 4: Web search, web radio, and calendar**

Web search as a tool, via own SearXNG or a search API. The user can ask a question and hear an answer in English, and can start web radio or music (“turn on P1”), including a favourite station. The radio starts a station only from the user’s saved favourites or a curated allowlist of stream URLs, never from a URL taken from search results or other untrusted text. The morning broadcast can read Google Calendar. Search results and calendar text are untrusted. Done when those behaviours hold. Covered by unit tests, CI green.

**Milestone 5: Proactive agent jobs**

Morning broadcast (weather, Google Calendar, news, then radio on), background watches, context-aware reminders, suggestions from memory, multi-step research, and evening summary, run by the local scheduler. Quiet hours are 22:00–07:00 Europe/Stockholm. The cap is at most three unprompted proactive suggestions per day. Only unprompted proactive suggestions count. User-requested reminders and watches, and the scheduled morning and evening broadcasts, do not count, and they still respect quiet hours, except an alarm the user set. Done when those jobs run on a schedule and can be managed in the admin. Covered by unit tests, CI green.

**Milestone 6: Evals, latency and the default stack**

Evals for intent-to-tool, memory recall, invention and deletion, untrusted text, paid calls after the cap, consent (no habit stored without agreement), and privacy leaks (including speech leaving the house when local mode is selected). CI runs those evals with mocks. Latency is measured on the ESP32-S3 plus the Mac mini, not only in CI, against the 3 second gate. The same measurement records English quality and tool calling for Qwen 2.5 7B or Llama 3.1 8B, and whether STT, the model and TTS fit together in 16 GB. Done when CI turns red on a planted failure in the test set, and green again when it is fixed, and when the latency measurement is written down. Covered by unit tests, CI green.

**v2 (after v1):** email by voice, with an unlock step before content is read aloud, and a physical approval button for sending mail; email text remains untrusted and can never start an action (PAN-302, PAN-307). Choosing the wake word from a list in the web admin (PAN-301). A custom wake word (“Kör Radio”) and Swedish as a language option, including KB-Whisper for Swedish speech-to-text, via the swappable providers. Spotify only with written permission, and with undo for playlist and favourite changes.

---

## 12. Process and workflow

Unchanged from the accepted spec:

* `AGENTS.md` stays the short project guide. Confirm work with `npm run check` before calling work done. Tests of SPEC.md and docs check structure and a few short key facts per section, not full sentences, section numbers, or words that must not appear.
* Daniel builds in Cursor and opens a PR. Vera (code review) and Lazek (QA, same sha) review every PR and post a verdict in the PR. Only Daniel merges.
* Every branch and PR title contains the Linear issue id, except this spec revision, whose branch name was set for the change of direction; PAN-267 tracks the spec.
* Live model calls with real keys only with Daniel’s yes, and only with an explicit `--live` opt-in. QA uses fake keys and mocks only.
* Secrets never go in chat or code. Migrations run only from `main`, after Daniel’s ok.
* Cloud agents use model grok-4.7.

PR #20 (PAN-308) will be merged by Daniel and then adapted to this revision. PR #21 (PAN-289) is stopped.

---

## 13. Impact on in-flight work

These changes follow Daniel’s decisions of 2026-11-27.

| Item | Status now | Decision |
| -- | -- | -- |
| [PR #20](https://github.com/PanamaDonne/radio-days/pull/20) / [PAN-308](https://linear.app/panamadonnes/issue/PAN-308/kor-milstolpe-1-pa-datorn-innan-pi-4-finns) | Approved, CI green, awaiting Daniel’s merge | **Merge, then adapt.** Daniel merges. After merge, the Pi 4 destination is removed and the loop is pointed at the Mac mini default |
| [PR #21](https://github.com/PanamaDonne/radio-days/pull/21) / [PAN-289](https://linear.app/panamadonnes/issue/PAN-289/webbadmin-skelett) | In review; custom Node `serve.ts`, in-memory store, Pi ciphertext model | **Stopped.** The stack does not fit. PAN-289 is rescoped to Next.js on the Mac mini, reached via Tailscale |
| [PAN-300](https://linear.app/panamadonnes/issue/PAN-300/mat-svensk-rost-pa-pi-4-med-1-gb-och-2-gb) | Backlog | **Rescope** to the 3 second measurement on the ESP32-S3 plus the Mac mini, including 16 GB concurrency and English quality and tool calling for Qwen 2.5 7B or Llama 3.1 8B |
| [PAN-306](https://linear.app/panamadonnes/issue/PAN-306/valj-eu-chattleverantor-for-v1) | Backlog | **Rescope to cloud fallback only.** Default LLM is local Qwen 2.5 7B or Llama 3.1 8B. Fallback: Berget for the LLM, Soniox for streaming STT, Cartesia or Soniox for TTS. An EU region and a data processing agreement are required before the first use |
| [PAN-307](https://linear.app/panamadonnes/issue/PAN-307/valj-upplasningsmetod-for-upplasning-av-mejl), [PAN-302](https://linear.app/panamadonnes/issue/PAN-302/mejl-med-rosten) | Backlog | **Parked until v2.** Email is out of v1. Not cancelled |
| [PAN-303](https://linear.app/panamadonnes/issue/PAN-303/kalender-med-rosten) | Backlog | **Rescope.** Calendar stays in v1 for the morning broadcast and as a Google Calendar connection in the admin |
| [PAN-304](https://linear.app/panamadonnes/issue/PAN-304/webbsokning-med-rosten) | Backlog | **Widen** so the same tool can start web radio or music, via own SearXNG or a search API |
| [PAN-305](https://linear.app/panamadonnes/issue/PAN-305/sparade-favoriter-och-cache-for-webbradio-och-poddar-efter-v1) | Backlog, previously after v1 | **Rescope into v1** for favourite stations. Podcast cache can stay later |
| [PAN-288](https://linear.app/panamadonnes/issue/PAN-288/spotify-med-rosten-uppskjuten-ej-v1) | Backlog, already not in v1 | **Keep out of v1.** If it returns: written permission, and undo for playlist and favourite changes |
| [PAN-287](https://linear.app/panamadonnes/issue/PAN-287/vackningsord-och-samtal) | Backlog | **Rescope** to on-chip microWakeWord with a ready-made English wake word and the Mac mini voice chain, behind the provider interface |
| [PAN-291](https://linear.app/panamadonnes/issue/PAN-291/langtidsminne) | Backlog | **Rescope** to Postgres with pgvector on the Mac mini, with Supabase as fallback only |
| [PAN-292](https://linear.app/panamadonnes/issue/PAN-292/evals-och-ci-sparr) | Backlog | **Rescope.** Latency is measured on the Mac mini plus the ESP32-S3. Privacy evals cover local mode and cloud fallback |
| [PAN-301](https://linear.app/panamadonnes/issue/PAN-301/valj-vackningsord-i-webbadmin-v2) | Backlog | **Keep after v1** |
| [PAN-295](https://linear.app/panamadonnes/issue/PAN-295/tata-luckor-i-specmd-och-agentsmd-efter-tts-beslutet), [PAN-294](https://linear.app/panamadonnes/issue/PAN-294/komplettera-tts-reserven-i-specen-och-gor-spec-testet-taligt) | Backlog | **Rescope.** Piper with an English voice, or Kokoro, is the default TTS. The fallback is Cartesia or Soniox after a listening test |
| [PAN-297](https://linear.app/panamadonnes/issue/PAN-297/tata-luckor-i-agentavsnittet-i-specmd-efter-pr-16) | Backlog | **Absorbed in this revision** and marked Done |
| [PAN-299](https://linear.app/panamadonnes/issue/PAN-299/specen-billig-pi-4-med-lokal-svensk-rost) | Done | **Superseded** as a hardware decision. Leave the issue done |
| [PAN-269](https://linear.app/panamadonnes/issue/PAN-269/skills-synken-skriver-aldrig-utanfor-cursorskills), [PAN-270](https://linear.app/panamadonnes/issue/PAN-270/skills-synk-skriver-aldrig-utanfor-cursorskills-aven-vid-symlankade) | Backlog | **Keep.** Repo hygiene |
| PAN-309 | New | **In v1.** ESP32-S3 WebSocket, mDNS or a fixed IP, and a pairing key. Both ends authenticate. The audio stream is encrypted. Re-pairing revokes the old key |
| PAN-310 | New | **In v1.** A common provider interface. Live provider calls require an explicit `--live` opt-in. A data processing agreement and an EU region are required before the first use of a cloud provider |
| PAN-311 | New | **In v1.** Local scheduler on the Mac mini |
| PAN-312 | New | **In v1.** Quiet hours 22:00–07:00 Europe/Stockholm. The cap is at most three unprompted proactive suggestions per day |
| PAN-313 | New | **After v1.** Swedish is a language option via the swappable providers, including KB-Whisper |

`README.md` and `AGENTS.md` are updated in this revision to the ESP32-S3, the Mac mini, and English by default in v1.

---

## 14. Measurement, not an open product decision

The product decisions in this revision are closed.

One measurement remains, and does not reopen those decisions. It is owned by milestone 6 and by the rescoped PAN-300:

* Is Qwen 2.5 7B or Llama 3.1 8B good enough in English with tool calling, and can STT, the model and Piper or Kokoro run at the same time in 16 GB on the Mac mini while still meeting the 3 second gate?

If the measurement misses the gate, a later change to the default model or the runtime (Ollama versus MLX, or Whisper versus Parakeet) can be proposed then. This file does not choose a smaller or larger model in advance.

The component list for the radio comes separately and is not decided here.
