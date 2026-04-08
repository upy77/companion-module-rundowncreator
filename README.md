companion-module-rundowncreator
A Bitfocus Companion 4.x module for controlling Rundown Creator broadcast rundown software, with integrated Stagetimer.io support for automatic rundown loading and timer control.
Developed by Derek Self — Vallivue School District / VSPN
Features
• Load any day's Rundown Creator rundown directly into Stagetimer as linked timers with one button press
• On-air timer tracking — displays current story slug and position (e.g. 3/17)
• TRT (Total Run Time) over/under clock with color feedback — green under target, red over
• Full Stagetimer transport control — play, stop, next, previous, reset, flash, blackout, on air
• Add/subtract time from the highlighted Stagetimer timer in preset increments (1s, 5s, 10s, 30s, 1m)
• Feedbacks for: on-air status, rundown frozen/locked, row approved/floated, Stagetimer running/blackout/on-air
• Variables: on-air row slug, story position, TRT display, active rundown title, Stagetimer status
• Rows with zero estimated and actual duration are automatically skipped in Stagetimer (behind-the-scenes rows)
Requirements
• Bitfocus Companion 4.x
• Rundown Creator account with API access (any paid plan)
• Stagetimer.io account with API access (any paid plan)
• Node.js 18 or higher (for building)
Installation
Option A — Developer Folder (Recommended)
1. Clone or download this repository to a folder on your computer, e.g. ~/Documents/companion-module-rundowncreator
2. In Terminal, run: npm install --legacy-peer-deps
3. Open the Companion Launcher, click the ⚙ Cog icon
4. Under Developer, click Select and choose the parent folder containing the module folder
5. Enable Developer Modules and restart Companion
Option B — Import Package
6. Run npm install --legacy-peer-deps && npx companion-module-build in the module folder
7. In Companion, go to Modules and click Import module package
8. Select the .tgz file generated in the module folder
Configuration
After adding the module as a Connection in Companion, fill in these fields:
Rundown Creator
• Account Subdomain: The subdomain from your RC URL, e.g. channel4news from channel4news.rundowncreator.com
• API Key: From Rundown Creator Account Settings → API
• API Token: From Rundown Creator Account Settings → API
• Default Rundown ID: Optional. The Rundown ID used when actions don't specify one
• Poll Interval: How often to fetch updated data (default: 5 seconds)
• Target TRT: Your show's target total run time in seconds (default: 360 = 6 minutes)
Stagetimer
• Room ID: From your Stagetimer room menu → API
• API Key: From your Stagetimer room menu → API
Actions
Rundown Creator
• Select Day + Load into Stagetimer: Sets the active rundown and loads all stories into Stagetimer as linked timers. Zero-duration rows are skipped.
• Start Show: Starts the TRT clock and fires startTimingRow on the specified first row
• Next Story: Queries the RC API for the row after the current on-air row and advances the timer
• Reset TRT Clock: Resets the show elapsed timer
• Approve / Unapprove Row Script: Sets approval state on a row
• Float / Unfloat Row: Sets float state on a row
• Set Row Properties: Set slug, page number, duration, approved, floated
• Insert / Duplicate / Delete Row: Row management
• Create / Copy / Delete Rundown: Rundown management
• Send Chat Message: Sends a message to the RC chat
• Refresh All Data: Forces an immediate poll of RC and Stagetimer
Stagetimer
• Play/Stop, Next, Previous, Reset: Transport controls for the highlighted timer
• Add Time / Subtract Time: Add or subtract 1s, 5s, 10s, 30s, 1m, 2m, or 5m from the highlighted timer
• Flash, Toggle Blackout, Toggle On Air: Viewer controls
Feedbacks
• Day: Currently Selected — Blue when this day's rundown is active
• Rundown: On-Air Timer Active — Red when the rundown's on-air timer is running
• Row: Currently On-Air — Red when a specific row is the active on-air row
• Row: Script Approved — Green when the row's script is approved
• Row: Floated — Orange when the row is floated
• Rundown: Frozen / Locked — Blue / Purple
• TRT: Over Time — Red when elapsed time exceeds target TRT
• TRT: Under Time — Green when elapsed time is under target TRT
• Stagetimer: Timer Running — Red when the Stagetimer timer is running
• Stagetimer: Blackout Active — Black/red when blackout is on
• Stagetimer: On Air Active — Red when On Air mode is on
Variables
• $(rundowncreator:active_rundown_title) — Title of the active rundown
• $(rundowncreator:active_rundown_id) — ID of the active rundown
• $(rundowncreator:on_air_row_slug) — Story slug of the row currently on-air
• $(rundowncreator:on_air_row_id) — Row ID of the row currently on-air
• $(rundowncreator:story_position) — Current story position, e.g. 3/17
• $(rundowncreator:row_count) — Number of rows in the active rundown
• $(rundowncreator:rundown_count) — Total number of rundowns
• $(rundowncreator:trt_elapsed) — Elapsed show time, e.g. 4:32
• $(rundowncreator:trt_display) — TRT over/under display, e.g. +0:23 OVER
• $(rundowncreator:stagetimer_status) — Stagetimer load status, e.g. TUE loaded (17 stories)
How It Works
When a day button is pressed, the module calls getRows on the Rundown Creator API for that day's rundown. It filters out rows where both EstimatedDuration and ActualDuration are zero (behind-the-scenes rows), then deletes all existing Stagetimer timers and creates new ones using the RC story slugs and durations. The first timer is set to MANUAL trigger and all subsequent timers are LINKED, so they auto-advance.
The TRT clock starts when the Start Show action fires and runs internally using setInterval, updating the trt_display and trt_elapsed variables every second.
Rundown Creator data is polled every N seconds (configurable). Stagetimer playback status and room state are polled in the same interval to keep feedbacks up to date.
License
MIT — free to use, modify, and distribute. Attribution appreciated.
Contributing / Issues
Pull requests and issues welcome. This module was built for a high school broadcast program (VSPN at Vallivue High School, Idaho) and may need adjustment for other Rundown Creator account structures.
