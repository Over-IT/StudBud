(function (window) {
    'use strict';

    class StudBudCommunityGames {
        constructor() {
            this.catalog = [
                { id: 'avatar_spark', name: 'Volt Runner', icon: 'fa-bolt', price: 50, type: 'avatar' },
                { id: 'avatar_fox', name: 'Copper Fox', icon: 'fa-paw', price: 90, type: 'avatar' },
                { id: 'avatar_rocket', name: 'Rocket Kid', icon: 'fa-rocket', price: 140, type: 'avatar' },
                { id: 'avatar_crown', name: 'Gold Crown', icon: 'fa-crown', price: 220, type: 'avatar' },
                { id: 'palette_ocean', name: 'Tidal Glow', color: 'ocean', price: 120, type: 'palette' },
                { id: 'palette_sunset', name: 'Heatwave', color: 'sunset', price: 120, type: 'palette' },
                { id: 'palette_violet', name: 'Nebula', color: 'violet', price: 120, type: 'palette' },
                { id: 'palette_aurora', name: 'Aurora Drift', color: 'aurora', price: 160, type: 'palette' },
                { id: 'palette_coral', name: 'Coral Reef', color: 'coral', price: 160, type: 'palette' },
                { id: 'palette_midnight', name: 'Midnight', color: 'midnight', price: 180, type: 'palette' },
                { id: 'accessory_cap', name: 'Comet Cap', icon: 'fa-hat-cowboy-side', price: 75, type: 'accessory' },
                { id: 'accessory_halo', name: 'Halo Headband', icon: 'fa-circle', price: 125, type: 'accessory' },
                { id: 'accessory_headphones', name: 'Cloud Headphones', icon: 'fa-headphones', price: 150, type: 'accessory' }
            ];
        }

        getClient() {
            const cloud = window.StudBudCloud;
            if (!cloud?.client || !cloud.user) throw new Error('Sign in to use community decks and hosted games.');
            return cloud.client;
        }

        getUserId() {
            this.getClient();
            return window.StudBudCloud.user.id;
        }

        async searchDecks(query = '') {
            const client = this.getClient();
            const term = String(query || '').trim().replace(/[%_]/g, '');
            let request = client.from('studbud_community_decks')
                .select('id,owner_id,title,description,card_count,study_count,updated_at')
                .order('study_count', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(30);
            if (term) request = request.ilike('title', `%${term}%`);
            const { data, error } = await request;
            if (error) throw new Error(`Could not search community decks: ${error.message}`);
            return data || [];
        }

        async publishDeck(deck) {
            const title = String(deck.title || '').trim();
            if (!title || title.length > 100) throw new Error('Deck titles must be between 1 and 100 characters to share.');
            const cards = (deck.cards || []).map(card => ({
                front: String(card.front || '').trim(),
                back: String(card.back || '').trim()
            })).filter(card => card.front && card.back);
            if (cards.length < 2 || cards.length > 250) throw new Error('A shared deck needs 2–250 complete cards.');
            if (cards.some(card => card.front.length > 5000 || card.back.length > 5000)) {
                throw new Error('Shared card terms and definitions must be 5000 characters or fewer.');
            }
            const { data, error } = await this.getClient().from('studbud_community_decks').upsert({
                owner_id: this.getUserId(),
                source_deck_id: String(deck.id),
                title,
                description: deck.communitySourceTitle
                    ? `Adapted from the shared set “${String(deck.communitySourceTitle).slice(0, 240)}”.`
                    : '',
                cards,
                updated_at: new Date().toISOString()
            }, { onConflict: 'owner_id,source_deck_id' }).select('id').single();
            if (error) throw new Error(`Could not share this deck: ${error.message}`);
            return data;
        }

        async unpublishDeck(deckId) {
            const { error } = await this.getClient().from('studbud_community_decks')
                .delete()
                .eq('owner_id', this.getUserId())
                .eq('source_deck_id', String(deckId));
            if (error) throw new Error(`Could not remove this deck from the community: ${error.message}`);
        }

        async importDeck(deckId) {
            const { data, error } = await this.getClient().from('studbud_community_decks')
                .select('id,owner_id,title,description,cards')
                .eq('id', deckId)
                .single();
            if (error) throw new Error(`Could not load this community deck: ${error.message}`);
            if (!Array.isArray(data.cards) || data.cards.length < 2) throw new Error('This community deck no longer contains enough cards to study.');
            return data;
        }

        async recordDeckStudy(deckId) {
            const { error } = await this.getClient().rpc('studbud_record_community_deck_study', {
                p_deck_id: deckId
            });
            if (error) throw new Error(`Could not update the community study count: ${error.message}`);
        }

        async recordStudyTime(entryId, seconds, studiedAt) {
            const normalizedEntryId = String(entryId || '').trim();
            const normalizedSeconds = Math.round(Number(seconds));
            if (!normalizedEntryId || normalizedEntryId.length > 140) {
                throw new Error('That study session could not be recorded.');
            }
            if (!Number.isInteger(normalizedSeconds) || normalizedSeconds < 1 || normalizedSeconds > 21600) {
                throw new Error('Study time must be between 1 second and 6 hours.');
            }
            const studiedDate = new Date(studiedAt || Date.now());
            if (!Number.isFinite(studiedDate.getTime())) throw new Error('That study session has an invalid date.');
            const { data, error } = await this.getClient().rpc('studbud_record_study_time', {
                p_entry_id: normalizedEntryId,
                p_seconds: normalizedSeconds,
                p_study_date: studiedDate.toISOString().slice(0, 10)
            });
            if (error) throw new Error(`Could not sync study time: ${error.message}`);
            return data;
        }

        async getStudyLeaderboard(period = 'daily') {
            const { data, error } = await this.getClient().rpc('studbud_get_study_leaderboard', {
                p_period: period
            });
            if (error) throw new Error(`Could not load the study leaderboard: ${error.message}`);
            return data;
        }

        async getPlayerProfile() {
            const { data, error } = await this.getClient().rpc('studbud_get_multiplayer_profile');
            if (error) throw new Error(`Could not load multiplayer profile: ${error.message}`);
            return data;
        }

        async purchaseItem(itemId) {
            const { data, error } = await this.getClient().rpc('studbud_buy_multiplayer_item', {
                p_item_id: itemId
            });
            if (error) throw new Error(`Could not purchase item: ${error.message}`);
            return data;
        }

        async equipItem(itemId) {
            const { data, error } = await this.getClient().rpc('studbud_equip_multiplayer_item', {
                p_item_id: itemId
            });
            if (error) throw new Error(`Could not equip item: ${error.message}`);
            return data;
        }

        async buyMysteryItem() {
            const { data, error } = await this.getClient().rpc('studbud_buy_mystery_item');
            if (error) throw new Error(`Could not open mystery capsule: ${error.message}`);
            return data;
        }

        async recordWaitingGameBest(score) {
            const { data, error } = await this.getClient().rpc('studbud_record_waiting_game_best', {
                p_score: score
            });
            if (error) throw new Error(`Could not save your warm-up record: ${error.message}`);
            return data;
        }

        async createRoom(roomCode, nickname, deck, mode, options = {}) {
            const cards = (deck.cards || []).filter(card => String(card.front || '').trim() && String(card.back || '').trim()).slice(0, 50)
                .map(card => ({ front: String(card.front).trim().slice(0, 1000), back: String(card.back).trim().slice(0, 1000) }));
            if (!cards.length) throw new Error('Choose a set with at least one complete card.');
            const { data, error } = await this.getClient().rpc('studbud_create_game_room', {
                p_code: roomCode,
                p_nickname: nickname,
                p_deck_title: String(deck.title || 'Flashcards').slice(0, 100),
                p_cards: cards,
                p_mode: mode,
                p_options: options
            });
            if (error) {
                const roomError = new Error(`Could not create the game: ${error.message}`);
                roomError.code = error.code;
                throw roomError;
            }
            return data;
        }

        async joinRoom(roomCode, nickname) {
            const { data, error } = await this.getClient().rpc('studbud_join_game_room', {
                p_code: roomCode,
                p_nickname: nickname
            });
            if (error) throw new Error(`Could not join the game: ${error.message}`);
            return data;
        }

        async getRoom(roomCode) {
            const { data, error } = await this.getClient().rpc('studbud_get_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not refresh the game: ${error.message}`);
            return data;
        }

        async startRoom(roomCode) {
            const { data, error } = await this.getClient().rpc('studbud_start_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not start the game: ${error.message}`);
            return data;
        }

        async submitAnswer(roomCode, questionNumber, choiceIndex, action = 'steady') {
            const { data, error } = await this.getClient().rpc('studbud_submit_game_answer', {
                p_code: roomCode,
                p_question_number: questionNumber,
                p_choice_index: choiceIndex,
                p_action: action
            });
            if (error) throw new Error(`Could not submit your answer: ${error.message}`);
            return data;
        }

        async nextQuestion(roomCode) {
            const { data, error } = await this.getClient().rpc('studbud_advance_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not move to the next question: ${error.message}`);
            return data;
        }

        async finishRoom(roomCode) {
            const { data, error } = await this.getClient().rpc('studbud_finish_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not end the game: ${error.message}`);
            return data;
        }

        async kickPlayer(roomCode, playerId) {
            const { data, error } = await this.getClient().rpc('studbud_kick_game_player', {
                p_code: roomCode,
                p_player_id: playerId
            });
            if (error) throw new Error(`Could not remove player: ${error.message}`);
            return data;
        }

        async leaveRoom(roomCode) {
            const { data, error } = await this.getClient().rpc('studbud_leave_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not leave the game: ${error.message}`);
            return data;
        }
    }

    window.StudBudCommunityGames = new StudBudCommunityGames();
})(window);
