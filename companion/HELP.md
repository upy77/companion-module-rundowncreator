# Rundown Creator Module for Bitfocus Companion

Control [Rundown Creator](https://www.rundowncreator.com) broadcast rundown software with integrated [Stagetimer.io](https://stagetimer.io) support.

Developed by Derek Self — VSPN / Vallivue School District, Idaho.

---

## Configuration

### Rundown Creator
- **Account Subdomain** — From your RC URL, e.g. `channel4news` from `channel4news.rundowncreator.com`
- **API Key** — From Account Settings → API
- **API Token** — From Account Settings → API
- **Default Rundown ID** — Optional fallback Rundown ID for actions that don't specify one
- **Poll Interval** — How often to fetch data from RC (default: 5 seconds)
- **Target TRT** — Your show's target total run time in seconds (default: 360 = 6 minutes)

### Stagetimer
- **Room ID** — From your Stagetimer room menu → API
- **API Key** — From your Stagetimer room menu → API

---

## Key Actions

- **Select Day + Load into Stagetimer** — Sets the active rundown AND loads all stories into Stagetimer as linked timers. Rows with zero estimated and actual duration are skipped automatically.
- **Start Show** — Starts the TRT clock and fires the on-air timer on the first row
- **Next Story** — Advances to the next row in Rundown Creator
- **Reset TRT Clock** — Resets the show elapsed timer
- **Stagetimer: Play/Stop, Next, Previous, Reset** — Transport controls
- **Stagetimer: Add/Subtract Time** — Adjust highlighted timer in increments (1s, 5s, 10s, 30s, 1m)
- **Stagetimer: Flash, Blackout, On Air** — Viewer controls

---

## Key Variables

- `$(rundowncreator:on_air_row_slug)` — Current on-air story name
- `$(rundowncreator:story_position)` — e.g. 3/17
- `$(rundowncreator:trt_elapsed)` — Elapsed show time
- `$(rundowncreator:trt_display)` — e.g. +0:23 OVER or -0:45 UNDER
- `$(rundowncreator:active_rundown_title)` — Active rundown title
- `$(rundowncreator:stagetimer_status)` — e.g. TUE loaded (17 stories)

---

## Feedbacks

- **Day: Currently Selected** — Blue when this day's rundown is active
- **Rundown: On-Air Timer Active** — Red when on-air timer is running
- **TRT: Over/Under Time** — Red when over, green when under target TRT
- **Stagetimer: Timer Running** — Red when Stagetimer is counting down
- **Stagetimer: Blackout/On Air Active** — Shows active state

---

## Support

For issues or questions, visit the GitHub repository or contact the module author.
