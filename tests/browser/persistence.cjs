const assert = require('node:assert/strict');

module.exports = async function runPersistenceChecks(page) {
    const result = await page.evaluate(async () => {
        const state = window.NexusApp.AppState;
        await state.saveFlashcardDeck({ id: 'atomic-first', title: 'First', sortIndex: 0, cards: [] });
        await state.saveFlashcardDeck({ id: 'atomic-second', title: 'Second', sortIndex: 1, cards: [] });
        let failed = false;
        try {
            await state.patchFlashcardDecks(new Map([
                ['atomic-first', { sortIndex: 2 }],
                ['atomic-second', { sortIndex: 3, invalid: () => {} }]
            ]));
        } catch (error) {
            if (error.name !== 'DataCloneError') throw error;
            failed = true;
        }
        const saved = JSON.parse(await state.exportAppState()).flashcards;
        const persistedOrder = saved.filter(deck => deck.id.startsWith('atomic-')).map(deck => deck.sortIndex);
        const visibleOrder = state.get('flashcards').filter(deck => deck.id.startsWith('atomic-')).map(deck => deck.sortIndex);
        await state.patchFlashcardDecks(new Map([['atomic-first', { sortIndex: 2 }], ['atomic-second', { sortIndex: 3 }]]));
        const updated = JSON.parse(await state.exportAppState()).flashcards;
        const updatedOrder = updated.filter(deck => deck.id.startsWith('atomic-')).map(deck => deck.sortIndex);
        await state.deleteFlashcardDeck('atomic-first');
        await state.deleteFlashcardDeck('atomic-second');
        return { failed, persistedOrder, visibleOrder, updatedOrder };
    });
    assert.deepEqual(result, { failed: true, persistedOrder: [0, 1], visibleOrder: [0, 1], updatedOrder: [2, 3] },
        'native IndexedDB failure rolls back the entire reorder, and a later valid retry succeeds');
};
