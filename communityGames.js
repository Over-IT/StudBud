(function (window) {
    'use strict';

    class StudBudCommunityGames {
        constructor() {
            this.catalog = [
                { id: 'palette_ocean', name: 'Tidal Glow', color: 'ocean', hue: 205, hue2: 190, price: 120, type: 'palette' },
                { id: 'palette_sunset', name: 'Heatwave', color: 'sunset', hue: 20, hue2: 350, price: 120, type: 'palette' },
                { id: 'palette_violet', name: 'Nebula', color: 'violet', hue: 265, hue2: 280, price: 120, type: 'palette' },
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
                { id: 'skin_candy', name: 'Candy Cane', icon: 'fa-candy-cane', price: 140, type: 'skin' },
                { id: 'skin_pixel', name: 'Pixel Pal', icon: 'fa-gamepad', price: 190, type: 'skin' },
                { id: 'skin_mummy', name: 'Mummy', icon: 'fa-user', price: 170, type: 'skin' },
                { id: 'skin_vampire', name: 'Vampire', icon: 'fa-droplet', price: 270, type: 'skin' },
                { id: 'skin_samurai', name: 'Samurai', icon: 'fa-user-shield', price: 290, type: 'skin' },
                { id: 'skin_steampunk', name: 'Steampunk', icon: 'fa-gear', price: 310, type: 'skin' },
                { id: 'skin_neon', name: 'Neon Runner', icon: 'fa-bolt', price: 330, type: 'skin' },
                { id: 'skin_rainbow', name: 'Rainbow Hero', icon: 'fa-rainbow', price: 480, type: 'skin' },
                { id: 'hat_straw', name: 'Straw Hat', icon: 'fa-sun', price: 80, type: 'hat' },
                { id: 'hat_grad', name: 'Graduation Cap', icon: 'fa-graduation-cap', price: 100, type: 'hat' },
                { id: 'hat_propeller', name: 'Propeller Cap', icon: 'fa-fan', price: 130, type: 'hat' },
                { id: 'hat_helmet', name: 'Knight Helmet', icon: 'fa-shield-halved', price: 150, type: 'hat' },
                { id: 'skin_bee', name: 'Bumble Bee', icon: 'fa-bug', price: 150, type: 'skin' },
                { id: 'skin_ocean', name: 'Deep Sea Diver', icon: 'fa-water', price: 200, type: 'skin' },
                { id: 'skin_forest', name: 'Forest Sprite', icon: 'fa-leaf', price: 210, type: 'skin' },
                { id: 'skin_ice', name: 'Ice Monarch', icon: 'fa-icicles', price: 350, type: 'skin' },
                { id: 'skin_chrome', name: 'Chrome Bot', icon: 'fa-robot', price: 380, type: 'skin' },
                { id: 'skin_cosmic', name: 'Cosmic Void', icon: 'fa-meteor', price: 520, type: 'skin' },
                { id: 'hat_beret', name: 'Artist Beret', icon: 'fa-palette', price: 90, type: 'hat' },
                { id: 'hat_sombrero', name: 'Sombrero', icon: 'fa-sun', price: 140, type: 'hat' },
                { id: 'hat_frog', name: 'Froggy Hat', icon: 'fa-frog', price: 150, type: 'hat' },
                { id: 'hat_mushroom', name: 'Mushroom Cap', icon: 'fa-seedling', price: 160, type: 'hat' },
                { id: 'hat_unicorn', name: 'Unicorn Horn', icon: 'fa-horse-head', price: 230, type: 'hat' },
                { id: 'hat_tiara', name: 'Jeweled Tiara', icon: 'fa-gem', price: 300, type: 'hat' },
                { id: 'acc_lei', name: 'Flower Lei', icon: 'fa-spa', price: 90, type: 'accessory' },
                { id: 'acc_guitar', name: 'Back Guitar', icon: 'fa-guitar', price: 210, type: 'accessory' },
                { id: 'acc_lightning', name: 'Storm Aura', icon: 'fa-bolt', price: 320, type: 'effect' },
                ...[
                    ['rose', 'Rose Garden', 340, 350, 110], ['lime', 'Lime Fizz', 90, 80, 110], ['mint', 'Fresh Mint', 150, 160, 120],
                    ['mocha', 'Mocha', 25, 35, 120], ['teal', 'Deep Teal', 175, 165, 130], ['peach', 'Peach Fuzz', 20, 30, 130],
                    ['lavender', 'Lavender', 265, 275, 140], ['gold', 'Golden Hour', 40, 45, 150], ['slate', 'Slate Storm', 215, 205, 150],
                    ['jungle', 'Jungle', 130, 100, 160], ['crimson', 'Crimson Night', 355, 10, 170], ['glacier', 'Glacier', 195, 210, 180],
                    ['sakura', 'Sakura', 330, 340, 190], ['ember', 'Ember', 15, 40, 210], ['cyber', 'Cyber Pink', 320, 180, 240],
                    ['galaxy', 'Galaxy', 275, 320, 280], ['prism', 'Prism', 300, 60, 420],
                    ['sunrise', 'Sunrise', 30, 350, 150], ['arctic', 'Arctic', 190, 230, 170], ['toxic', 'Toxic', 100, 140, 200], ['royal', 'Royal', 250, 45, 320],
                    ['sand', 'Sandy Shore', 35, 45, 70], ['sky', 'Clear Sky', 205, 195, 75], ['moss', 'Mossy', 110, 95, 80], ['plum', 'Plum', 290, 310, 85], ['steel', 'Steel', 210, 220, 90],
                    ['eclipse', 'Eclipse', 280, 20, 700], ['opal', 'Opal Dream', 180, 320, 740]
                ].map(([color, name, hue, hue2, price]) => ({ id: `palette_${color}`, name, color, hue, hue2, price, type: 'palette' })),
                { id: 'skin_sprout', name: 'Sprout', icon: 'fa-seedling', price: 70, type: 'skin' },
                { id: 'skin_sunny', name: 'Sunny', icon: 'fa-sun', price: 75, type: 'skin' },
                { id: 'skin_berry', name: 'Berry', icon: 'fa-user', price: 80, type: 'skin' },
                { id: 'skin_storm', name: 'Stormy', icon: 'fa-cloud', price: 85, type: 'skin' },
                { id: 'skin_minty', name: 'Minty', icon: 'fa-leaf', price: 90, type: 'skin' },
                { id: 'skin_celestial', name: 'Celestial Titan', icon: 'fa-sun', price: 750, type: 'skin' },
                { id: 'skin_inferno', name: 'Inferno Phoenix', icon: 'fa-fire', price: 800, type: 'skin' },
                { id: 'skin_bookworm', name: 'Bookworm', icon: 'fa-book', price: 140, type: 'skin', description: 'Pocket notebook, glasses and a scholarly vest' },
                { id: 'skin_astronaut', name: 'Moonwalker', icon: 'fa-user-astronaut', price: 230, type: 'skin', description: 'Reflective visor and a panelled space suit' },
                { id: 'skin_axolotl', name: 'Axolotl', icon: 'fa-fish', price: 380, type: 'skin', description: 'Animated pink gills and a spotted mint body' },
                { id: 'hat_aviator', name: 'Aviator Cap', icon: 'fa-plane', price: 220, type: 'hat', description: 'Leather ear flaps and brass flight goggles' },
                { id: 'hat_prism', name: 'Prism Diadem', icon: 'fa-gem', price: 430, type: 'hat', description: 'Three-cut crystal crown with contrasting facets' },
                { id: 'hat_satellite', name: 'Satellite Halo', icon: 'fa-satellite', price: 740, type: 'hat', description: 'A miniature orbital station above your head' },
                { id: 'acc_planet_effect', name: 'Planetary Rings', icon: 'fa-globe', price: 440, type: 'effect', description: 'Ringed planets in an elliptical orbit' },
                { id: 'acc_music_effect', name: 'Study Symphony', icon: 'fa-music', price: 180, type: 'effect', description: 'Distinct musical notes circling you' },
                { id: 'hat_visor', name: 'Sun Visor', icon: 'fa-sun', price: 65, type: 'hat' },
                { id: 'hat_bucket', name: 'Bucket Hat', icon: 'fa-hat-cowboy-side', price: 75, type: 'hat' },
                { id: 'hat_astronaut', name: 'Space Helmet', icon: 'fa-user-astronaut', price: 210, type: 'hat' },
                { id: 'hat_cosmic', name: 'Cosmic Crown', icon: 'fa-crown', price: 720, type: 'hat' },
                { id: 'acc_aura', name: 'Celestial Gate', icon: 'fa-infinity', price: 760, type: 'effect', description: 'A rotating star gate with counter-orbiting constellations' },
                { id: 'acc_prism_effect', name: 'Prism Pulse', icon: 'fa-circle-nodes', price: 680, type: 'effect' },
                { id: 'acc_frost_effect', name: 'Frost Nova', icon: 'fa-snowflake', price: 420, type: 'effect' },
                { id: 'acc_ember_effect', name: 'Ember Halo', icon: 'fa-fire-flame-curved', price: 500, type: 'effect' },
                { id: 'acc_heart_effect', name: 'Heartbeats', icon: 'fa-heart', price: 320, type: 'effect' },
                { id: 'acc_dew_effect', name: 'Dewdrop Halo', icon: 'fa-droplet', price: 75, type: 'effect', description: 'Floating translucent bubble rings' },
                { id: 'acc_leaf_effect', name: 'Leaf Dance', icon: 'fa-leaf', price: 130, type: 'effect', description: 'Green leaves circling your character' },
                { id: 'acc_snowflake_effect', name: 'Snowflake Orbit', icon: 'fa-snowflake', price: 210, type: 'effect', description: 'Six-point crystals orbiting slowly' },
                { id: 'acc_electric_effect', name: 'Electric Arc', icon: 'fa-bolt', price: 340, type: 'effect', description: 'Zigzag bolts crackling around you' },
                { id: 'acc_solar_effect', name: 'Solar Crown', icon: 'fa-sun', price: 520, type: 'effect', description: 'Pulsing sun rays and golden sparks' },
                { id: 'acc_vortex_effect', name: 'Vortex Bloom', icon: 'fa-hurricane', price: 760, type: 'effect', description: 'A three-armed dimensional spiral pulling gems inward' },
                { id: 'acc_cloud_effect', name: 'Cloud Nine', icon: 'fa-cloud', price: 85, type: 'effect', description: 'Soft cloud puffs pulsing around you' },
                { id: 'acc_confetti_effect', name: 'Confetti Carnival', icon: 'fa-shapes', price: 145, type: 'effect', description: 'Tumbling colorful confetti in a halo' },
                { id: 'acc_sakura_effect', name: 'Sakura Bloom', icon: 'fa-spa', price: 230, type: 'effect', description: 'Pink petals orbiting like a blossom' },
                { id: 'acc_pixel_effect', name: 'Pixel Pulse', icon: 'fa-gamepad', price: 360, type: 'effect', description: 'Neon squares dancing in a stepped orbit' },
                { id: 'acc_meteor_effect', name: 'Meteor Halo', icon: 'fa-meteor', price: 560, type: 'effect', description: 'Golden shooting stars circling you' },
                { id: 'acc_aurora_effect', name: 'Aurora Veil', icon: 'fa-rainbow', price: 780, type: 'effect', description: 'Layered northern-light curtains waving above a star field' },
                { id: 'acc_storm_effect', name: 'Personal Tempest', icon: 'fa-cloud-bolt', price: 900, type: 'effect', description: 'An overhead thundercloud with endless rain, splashes and occasional lightning' },
                { id: 'acc_blackhole_effect', name: 'Event Horizon', icon: 'fa-circle', price: 880, type: 'effect', description: 'A dark gravity well with a molten accretion disk and falling stardust' },
                { id: 'acc_firefly_effect', name: 'Firefly Garden', icon: 'fa-seedling', price: 150, type: 'effect', description: 'Fireflies drift along independent paths with softly glowing wings' },
                { id: 'acc_jellyfish_effect', name: 'Sky Jellyfish', icon: 'fa-water', price: 600, type: 'effect', description: 'Bioluminescent jellyfish bob above you with flowing tentacles' },
                { id: 'acc_rune_effect', name: 'Arcane Runes', icon: 'fa-wand-magic-sparkles', price: 390, type: 'effect', description: 'Rotating geometric runes with glowing centers' },
                { id: 'acc_lunar_effect', name: 'Lunar Eclipse', icon: 'fa-moon', price: 640, type: 'effect', description: 'Silver crescent moons in a blue halo' },
                { id: 'acc_glasses', name: 'Round Glasses', icon: 'fa-glasses', price: 70, type: 'accessory' },
                { id: 'acc_headband', name: 'Sport Headband', icon: 'fa-ribbon', price: 70, type: 'accessory' },
                { id: 'acc_bandana', name: 'Bandana', icon: 'fa-ribbon', price: 80, type: 'accessory' },
                { id: 'acc_mask', name: 'Hero Mask', icon: 'fa-mask', price: 90, type: 'accessory' },
                { id: 'acc_tie', name: 'Neck Tie', icon: 'fa-user-tie', price: 90, type: 'accessory' },
                { id: 'acc_mustache', name: 'Fancy Mustache', icon: 'fa-face-smile', price: 100, type: 'accessory' },
                { id: 'acc_goggles', name: 'Pilot Goggles', icon: 'fa-glasses', price: 120, type: 'accessory' },
                { id: 'acc_chain', name: 'Gold Chain', icon: 'fa-link', price: 130, type: 'accessory' },
                { id: 'acc_beard', name: 'Wise Beard', icon: 'fa-face-grin-beam', price: 130, type: 'accessory' },
                { id: 'acc_medal', name: 'Champion Medal', icon: 'fa-medal', price: 150, type: 'accessory' },
                { id: 'acc_tail', name: 'Fox Tail', icon: 'fa-paw', price: 170, type: 'accessory' },
                { id: 'acc_sword', name: 'Back Sword', icon: 'fa-khanda', price: 190, type: 'accessory' },
                { id: 'acc_hearts', name: 'Heart Cloud', icon: 'fa-heart', price: 200, type: 'accessory' },
                { id: 'acc_snow', name: 'Snow Flurry', icon: 'fa-snowflake', price: 210, type: 'accessory' },
                { id: 'acc_jetpack', name: 'Jetpack', icon: 'fa-rocket', price: 240, type: 'accessory' },
                { id: 'acc_fairy', name: 'Fairy Wings', icon: 'fa-wand-magic', price: 260, type: 'accessory' },
                { id: 'acc_stars', name: 'Orbit Stars', icon: 'fa-star', price: 280, type: 'accessory' },
                { id: 'acc_flame', name: 'Flame Aura', icon: 'fa-fire-flame-curved', price: 300, type: 'effect' },
                { id: 'acc_phoenix', name: 'Phoenix Wings', icon: 'fa-dove', price: 420, type: 'accessory' },
                { id: 'hat_cap', name: 'Sporty Cap', icon: 'fa-hat-cowboy-side', price: 60, type: 'hat' },
                { id: 'hat_party', name: 'Party Hat', icon: 'fa-cake-candles', price: 70, type: 'hat' },
                { id: 'hat_beanie', name: 'Cozy Beanie', icon: 'fa-mitten', price: 70, type: 'hat' },
                { id: 'hat_flower', name: 'Flower Crown', icon: 'fa-seedling', price: 90, type: 'hat' },
                { id: 'hat_chef', name: 'Chef Hat', icon: 'fa-utensils', price: 100, type: 'hat' },
                { id: 'hat_cowboy', name: 'Cowboy Hat', icon: 'fa-hat-cowboy', price: 110, type: 'hat' },
                { id: 'hat_headphones', name: 'Headphones', icon: 'fa-headphones', price: 120, type: 'hat' },
                { id: 'hat_santa', name: 'Santa Hat', icon: 'fa-gift', price: 120, type: 'hat' },
                { id: 'hat_tophat', name: 'Top Hat', icon: 'fa-hat-wizard', price: 130, type: 'hat' },
                { id: 'hat_fedora', name: 'Classic Fedora', icon: 'fa-hat-cowboy-side', price: 110, type: 'hat', description: 'Pinched felt crown, dark ribbon and a gently curved brim' },
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
                { id: 'acc_sparkles', name: 'Sparkle Aura', icon: 'fa-wand-magic-sparkles', price: 220, type: 'effect' },
                { id: 'acc_wings', name: 'Jet Wings', icon: 'fa-dove',                 price: 350, type: 'accessory' },
                { id: 'palette_aurora', name: 'Aurora Drift', color: 'aurora', hue: 165, hue2: 260, price: 160, type: 'palette' },
                { id: 'palette_coral', name: 'Coral Reef', color: 'coral', hue: 10, hue2: 40, price: 160, type: 'palette' },
                { id: 'palette_midnight', name: 'Midnight', color: 'midnight', hue: 230, hue2: 270, price: 180, type: 'palette' },
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
                            ].map(item => {
                                const rarity = item.rarity || StudBudCommunityGames.rarityForItem(item);
                                return { ...item, rarity, price: item.price == null ? null : Math.round(item.price * 2.5 / 5) * 5 };
                            });
                        }

                        static rarityForPrice(price) {
                            return price < 100 ? 'common' : price < 160 ? 'uncommon' : price < 260 ? 'rare' : price < 400 ? 'epic' : price < 700 ? 'legendary' : 'mythic';
                        }

                        static rarityForItem(item) {
                            if (item.type === 'palette' && item.price < 400) {
                                return ['aurora', 'coral', 'cyber', 'galaxy', 'royal'].includes(item.color) ? 'rare' : item.price < 100 ? 'common' : 'uncommon';
                            }
                            return { skin_gold: 'epic', skin_chrome: 'rare', skin_shadow: 'rare', skin_crystal: 'epic' }[item.id]
                                || this.rarityForPrice(item.price);
                        }

                        static get boxes() {
                            return [
                                { id: 'basic', name: 'Study Box', price: 80, icon: 'fa-book-open', odds: 'A little bit of everything', chances: { common: 70, uncommon: 22, rare: 7, epic: 1 } },
                                { id: 'rare', name: 'Honors Box', price: 200, icon: 'fa-graduation-cap', odds: 'Better odds for rare finds', chances: { common: 20, uncommon: 40, rare: 28, epic: 10, legendary: 2 } },
                                { id: 'legendary', name: 'Valedictorian Box', price: 500, icon: 'fa-award', odds: '20% uncommon; no common drops', chances: { uncommon: 20, rare: 40, epic: 28, legendary: 10, mythic: 2 } },
                                { id: 'hat', name: 'Hat Box', price: 130, icon: 'fa-hat-wizard', odds: 'Hats only', chances: { common: 40, uncommon: 32, rare: 20, epic: 7, legendary: 1 } },
                                { id: 'accessory', name: 'Style Box', price: 140, icon: 'fa-wand-magic-sparkles', odds: 'Accessories and auras', chances: { common: 40, uncommon: 32, rare: 20, epic: 7, legendary: 1 } },
                                { id: 'effect', name: 'Auras Box', price: 200, icon: 'fa-circle-nodes', odds: 'Auras and particles only', chances: { common: 25, uncommon: 35, rare: 25, epic: 12, legendary: 2, mythic: 1 } },
                                { id: 'palette', name: 'Color Box', price: 160, icon: 'fa-palette', odds: 'Color palettes only', chances: { uncommon: 50, rare: 35, epic: 13, legendary: 2 } },
                                { id: 'skin', name: 'Character Box', price: 260, icon: 'fa-user-astronaut', odds: 'Characters only', chances: { uncommon: 40, rare: 35, epic: 20, legendary: 5 } },
                                { id: 'mythic', name: 'Mythic Box', price: 1000, icon: 'fa-dragon', odds: 'High-tier finds', chances: { epic: 40, legendary: 45, mythic: 15 } }
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

        boxPool(box, owned = []) {
            const types = { hat: ['hat'], accessory: ['accessory', 'effect'], effect: ['effect'], palette: ['palette'], skin: ['skin'] };
            return this.catalog.filter(item => !item.legacy && item.type !== 'pet' && box.chances[item.rarity] > 0
                && (!types[box.id] || types[box.id].includes(item.type)) && !owned.includes(item.id));
        }

        boxChances(box, owned = []) {
            const pool = this.boxPool(box, owned);
            const weights = Object.entries(box.chances).filter(([rarity]) => pool.some(item => item.rarity === rarity));
            const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
            return Object.fromEntries(weights.map(([rarity, weight]) => [rarity, Math.round(weight / total * 1000) / 10]));
        }

        async searchDecks(query = '') {
            const client = this.getClient();
            const term = String(query || '').trim().replace(/[%_,()]/g, '');
            const build = withCourse => {
                let request = client.from('studbud_community_decks')
                    .select(withCourse ? 'id,owner_id,title,description,course,card_count,study_count,updated_at' : 'id,owner_id,title,description,card_count,study_count,updated_at')
                    .order('study_count', { ascending: false })
                    .order('updated_at', { ascending: false })
                    .limit(30);
                if (term) request = withCourse ? request.or(`title.ilike.%${term}%,course.ilike.%${term}%`) : request.ilike('title', `%${term}%`);
                return request;
            };
            let { data, error } = await build(true);
            // Servers that haven't re-run supabase-setup.sql don't have the course column yet.
            if (error && /course/i.test(error.message)) ({ data, error } = await build(false));
            if (error) throw new Error(`Could not search community decks: ${error.message}`);
            const rows = data || [];
            const ids = [...new Set(rows.map(row => row.owner_id))];
            if (ids.length) {
                const { data: names } = await client.rpc('studbud_community_authors', { p_ids: ids });
                rows.forEach(row => { row.author_name = names?.[row.owner_id] || 'Student'; });
            }
            return rows;
        }

        async getAuthorNames(ids) {
            const list = [...new Set((ids || []).filter(Boolean))];
            if (!list.length) return {};
            const { data, error } = await this.getClient().rpc('studbud_community_authors', { p_ids: list });
            if (error) throw new Error(error.message);
            return data || {};
        }

        async getUserProfile(userId) {
            const { data, error } = await this.getClient().rpc('studbud_view_profile', { p_user_id: userId });
            if (error) throw new Error(error.message);
            return data;
        }

        async publishDeck(deck) {
            if (deck.communitySourceId && deck.communitySourceOwnerId && deck.communitySourceOwnerId !== this.getUserId()) {
                const author = deck.communitySourceAuthor ? ` by ${deck.communitySourceAuthor}` : '';
                throw new Error(`“${deck.title}” was added from another student's shared set${author}, so it can't be reposted. Make your own set to share it.`);
            }

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
            const row = {
                owner_id: this.getUserId(),
                source_deck_id: String(deck.id),
                title,
                description: deck.communitySourceTitle
                    ? `Adapted from the shared set “${String(deck.communitySourceTitle).slice(0, 240)}”.`
                    : '',
                // Only the class is public; the linked quiz/test stays on this device.
                course: String(deck.courseTitle || '').trim().slice(0, 100),
                cards,
                updated_at: new Date().toISOString()
            };
            const save = payload => this.getClient().from('studbud_community_decks')
                .upsert(payload, { onConflict: 'owner_id,source_deck_id' }).select('id').single();
            // BEFORE INSERT guards run before ON CONFLICT, so reuse the published row's identity.
            const existing = await this.getClient().from('studbud_community_decks')
                .select('id').eq('owner_id', row.owner_id).eq('source_deck_id', row.source_deck_id).maybeSingle();
            if (existing.error) throw new Error(`Could not check this deck's shared copy: ${existing.error.message}`);
            if (existing.data) row.id = existing.data.id;
            let { data, error } = await save(row);
            if (error && /course/i.test(error.message)) {
                const { course, ...withoutCourse } = row;
                ({ data, error } = await save(withoutCourse));
            }
            if (error) throw new Error(`Could not share this deck: ${error.message}`);
            return data;
        }

        async ownedDecks() {
            const { data, error } = await this.getClient().from('studbud_community_decks')
                .select('id,source_deck_id,title,cards,course').eq('owner_id', this.getUserId());
            if (error) throw new Error(`Could not restore your published flashcards: ${error.message}`);
            return data || [];
        }

        async unpublishDeck(deckId) {
            const { error } = await this.getClient().from('studbud_community_decks')
                .delete()
                .eq('owner_id', this.getUserId())
                .eq('source_deck_id', String(deckId));
            if (error) throw new Error(`Could not remove this deck from the community: ${error.message}`);
        }

        async importDeck(deckId) {
            const load = columns => this.getClient().from('studbud_community_decks')
                .select(columns)
                .eq('id', deckId)
                .single();
            let { data, error } = await load('id,owner_id,title,description,course,cards');
            if (error && /course/i.test(error.message)) ({ data, error } = await load('id,owner_id,title,description,cards'));
            if (error) throw new Error(`Could not load this community deck: ${error.message}`);
            if (!Array.isArray(data.cards) || data.cards.length < 2) throw new Error('This community deck no longer contains enough cards to study.');
            try {
                const { data: names } = await this.getClient().rpc('studbud_community_authors', { p_ids: [data.owner_id] });
                data.author_name = names?.[data.owner_id] || 'Student';
            } catch (_) {
                data.author_name = 'Student';
            }
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

        async getStudyLeaderboard(period = 'daily', scope = 'global') {
            const client = this.getClient();
            let { data, error } = await client.rpc('studbud_get_study_leaderboard', { p_period: period, p_scope: scope });
            // Older databases only know the one-argument daily/weekly version; keep the board working until setup is re-run.
            if (error && /p_scope|function|schema cache/i.test(error.message || '')) {
                if (scope !== 'global' || !['daily', 'weekly'].includes(period)) {
                    throw new Error('Friends, monthly and all-time boards need the latest supabase-setup.sql. Ask the site admin to run it.');
                }
                ({ data, error } = await client.rpc('studbud_get_study_leaderboard', { p_period: period }));
            }
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
            if (error && /You already own every item that box can contain!?/.test(error.message)) {
                const profile = await this.getPlayerProfile();
                return { ...profile, collection_complete: true, completed_box: box };
            }
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

        async getSiteNotice() {
            const { data, error } = await this.getClient().rpc('studbud_get_site_notice');
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Site announcements are not set up yet. Re-run supabase-setup.sql in Supabase.'
                : error.message);
            return data;
        }

        async getSiteNoticeHistory() {
            const { data, error } = await this.getClient().rpc('studbud_get_site_notice_history');
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Announcement history is not set up yet. Re-run supabase-setup.sql in Supabase.'
                : error.message);
            return data;
        }

        async dismissSiteNotice(publicationId) {
            const { error } = await this.getClient().rpc('studbud_dismiss_site_notice', { p_publication_id: publicationId });
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Saved announcement dismissals are not set up yet. Re-run supabase-setup.sql in Supabase.'
                : error.message);
        }

        async friendCall(fn, args = {}) {
            const { data, error } = await this.getClient().rpc(fn, args);
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Friends are not set up yet. Re-run supabase-setup.sql in Supabase.' : error.message);
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
