const assert = require('node:assert/strict');

module.exports = async function runSchoolImportChecks(page) {
    const viewport = page.viewportSize();
    const diagnostic = `${viewport.width}x${viewport.height}`;
    const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const courseCode = `browser_import_${suffix}`;
    const courseTitle = `Browser Import Math ${suffix}`;
    const assignmentId = `browser_import_task_${suffix}`;
    const pasted = [
        'Student Name: Private Browser Example',
        'Student ID: 123456789',
        'Email: private-browser@example.invalid',
        `Class: ${courseTitle}`,
        'Assignment\tDue Date\tScore\tCategory\tStatus',
        'TEST: UNIT 3\t11/20/2026\t18/20\tTests\t'
    ].join('\n');
    let originalSchool, importBaseline, baselineOthers, seeded = false;

    const snapshot = () => page.evaluate(() => JSON.parse(JSON.stringify(window.NexusApp.AppState.state)));
    const schoolCollections = state => JSON.stringify({
        courses: state.courses || [], assignments: state.assignments || [], schedule: state.schedule || {}
    });
    const withoutSchoolCollections = state => {
        const { courses, assignments, schedule, savedAt, ...other } = state;
        return JSON.stringify(other);
    };
    const pasteThroughClipboardEvent = async () => page.locator('#campus-paste-data').evaluate((textarea, text) => {
        textarea.focus();
        textarea.setSelectionRange(0, textarea.value.length);
        const transfer = new DataTransfer();
        transfer.setData('text/plain', text);
        const event = new ClipboardEvent('paste', {
            bubbles: true, cancelable: true, clipboardData: transfer
        });
        textarea.dispatchEvent(event);
        return { prevented: event.defaultPrevented, value: textarea.value };
    }, pasted);
    const dismissNotice = async () => {
        const dismiss = page.locator('#app-notice button');
        if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    };

    try {
        const originalState = await snapshot();
        originalSchool = JSON.parse(schoolCollections(originalState));
        const course = {
            code: courseCode, title: courseTitle, school: 'other', term: 'FY', credits: 0.5,
            categories: []
        };
        const assignment = {
            id: assignmentId, courseCode, title: 'Unit 3 Test', dueDate: '', graded: true,
            pointsEarned: 8, maxPoints: 10, status: 'pending', notes: 'Preserve this private note',
            estimatedMinutes: 45, plannedDate: '2026-11-18', importance: 3, priority: 'high'
        };
        originalSchool.courses.push(course);
        originalSchool.assignments.push(assignment);
        await page.evaluate(state => window.NexusApp.AppState.saveStateChanges(state), originalSchool);
        seeded = true;
        await page.evaluate(() => { location.hash = '#gpa'; });
        await page.waitForFunction(() => window.NexusApp
            && document.querySelector('#gpa-view')?.classList.contains('active')
            && document.getElementById('open-campus-paste-modal-btn'));
        await page.waitForFunction(() => Number.isInteger(
            window.NexusApp.AppState.get('profile')?.academicYearStart));
        importBaseline = await snapshot();
        baselineOthers = withoutSchoolCollections(importBaseline);
        const importBaselineSchool = schoolCollections(importBaseline);
        assert.ok(importBaseline.courses.some(item => item.code === courseCode),
            `${diagnostic}: test class loaded; got ${JSON.stringify(importBaseline.courses?.map(item => item.code))}`);
        assert.ok(importBaseline.assignments.some(item => item.id === assignmentId),
            `${diagnostic}: test task loaded; got ${JSON.stringify(importBaseline.assignments?.map(item => item.id))}`);

        await page.locator('#open-campus-paste-modal-btn').click();
        const modal = page.locator('#campus-paste-modal');
        await modal.waitFor({ state: 'visible' });
        const pasteResult = await pasteThroughClipboardEvent();
        assert.equal(pasteResult.prevented, true, `${diagnostic}: the app consumes the clipboard paste event`);
        assert.doesNotMatch(pasteResult.value, /Private Browser Example|123456789|private-browser@example/i,
            `${diagnostic}: identifying clipboard fields are scrubbed immediately`);
        await page.locator('[data-action="preview-campus-data"]').click();
        await page.locator('#campus-paste-preview .campus-import-diff').first().waitFor();

        const preview = await page.locator('#campus-paste-preview').innerText();
        assert.match(preview, /Matched existing task: Unit 3 Test/,
            `${diagnostic}: preview identifies the existing task selected for update`);
        assert.match(preview, /8\s*\/\s*10 points[\s\S]*18\s*\/\s*20 points/,
            `${diagnostic}: preview shows old and new points`);
        assert.match(preview, /Not set[\s\S]*2026-11-20/,
            `${diagnostic}: preview shows the due-date change`);
        assert.match(preview, /pending[\s\S]*completed/,
            `${diagnostic}: preview shows the status change`);
        assert.match(preview, /Uncategorized[\s\S]*Tests/,
            `${diagnostic}: preview shows the category change`);
        assert.doesNotMatch(preview, /Private Browser Example|123456789|private-browser@example/i,
            `${diagnostic}: identifying fields do not appear in preview text`);
        assert.doesNotMatch(JSON.stringify(await page.evaluate(() => window.NexusApp.schoolImportDraft)),
            /Private Browser Example|123456789|private-browser@example/i,
            `${diagnostic}: identifying fields are not retained in the draft`);

        const selection = page.locator('#campus-paste-preview [data-school-import-index]');
        assert.ok(await selection.count() >= 2, `${diagnostic}: class/category and assignment rows are selectable`);
        const assignmentRow = page.locator('.campus-paste-list li').filter({ hasText: 'Matched existing task: Unit 3 Test' });
        const assignmentCheck = assignmentRow.locator('[data-school-import-index]');
        assert.equal(await assignmentCheck.isChecked(), true, `${diagnostic}: the matched task is selected by default`);
        await assignmentCheck.uncheck();
        await assignmentCheck.check();
        assert.equal(await assignmentCheck.isChecked(), true, `${diagnostic}: row selection remains interactive`);

        const geometry = await modal.evaluate(element => {
            const box = element.getBoundingClientRect();
            const controls = [...element.querySelectorAll('textarea, select, input, button')]
                .filter(control => !control.closest('.hidden') && !control.hidden)
                .map(control => {
                    const rect = control.getBoundingClientRect();
                    return { left: rect.left, right: rect.right, width: rect.width,
                        clientWidth: control.clientWidth, scrollWidth: control.scrollWidth };
                });
            return {
                left: box.left, right: box.right, top: box.top, bottom: box.bottom,
                width: box.width, height: box.height,
                scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
                controls
            };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0,
            `${diagnostic}: import modal has visible geometry`);
        assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1,
            `${diagnostic}: import modal stays within the viewport: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.top >= -1 && geometry.bottom <= geometry.viewportHeight + 1,
            `${diagnostic}: import modal fits vertically or scrolls within the viewport: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1,
            `${diagnostic}: import modal has no horizontal content overflow`);
        assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1,
            `${diagnostic}: importer does not cause page-level horizontal overflow`);
        for (const control of geometry.controls) {
            assert.ok(control.left >= geometry.left - 1 && control.right <= geometry.right + 1,
                `${diagnostic}: importer controls stay inside the modal: ${JSON.stringify(control)}`);
            assert.ok(control.scrollWidth <= control.clientWidth + 1 || control.clientWidth === 0,
                `${diagnostic}: importer control content does not overflow horizontally: ${JSON.stringify(control)}`);
        }

        await page.locator('#import-campus-data-btn').click();
        await page.waitForFunction(id => window.NexusApp.AppState.get('assignments')
            .some(item => item.id === id && item.pointsEarned === 18 && item.maxPoints === 20), assignmentId);
        let imported = (await snapshot()).assignments.find(item => item.id === assignmentId);
        assert.equal(imported.notes, 'Preserve this private note', `${diagnostic}: update preserves existing notes`);
        assert.equal(imported.plannedDate, '2026-11-18', `${diagnostic}: update preserves the existing work plan`);
        assert.equal(imported.dueDate, '2026-11-20');
        assert.equal(imported.status, 'completed');
        assert.equal(withoutSchoolCollections(await snapshot()), baselineOthers,
            `${diagnostic}: import does not modify non-school collections`);

        const secondPaste = await pasteThroughClipboardEvent();
        assert.doesNotMatch(secondPaste.value, /Private Browser Example|123456789|private-browser@example/i);
        await page.locator('[data-action="preview-campus-data"]').click();
        await page.waitForFunction(() => document.querySelector('#import-campus-data-btn')?.classList.contains('hidden'));
        assert.match(await page.locator('#campus-paste-status').textContent(), /No safe new changes detected/);
        const assignmentCount = (await snapshot()).assignments.filter(item => item.id === assignmentId).length;
        assert.equal(assignmentCount, 1, `${diagnostic}: reviewing the same paste does not duplicate the task`);

        await page.locator('#undo-campus-import-btn').click();
        await page.waitForFunction(() => window.NexusApp.schoolImportUndo === null);
        assert.equal(schoolCollections(await snapshot()), importBaselineSchool,
            `${diagnostic}: Undo restores the exact pre-import courses, assignments and schedule`);
        assert.equal(withoutSchoolCollections(await snapshot()), baselineOthers,
            `${diagnostic}: Undo leaves every non-school collection unchanged`);

        const changedPaste = await pasteThroughClipboardEvent();
        assert.doesNotMatch(changedPaste.value, /Private Browser Example|123456789|private-browser@example/i);
        await page.locator('[data-action="preview-campus-data"]').click();
        await page.locator('#import-campus-data-btn').click();
        await page.waitForFunction(() => window.NexusApp.schoolImportUndo !== null);
        await page.evaluate(id => {
            const appState = window.NexusApp.AppState;
            window.NexusApp.openAssignmentForm(appState.get('assignments').find(item => item.id === id));
        }, assignmentId);
        await page.locator('#assignment-planned-date').fill('2026-11-19');
        await page.locator('button[form="assignment-form"][type="submit"]').click();
        await page.waitForFunction(id => window.NexusApp.AppState.get('assignments')
            .some(item => item.id === id && item.plannedDate === '2026-11-19'), assignmentId);
        await page.locator('#open-campus-paste-modal-btn').click();
        await page.locator('#campus-paste-modal').waitFor({ state: 'visible' });
        const editedBeforeRefusal = schoolCollections(await snapshot());
        await page.locator('#undo-campus-import-btn').click();
        await page.waitForFunction(() => /Undo refused because school data changed/.test(
            document.getElementById('campus-paste-status')?.textContent || ''));
        assert.equal(schoolCollections(await snapshot()), editedBeforeRefusal,
            `${diagnostic}: Undo refusal does not overwrite edits made after import`);
        imported = (await snapshot()).assignments.find(item => item.id === assignmentId);
        assert.equal(imported.plannedDate, '2026-11-19');

        return { viewport, result: 'paste scrubbing, preview diffs, preservation, de-duplication, safe undo/refusal, responsive modal' };
    } finally {
        if (await page.locator('#campus-paste-modal').isVisible().catch(() => false)) {
            await page.locator('#campus-paste-modal .close-modal-btn').click().catch(() => {});
        }
        await dismissNotice();
        if (seeded) {
            await page.evaluate(school => window.NexusApp.AppState.saveStateChanges(school), originalSchool);
        }
    }
};
