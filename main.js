import { InstanceBase, runEntrypoint, InstanceStatus, combineRgb } from '@companion-module/base'

class RundownCreatorInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.rundowns = []
		this.rows = []
		this.pollInterval = null
		this.trtInterval = null
		this.showStartTime = null
		this.targetTRT = 360
		this.currentOnAirRowId = null
		this.startStagetimeronLoad = false
		this.stRunning = false
		this.stBlackout = false
		this.stOnAir = false
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				label: 'Rundown Creator Setup',
				value: 'Enter your Rundown Creator account subdomain, API Key and Token from Account Settings → API.',
				width: 12,
			},
			{ type: 'textinput', id: 'subdomain', label: 'Account Subdomain', width: 6, default: '' },
			{ type: 'textinput', id: 'apiKey', label: 'API Key', width: 6, default: '' },
			{ type: 'textinput', id: 'apiToken', label: 'API Token', width: 6, default: '' },
			{ type: 'textinput', id: 'defaultRundownId', label: 'Default Rundown ID', width: 6, default: '' },
			{ type: 'number', id: 'pollInterval', label: 'Poll Interval (seconds)', width: 6, default: 5, min: 3, max: 60 },
			{ type: 'number', id: 'targetTRT', label: 'Target TRT (seconds)', width: 6, default: 360, min: 30, max: 3600 },
			{
				type: 'static-text',
				id: 'stagetimer_info',
				label: 'Stagetimer Setup',
				value: 'Enter your Stagetimer Room ID and API Key from the room menu → API.',
				width: 12,
			},
			{ type: 'textinput', id: 'stagetimer_room_id', label: 'Stagetimer Room ID', width: 6, default: '' },
			{ type: 'textinput', id: 'stagetimer_api_key', label: 'Stagetimer API Key', width: 6, default: '' },
		]
	}

	async init(config) {
		this.config = config
		this.targetTRT = config.targetTRT || 360
		this.updateStatus(InstanceStatus.Connecting)
		this.initVariables()
		this.initActions()
		this.initFeedbacks()
		this.initPresets()
		await this.refreshAll()
		this.startPolling()
		this.startTRTClock()
	}

	async destroy() {
		this.stopPolling()
		this.stopTRTClock()
	}

	async configUpdated(config) {
		this.config = config
		this.targetTRT = config.targetTRT || 360
		this.stopPolling()
		this.stopTRTClock()
		this.rundowns = []
		this.rows = []
		await this.refreshAll()
		this.startPolling()
		this.startTRTClock()
	}

	// ── Polling ───────────────────────────────────────────────

	startPolling() {
		const ms = (this.config.pollInterval || 5) * 1000
		this.pollInterval = setInterval(() => this.refreshAll(), ms)
	}

	stopPolling() {
		if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null }
	}

	// ── TRT Clock ─────────────────────────────────────────────

	startTRTClock() {
		this.trtInterval = setInterval(() => this.updateTRTVariable(), 1000)
	}

	stopTRTClock() {
		if (this.trtInterval) { clearInterval(this.trtInterval); this.trtInterval = null }
	}

	updateTRTVariable() {
		if (!this.showStartTime) {
			this.setVariableValues({ trt_display: 'TRT --:--', trt_elapsed: '--:--', trt_seconds: 0, trt_over: false })
			this.checkFeedbacks('trt_over', 'trt_under')
			return
		}
		const elapsed = Math.floor((Date.now() - this.showStartTime) / 1000)
		const diff = elapsed - this.targetTRT
		const absDiff = Math.abs(diff)
		const mins = Math.floor(absDiff / 60)
		const secs = String(absDiff % 60).padStart(2, '0')
		const sign = diff >= 0 ? '+' : '-'
		const label = diff >= 0 ? 'OVER' : 'UNDER'
		this.setVariableValues({
			trt_display: `${sign}${mins}:${secs} ${label}`,
			trt_elapsed: this.formatTime(elapsed),
			trt_seconds: diff,
			trt_over: diff > 0,
		})
		this.checkFeedbacks('trt_over', 'trt_under')
	}

	formatTime(secs) {
		const m = Math.floor(secs / 60)
		const s = String(secs % 60).padStart(2, '0')
		return `${m}:${s}`
	}

	// ── Rundown Creator API ───────────────────────────────────

	rdBaseUrl() {
		return `https://www.rundowncreator.com/${encodeURIComponent(this.config.subdomain)}/API.php`
	}

	async apiGet(action, extra = {}) {
		if (!this.config.subdomain || !this.config.apiKey || !this.config.apiToken) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing RC credentials'); return null
		}
		const params = new URLSearchParams({ APIKey: this.config.apiKey, APIToken: this.config.apiToken, Action: action, ...extra })
		try {
			const res = await fetch(`${this.rdBaseUrl()}?${params}`)
			if (res.status === 401) { this.updateStatus(InstanceStatus.AuthenticationError, 'Invalid RC credentials'); return null }
			if (!res.ok) { this.log('warn', `RC API ${action} ${res.status}: ${await res.text()}`); return null }
			this.updateStatus(InstanceStatus.Ok)
			return await res.json()
		} catch (e) { this.log('error', `RC GET ${action}: ${e.message}`); this.updateStatus(InstanceStatus.ConnectionFailure, e.message); return null }
	}

	async apiPost(action, body = {}) {
		if (!this.config.subdomain || !this.config.apiKey || !this.config.apiToken) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing RC credentials'); return null
		}
		const b = new URLSearchParams({ APIKey: this.config.apiKey, APIToken: this.config.apiToken, Action: action, ...body })
		try {
			const res = await fetch(this.rdBaseUrl(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() })
			if (res.status === 401) { this.updateStatus(InstanceStatus.AuthenticationError, 'Invalid RC credentials'); return null }
			if (!res.ok) { this.log('warn', `RC POST ${action} ${res.status}: ${await res.text()}`); return null }
			this.updateStatus(InstanceStatus.Ok)
			return await res.json()
		} catch (e) { this.log('error', `RC POST ${action}: ${e.message}`); this.updateStatus(InstanceStatus.ConnectionFailure, e.message); return null }
	}

	// ── Stagetimer API ────────────────────────────────────────

	stBaseUrl() {
		return `https://api.stagetimer.io/v1`
	}

	// All Stagetimer API calls are GET with query params
	async stGet(endpoint, params = {}) {
		if (!this.config.stagetimer_room_id || !this.config.stagetimer_api_key) {
			this.log('warn', 'Stagetimer not configured'); return null
		}
		const q = new URLSearchParams({
			room_id: this.config.stagetimer_room_id,
			api_key: this.config.stagetimer_api_key,
			...params,
		})
		try {
			const res = await fetch(`${this.stBaseUrl()}/${endpoint}?${q}`)
			if (!res.ok) { this.log('warn', `Stagetimer ${endpoint} ${res.status}: ${await res.text()}`); return null }
			return await res.json()
		} catch (e) { this.log('error', `Stagetimer ${endpoint}: ${e.message}`); return null }
	}

	// ── Load Rundown into Stagetimer ──────────────────────────

	async loadRundownIntoStagetimer(rundownId, dayLabel) {
		this.log('info', `Loading ${dayLabel} rundown (${rundownId}) into Stagetimer...`)
		this.setVariableValues({ stagetimer_status: `Loading ${dayLabel}...` })

		// 1. Get rows from Rundown Creator
		const rows = await this.apiGet('getRows', { RundownID: rundownId })
		if (!Array.isArray(rows) || rows.length === 0) {
			this.log('warn', 'No rows returned from Rundown Creator')
			this.setVariableValues({ stagetimer_status: 'Load failed' })
			return
		}

		// Filter out rows with no slug, and rows with zero duration on both fields (behind-the-scenes rows)
		const validRows = rows.filter(r => r.StorySlug && r.StorySlug.trim() !== '' && (r.EstimatedDuration > 0 || r.ActualDuration > 0))
		this.log('info', `Found ${validRows.length} rows to load into Stagetimer`)

		// 2. Get existing Stagetimer timers and delete them all
		const existing = await this.stGet('get_all_timers')
		if (existing && existing.data && Array.isArray(existing.data)) {
			for (const timer of existing.data) {
				await this.stGet('delete_timer', { timer_id: timer._id })
			}
			this.log('info', `Cleared ${existing.data.length} existing Stagetimer timers`)
		}

		// 3. Create a timer for each row (all via GET with query params)
		let created = 0
		for (let i = 0; i < validRows.length; i++) {
			const row = validRows[i]
			// EstimatedDuration is in seconds, Stagetimer wants milliseconds
			const durationSecs = row.EstimatedDuration > 0 ? row.EstimatedDuration : (row.ActualDuration > 0 ? row.ActualDuration : 30)
			const durationStr = `${durationSecs}s`
			// durationMs removed - Stagetimer uses shorthand strings
			const isLinked = i > 0

			const hours = Math.floor(durationSecs / 3600)
			const minutes = Math.floor((durationSecs % 3600) / 60)
			const seconds = durationSecs % 60
			const result = await this.stGet('create_timer', {
				name: row.StorySlug.trim(),
				hours,
				minutes,
				seconds,
				trigger: isLinked ? 'LINKED' : 'MANUAL',
				wrap_up_yellow: 10000,
				wrap_up_red: 5000,
			})
			if (result && result.data) {
				created++
			} else {
				this.log('warn', `Failed to create timer for row: ${row.StorySlug}`)
			}
		}

		this.log('info', `Stagetimer loaded: ${created}/${validRows.length} timers created for ${dayLabel}`)
		this.setVariableValues({ stagetimer_status: `${dayLabel} loaded (${created} stories)` })
		// If show is already started, auto-start timer 1 in Stagetimer now that timers are ready
		if (this.startStagetimeronLoad) {
			this.startStagetimeronLoad = false
		this.stRunning = false
		this.stBlackout = false
		this.stOnAir = false
			await this.stGet('start_timer', { index: 0, autostart: 1 })
			this.log('info', 'Stagetimer timer 1 started')
		}
	}

	// ── Data Loading ──────────────────────────────────────────

	async refreshAll() {
		await this.loadRundowns()
		if (this.config.defaultRundownId) await this.loadRows(this.config.defaultRundownId)
		await this.pollStagetimer()
	}

	async pollStagetimer() {
		const status = await this.stGet('get_status')
		if (!status || !status.data) return
		const wasRunning = this.stRunning
		this.stRunning = !!status.data.running
		if (wasRunning !== this.stRunning) this.checkFeedbacks('st_running')

		// Also get room state for blackout/onair
		const room = await this.stGet('get_room')
		if (!room || !room.data) return
		const wasBlackout = this.stBlackout
		const wasOnAir = this.stOnAir
		this.stBlackout = !!room.data.blackout
		this.stOnAir = !!room.data.on_air
		if (wasBlackout !== this.stBlackout) this.checkFeedbacks('st_blackout_active')
		if (wasOnAir !== this.stOnAir) this.checkFeedbacks('st_onair_active')
	}

	async loadRundowns() {
		const data = await this.apiGet('getRundowns')
		if (!Array.isArray(data)) return
		this.rundowns = data
		this.setVariableValues({ rundown_count: data.length })
		const id = this.config.defaultRundownId
		if (id) {
			const active = data.find((r) => String(r.RundownID) === String(id))
			if (active) {
				this.setVariableValues({ active_rundown_title: active.Title || '', active_rundown_id: String(active.RundownID) })
				if (active.OnAirTimer_Active === 1) {
					const onAirRowId = String(active.OnAirTimer_RowID)
					if (onAirRowId !== this.currentOnAirRowId) {
						this.currentOnAirRowId = onAirRowId
						const onAirRow = this.rows.find((r) => String(r.RowID) === onAirRowId)
						this.setVariableValues({
							on_air_row_slug: onAirRow ? onAirRow.StorySlug || '' : '',
							on_air_row_id: onAirRowId,
						})
						this.updateStoryPosition()
					}
				} else {
					this.currentOnAirRowId = null
		this.startStagetimeronLoad = false
		this.stRunning = false
		this.stBlackout = false
		this.stOnAir = false
					this.setVariableValues({ on_air_row_slug: '', on_air_row_id: '' })
				}
			}
		}
		this.checkFeedbacks('rundown_on_air', 'rundown_frozen', 'rundown_locked', 'active_day')
	}

	async loadRows(rundownId) {
		if (!rundownId) return
		const data = await this.apiGet('getRows', { RundownID: rundownId })
		if (!Array.isArray(data)) return
		this.rows = data
		this.setVariableValues({ row_count: data.length })
		this.updateStoryPosition()
		this.checkFeedbacks('row_approved', 'row_floated', 'row_on_air')
	}

	updateStoryPosition() {
		if (!this.currentOnAirRowId || this.rows.length === 0) { this.setVariableValues({ story_position: '' }); return }
		const idx = this.rows.findIndex((r) => String(r.RowID) === String(this.currentOnAirRowId))
		if (idx >= 0) this.setVariableValues({ story_position: `${idx + 1}/${this.rows.length}` })
	}

	// ── Variables ─────────────────────────────────────────────

	initVariables() {
		this.setVariableDefinitions([
			{ variableId: 'rundown_count',        name: 'Total Rundown Count' },
			{ variableId: 'active_rundown_title', name: 'Active Rundown Title' },
			{ variableId: 'active_rundown_id',    name: 'Active Rundown ID' },
			{ variableId: 'on_air_row_slug',      name: 'On-Air Row Story Slug' },
			{ variableId: 'on_air_row_id',        name: 'On-Air Row ID' },
			{ variableId: 'row_count',            name: 'Row Count in Active Rundown' },
			{ variableId: 'story_position',       name: 'Story Position (e.g. 3/17)' },
			{ variableId: 'trt_display',          name: 'TRT Over/Under Display' },
			{ variableId: 'trt_elapsed',          name: 'TRT Elapsed Time' },
			{ variableId: 'trt_seconds',          name: 'TRT Difference in Seconds' },
			{ variableId: 'trt_over',             name: 'TRT Is Over (boolean)' },
			{ variableId: 'stagetimer_status',    name: 'Stagetimer Load Status' },
		])
		this.setVariableValues({
			rundown_count: 0, active_rundown_title: '', active_rundown_id: '',
			on_air_row_slug: '', on_air_row_id: '', row_count: 0,
			story_position: '', trt_display: 'TRT --:--', trt_elapsed: '--:--',
			trt_seconds: 0, trt_over: false, stagetimer_status: 'Not loaded',
		})
	}

	// ── Actions ───────────────────────────────────────────────

	initActions() {
		this.setActionDefinitions({

			select_and_load_day: {
				name: 'Select Day + Load into Stagetimer',
				description: 'Sets the active rundown AND loads all stories into Stagetimer as linked timers',
				options: [
					{ type: 'textinput', id: 'rundownId', label: 'Rundown ID', default: '', useVariables: true },
					{ type: 'textinput', id: 'dayLabel', label: 'Day Label (e.g. MON)', default: '', useVariables: true },
				],
				callback: async (action, context) => {
					const rundownId = await context.parseVariablesInString(action.options.rundownId)
					const dayLabel = await context.parseVariablesInString(action.options.dayLabel)
					if (!rundownId) { this.log('warn', 'select_and_load_day: Rundown ID required'); return }

					// Set active rundown
					this.config.defaultRundownId = rundownId
					this.currentOnAirRowId = null
		this.startStagetimeronLoad = false
		this.stRunning = false
		this.stBlackout = false
		this.stOnAir = false
					this.showStartTime = null
					this.updateTRTVariable()
					await this.loadRows(rundownId)
					const r = this.rundowns.find((r) => String(r.RundownID) === String(rundownId))
					if (r) this.setVariableValues({ active_rundown_title: r.Title || '', active_rundown_id: String(r.RundownID) })
					this.checkFeedbacks('active_day')

					// Load into Stagetimer in background so action doesn't time out
					this.loadRundownIntoStagetimer(rundownId, dayLabel).catch(e => this.log('error', `Stagetimer load error: ${e.message}`))
				},
			},

			load_to_stagetimer: {
				name: 'Load Rundown into Stagetimer (manual)',
				options: [
					{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '', useVariables: true },
					{ type: 'textinput', id: 'dayLabel', label: 'Day Label', default: '', useVariables: true },
				],
				callback: async (action, context) => {
					const rundownId = (await context.parseVariablesInString(action.options.rundownId)) || this.config.defaultRundownId
					const dayLabel = await context.parseVariablesInString(action.options.dayLabel)
					await this.loadRundownIntoStagetimer(rundownId, dayLabel)
				},
			},

			start_show: {
				name: 'Start Show (Begin TRT + First Row On-Air)',
				options: [
					{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '', useVariables: true },
					{ type: 'textinput', id: 'rowId', label: 'First Row ID', default: '', useVariables: true },
				],
				callback: async (action, context) => {
					const rundownId = (await context.parseVariablesInString(action.options.rundownId)) || this.config.defaultRundownId
					const rowId = await context.parseVariablesInString(action.options.rowId)
					if (!rundownId || !rowId) { this.log('warn', 'start_show: Rundown ID and Row ID required'); return }
					this.showStartTime = Date.now()
					this.updateTRTVariable()
					const result = await this.apiPost('startTimingRow', { RundownID: rundownId, RowID: rowId })
					if (result) {
						this.currentOnAirRowId = String(rowId)
						const row = this.rows.find((r) => String(r.RowID) === String(rowId))
						this.setVariableValues({ on_air_row_slug: row ? row.StorySlug || '' : '', on_air_row_id: String(rowId) })
						this.updateStoryPosition()
						this.checkFeedbacks('row_on_air', 'rundown_on_air')
						this.log('info', `Show started — Row ${rowId} on air`)
						// Flag to start Stagetimer once the background load finishes
						this.startStagetimeronLoad = true
						// If timers are already loaded (no active load), start immediately
						setTimeout(async () => {
							if (this.startStagetimeronLoad) {
								this.startStagetimeronLoad = false
		this.stRunning = false
		this.stBlackout = false
		this.stOnAir = false
								await this.stGet('start_timer', { index: 0, autostart: 1 })
								this.log('info', 'Stagetimer timer 1 started')
							}
						}, 15000) // 15 sec fallback in case load already finished
					}
				},
			},

			next_story: {
				name: 'Next Story',
				options: [
					{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '', useVariables: true },
				],
				callback: async (action, context) => {
					const rundownId = (await context.parseVariablesInString(action.options.rundownId)) || this.config.defaultRundownId
					if (!this.currentOnAirRowId) { this.log('warn', 'next_story: No row currently on air'); return }
					const data = await this.apiGet('getRows', { RowID: this.currentOnAirRowId, GetBeforeandAfter: 1 })
					if (!data) return
					const currentRow = Array.isArray(data) ? data[0] : data
					if (!currentRow || !currentRow.After || currentRow.After === 0) { this.log('info', 'next_story: Already at last row'); return }
					const nextRowId = String(currentRow.After)
					const result = await this.apiPost('startTimingRow', { RundownID: rundownId, RowID: nextRowId })
					if (result) {
						this.currentOnAirRowId = nextRowId
						const nextRow = this.rows.find((r) => String(r.RowID) === nextRowId)
						this.setVariableValues({ on_air_row_slug: nextRow ? nextRow.StorySlug || '' : '', on_air_row_id: nextRowId })
						this.updateStoryPosition()
						this.checkFeedbacks('row_on_air', 'rundown_on_air')
					}
				},
			},

			reset_trt: {
				name: 'Reset TRT Clock',
				options: [],
				callback: async () => { this.showStartTime = null; this.updateTRTVariable(); this.log('info', 'TRT clock reset') },
			},

			set_active_rundown: {
				name: 'Set Active Rundown (no Stagetimer load)',
				options: [{ type: 'textinput', id: 'rundownId', label: 'Rundown ID', default: '', useVariables: true }],
				callback: async (action, context) => {
					const id = await context.parseVariablesInString(action.options.rundownId)
					this.config.defaultRundownId = id
					this.currentOnAirRowId = null
		this.startStagetimeronLoad = false
		this.stRunning = false
		this.stBlackout = false
		this.stOnAir = false
					this.showStartTime = null
					this.updateTRTVariable()
					await this.loadRows(id)
					const r = this.rundowns.find((r) => String(r.RundownID) === String(id))
					if (r) this.setVariableValues({ active_rundown_title: r.Title || '', active_rundown_id: String(r.RundownID) })
					this.checkFeedbacks('active_day')
				},
			},

			start_timing_row: {
				name: 'Start Timing Row (On-Air)',
				options: [
					{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '', useVariables: true },
					{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '', useVariables: true },
				],
				callback: async (action, context) => {
					const rundownId = (await context.parseVariablesInString(action.options.rundownId)) || this.config.defaultRundownId
					const rowId = await context.parseVariablesInString(action.options.rowId)
					if (!rundownId || !rowId) { this.log('warn', 'start_timing_row: Rundown ID and Row ID required'); return }
					const result = await this.apiPost('startTimingRow', { RundownID: rundownId, RowID: rowId })
					if (result) {
						this.currentOnAirRowId = String(rowId)
						const row = this.rows.find((r) => String(r.RowID) === String(rowId))
						this.setVariableValues({ on_air_row_slug: row ? row.StorySlug || '' : '', on_air_row_id: String(rowId) })
						this.updateStoryPosition()
						this.checkFeedbacks('row_on_air', 'rundown_on_air')
					}
				},
			},

			approve_row: {
				name: 'Approve Row Script',
				options: [{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '', useVariables: true }],
				callback: async (action, context) => {
					await this.apiPost('setRowProperties', { RowID: await context.parseVariablesInString(action.options.rowId), Approved: 1 })
					await this.loadRows(this.config.defaultRundownId)
				},
			},

			unapprove_row: {
				name: 'Unapprove Row Script',
				options: [{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '', useVariables: true }],
				callback: async (action, context) => {
					await this.apiPost('setRowProperties', { RowID: await context.parseVariablesInString(action.options.rowId), Approved: 0 })
					await this.loadRows(this.config.defaultRundownId)
				},
			},

			float_row: {
				name: 'Float / Unfloat Row',
				options: [
					{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '', useVariables: true },
					{ type: 'dropdown', id: 'floated', label: 'Action', choices: [{ id: '1', label: 'Float' }, { id: '0', label: 'Unfloat' }], default: '1' },
				],
				callback: async (action, context) => {
					await this.apiPost('setRowProperties', { RowID: await context.parseVariablesInString(action.options.rowId), Floated: action.options.floated })
					await this.loadRows(this.config.defaultRundownId)
				},
			},

			send_chat_message: {
				name: 'Send Chat Message',
				options: [{ type: 'textinput', id: 'message', label: 'Message', default: '', useVariables: true }],
				callback: async (action, context) => {
					await this.apiPost('sendChatMessage', { Message: await context.parseVariablesInString(action.options.message) })
				},
			},

			refresh_data: {
				name: 'Refresh All Data Now',
				options: [],
				callback: async () => { await this.refreshAll(); this.log('info', 'Data refreshed') },
			},

			// ── Stagetimer Transport ──────────────────────────────

			st_playstop: {
				name: 'Stagetimer: Play / Stop',
				options: [],
				callback: async () => { await this.stGet('start_or_stop') },
			},

			st_next: {
				name: 'Stagetimer: Next Timer',
				options: [
					{ type: 'checkbox', id: 'autostart', label: 'Auto-start next timer', default: true },
				],
				callback: async (action) => {
					await this.stGet('next', { autostart: action.options.autostart ? 1 : 0 })
				},
			},

			st_previous: {
				name: 'Stagetimer: Previous Timer',
				options: [
					{ type: 'checkbox', id: 'autostart', label: 'Auto-start previous timer', default: false },
				],
				callback: async (action) => {
					await this.stGet('previous', { autostart: action.options.autostart ? 1 : 0 })
				},
			},

			st_reset: {
				name: 'Stagetimer: Reset Timer',
				options: [
					{ type: 'checkbox', id: 'autostart', label: 'Auto-start after reset', default: false },
				],
				callback: async (action) => {
					await this.stGet('reset', { autostart: action.options.autostart ? 1 : 0 })
				},
			},

			st_add_time: {
				name: 'Stagetimer: Add Time',
				options: [
					{
						type: 'dropdown', id: 'amount', label: 'Amount',
						choices: [
							{ id: '1s', label: '+1 second' },
							{ id: '5s', label: '+5 seconds' },
							{ id: '10s', label: '+10 seconds' },
							{ id: '30s', label: '+30 seconds' },
							{ id: '1m', label: '+1 minute' },
							{ id: '2m', label: '+2 minutes' },
							{ id: '5m', label: '+5 minutes' },
						],
						default: '30s',
					},
				],
				callback: async (action) => {
					await this.stGet('add_time', { amount: action.options.amount })
				},
			},

			st_sub_time: {
				name: 'Stagetimer: Subtract Time',
				options: [
					{
						type: 'dropdown', id: 'amount', label: 'Amount',
						choices: [
							{ id: '1s', label: '-1 second' },
							{ id: '5s', label: '-5 seconds' },
							{ id: '10s', label: '-10 seconds' },
							{ id: '30s', label: '-30 seconds' },
							{ id: '1m', label: '-1 minute' },
							{ id: '2m', label: '-2 minutes' },
							{ id: '5m', label: '-5 minutes' },
						],
						default: '30s',
					},
				],
				callback: async (action) => {
					await this.stGet('subtract_time', { amount: action.options.amount })
				},
			},

			st_flash: {
				name: 'Stagetimer: Flash Screen',
				options: [],
				callback: async () => { await this.stGet('start_flashing') },
			},

			st_blackout: {
				name: 'Stagetimer: Toggle Blackout',
				options: [],
				callback: async () => { await this.stGet('toggle_blackout') },
			},

			st_onair: {
				name: 'Stagetimer: Toggle On Air',
				options: [],
				callback: async () => { await this.stGet('toggle_on_air') },
			},
		})
	}

	// ── Feedbacks ─────────────────────────────────────────────

	initFeedbacks() {
		this.setFeedbackDefinitions({

			active_day: {
				type: 'boolean', name: 'Day: Currently Selected',
				description: 'Active when this day\'s rundown is the currently selected one',
				defaultStyle: { bgcolor: combineRgb(0, 80, 180), color: combineRgb(255, 255, 255) },
				options: [{ type: 'textinput', id: 'rundownId', label: 'Rundown ID', default: '' }],
				callback: (fb) => String(this.config.defaultRundownId) === String(fb.options.rundownId),
			},

			rundown_on_air: {
				type: 'boolean', name: 'Rundown: On-Air Timer Active',
				defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
				options: [{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '' }],
				callback: (fb) => {
					const id = fb.options.rundownId || this.config.defaultRundownId
					const r = this.rundowns.find((r) => String(r.RundownID) === String(id))
					return !!r && r.OnAirTimer_Active === 1
				},
			},

			row_on_air: {
				type: 'boolean', name: 'Row: Currently On-Air',
				defaultStyle: { bgcolor: combineRgb(220, 0, 0), color: combineRgb(255, 255, 255) },
				options: [
					{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '' },
					{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '' },
				],
				callback: (fb) => {
					const rundownId = fb.options.rundownId || this.config.defaultRundownId
					const r = this.rundowns.find((r) => String(r.RundownID) === String(rundownId))
					if (!r || r.OnAirTimer_Active !== 1) return false
					return String(r.OnAirTimer_RowID) === String(fb.options.rowId)
				},
			},

			trt_over: {
				type: 'boolean', name: 'TRT: Over Time',
				defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => !!this.showStartTime && (Date.now() - this.showStartTime) / 1000 > this.targetTRT,
			},

			trt_under: {
				type: 'boolean', name: 'TRT: Under Time',
				defaultStyle: { bgcolor: combineRgb(0, 170, 0), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => !!this.showStartTime && (Date.now() - this.showStartTime) / 1000 <= this.targetTRT,
			},

			row_approved: {
				type: 'boolean', name: 'Row: Script Approved',
				defaultStyle: { bgcolor: combineRgb(0, 170, 0), color: combineRgb(255, 255, 255) },
				options: [{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '' }],
				callback: (fb) => {
					const row = this.rows.find((r) => String(r.RowID) === String(fb.options.rowId))
					return !!row && row.Approved === 1
				},
			},

			row_floated: {
				type: 'boolean', name: 'Row: Floated',
				defaultStyle: { bgcolor: combineRgb(200, 140, 0), color: combineRgb(0, 0, 0) },
				options: [{ type: 'textinput', id: 'rowId', label: 'Row ID', default: '' }],
				callback: (fb) => {
					const row = this.rows.find((r) => String(r.RowID) === String(fb.options.rowId))
					return !!row && row.Floated === 1
				},
			},

			rundown_frozen: {
				type: 'boolean', name: 'Rundown: Frozen',
				defaultStyle: { bgcolor: combineRgb(0, 100, 210), color: combineRgb(255, 255, 255) },
				options: [{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '' }],
				callback: (fb) => {
					const id = fb.options.rundownId || this.config.defaultRundownId
					const r = this.rundowns.find((r) => String(r.RundownID) === String(id))
					return !!r && r.Frozen === 1
				},
			},

			rundown_locked: {
				type: 'boolean', name: 'Rundown: Locked',
				defaultStyle: { bgcolor: combineRgb(140, 0, 160), color: combineRgb(255, 255, 255) },
				options: [{ type: 'textinput', id: 'rundownId', label: 'Rundown ID (blank = default)', default: '' }],
				callback: (fb) => {
					const id = fb.options.rundownId || this.config.defaultRundownId
					const r = this.rundowns.find((r) => String(r.RundownID) === String(id))
					return !!r && r.Locked === 1
				},
			},

			// ── Stagetimer feedbacks ──────────────────────────────

			st_running: {
				type: 'boolean', name: 'Stagetimer: Timer Running',
				description: 'Active when the current Stagetimer timer is running',
				defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => !!this.stRunning,
			},

			st_blackout_active: {
				type: 'boolean', name: 'Stagetimer: Blackout Active',
				description: 'Active when Stagetimer blackout mode is on',
				defaultStyle: { bgcolor: combineRgb(0, 0, 0), color: combineRgb(255, 0, 0) },
				options: [],
				callback: () => !!this.stBlackout,
			},

			st_onair_active: {
				type: 'boolean', name: 'Stagetimer: On Air Active',
				description: 'Active when Stagetimer On Air mode is on',
				defaultStyle: { bgcolor: combineRgb(220, 0, 0), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => !!this.stOnAir,
			},
		})
	}

	// ── Presets ───────────────────────────────────────────────

	initPresets() {
		const days = [
			{ label: 'MON', id: '540', firstRowId: '7270' },
			{ label: 'TUE', id: '541', firstRowId: '7287' },
			{ label: 'WED', id: '552', firstRowId: '7586' },
			{ label: 'THU', id: '557', firstRowId: '7880' },
			{ label: 'FRI', id: '553', firstRowId: '7603' },
		]

		const presets = {}

		// Day selector + Stagetimer load buttons
		for (const day of days) {
			presets[`day_${day.label}`] = {
				category: 'VSPN Page 43 — Day Select',
				name: `${day.label} — Select + Load Stagetimer`,
				type: 'button',
				style: { text: day.label, size: '24', color: combineRgb(180, 180, 180), bgcolor: combineRgb(30, 30, 30) },
				steps: [{
					down: [{
						actionId: 'select_and_load_day',
						options: { rundownId: day.id, dayLabel: day.label },
					}],
					up: [],
				}],
				feedbacks: [
					{
						feedbackId: 'active_day',
						options: { rundownId: day.id },
						style: { bgcolor: combineRgb(0, 80, 180), color: combineRgb(255, 255, 255) },
					},
					{
						feedbackId: 'rundown_on_air',
						options: { rundownId: day.id },
						style: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
					},
				],
			}
		}

		// Start Show
		presets['start_show'] = {
			category: 'VSPN Page 43 — Show Control',
			name: 'Start Show',
			type: 'button',
			style: { text: 'START\nSHOW', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(180, 0, 0) },
			steps: [{ down: [{ actionId: 'start_show', options: { rundownId: '', rowId: '' } }], up: [] }],
			feedbacks: [{ feedbackId: 'rundown_on_air', options: { rundownId: '' }, style: { bgcolor: combineRgb(255, 0, 0) } }],
		}

		// On Air display
		presets['on_air_display'] = {
			category: 'VSPN Page 43 — Show Control',
			name: 'On Air Display',
			type: 'button',
			style: {
				text: '● ON AIR\n$(rundowncreator:on_air_row_slug)\n$(rundowncreator:story_position)',
				size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 0, 0),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [{ feedbackId: 'rundown_on_air', options: { rundownId: '' }, style: { bgcolor: combineRgb(200, 0, 0) } }],
		}

		// Next Story
		presets['next_story'] = {
			category: 'VSPN Page 43 — Show Control',
			name: 'Next Story',
			type: 'button',
			style: { text: 'NEXT\nSTORY ▶', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 100, 0) },
			steps: [{ down: [{ actionId: 'next_story', options: { rundownId: '' } }], up: [] }],
			feedbacks: [],
		}

		// TRT display
		presets['trt_display'] = {
			category: 'VSPN Page 43 — Show Control',
			name: 'TRT Over/Under',
			type: 'button',
			style: {
				text: '$(rundowncreator:trt_elapsed)\n$(rundowncreator:trt_display)',
				size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(30, 30, 30),
			},
			steps: [{ down: [{ actionId: 'reset_trt', options: {} }], up: [] }],
			feedbacks: [
				{ feedbackId: 'trt_under', options: {}, style: { bgcolor: combineRgb(0, 120, 0) } },
				{ feedbackId: 'trt_over', options: {}, style: { bgcolor: combineRgb(180, 0, 0) } },
			],
		}

		// Stagetimer status display
		presets['stagetimer_status'] = {
			category: 'VSPN Page 43 — Show Control',
			name: 'Stagetimer Status',
			type: 'button',
			style: {
				text: 'STAGE\nTIMER\n$(rundowncreator:stagetimer_status)',
				size: '11', color: combineRgb(255, 255, 255), bgcolor: combineRgb(40, 40, 80),
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}

		// Refresh
		presets['refresh'] = {
			category: 'VSPN Page 43 — Utility',
			name: 'Refresh Data',
			type: 'button',
			style: {
				text: 'REFRESH\n$(rundowncreator:active_rundown_title)',
				size: '11', color: combineRgb(180, 180, 180), bgcolor: combineRgb(30, 30, 30),
			},
			steps: [{ down: [{ actionId: 'refresh_data', options: {} }], up: [] }],
			feedbacks: [],
		}

		// ── Page 44 — Stagetimer Operator Controls ──────────────

		// Transport
		presets['st_previous'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'Previous Timer',
			type: 'button',
			style: { text: '⏮\nPREV', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(50,50,50) },
			steps: [{ down: [{ actionId: 'st_previous', options: {} }], up: [] }],
			feedbacks: [],
		}

		presets['st_playstop'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'Play / Stop',
			type: 'button',
			style: { text: '▶ / ⏹\nPLAY/STOP', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(0,140,0) },
			steps: [{ down: [{ actionId: 'st_playstop', options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'st_running', options: {}, style: { bgcolor: combineRgb(200,0,0), text: '⏹\nSTOP' } }],
		}

		presets['st_next'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'Next Timer',
			type: 'button',
			style: { text: '⏭\nNEXT', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(50,50,50) },
			steps: [{ down: [{ actionId: 'st_next', options: {} }], up: [] }],
			feedbacks: [],
		}

		presets['st_reset'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'Reset Timer',
			type: 'button',
			style: { text: '↺\nRESET', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(100,60,0) },
			steps: [{ down: [{ actionId: 'st_reset', options: {} }], up: [] }],
			feedbacks: [],
		}

		presets['st_flash'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'Flash Screen',
			type: 'button',
			style: { text: '⚡\nFLASH', size: '14', color: combineRgb(0,0,0), bgcolor: combineRgb(255,200,0) },
			steps: [{ down: [{ actionId: 'st_flash', options: {} }], up: [] }],
			feedbacks: [],
		}

		presets['st_blackout'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'Blackout Toggle',
			type: 'button',
			style: { text: 'BLACK\nOUT', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(30,30,30) },
			steps: [{ down: [{ actionId: 'st_blackout', options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'st_blackout_active', options: {}, style: { bgcolor: combineRgb(0,0,0), color: combineRgb(255,0,0) } }],
		}

		presets['st_onair'] = {
			category: 'VSPN Page 44 — Stagetimer',
			name: 'On Air Toggle',
			type: 'button',
			style: { text: 'ON\nAIR', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(80,0,0) },
			steps: [{ down: [{ actionId: 'st_onair', options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'st_onair_active', options: {}, style: { bgcolor: combineRgb(220,0,0) } }],
		}

		// Add time buttons
		for (const [label, amount] of [['1s', '1s'], ['5s', '5s'], ['10s', '10s'], ['30s', '30s'], ['1m', '1m']]) {
			presets[`st_add_${label}`] = {
				category: 'VSPN Page 44 — Stagetimer',
				name: `Add ${label}`,
				type: 'button',
				style: { text: `+${label}`, size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(0,100,40) },
				steps: [{ down: [{ actionId: 'st_add_time', options: { amount: amount } }], up: [] }],
				feedbacks: [],
			}
		}

		// Subtract time buttons
		for (const [label, amount] of [['1s', '1s'], ['5s', '5s'], ['10s', '10s'], ['30s', '30s'], ['1m', '1m']]) {
			presets[`st_sub_${label}`] = {
				category: 'VSPN Page 44 — Stagetimer',
				name: `Subtract ${label}`,
				type: 'button',
				style: { text: `-${label}`, size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(140,0,0) },
				steps: [{ down: [{ actionId: 'st_sub_time', options: { amount: amount } }], up: [] }],
				feedbacks: [],
			}
		}

		this.setPresetDefinitions(presets)
	}
}

runEntrypoint(RundownCreatorInstance, [])
