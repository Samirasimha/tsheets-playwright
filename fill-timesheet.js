const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

const USER_DATA_DIR = path.join(__dirname, ".browser-data");
const ARGS = process.argv.slice(2);
const DEBUG = ARGS.includes("--debug");
const INSPECT = ARGS.includes("--inspect");

function isWeekday() {
	const day = new Date().getDay();
	return day >= 1 && day <= 5;
}

function todayFormatted() {
	return new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

async function dismissCookieBanner(page) {
	const iUnderstand = page.locator("button:has-text('I Understand'), button:has-text('Accept')").first();
	if (await iUnderstand.isVisible({ timeout: 2000 }).catch(() => false)) {
		await iUnderstand.click();
		console.log("[TSheets] Dismissed cookie banner.");
		await page.waitForTimeout(500);
	}
}

async function navigateToTimeEntries(page) {
	const timeEntriesLink = page.locator("#timesheets_v2_shortcut");
	if (await timeEntriesLink.isVisible({ timeout: 5000 }).catch(() => false)) {
		await timeEntriesLink.click();
		console.log("[TSheets] Clicked 'Time Entries' in sidebar.");
		await page.waitForTimeout(5000);
		return true;
	}
	console.log("[TSheets] Could not find 'Time Entries' link — may already be on the page.");
	return false;
}

async function dumpPageStructure(page) {
	console.log("\n[TSheets] === PAGE STRUCTURE DUMP ===");
	const title = await page.title();
	console.log(`  Title: ${title}`);
	console.log(`  URL: ${page.url()}`);

	// Visible text
	const bodyText = await page.locator("body").innerText();
	const lines = bodyText.split("\n").filter((l) => l.trim()).slice(0, 60);
	console.log(`\n  Visible text (first 60 non-empty lines):`);
	for (const line of lines) {
		console.log(`    | ${line.trim().substring(0, 120)}`);
	}

	// All visible inputs
	const inputs = await page.locator("input").all();
	console.log(`\n  Inputs (visible): ${inputs.length}`);
	for (let i = 0; i < inputs.length; i++) {
		const attrs = await inputs[i].evaluate((el) => ({
			type: el.type, id: el.id, name: el.name,
			placeholder: el.placeholder, class: el.className.substring(0, 80),
			value: el.value, "data-testid": el.getAttribute("data-testid"),
			visible: el.offsetParent !== null,
		}));
		if (attrs.visible) console.log(`    [${i}] ${JSON.stringify(attrs)}`);
	}

	// All visible buttons
	const buttons = await page.locator("button").all();
	console.log(`\n  Buttons (visible):`);
	for (let i = 0; i < buttons.length; i++) {
		const info = await buttons[i].evaluate((el) => ({
			text: el.textContent?.trim().substring(0, 60),
			id: el.id, class: el.className.substring(0, 60),
			"data-testid": el.getAttribute("data-testid"),
			"aria-label": el.getAttribute("aria-label"),
			visible: el.offsetParent !== null,
		}));
		if (info.visible && info.text) console.log(`    [${i}] ${JSON.stringify(info)}`);
	}

	// All visible links
	const links = await page.locator("a").all();
	console.log(`\n  Links (visible):`);
	for (let i = 0; i < links.length; i++) {
		const info = await links[i].evaluate((el) => ({
			text: el.textContent?.trim().substring(0, 60),
			href: el.getAttribute("href")?.substring(0, 80),
			id: el.id, visible: el.offsetParent !== null,
		}));
		if (info.visible && info.text) console.log(`    [${i}] ${JSON.stringify(info)}`);
	}

	// Tables
	const tables = await page.locator("table").all();
	console.log(`\n  Tables: ${tables.length}`);
	for (let i = 0; i < tables.length; i++) {
		const info = await tables[i].evaluate((el) => ({
			id: el.id, class: el.className.substring(0, 80),
			rows: el.rows?.length || 0, visible: el.offsetParent !== null,
		}));
		if (info.visible) console.log(`    [${i}] ${JSON.stringify(info)}`);
	}

	// ARIA role elements
	const roleElements = await page.locator("[role='grid'], [role='table'], [role='row'], [role='cell'], [role='textbox'], [role='dialog'], [role='gridcell']").all();
	console.log(`\n  ARIA role elements: ${roleElements.length}`);
	for (let i = 0; i < Math.min(roleElements.length, 40); i++) {
		const info = await roleElements[i].evaluate((el) => ({
			tag: el.tagName, role: el.getAttribute("role"),
			id: el.id, class: el.className?.substring?.(0, 60) || "",
			text: el.textContent?.trim().substring(0, 60),
			visible: el.offsetParent !== null,
		}));
		if (info.visible) console.log(`    [${i}] ${JSON.stringify(info)}`);
	}

	// Iframes
	const iframes = await page.locator("iframe").all();
	console.log(`\n  Iframes: ${iframes.length}`);
	for (let i = 0; i < iframes.length; i++) {
		const info = await iframes[i].evaluate((el) => ({
			src: el.src?.substring(0, 120), id: el.id, name: el.name,
		}));
		console.log(`    [${i}] ${JSON.stringify(info)}`);
	}

	// Inspect inside each iframe
	const frames = page.frames();
	console.log(`\n  Frames (including main): ${frames.length}`);
	for (let i = 1; i < frames.length; i++) {
		const frame = frames[i];
		const frameUrl = frame.url();
		if (!frameUrl || frameUrl === "about:blank") continue;
		console.log(`\n  --- Frame [${i}]: ${frameUrl.substring(0, 100)} ---`);
		try {
			const frameText = await frame.locator("body").innerText({ timeout: 3000 }).catch(() => "");
			const frameLines = frameText.split("\n").filter((l) => l.trim()).slice(0, 30);
			if (frameLines.length > 0) {
				console.log(`  Frame text:`);
				for (const line of frameLines) {
					console.log(`    | ${line.trim().substring(0, 120)}`);
				}
			}
			const frameInputs = await frame.locator("input").all();
			console.log(`  Frame inputs: ${frameInputs.length}`);
			for (let j = 0; j < frameInputs.length; j++) {
				const attrs = await frameInputs[j].evaluate((el) => ({
					type: el.type, id: el.id, name: el.name,
					placeholder: el.placeholder, class: el.className.substring(0, 80),
					value: el.value, visible: el.offsetParent !== null,
				}));
				if (attrs.visible) console.log(`    [${j}] ${JSON.stringify(attrs)}`);
			}
			const frameBtns = await frame.locator("button").all();
			console.log(`  Frame buttons: ${frameBtns.length}`);
			for (let j = 0; j < frameBtns.length; j++) {
				const info = await frameBtns[j].evaluate((el) => ({
					text: el.textContent?.trim().substring(0, 80),
					id: el.id, class: el.className.substring(0, 60),
					visible: el.offsetParent !== null,
				}));
				if (info.visible && info.text) console.log(`    [${j}] ${JSON.stringify(info)}`);
			}
		} catch (e) {
			console.log(`  (Frame not accessible: ${e.message.substring(0, 60)})`);
		}
	}

	console.log("\n[TSheets] === END DUMP ===\n");
}

async function main() {
	if (config.skipWeekends && !isWeekday()) {
		console.log(`[TSheets] Today is a weekend — skipping.`);
		process.exit(0);
	}

	console.log(`[TSheets] ${todayFormatted()}`);

	const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
		headless: false,
		channel: "msedge",
		args: ["--disable-blink-features=AutomationControlled"],
		viewport: { width: 1280, height: 900 },
	});

	const page = browser.pages()[0] || (await browser.newPage());

	try {
		// Navigate — use domcontentloaded (this SPA never reaches networkidle)
		console.log(`[TSheets] Navigating to ${config.url}`);
		await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 30000 });
		await page.waitForTimeout(3000);

		// Check if login is needed
		const currentUrl = page.url();
		if (currentUrl.includes("login") || currentUrl.includes("signin") || currentUrl.includes("accounts.intuit.com")) {
			console.log("[TSheets] Login redirect detected — waiting for session to resolve...");
			try {
				await page.waitForURL("**/tsheets.intuit.com/**", { timeout: 15000 });
				console.log("[TSheets] Session restored.");
				await page.waitForTimeout(3000);
			} catch {
				console.log("[TSheets] Login required. Please log in manually...");
				await page.waitForURL("**/tsheets.intuit.com/**", { timeout: 300000 });
				console.log("[TSheets] Logged in.");
				await page.waitForTimeout(5000);
			}
		}

		// Dismiss cookie banner first
		await dismissCookieBanner(page);

		// Click "Time Entries" sidebar link to trigger SPA navigation
		await navigateToTimeEntries(page);

		// Wait for the Time Entries view to render (SPA content loads async)
		console.log("[TSheets] Waiting for Time Entries to load...");
		await page.waitForTimeout(6000);

		if (INSPECT) {
			await dumpPageStructure(page);
			console.log("[TSheets] Browser staying open. Press Ctrl+C to exit.");
			await new Promise(() => {});
		}

		// === FILL TIME ENTRIES ===
		// Grid layout: #weekly_timecard_weekly_{row}_{col}
		// Columns: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
		const todayCol = new Date().getDay();
		const todayShort = new Date().toLocaleDateString("en-US", { weekday: "short" });
		const isFriday = todayCol === 5;

		console.log(`[TSheets] Today: column ${todayCol} (${todayShort})`);

		// Wait for the timecard grid
		await page.locator("#weekly_timecard_time_table").waitFor({ state: "visible", timeout: 10000 });

		// Pick the right entries for today
		const entries = isFriday && config.entries.friday
			? config.entries.friday
			: config.entries.default;

		console.log(`[TSheets] ${isFriday ? "Friday" : "Weekday"} schedule: ${entries.length} entry(ies)`);

		let anyFilled = false;

		for (let e = 0; e < entries.length; e++) {
			const entry = entries[e];
			const targetCustomerText = entry.customerPath[entry.customerPath.length - 1];
			const hoursValue = `${entry.hours}:00`;

			console.log(`\n[TSheets] --- Entry ${e + 1}/${entries.length}: ${targetCustomerText} (${entry.hours}h) ---`);

			// Scan all rows for the target customer
			const allRows = page.locator("#weekly_timecard_time_table tbody tr");
			const rowCount = await allRows.count();
			let jobRow = -1;

			for (let r = 0; r < rowCount; r++) {
				const rowText = await allRows.nth(r).innerText();
				if (rowText.includes(targetCustomerText)) {
					jobRow = r;
					console.log(`[TSheets] Customer found at row ${jobRow}`);
					break;
				}
			}

			if (jobRow >= 0) {
				// Check if today's cell already has hours
				const cellId = `weekly_timecard_weekly_${jobRow}_${todayCol}`;
				const cell = page.locator(`#${cellId}`);
				const currentValue = await cell.inputValue().catch(() => "");
				if (currentValue && currentValue !== "0:00" && currentValue !== "") {
					console.log(`[TSheets] Already filled with "${currentValue}" — skipping.`);
					continue;
				}
			} else {
				// No customer row — need to assign via (no customer)
				const noCustomerBtn = page.locator("text='(no customer)'").first();
				const hasNoCustomer = await noCustomerBtn.isVisible({ timeout: 3000 }).catch(() => false);

				if (!hasNoCustomer) {
					console.log("[TSheets] No '(no customer)' row available for assignment.");
					const updatedRows = page.locator("#weekly_timecard_time_table tbody tr");
					const cnt = await updatedRows.count();
					for (let r = 0; r < cnt; r++) {
						const txt = await updatedRows.nth(r).innerText().catch(() => "(unreadable)");
						console.log(`  Row ${r}: ${txt.replace(/\n/g, " | ").substring(0, 120)}`);
					}
					throw new Error(`Cannot assign "${targetCustomerText}". No empty row available.`);
				}

				console.log("[TSheets] Selecting customer for empty row...");
				await noCustomerBtn.click();
				console.log("[TSheets] Clicked '(no customer)' — customer dialog opening...");
				await page.waitForTimeout(2000);

				// Navigate the customer tree
				for (let i = 0; i < entry.customerPath.length; i++) {
					const customerName = entry.customerPath[i];
					const isLast = i === entry.customerPath.length - 1;

					await page.locator("[role='listbox'] [role='option']").first().waitFor({ state: "visible", timeout: 10000 });
					await page.waitForTimeout(500);

					const option = page.locator(`[role='option']:has-text("${customerName}")`).first();
					await option.waitFor({ state: "visible", timeout: 5000 });
					await option.click();
					console.log(`[TSheets] Selected: ${customerName}${isLast ? "" : " (expanding...)"}`);

					if (!isLast) {
						await page.waitForTimeout(2000);
					}
				}

				await page.waitForTimeout(2000);

				// Find the newly assigned row
				const updatedRows = page.locator("#weekly_timecard_time_table tbody tr");
				const updatedCount = await updatedRows.count();
				for (let r = 0; r < updatedCount; r++) {
					const rowText = await updatedRows.nth(r).innerText();
					if (rowText.includes(targetCustomerText)) {
						jobRow = r;
						break;
					}
				}
				if (jobRow === -1) {
					throw new Error(`Customer row not found after assignment. Expected: "${targetCustomerText}"`);
				}
				console.log(`[TSheets] Customer assigned to row ${jobRow}`);
			}

			// Fill today's cell
			const cellId = `weekly_timecard_weekly_${jobRow}_${todayCol}`;
			const cell = page.locator(`#${cellId}`);
			await cell.waitFor({ state: "visible", timeout: 5000 });
			await cell.click();
			await cell.fill(hoursValue);
			console.log(`[TSheets] Filled "${hoursValue}" into #${cellId}`);

			// Set Service Item and Billable if configured (required fields for new rows)
			// The details panel opens when a cell is clicked — dropdowns are <select> with class weekly_timecard-tag-value
			if (config.serviceItem || config.billable) {
				await page.waitForTimeout(1000);
				const tagSelects = page.locator("select.weekly_timecard-tag-value");
				const tagCount = await tagSelects.count();

				if (tagCount >= 1 && config.serviceItem) {
					const siSelect = tagSelects.nth(0);
					const currentSi = await siSelect.inputValue().catch(() => "");
					if (!currentSi || currentSi === "") {
						await siSelect.selectOption({ label: config.serviceItem });
						console.log(`[TSheets] Service Item: ${config.serviceItem}`);
					}
				}
				if (tagCount >= 2 && config.billable) {
					const billSelect = tagSelects.nth(1);
					const currentBill = await billSelect.inputValue().catch(() => "");
					if (!currentBill || currentBill === "") {
						await billSelect.selectOption({ label: config.billable });
						console.log(`[TSheets] Billable: ${config.billable}`);
					}
				}
			}

			anyFilled = true;
		}

		if (!anyFilled) {
			console.log("\n[TSheets] All entries already filled — nothing to save.");
			if (DEBUG) {
				console.log("[TSheets] === DEBUG MODE — browser stays open ===");
				await new Promise(() => {});
			}
			console.log("[TSheets] Done!");
			await browser.close();
			return;
		}

		// Click Save
		const saveBtn = page.locator("#weekly_timecard_submit_button");
		await saveBtn.waitFor({ state: "visible", timeout: 5000 });

		if (DEBUG) {
			console.log("[TSheets] [DEBUG] Save button found — NOT clicking in debug mode. Review and save manually.");
		} else {
			await saveBtn.click();
			console.log("[TSheets] Clicked Save!");
			await page.waitForTimeout(3000);

			// Check for success (grand total should update)
			const grandTotal = await page.locator("#weekly_timecard_weekly_grand_total").inputValue();
			console.log(`[TSheets] Grand total is now: ${grandTotal}`);
		}

		if (DEBUG) {
			console.log("[TSheets] === DEBUG MODE — browser stays open ===");
			await new Promise(() => {});
		}

		console.log("[TSheets] Done!");
	} catch (err) {
		console.error(`[TSheets] Error: ${err.message}`);
		if (DEBUG || INSPECT) {
			console.log("[TSheets] Browser staying open for debugging...");
			await new Promise(() => {});
		}
		process.exit(1);
	} finally {
		if (!DEBUG && !INSPECT) {
			await browser.close();
		}
	}
}

main();
