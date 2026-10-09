(function (window) {
    'use strict';

    class StudBudCommunityGames {
        constructor() {
            this.catalog = [
                { id: 'palette_ocean', name: 'Tidal Glow', color: 'ocean', price: 120, type: 'palette' },
                { id: 'palette_sunset', name: 'Heatwave', color: 'sunset', price: 120, type: 'palette' },
                { id: 'palette_violet', name: 'Nebula', color: 'violet', price: 120, type: 'palette' },
                { id: 'skin_robot', name: 'Robo Buddy', icon: 'fa-robot', price: 150, type: 'skin' },
                { id: 'skin_ninja', name: 'Shadow Ninja', icon: 'fa-user-ninja', price: 180, type: 'skin' },
                { id: 'skin_alien', name: 'Martian', icon: 'fa-user-astronaut', price: 180, type: 'skin' },
                { id: 'skin_ghost', name: 'Spooky Ghost', icon: 'fa-ghost', price: 220, type: 'skin' },
                { id: 'skin_lava', name: 'Magma Golem', icon: 'fa-fire', price: 300, type: 'skin' },
                { id: 'skin_gold', name: 'Golden Hero', icon: 'fa-medal', price: 400, type: 'skin' },
                { id: 'skin_bubble', name: 'Bubblegum', icon: 'fa-user', price: 130, type: 'skin' },
                { id: 'skin_snow', name: 'Frosty', icon: 'fa-snowflake', price: 140, type: 'skin' },
                { id: 'skin_zombie', name: 'Zombie', icon: 'fa-skull', price: 160, type: 'skin' },
                { id: 'skin_pumpkin', name: 'Pumpkin Head', icon: 'fa-user', price: 170, type: 'skin' },
                { id: 'skin_cyber', name: 'Cyber Agent', icon: 'fa-microchip', price: 260, type: 'skin' },
                { id: 'skin_shadow', name: 'Void Walker', icon: 'fa-moon', price: 280, type: 'skin' },
                { id: 'skin_crystal', name: 'Crystal Knight', icon: 'fa-gem', price: 320, type: 'skin' },
                { id: 'skin_galaxy', name: 'Galaxy Guardian', icon: 'fa-star', price: 450, type: 'skin' },
                { id: 'skin_dragon', name: 'Dragon Lord', icon: 'fa-dragon', price: 500, type: 'skin' },
                { id: 'hat_cap', name: 'Sporty Cap', icon: 'fa-hat-cowboy-side', price: 60, type: 'hat' },
                { id: 'hat_party', name: 'Party Hat', icon: 'fa-cake-candles', price: 70, type: 'hat' },
                { id: 'hat_beanie', name: 'Cozy Beanie', icon: 'fa-mitten', price: 70, type: 'hat' },
                { id: 'hat_flower', name: 'Flower Crown', icon: 'fa-seedling', price: 90, type: 'hat' },
                { id: 'hat_chef', name: 'Chef Hat', icon: 'fa-utensils', price: 100, type: 'hat' },
                { id: 'hat_cowboy', name: 'Cowboy Hat', icon: 'fa-hat-cowboy', price: 110, type: 'hat' },
                { id: 'hat_headphones', name: 'Headphones', icon: 'fa-headphones', price: 120, type: 'hat' },
                { id: 'hat_santa', name: 'Santa Hat', icon: 'fa-gift', price: 120, type: 'hat' },
                { id: 'hat_tophat', name: 'Top Hat', icon: 'fa-hat-wizard', price: 130, type: 'hat' },
                { id: 'hat_bunny', name: 'Bunny Ears', icon: 'fa-carrot', price: 140, type: 'hat' },
                { id: 'hat_cat', name: 'Cat Ears', icon: 'fa-cat', price: 140, type: 'hat' },
                { id: 'hat_wizard', name: 'Wizard Hat', icon: 'fa-hat-wizard', price: 160, type: 'hat' },
                { id: 'hat_pirate', name: 'Pirate Hat', icon: 'fa-skull-crossbones', price: 170, type: 'hat' },
                { id: 'hat_viking', name: 'Viking Helm', icon: 'fa-shield', price: 190, type: 'hat' },
                { id: 'hat_horns', name: 'Devil Horns', icon: 'fa-fire', price: 200, type: 'hat' },
                { id: 'hat_halo', name: 'Angel Halo', icon: 'fa-circle-notch', price: 250, type: 'hat' },
                { id: 'hat_crown', name: 'Royal Crown', icon: 'fa-crown', price: 400, type: 'hat' },
                { id: 'acc_bowtie', name: 'Bow Tie', icon: 'fa-ribbon', price: 70, type: 'accessory' },
                { id: 'acc_shades', name: 'Cool Shades', icon: 'fa-glasses', price: 80, type: 'accessory' },
                { id: 'acc_eyepatch', name: 'Eye Patch', icon: 'fa-eye-slash', price: 90, type: 'accessory' },
                { id: 'acc_scarf', name: 'Cozy Scarf', icon: 'fa-wind', price: 90, type: 'accessory' },
                { id: 'acc_backpack', name: 'Backpack', icon: 'fa-bag-shopping', price: 100, type: 'accessory' },
                { id: 'acc_monocle', name: 'Monocle', icon: 'fa-eye', price: 140, type: 'accessory' },
                { id: 'acc_cape', name: 'Hero Cape', icon: 'fa-mask', price: 180, type: 'accessory' },
                { id: 'acc_sparkles', name: 'Sparkle Aura', icon: 'fa-wand-magic-sparkles', price: 220, type: 'accessory' },
                { id: 'acc_wings', name: 'Jet Wings', icon: 'fa-dove',                 price: 350, type: 'accessory' },
                { id: 'palette_aurora', name: 'Aurora Drift', color: 'aurora', price: 160, type: 'palette' },
                { id: 'palette_coral', name: 'Coral Reef', color: 'coral', price: 160, type: 'palette' },
                { id: 'palette_midnight', name: 'Midnight', color: 'midnight', price: 180, type: 'palette' },
                { id: 'accessory_cap', legacy: true, name: 'Comet Cap', icon: 'fa-hat-cowboy-side', price: 75, type: 'hat' },
                { id: 'accessory_halo', legacy: true, name: 'Halo Headband', icon: 'fa-circle', price: 125, type: 'hat' },
                { id: 'accessory_headphones', legacy: true, name: 'Cloud Headphones', icon: 'fa-headphones',                                 price: 150, type: 'hat' },
                                ...[
                                    ['puppy', 'Puppy', '🐶', 'common'], ['kitten', 'Kitten', '🐱', 'common'], ['hamster', 'Hamster', '🐹', 'common'], ['bunny', 'Bunny', '🐰', 'common'],
                                    ['chick', 'Chick', '🐥', 'common'], ['frog', 'Frog', '🐸', 'common'], ['turtle', 'Turtle', '🐢', 'common'], ['goldfish', 'Goldfish', '🐟', 'common'],
                                    ['fox', 'Fox', '🦊', 'uncommon'], ['panda', 'Panda', '🐼', 'uncommon'], ['koala', 'Koala', '🐨', 'uncommon'], ['penguin', 'Penguin', '🐧', 'uncommon'],
                                    ['duck', 'Duck', '🦆', 'uncommon'], ['octopus', 'Octopus', '🐙', 'uncommon'], ['owl', 'Owl', '🦉', 'uncommon'], ['bee', 'Bumblebee', '🐝', 'uncommon'],
                                    ['unicorn', 'Unicorn', '🦄', 'rare'], ['tiger', 'Tiger', '🐯', 'rare'], ['shark', 'Shark', '🦈', 'rare'], ['butterfly', 'Butterfly', '🦋', 'rare'],
                                    ['wolf', 'Wolf', '🐺', 'rare'], ['dino', 'Dino', '🦖', 'rare'], ['robot', 'Bot Buddy', '🤖', 'rare'], ['ghosty', 'Ghosty', '👻', 'rare'],
                                    ['dragon', 'Dragon', '🐉', 'epic'], ['eagle', 'Eagle', '🦅', 'epic'], ['alien', 'Alien', '👽', 'epic'], ['squid', 'Giant Squid', '🦑', 'epic'],
                                    ['genie', 'Genie', '🧞', 'epic'], ['gem', 'Gem Sprite', '💎', 'epic'], ['comet', 'Comet', '☄️', 'epic'], ['phoenix', 'Phoenix', '🔥', 'epic'],
                                    ['star', 'Star Spirit', '🌟', 'legendary'], ['planet', 'Planet Pal', '🪐', 'legendary'], ['rainbow', 'Rainbow', '🌈', 'legendary'],
                                    ['elder', 'Elder Dragon', '🐲', 'legendary'], ['brain', 'Big Brain', '🧠', 'legendary'], ['trophy', 'Golden Trophy', '🏆', 'legendary']
                                ].map(([key, name, emoji, rarity]) => ({ id: `pet_${key}`, name, emoji, rarity, price: null, type: 'pet' }))
                            ].map(item => ({ ...item, rarity: item.rarity || StudBudCommunityGames.rarityForPrice(item.price) }));
                        }

                        static rarityForPrice(price) {
                            return price < 100 ? 'common' : price < 160 ? 'uncommon' : price < 260 ? 'rare' : price < 400 ? 'epic' : 'legendary';
                        }

                        static get boxes() {
                            return [
                                { id: 'basic', name: 'Study Box', price: 80, icon: 'fa-box', odds: 'Mostly common, small chance of rare' },
                                { id: 'rare', name: 'Honors Box', price: 200, icon: 'fa-box-open', odds: 'Uncommon and rare finds, epics possible' },
                                { id: 'legendary', name: 'Valedictorian Box', price: 500, icon: 'fa-gem', odds: 'Rare or better, 10% legendary' }
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
            if (cards.length < 2) throw new Error('A shared deck needs at least 2 complete cards.');
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

        async buyMysteryItem(box = 'basic') {
            const { data, error } = await this.getClient().rpc('studbud_buy_mystery_item', { p_box: box });
            if (error) throw new Error(`Could not open mystery capsule: ${error.message}`);
            return data;
        }

        async claimDailyReward() {
            const { data, error } = await this.getClient().rpc('studbud_claim_daily_reward');
            if (error) throw new Error(`Could not claim daily reward: ${error.message}`);
            return data;
        }

        async isAdmin() {
            const { data, error } = await this.getClient().rpc('studbud_is_admin');
            return !error && data === true;
        }

        async getUsernameStatus() {
            const { data, error } = await this.getClient().rpc('studbud_username_status');
            if (error) throw new Error(error.message);
            return data;
        }

        async changeUsername(username) {
            const { data, error } = await this.getClient().rpc('studbud_change_username', { p_username: username });
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Username changes are not set up yet. Re-run supabase-setup.sql in Supabase.' : error.message);
            return data;
        }

        async adminCall(fn, args = {}) {
            const { data, error } = await this.getClient().rpc(fn, args);
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Admin tools are not set up yet. Re-run supabase-setup.sql in Supabase.'
                : error.message);
            return data;
        }

        async awardSoloCoins(correct, total) {
            const { data, error } = await this.getClient().rpc('studbud_award_solo_coins', { p_correct: correct, p_total: total });
            if (error) throw new Error(`Could not award coins: ${error.message}`);
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
            const cards = (deck.cards || []).filter(card => String(card.front || '').trim() && String(card.back || '').trim())
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

        async getCards(roomCode) {
            const { data, error } = await this.getClient().rpc('studbud_get_game_cards', { p_code: roomCode });
            if (error) throw new Error(`Could not load questions: ${error.message}`);
            return (Array.isArray(data) ? data : []).filter(card => card?.front && card?.back);
        }

        async reportScore(roomCode, score, answered, correct = 0) {
            const { error } = await this.getClient().rpc('studbud_report_game_score', {
                p_code: roomCode,
                p_score: Math.max(0, Math.round(score)),
                p_answered: Math.max(0, Math.round(answered)),
                p_correct: Math.max(0, Math.round(correct))
            });
            return !error;
        }

        async unequipSlot(slot) {
            const { data, error } = await this.getClient().rpc('studbud_unequip_multiplayer_slot', { p_slot: slot });
            if (error) throw new Error(`Could not unequip item: ${error.message}`);
            return data;
        }

        openChannel(roomCode) {
            return this.getClient().channel(`studbud-room-${roomCode}`, {
                config: { broadcast: { self: false, ack: false } }
            });
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
