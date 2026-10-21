(function (window) {
    'use strict';

    class StudBudCommunityGames {
        constructor() {
            this.guestColors = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c'];
            this.catalog = [
                ...[
                    ['skin_animal_chicken', 'Chicken', 'skin', 'common', 'White feathers, a red comb, orange beak and little wings'],
                    ['skin_animal_cow', 'Cow', 'skin', 'uncommon', 'Black-and-white patches, small horns and a pink muzzle'],
                    ['skin_animal_shark', 'Reef Shark', 'skin', 'rare', 'Blue-gray shark suit with fins, a pale belly and a toothy head'],
                    ['skin_animal_penguin', 'Penguin', 'skin', 'uncommon', 'A tuxedo-feathered penguin with a white belly and orange beak'],
                    ['hat_animal_hammerhead', 'Hammerhead Shark Head', 'hat', 'epic', 'Turns your head into a wide hammerhead shark with eyes at both ends'],
                    ['hat_animal_rooster', 'Rooster Head', 'hat', 'rare', 'A rooster head with a tall red comb, golden beak and red wattle'],
                    ['hat_animal_cow', 'Cow Head', 'hat', 'uncommon', 'A spotted cow head with cream horns, floppy ears and a pink snout'],
                    ['hat_animal_fox', 'Fox Hood', 'hat', 'rare', 'An orange fox head with tall ears and a white pointed muzzle'],
                    ['acc_animal_cowbell', 'Cowbell Collar', 'accessory', 'common', 'A red collar carrying a chunky golden cowbell'],
                    ['acc_animal_shark_fin', 'Shark Fin', 'accessory', 'uncommon', 'A blue-gray dorsal fin strapped onto your back'],
                    ['acc_animal_chicken_wings', 'Chicken Wings', 'accessory', 'rare', 'A pair of rounded white feather wings that flap as you move'],
                    ['acc_animal_fox_tail', 'Fluffy Fox Tail', 'accessory', 'epic', 'A big orange tail with a white tip and a gentle wag']
                ].map(([id, name, type, rarity, description]) => ({
                    id, name, type, rarity, description, box: 'animal', price: null,
                    icon: type === 'hat' ? 'fa-hat-wizard' : type === 'skin' ? 'fa-paw' : 'fa-feather'
                })),
                { id: 'acc_animal_paw_effect', name: 'Paw Parade', type: 'effect', rarity: 'rare', box: 'animal', price: null, icon: 'fa-paw', description: 'Little golden paw prints orbit your character' },
                { id: 'palette_animal_meadow', name: 'Wild Meadow', color: 'animal_meadow', hue: 90, hue2: 45, type: 'palette', rarity: 'uncommon', box: 'animal', price: null, description: 'Meadow greens and golden accents for your character and app theme' },
                { id: 'palette_forest', name: 'Forest', color: 'forest', hue: 135, hue2: 150, price: 120, type: 'palette', description: 'Forest-green colors for your character and app theme' },
                { id: 'palette_sunflower', name: 'Sunflower', color: 'sunflower', hue: 50, hue2: 55, price: 150, type: 'palette', description: 'Lemon-yellow accents with warm charcoal or cream surfaces for your character and app theme' },
                { id: 'palette_ocean', name: 'Tidal Glow', color: 'ocean', hue: 205, hue2: 190, price: 120, type: 'palette', description: 'Ocean-blue and turquoise colors for your character and app theme' },
                { id: 'palette_sunset', name: 'Heatwave', color: 'sunset', hue: 20, hue2: 350, price: 120, type: 'palette', description: 'Warm orange and pink colors for your character and app theme' },
                { id: 'palette_violet', name: 'Nebula', color: 'violet', hue: 265, hue2: 280, price: 120, type: 'palette', description: 'Violet and purple colors for your character and app theme' },
                { id: 'skin_robot', name: 'Robo Buddy', icon: 'fa-robot', price: 150, type: 'skin', description: 'A friendly robot character with mechanical details' },
                { id: 'skin_ninja', name: 'Shadow Ninja', icon: 'fa-user-ninja', price: 180, type: 'skin', description: 'A masked ninja outfit for a stealthy look' },
                { id: 'skin_alien', name: 'Martian', icon: 'fa-user-astronaut', price: 180, type: 'skin', description: 'An otherworldly alien character' },
                { id: 'skin_ghost', name: 'Spooky Ghost', icon: 'fa-ghost', price: 220, type: 'skin', description: 'A pale ghost character with a spooky face' },
                { id: 'skin_lava', name: 'Magma Golem', icon: 'fa-fire', price: 300, type: 'skin', description: 'A volcanic character with fiery magma details' },
                { id: 'skin_gold', name: 'Golden Hero', icon: 'fa-medal', price: 400, type: 'skin', description: 'A gold-colored hero with a gleaming finish' },
                { id: 'skin_bubble', name: 'Bubblegum', icon: 'fa-user', price: 130, type: 'skin', description: 'A bright bubblegum-pink character' },
                { id: 'skin_snow', name: 'Frosty', icon: 'fa-snowflake', price: 140, type: 'skin', description: 'A snowy character with a cool winter look' },
                { id: 'skin_zombie', name: 'Zombie', icon: 'fa-skull', price: 160, type: 'skin', description: 'An undead character with a shambling style' },
                { id: 'skin_pumpkin', name: 'Pumpkin Head', icon: 'fa-user', price: 170, type: 'skin', description: 'A pumpkin-faced character for autumn adventures' },
                { id: 'skin_cyber', name: 'Cyber Agent', icon: 'fa-microchip', price: 260, type: 'skin', description: 'A futuristic agent with electronic details' },
                { id: 'skin_shadow', name: 'Void Walker', icon: 'fa-moon', price: 280, type: 'skin', description: 'A dark character inspired by the void' },
                { id: 'skin_crystal', name: 'Crystal Knight', icon: 'fa-gem', price: 320, type: 'skin', description: 'A crystalline character with gem-like armor' },
                { id: 'skin_galaxy', name: 'Galaxy Guardian', icon: 'fa-star', price: 450, type: 'skin', description: 'A space-themed guardian with starry details' },
                { id: 'skin_dragon', name: 'Dragon Lord', icon: 'fa-dragon', price: 500, type: 'skin', description: 'A dragon-inspired character with a fierce look' },
                { id: 'skin_candy', name: 'Candy Cane', icon: 'fa-candy-cane', price: 140, type: 'skin', description: 'A sweet character with candy-cane stripes' },
                { id: 'skin_pixel', name: 'Pixel Pal', icon: 'fa-gamepad', price: 190, type: 'skin', description: 'A blocky character inspired by retro games' },
                { id: 'skin_mummy', name: 'Mummy', icon: 'fa-user', price: 170, type: 'skin', description: 'A character wrapped in mummy bandages' },
                { id: 'skin_vampire', name: 'Vampire', icon: 'fa-droplet', price: 270, type: 'skin', description: 'A vampire character with a gothic style' },
                { id: 'skin_samurai', name: 'Samurai', icon: 'fa-user-shield', price: 290, type: 'skin', description: 'A warrior character with samurai-inspired armor' },
                { id: 'skin_steampunk', name: 'Steampunk', icon: 'fa-gear', price: 310, type: 'skin', description: 'A character with brass and clockwork styling' },
                { id: 'skin_neon', name: 'Neon Runner', icon: 'fa-bolt', price: 330, type: 'skin', description: 'A runner with vivid neon styling' },
                { id: 'skin_rainbow', name: 'Rainbow Hero', icon: 'fa-rainbow', price: 480, type: 'skin', description: 'A colorful hero with a rainbow finish' },
                { id: 'hat_straw', name: 'Straw Hat', icon: 'fa-sun', price: 80, type: 'hat', description: 'A woven sun hat with a wide brim' },
                { id: 'hat_grad', name: 'Graduation Cap', icon: 'fa-graduation-cap', price: 100, type: 'hat', description: 'A square graduation cap with a tassel' },
                { id: 'hat_propeller', name: 'Propeller Cap', icon: 'fa-fan', price: 130, type: 'hat', description: 'A playful cap topped with a propeller' },
                { id: 'hat_helmet', name: 'Knight Helmet', icon: 'fa-shield-halved', price: 150, type: 'hat', description: 'A metal helmet with a knightly visor' },
                { id: 'skin_bee', name: 'Bumble Bee', icon: 'fa-bug', price: 150, type: 'skin', description: 'A bee character with yellow-and-black stripes' },
                { id: 'skin_ocean', name: 'Deep Sea Diver', icon: 'fa-water', price: 200, type: 'skin', description: 'An underwater explorer in diving gear' },
                { id: 'skin_forest', name: 'Forest Sprite', icon: 'fa-leaf', price: 210, type: 'skin', description: 'A woodland character with leafy styling' },
                { id: 'skin_ice', name: 'Ice Monarch', icon: 'fa-icicles', price: 350, type: 'skin', description: 'A regal character with icy details' },
                { id: 'skin_chrome', name: 'Chrome Bot', icon: 'fa-robot', price: 380, type: 'skin', description: 'A robot character with a polished chrome finish' },
                { id: 'skin_cosmic', name: 'Cosmic Void', icon: 'fa-meteor', price: 520, type: 'skin', description: 'A cosmic character inspired by deep space' },
                { id: 'hat_beret', name: 'Artist Beret', icon: 'fa-palette', price: 90, type: 'hat', description: 'A soft artist beret with a rounded crown' },
                { id: 'hat_sombrero', name: 'Sombrero', icon: 'fa-sun', price: 140, type: 'hat', description: 'A festive hat with a broad brim' },
                { id: 'hat_frog', name: 'Froggy Hat', icon: 'fa-frog', price: 150, type: 'hat', description: 'A frog-shaped hat with eyes on top' },
                { id: 'hat_mushroom', name: 'Mushroom Cap', icon: 'fa-seedling', price: 160, type: 'hat', description: 'A spotted mushroom cap for your head' },
                { id: 'hat_unicorn', name: 'Unicorn Horn', icon: 'fa-horse-head', price: 230, type: 'hat', description: 'A unicorn horn for a magical look' },
                { id: 'hat_tiara', name: 'Jeweled Tiara', icon: 'fa-gem', price: 300, type: 'hat', description: 'A delicate tiara decorated with jewels' },
                { id: 'acc_lei', name: 'Flower Lei', icon: 'fa-spa', price: 90, type: 'accessory', description: 'A necklace of colorful flowers' },
                { id: 'acc_guitar', name: 'Back Guitar', icon: 'fa-guitar', price: 210, type: 'accessory', description: 'A guitar carried across your back' },
                { id: 'acc_lightning', name: 'Storm Aura', icon: 'fa-bolt', price: 320, type: 'effect', description: 'Lightning-inspired sparks surrounding your character' },
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
                ].map(([color, name, hue, hue2, price]) => ({ id: `palette_${color}`, name, color, hue, hue2, price, type: 'palette', description: `${name}-inspired colors for your character and app theme` })),
                { id: 'skin_sprout', name: 'Sprout', icon: 'fa-seedling', price: 70, type: 'skin', description: 'A fresh green character inspired by new sprouts' },
                { id: 'skin_sunny', name: 'Sunny', icon: 'fa-sun', price: 75, type: 'skin', description: 'A cheerful character in sunny yellow' },
                { id: 'skin_berry', name: 'Berry', icon: 'fa-user', price: 80, type: 'skin', description: 'A character in bright berry tones' },
                { id: 'skin_storm', name: 'Stormy', icon: 'fa-cloud', price: 85, type: 'skin', description: 'A character in moody storm-cloud tones' },
                { id: 'skin_minty', name: 'Minty', icon: 'fa-leaf', price: 90, type: 'skin', description: 'A character with a refreshing mint-green look' },
                { id: 'skin_celestial', name: 'Celestial Titan', icon: 'fa-sun', price: 750, type: 'skin', description: 'A luminous character with celestial details' },
                { id: 'skin_inferno', name: 'Inferno Phoenix', icon: 'fa-fire', price: 800, type: 'skin', description: 'A fiery character inspired by the phoenix' },
                { id: 'skin_bookworm', name: 'Bookworm', icon: 'fa-book', price: 140, type: 'skin', description: 'Pocket notebook, glasses and a scholarly vest' },
                { id: 'skin_astronaut', name: 'Moonwalker', icon: 'fa-user-astronaut', price: 230, type: 'skin', description: 'Reflective visor and a panelled space suit' },
                { id: 'skin_axolotl', name: 'Axolotl', icon: 'fa-fish', price: 380, type: 'skin', description: 'Animated pink gills and a spotted mint body' },
                { id: 'hat_aviator', name: 'Aviator Cap', icon: 'fa-plane', price: 220, type: 'hat', description: 'Leather ear flaps and brass flight goggles' },
                { id: 'hat_prism', name: 'Prism Diadem', icon: 'fa-gem', price: 430, type: 'hat', description: 'Three-cut crystal crown with contrasting facets' },
                { id: 'hat_satellite', name: 'Satellite Halo', icon: 'fa-satellite', price: 740, type: 'hat', description: 'A miniature orbital station above your head' },
                { id: 'acc_planet_effect', name: 'Planetary Rings', icon: 'fa-globe', price: 440, type: 'effect', description: 'Ringed planets in an elliptical orbit' },
                { id: 'acc_music_effect', name: 'Study Symphony', icon: 'fa-music', price: 180, type: 'effect', description: 'Distinct musical notes circling you' },
                { id: 'hat_visor', name: 'Sun Visor', icon: 'fa-sun', price: 65, type: 'hat', description: 'An open-top visor with a shaded brim' },
                { id: 'hat_bucket', name: 'Bucket Hat', icon: 'fa-hat-cowboy-side', price: 75, type: 'hat', description: 'A casual hat with a downward-sloping brim' },
                { id: 'hat_astronaut', name: 'Space Helmet', icon: 'fa-user-astronaut', price: 210, type: 'hat', description: 'A rounded space helmet for orbital adventures' },
                { id: 'hat_cosmic', name: 'Cosmic Crown', icon: 'fa-crown', price: 720, type: 'hat', description: 'A celestial crown with cosmic styling' },
                { id: 'acc_aura', name: 'Celestial Gate', icon: 'fa-infinity', price: 760, type: 'effect', description: 'A rotating star gate with counter-orbiting constellations' },
                { id: 'acc_prism_effect', name: 'Prism Pulse', icon: 'fa-circle-nodes', price: 680, type: 'effect', description: 'Prismatic light pulsing around your character' },
                { id: 'acc_frost_effect', name: 'Frost Nova', icon: 'fa-snowflake', price: 420, type: 'effect', description: 'A frosty burst of icy particles' },
                { id: 'acc_ember_effect', name: 'Ember Halo', icon: 'fa-fire-flame-curved', price: 500, type: 'effect', description: 'Warm embers glowing in a halo' },
                { id: 'acc_heart_effect', name: 'Heartbeats', icon: 'fa-heart', price: 320, type: 'effect', description: 'Heart-shaped particles pulsing around you' },
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
                { id: 'acc_blossom_effect', name: 'Petal Drift', icon: 'fa-spa', price: 190, type: 'effect', description: 'Soft blossom petals flutter past in the breeze' },
                { id: 'acc_bubble_effect', name: 'Bubble Parade', icon: 'fa-circle', price: 160, type: 'effect', description: 'Iridescent bubbles wobble upward and pop' },
                { id: 'acc_comet_effect', name: 'Comet Trails', icon: 'fa-meteor', price: 300, type: 'effect', description: 'Bright comets sweep around you with streaming tails' },
                { id: 'acc_spiral_effect', name: 'Orbit Spiral', icon: 'fa-spiral', price: 360, type: 'effect', description: 'Tiny stars climb a pair of twisting orbital paths' },
                { id: 'acc_spark_effect', name: 'Spark Shower', icon: 'fa-burst', price: 110, type: 'effect', description: 'A playful burst of twinkling sparks' },
                { id: 'acc_glasses', name: 'Round Glasses', icon: 'fa-glasses', price: 70, type: 'accessory', description: 'Round frames for a scholarly look' },
                { id: 'acc_headband', name: 'Sport Headband', icon: 'fa-ribbon', price: 70, type: 'accessory', description: 'An athletic band worn across your forehead' },
                { id: 'acc_bandana', name: 'Bandana', icon: 'fa-ribbon', price: 80, type: 'accessory', description: 'A tied bandana for an adventurous look' },
                { id: 'acc_mask', name: 'Hero Mask', icon: 'fa-mask', price: 90, type: 'accessory', description: 'An eye mask for your superhero identity' },
                { id: 'acc_tie', name: 'Neck Tie', icon: 'fa-user-tie', price: 90, type: 'accessory', description: 'A neat necktie for formal occasions' },
                { id: 'acc_mustache', name: 'Fancy Mustache', icon: 'fa-face-smile', price: 100, type: 'accessory', description: 'A stylish mustache for your character' },
                { id: 'acc_goggles', name: 'Pilot Goggles', icon: 'fa-glasses', price: 120, type: 'accessory', description: 'Flight goggles with a vintage pilot look' },
                { id: 'acc_chain', name: 'Gold Chain', icon: 'fa-link', price: 130, type: 'accessory', description: 'A gleaming chain worn around your neck' },
                { id: 'acc_beard', name: 'Wise Beard', icon: 'fa-face-grin-beam', price: 130, type: 'accessory', description: 'A full beard for a wise old look' },
                { id: 'acc_medal', name: 'Champion Medal', icon: 'fa-medal', price: 150, type: 'accessory', description: 'A medal worn proudly on your chest' },
                { id: 'acc_tail', name: 'Fox Tail', icon: 'fa-paw', price: 170, type: 'accessory', description: 'A fluffy fox tail attached behind you' },
                { id: 'acc_sword', name: 'Back Sword', icon: 'fa-khanda', price: 190, type: 'accessory', description: 'A decorative sword carried on your back' },
                { id: 'acc_hearts', name: 'Heart Cloud', icon: 'fa-heart', price: 200, type: 'effect', description: 'A cloud of floating hearts around your character' },
                { id: 'acc_snow', name: 'Snow Flurry', icon: 'fa-snowflake', price: 210, type: 'effect', description: 'A gentle flurry of snow around you' },
                { id: 'acc_jetpack', name: 'Jetpack', icon: 'fa-rocket', price: 240, type: 'accessory', description: 'A decorative rocket pack worn on your back' },
                { id: 'acc_fairy', name: 'Fairy Wings', icon: 'fa-wand-magic', price: 260, type: 'accessory', description: 'A pair of delicate fairy wings' },
                { id: 'acc_stars', name: 'Orbit Stars', icon: 'fa-star', price: 280, type: 'effect', description: 'Tiny stars orbiting your character' },
                { id: 'acc_flame', name: 'Flame Aura', icon: 'fa-fire-flame-curved', price: 300, type: 'effect', description: 'A fiery glow surrounding your character' },
                { id: 'acc_phoenix', name: 'Phoenix Wings', icon: 'fa-dove', price: 420, type: 'accessory', description: 'A fiery pair of phoenix-inspired wings' },
                { id: 'hat_cap', name: 'Sporty Cap', icon: 'fa-hat-cowboy-side', price: 60, type: 'hat', description: 'A casual sports cap with a short brim' },
                { id: 'hat_party', name: 'Party Hat', icon: 'fa-cake-candles', price: 70, type: 'hat', description: 'A pointed party hat for celebrations' },
                { id: 'hat_beanie', name: 'Cozy Beanie', icon: 'fa-mitten', price: 70, type: 'hat', description: 'A warm knit cap with a cozy fit' },
                { id: 'hat_flower', name: 'Flower Crown', icon: 'fa-seedling', price: 90, type: 'hat', description: 'A circle of flowers worn as a crown' },
                { id: 'hat_chef', name: 'Chef Hat', icon: 'fa-utensils', price: 100, type: 'hat', description: 'A tall white hat for a kitchen-ready look' },
                { id: 'hat_cowboy', name: 'Cowboy Hat', icon: 'fa-hat-cowboy', price: 110, type: 'hat', description: 'A Western hat with a curved brim' },
                { id: 'hat_headphones', name: 'Headphones', icon: 'fa-headphones', price: 120, type: 'hat', description: 'Over-ear headphones for your study soundtrack' },
                { id: 'hat_santa', name: 'Santa Hat', icon: 'fa-gift', price: 120, type: 'hat', description: 'A festive red hat with a fluffy trim' },
                { id: 'hat_tophat', name: 'Top Hat', icon: 'fa-hat-wizard', price: 130, type: 'hat', description: 'A tall formal hat with a flat brim' },
                { id: 'hat_fedora', name: 'Classic Fedora', icon: 'fa-hat-cowboy-side', price: 110, type: 'hat', description: 'Pinched felt crown, dark ribbon and a gently curved brim' },
                { id: 'hat_fedora_black', name: 'Black Fedora', icon: 'fa-hat-cowboy-side', price: 110, type: 'hat', description: 'Black felt crown, charcoal ribbon and a gently curved brim' },
                { id: 'hat_bunny', name: 'Bunny Ears', icon: 'fa-carrot', price: 140, type: 'hat', description: 'A pair of tall bunny ears' },
                { id: 'hat_cat', name: 'Cat Ears', icon: 'fa-cat', price: 140, type: 'hat', description: 'A pair of pointed cat ears' },
                { id: 'hat_wizard', name: 'Wizard Hat', icon: 'fa-hat-wizard', price: 160, type: 'hat', description: 'A tall pointed hat for a magical look' },
                { id: 'hat_pirate', name: 'Pirate Hat', icon: 'fa-skull-crossbones', price: 170, type: 'hat', description: 'A pirate captain hat for high-seas style' },
                { id: 'hat_viking', name: 'Viking Helm', icon: 'fa-shield', price: 190, type: 'hat', description: 'A horned helmet with Viking-inspired styling' },
                { id: 'hat_horns', name: 'Devil Horns', icon: 'fa-fire', price: 200, type: 'hat', description: 'A pair of mischievous devil horns' },
                { id: 'hat_halo', name: 'Angel Halo', icon: 'fa-circle-notch', price: 250, type: 'hat', description: 'A bright halo floating above your head' },
                { id: 'hat_crown', name: 'Royal Crown', icon: 'fa-crown', price: 400, type: 'hat', description: 'A royal crown for a regal finish' },
                { id: 'acc_bowtie', name: 'Bow Tie', icon: 'fa-ribbon', price: 70, type: 'accessory', description: 'A neat bow tie worn at your collar' },
                { id: 'acc_shades', name: 'Cool Shades', icon: 'fa-glasses', price: 80, type: 'accessory', description: 'Dark sunglasses for a laid-back look' },
                { id: 'acc_eyepatch', name: 'Eye Patch', icon: 'fa-eye-slash', price: 90, type: 'accessory', description: 'A pirate-style patch over one eye' },
                { id: 'acc_scarf', name: 'Cozy Scarf', icon: 'fa-wind', price: 90, type: 'accessory', description: 'A warm scarf wrapped around your neck' },
                { id: 'acc_backpack', name: 'Backpack', icon: 'fa-bag-shopping', price: 100, type: 'accessory', description: 'A school backpack carried on your back' },
                { id: 'acc_monocle', name: 'Monocle', icon: 'fa-eye', price: 140, type: 'accessory', description: 'A single round lens for a distinguished look' },
                { id: 'acc_cape', name: 'Hero Cape', icon: 'fa-mask', price: 180, type: 'accessory', description: 'A flowing superhero cape' },
                { id: 'acc_sparkles', name: 'Sparkle Aura', icon: 'fa-wand-magic-sparkles', price: 220, type: 'effect', description: 'Twinkling sparkles floating around your character' },
                { id: 'acc_wings', name: 'Jet Wings', icon: 'fa-dove',                 price: 350, type: 'accessory', description: 'A decorative pair of jet-inspired wings' },
                { id: 'palette_aurora', name: 'Aurora Drift', color: 'aurora', hue: 165, hue2: 260, price: 160, type: 'palette', description: 'Mint and violet colors for your character and app theme' },
                { id: 'palette_coral', name: 'Coral Reef', color: 'coral', hue: 10, hue2: 40, price: 160, type: 'palette', description: 'Coral and golden colors for your character and app theme' },
                { id: 'palette_midnight', name: 'Midnight', color: 'midnight', hue: 230, hue2: 270, price: 180, type: 'palette', description: 'Deep blue and purple colors for your character and app theme' },
                { id: 'accessory_cap', legacy: true, name: 'Comet Cap', icon: 'fa-hat-cowboy-side', price: 75, type: 'hat', description: 'A classic cap from the original cosmetic collection' },
                { id: 'accessory_halo', legacy: true, name: 'Halo Headband', icon: 'fa-circle', price: 125, type: 'hat', description: 'A halo headband from the original cosmetic collection' },
                { id: 'accessory_headphones', legacy: true, name: 'Cloud Headphones', icon: 'fa-headphones',                                 price: 150, type: 'hat', description: 'Cloud-styled headphones from the original cosmetic collection' },
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
                            ].concat(StudBudCommunityGames.seasonalItems()).map(item => {
                                const rarity = item.rarity || StudBudCommunityGames.rarityForItem(item);
                                const collection = StudBudCommunityGames.permanentSets.find(set => set.items.includes(item.id));
                                return { ...item, collection: collection?.id, collectionName: collection?.name, rarity, price: item.price == null ? null : Math.round(item.price * 2.5 / 5) * 5 * 2 };
                            });
                        }

                        static rarityForPrice(price) {
                            return price < 100 ? 'common' : price < 200 ? 'uncommon' : price < 350 ? 'rare' : price < 550 ? 'epic' : price < 800 ? 'legendary' : 'mythic';
                        }

                        static rarityForItem(item) {
                            return this.rarityForPrice(item.price);
                        }

                        // One limited box per month. Items are box-only and keep their set (season) for collections.
                        static get seasons() {
                            return [
                                { month: 1, key: 'newyear', name: 'New Year', icon: 'fa-champagne-glasses', colors: ['#facc15', '#a5b4fc'],
                                    skin: ['Midnight Sparkle', '#1e1b4b', '#fde68a', '#1e1b4b', '#facc15'], hat: ['Countdown Top Hat', 'tophat', '#111827', '#facc15', '#f8fafc'],
                                    aura: ['Confetti Countdown', 'confetti', '#facc15', '#e2e8f0', '#a5b4fc'], palette: ['Golden Midnight', 45, 250] },
                                { month: 2, key: 'valentine', name: "Valentine's", icon: 'fa-heart', colors: ['#fb7185', '#f9a8d4'],
                                    skin: ['Sweetheart', '#e11d48', '#ffe4e6', '#881337', '#f9a8d4'], hat: ['Heart Headband', 'band', '#f43f5e', '#fecdd3', '#be123c'],
                                    aura: ['Love Notes', 'heart', '#fb7185', '#fda4af', '#f9a8d4'], palette: ['Rose Petal', 345, 320], extras: [
                                        { key: 'cupid', type: 'hat', name: 'Cupid Wing Crown', hatShape: 'wings', hatColors: ['#fff1f2', '#fb7185', '#fda4af'] }
                                    ] },
                                { month: 3, key: 'clover', name: "St. Patrick's", icon: 'fa-clover', colors: ['#22c55e', '#facc15'],
                                    skin: ['Lucky Clover', '#15803d', '#fde7c8', '#14532d', '#facc15'], hat: ['Lucky Top Hat', 'tophat', '#166534', '#facc15', '#bbf7d0'],
                                    aura: ['Four-Leaf Flurry', 'leaf', '#22c55e', '#86efac', '#facc15'], palette: ['Emerald Luck', 140, 50] },
                                { month: 4, key: 'spring', name: 'Spring', icon: 'fa-egg', colors: ['#f9a8d4', '#a7f3d0'],
                                    skin: ['Spring Bloom', '#a7f3d0', '#fef9c3', '#4c1d95', '#f9a8d4'], hat: ['Bunny Ears', 'ears', '#f8fafc', '#f9a8d4', '#fbcfe8'],
                                    aura: ['Petal Breeze', 'petal', '#f9a8d4', '#fde68a', '#a7f3d0'], palette: ['Pastel Garden', 320, 150] },
                                { month: 5, key: 'grad', name: 'Graduation', icon: 'fa-graduation-cap', colors: ['#1d4ed8', '#facc15'],
                                    skin: ['Valedictorian', '#1e3a8a', '#fde7c8', '#172554', '#facc15'], hat: ['Honors Mortarboard', 'mortar', '#0f172a', '#facc15', '#fde68a'],
                                    aura: ['Cap Toss Stars', 'star', '#facc15', '#fef3c7', '#93c5fd'], palette: ['Class Colors', 225, 45] },
                                { month: 6, key: 'summer', name: 'Summer', icon: 'fa-umbrella-beach', colors: ['#22d3ee', '#fbbf24'],
                                    skin: ['Beach Day', '#0ea5e9', '#fed7aa', '#0c4a6e', '#fde047'], hat: ['Sun Hat', 'straw', '#fcd34d', '#f97316', '#fef3c7'],
                                    aura: ['Heat Shimmer', 'ray', '#fde68a', '#fbbf24', '#22d3ee'], palette: ['Tropical Wave', 190, 40], extras: [
                                        { key: 'sunglasses', type: 'hat', name: 'Beach Sunglasses', hatShape: 'sunglasses', hatColors: ['#facc15', '#0f172a', '#38bdf8'] },
                                        { key: 'shark', type: 'hat', name: 'Shark Fin', hatShape: 'fin', hatColors: ['#64748b', '#cbd5e1', '#334155'] }
                                    ] },
                                { month: 7, key: 'fireworks', name: 'Fireworks', icon: 'fa-burst', colors: ['#ef4444', '#3b82f6'],
                                    skin: ['Firecracker', '#1d4ed8', '#f8fafc', '#1e3a8a', '#ef4444'], hat: ['Rocket Party Hat', 'cone', '#ef4444', '#f8fafc', '#3b82f6'],
                                    aura: ['Sparkler Show', 'spark', '#ef4444', '#f8fafc', '#60a5fa'], palette: ['Star Spangled', 0, 220] },
                                { month: 8, key: 'school', name: 'Back to School', icon: 'fa-pencil', colors: ['#f59e0b', '#38bdf8'],
                                    skin: ['Honor Roll', '#ca8a04', '#fde7c8', '#422006', '#38bdf8'], hat: ['Varsity Cap', 'cap', '#2563eb', '#facc15', '#f8fafc'],
                                    aura: ['Study Beats', 'note', '#fde68a', '#38bdf8', '#f472b6'], palette: ['Pencil Case', 40, 200] },
                                { month: 9, key: 'autumn', name: 'Autumn', icon: 'fa-leaf', colors: ['#f97316', '#b45309'],
                                    skin: ['Maple Ranger', '#c2410c', '#fde7c8', '#431407', '#fbbf24'], hat: ['Cozy Knit Beanie', 'beanie', '#ea580c', '#fde68a', '#9a3412'],
                                    aura: ['Falling Maple', 'leaf', '#f97316', '#dc2626', '#fbbf24'], palette: ['Maple Glow', 25, 5] },
                                { month: 10, key: 'halloween', name: 'Halloween', icon: 'fa-ghost', colors: ['#f97316', '#a855f7'],
                                    skin: ['Jack-o\u2019-Spook', '#f97316', '#1c1917', '#facc15', '#7c3aed'], hat: ['Witching Hat', 'witch', '#3b0764', '#f97316', '#a855f7'],
                                    aura: ['Spectral Flames', 'flame', '#a855f7', '#22c55e', '#f97316'], palette: ['Haunted Night', 275, 25], extras: [
                                        { key: 'pumpkin', type: 'hat', name: 'Pumpkin Head', hatShape: 'pumpkin', hatColors: ['#f97316', '#fde047', '#166534'] },
                                        { key: 'ghost', type: 'hat', name: 'Ghost Sheet', hatShape: 'ghost', hatColors: ['#f8fafc', '#cbd5e1', '#0f172a'] },
                                        { key: 'ghost', type: 'skin', name: 'Pale Phantom', skinColors: { body: '#e2e8f0', head: '#f8fafc', eye: '#334155', trim: '#cbd5e1', alpha: .72 } },
                                        { key: 'skeleton', type: 'skin', name: 'Skeleton Suit', skinColors: { body: '#18181b', head: '#f1f5f9', eye: '#09090b', trim: '#e2e8f0', pattern: 'bones' } },
                                        { key: 'bats', type: 'effect', name: 'Bat Swarm', particle: { shape: 'bat', colors: ['#312e81', '#7e22ce', '#1c1917'] } },
                                        { key: 'candycorn', type: 'palette', name: 'Candy Corn', hue: 30, hue2: 50 }
                                    ] },
                                { month: 11, key: 'harvest', name: 'Thanksgiving', icon: 'fa-wheat-awn', colors: ['#b45309', '#facc15'],
                                    skin: ['Harvest Host', '#92400e', '#fde7c8', '#451a03', '#f59e0b'], hat: ['Pilgrim Hat', 'tophat', '#292524', '#a8a29e', '#facc15'],
                                    aura: ['Harvest Breeze', 'leaf', '#b45309', '#f59e0b', '#facc15'], palette: ['Pumpkin Pie', 30, 15], extras: [
                                        { key: 'turkey', type: 'hat', name: 'Turkey Fan', hatShape: 'turkey', hatColors: ['#92400e', '#f59e0b', '#dc2626'] }
                                    ] },
                                { month: 12, key: 'holiday', name: 'Christmas', icon: 'fa-tree', colors: ['#ef4444', '#22c55e'],
                                    skin: ['Jolly Elf', '#15803d', '#fde7c8', '#14532d', '#ef4444'], hat: ['Santa Hat', 'santa', '#dc2626', '#f8fafc', '#fef2f2'],
                                    aura: ['Let It Snow', 'snowflake', '#f8fafc', '#bae6fd', '#ef4444'], palette: ['Candy Cane', 355, 140], extras: [
                                        { key: 'antlers', type: 'hat', name: 'Reindeer Antlers', hatShape: 'antlers', hatColors: ['#92400e', '#dc2626', '#facc15'] },
                                        { key: 'elf', type: 'hat', name: 'Workshop Elf Hat', hatShape: 'elf', hatColors: ['#16a34a', '#ef4444', '#facc15'] }
                                    ] }
                            ];
                        }

                        static seasonalItems() {
                            const extras = [
                                ['Starlight Party Crown', 'cone', 'Aurora Celebrant', 'Midnight Wishes', 'star'],
                                ['Cupid Wings Headband', 'ears', 'Velvet Valentine', 'Rose Petal Shower', 'petal'],
                                ['Clover Cap', 'cap', 'Emerald Guardian', 'Pot of Gold', 'spark'],
                                ['Garden Straw Hat', 'straw', 'Meadow Sprite', 'Buttercup Stars', 'star'],
                                ['Alumni Top Hat', 'tophat', 'Golden Graduate', 'Honor Roll Confetti', 'confetti'],
                                ['Coral Party Hat', 'cone', 'Sunset Surfer', 'Ocean Sparkles', 'spark'],
                                ['Parade Top Hat', 'tophat', 'Starlight Captain', 'Freedom Confetti', 'confetti'],
                                ['Study Session Beanie', 'beanie', 'Campus Captain', 'Notebook Stars', 'star'],
                                ['Woodland Ears', 'ears', 'Golden Scarecrow', 'Autumn Embers', 'flame'],
                                ['Midnight Cat Ears', 'ears', 'Moonlit Phantom', 'Haunted Stardust', 'star'],
                                ['Harvest Straw Hat', 'straw', 'Cranberry Wanderer', 'Golden Harvest', 'spark'],
                                ['Reindeer Ears', 'ears', 'Frost Guardian', 'Holiday Wishes', 'star']
                            ];
                            return StudBudCommunityGames.seasons.flatMap(season => {
                                const set = { season: season.month, set: season.name };
                                const [skinName, body, head, eye, trim] = season.skin;
                                const [hatName, shape, ...hatColors] = season.hat;
                                const [auraName, particle, ...auraColors] = season.aura;
                                const [paletteName, hue, hue2] = season.palette;
                                const [extraHat, extraShape, extraSkin, extraAura, extraParticle] = extras[season.month - 1];
                                return [
                                    { ...set, id: `palette_seasonal_${season.key}`, name: paletteName, color: `seasonal_${season.key}`, hue, hue2, price: null, rarity: 'uncommon', type: 'palette', description: `${season.name} colors for your character and app theme` },
                                    { ...set, id: `hat_seasonal_${season.key}`, name: hatName, icon: season.icon, price: null, rarity: 'rare', type: 'hat', hatShape: shape, hatColors, description: `A limited ${season.name} hat` },
                                    { ...set, id: `skin_seasonal_${season.key}`, name: skinName, icon: season.icon, price: null, rarity: 'epic', type: 'skin', skinColors: { body, head, eye, trim }, description: `A limited ${season.name} character` },
                                    { ...set, id: `acc_seasonal_${season.key}_effect`, name: auraName, icon: 'fa-wand-magic-sparkles', price: null, rarity: 'legendary', type: 'effect', particle: { shape: particle, colors: auraColors }, description: `A limited ${season.name} aura` },
                                    { ...set, id: `hat_seasonal_${season.key}_alt`, name: extraHat, icon: season.icon, price: null, rarity: 'rare', type: 'hat', hatShape: extraShape, hatColors: [season.colors[1], season.colors[0], head], description: `A limited ${season.name} hat` },
                                    { ...set, id: `skin_seasonal_${season.key}_alt`, name: extraSkin, icon: season.icon, price: null, rarity: 'epic', type: 'skin', skinColors: { body: trim, head, eye, trim: body }, description: `A limited ${season.name} character` },
                                    { ...set, id: `acc_seasonal_${season.key}_alt_effect`, name: extraAura, icon: 'fa-wand-magic-sparkles', price: null, rarity: 'legendary', type: 'effect', particle: { shape: extraParticle, colors: [season.colors[1], head, season.colors[0]] }, description: `A limited ${season.name} aura` }
                                ].concat((season.extras || []).map(({ key, ...item }) => ({
                                    ...set, icon: season.icon, price: null,
                                    rarity: { palette: 'uncommon', hat: 'rare', skin: 'epic', effect: 'legendary' }[item.type],
                                    description: `A limited ${season.name} ${item.type === 'effect' ? 'aura' : item.type}`,
                                    ...item,
                                    id: `${item.type === 'effect' ? 'acc' : item.type}_seasonal_${season.key}_${key}${item.type === 'effect' ? '_effect' : ''}`,
                                    ...(item.type === 'palette' ? { color: `seasonal_${season.key}_${key}` } : {})
                                })));
                            });
                        }

                        static currentSeason(date = new Date()) {
                            return StudBudCommunityGames.seasons.find(season => season.month === date.getUTCMonth() + 1);
                        }

                        static get seasonalBox() {
                            const season = StudBudCommunityGames.currentSeason();
                            return { id: 'season', name: `${season.name} Box`, price: 350, icon: season.icon, seasonal: true, season,
                                odds: `Limited ${season.name} set \u00b7 this month only`, chances: { uncommon: 35, rare: 30, epic: 27, legendary: 8 } };
                        }

                        static get permanentSets() {
                            return [
                                { id: 'animal', name: 'Animals', icon: 'fa-paw', price: 220, colors: ['#fbbf24', '#65a30d'], items: [
                                    'skin_animal_chicken', 'skin_animal_cow', 'skin_animal_shark', 'skin_animal_penguin',
                                    'hat_animal_hammerhead', 'hat_animal_rooster', 'hat_animal_cow', 'hat_animal_fox',
                                    'acc_animal_cowbell', 'acc_animal_shark_fin', 'acc_animal_chicken_wings', 'acc_animal_fox_tail',
                                    'acc_animal_paw_effect', 'palette_animal_meadow',
                                    'skin_bee', 'hat_frog', 'hat_bunny', 'hat_cat', 'acc_tail'] },
                                { id: 'space', name: 'Space', icon: 'fa-rocket', price: 240, colors: ['#818cf8', '#38bdf8'], items: [
                                    'skin_alien', 'skin_astronaut', 'skin_cosmic', 'hat_astronaut', 'hat_cosmic',
                                    'acc_jetpack', 'acc_comet_effect', 'palette_galaxy'] },
                                { id: 'fantasy', name: 'Fantasy', icon: 'fa-dragon', price: 240, colors: ['#c084fc', '#facc15'], items: [
                                    'skin_dragon', 'skin_ice', 'hat_wizard', 'hat_unicorn', 'acc_fairy',
                                    'acc_prism_effect', 'palette_royal'] },
                                { id: 'nature', name: 'Nature', icon: 'fa-leaf', price: 240, colors: ['#4ade80', '#f9a8d4'], items: [
                                    'skin_forest', 'skin_sprout', 'hat_flower', 'hat_mushroom', 'acc_lei',
                                    'acc_leaf_effect', 'palette_forest', 'palette_sunflower'] },
                                { id: 'ocean', name: 'Ocean', icon: 'fa-water', price: 240, colors: ['#22d3ee', '#38bdf8'], items: [
                                    'skin_ocean', 'skin_axolotl', 'hat_straw', 'hat_sombrero', 'acc_shades',
                                    'acc_bubble_effect', 'palette_ocean', 'palette_sand'] },
                                { id: 'school', name: 'School', icon: 'fa-graduation-cap', price: 240, colors: ['#fbbf24', '#60a5fa'], items: [
                                    'skin_bookworm', 'skin_robot', 'hat_grad', 'hat_cap', 'acc_backpack', 'acc_glasses',
                                    'acc_music_effect', 'palette_slate'] }
                            ];
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
                                { id: 'skin', name: 'Character Box', price: 260, icon: 'fa-user-astronaut', odds: 'Characters only', chances: { common: 10, uncommon: 35, rare: 30, epic: 20, legendary: 5 } },
                                ...this.permanentSets.map(set => ({ ...set, name: set.id === 'animal' ? 'Animal Box' : `${set.name} Box`, themed: true,
                                    odds: `${set.name} characters, hats, accessories, auras and colors`,
                                    chances: set.id === 'animal' ? { common: 35, uncommon: 35, rare: 22, epic: 8 }
                                        : { common: 25, uncommon: 35, rare: 25, epic: 12, legendary: 2, mythic: 1 } })),
                                { id: 'mythic', name: 'Mythic Box', price: 1000, icon: 'fa-dragon', odds: 'High-tier finds', chances: { epic: 40, legendary: 45, mythic: 15 } }
                            ];
                        }

        getClient() {
            const cloud = window.StudBudCloud;
            if (window.navigator?.onLine === false) throw new Error('This feature needs an internet connection. Your private study tools and solo games work offline.');
            if (cloud?.isGuest?.()) throw new Error('Create a free account to use this. Your guest data comes with you.');
            if (cloud?.offlineMode) throw new Error('Connect your account to use this. Your saved data stays on this device until then.');
            if (!cloud?.client || !cloud.user) throw new Error('Sign in to use this feature.');
            return cloud.client;
        }

        hasAccount() {
            const cloud = window.StudBudCloud;
            return Boolean(cloud?.client && cloud.user && !cloud.offlineMode);
        }

        getUserId() {
            this.getClient();
            return window.StudBudCloud.user.id;
        }

        // Signed-in client when available, otherwise an anonymous guest session (created on first use).
        async publicClient() {
            if (this.hasAccount()) return window.StudBudCloud.client;
            if (window.navigator?.onLine === false) throw new Error('This feature needs an internet connection. Your saved sets and solo games work offline.');
            await window.StudBudCloud.prepareGuestSession();
            return window.StudBudCloud.guestClient;
        }

        async publicDeckClient() {
            if (window.navigator?.onLine === false) throw new Error('The community library needs an internet connection. Your saved decks still work offline.');
            const config = window.StudBudCloud?.loadAccountConfig
                ? await window.StudBudCloud.loadAccountConfig() : window.STUDBUD_SUPABASE_CONFIG;
            if (!config?.url || !config.anonKey || !window.supabase?.createClient) {
                throw new Error('Community connection settings could not load. Check your connection and reload.');
            }
            this.publicDeckReader ||= window.supabase.createClient(config.url, config.anonKey, {
                auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'studbud-public-library' }
            });
            return this.publicDeckReader;
        }

        async readPublicDecks(query = '', deckId = null) {
            const client = await this.publicDeckClient();
            const { data, error } = await client.rpc('studbud_read_community_decks', {
                p_query: String(query || '').trim().slice(0, 100), p_deck_id: deckId
            });
            if (error) {
                if (error.code === 'PGRST202' || error.code === '42883') {
                    throw new Error('Guest library access needs a server update. The site owner must apply the latest community-library database setup.');
                }
                throw new Error(`Could not load community decks: ${error.message}`);
            }
            if (!Array.isArray(data)) throw new Error('The community library returned an invalid deck list. Please try again.');
            return data;
        }

        getGameClient() {
            const cloud = window.StudBudCloud;
            if (window.navigator?.onLine === false) throw new Error('Playing online needs an internet connection.');
            if (this.hasAccount()) return cloud.client;
            if (cloud?.guestClient && cloud.guestUser) return cloud.guestClient;
            return this.getClient();
        }

        async gameClient() {
            return this.hasAccount() ? window.StudBudCloud.client : this.publicClient();
        }

        boxPool(box, owned = []) {
            const types = { hat: ['hat'], accessory: ['accessory', 'effect'], effect: ['effect'], palette: ['palette'], skin: ['skin'] };
            const month = box.id === 'season' ? box.season?.month : null;
            return this.catalog.filter(item => !item.legacy && item.type !== 'pet' && box.chances[item.rarity] > 0
                && (!box.themed || box.items.includes(item.id))
                && (month ? item.season === month : !item.season)
                && (!types[box.id] || types[box.id].includes(item.type)) && !owned.includes(item.id));
        }

        boxChances(box) {
            const pool = this.boxPool(box);
            const weights = Object.entries(box.chances).filter(([rarity]) => pool.some(item => item.rarity === rarity));
            const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
            return Object.fromEntries(weights.map(([rarity, weight]) => [rarity, Math.round(weight / total * 1000) / 10]));
        }

        async searchDecks(query = '') {
            if (!this.hasAccount()) return this.readPublicDecks(query);
            const client = (await this.publicClient());
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
            this.authorCache ||= new Map();
            const fresh = Date.now() - 300000, missing = list.filter(id => !(this.authorCache.get(id)?.at > fresh));
            if (missing.length) {
                const { data, error } = await (await this.publicClient()).rpc('studbud_community_authors', { p_ids: missing });
                if (error) throw new Error(error.message);
                for (const id of missing) this.authorCache.set(id, { at: Date.now(), name: data?.[id] });
            }
            return Object.fromEntries(list.filter(id => this.authorCache.get(id)?.name != null).map(id => [id, this.authorCache.get(id).name]));
        }

        async getUserProfile(userId) {
            const { data, error } = await (await this.publicClient()).rpc('studbud_view_profile', { p_user_id: userId });
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
                back: String(card.back || '').trim(),
                distractors: (card.distractors || []).map(text => String(text).trim()).filter(Boolean).slice(0, 3)
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

        async removedDecks() {
            const client = this.hasAccount() ? this.getClient() : await this.publicDeckClient();
            const { data, error } = await client.rpc('studbud_removed_deck_ids');
            if (error) {
                const failure = new Error(`Could not check removed flashcard sets: ${error.message}`);
                failure.code = error.code;
                throw failure;
            }
            if (!Array.isArray(data)) throw new Error('The removed flashcard set list was invalid.');
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
            if (!this.hasAccount()) {
                const [deck] = await this.readPublicDecks('', deckId);
                if (!deck) throw new Error('This community deck is no longer available.');
                if (!Array.isArray(deck.cards) || deck.cards.length < 2) throw new Error('This community deck no longer contains enough cards to study.');
                return deck;
            }
            const client = await this.publicClient();
            const load = columns => client.from('studbud_community_decks')
                .select(columns)
                .eq('id', deckId)
                .single();
            let { data, error } = await load('id,owner_id,title,description,course,cards');
            if (error && /course/i.test(error.message)) ({ data, error } = await load('id,owner_id,title,description,cards'));
            if (error) throw new Error(`Could not load this community deck: ${error.message}`);
            if (!Array.isArray(data.cards) || data.cards.length < 2) throw new Error('This community deck no longer contains enough cards to study.');
            try {
                const { data: names } = await client.rpc('studbud_community_authors', { p_ids: [data.owner_id] });
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
            this.boardCache?.clear();
            return data;
        }

        // Boards change slowly; a short cache stops tab switches and re-renders from refetching the same ranking.
        async getStudyLeaderboard(period = 'daily', scope = 'global') {
            const key = `${period}:${scope}:${window.StudBudCloud?.user?.id || ''}`;
            this.boardCache ||= new Map();
            const hit = this.boardCache.get(key);
            if (hit && Date.now() - hit.at < 30000) return hit.data;
            const data = await this.fetchStudyLeaderboard(period, scope);
            this.boardCache.set(key, { at: Date.now(), data });
            return data;
        }

        async fetchStudyLeaderboard(period, scope) {
            const client = (await this.publicClient());
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

        async buyMysteryItem(box = 'basic', seasonMonth = StudBudCommunityGames.currentSeason().month) {
            const requestedBox = box === 'season' ? `season:${seasonMonth}` : box;
            const { data, error } = await this.getClient().rpc('studbud_buy_mystery_item', { p_box: requestedBox });
            if (error && box === 'season' && /Unknown mystery box/i.test(error.message || '')) {
                throw new Error('Seasonal boxes need the latest supabase-setup.sql. Ask the site admin to run it.');
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
            window.StudBudNameModeration.assertAllowed(username, 'Username');
            const { data, error } = await this.getClient().rpc('studbud_change_username', { p_username: username });
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Username changes are not set up yet. Re-run supabase-setup.sql in Supabase.' : error.message);
            return data;
        }

        async reportContent(targetType, targetId, reason, details = '') {
            const explanation = String(details).trim();
            if (explanation.length < 10 || explanation.length > 500) throw new Error('Explain what happened in 10 to 500 characters.');
            const { data, error } = await (await this.publicClient()).rpc('studbud_report_content', {
                p_target_type: targetType, p_target_id: targetId, p_reason: reason, p_details: explanation
            });
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Reporting is not set up yet. Re-run supabase-setup.sql in Supabase.' : error.message);
            return data;
        }

        async reportProblem(type, subject, details, username = '') {
            const summary = String(subject).trim(), explanation = String(details).trim();
            const player = String(username).trim().replace(/^@/, '');
            if (!['bug', 'player', 'other'].includes(type)) throw new Error('Choose a report type.');
            if (summary.length < 3 || summary.length > 120) throw new Error('Enter a summary from 3 to 120 characters.');
            if (explanation.length < 10 || explanation.length > 2000) throw new Error('Explain what happened in 10 to 2,000 characters.');
            if (type === 'player' && (!player || player.length > 50)) throw new Error('Enter the player’s exact username.');
            const { data, error } = await (await this.publicClient()).rpc('studbud_submit_report', {
                p_type: type, p_subject: summary, p_details: explanation, p_username: type === 'player' ? player : null
            });
            if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883'
                ? 'Reporting needs a server update. Your report has not been sent. Please use Email support instead.'
                : error.message);
            if (data === null || data === undefined) throw new Error('The server did not confirm your report. Please try again.');
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
            const { data, error } = await (await this.publicClient()).rpc('studbud_get_site_notice');
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Site announcements are not set up yet. Re-run supabase-setup.sql in Supabase.'
                : error.message);
            return data;
        }

        async getSiteNoticeHistory() {
            const { data, error } = await (await this.publicClient()).rpc('studbud_get_site_notice_history');
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
                ? fn === 'studbud_classmates' ? 'Course discovery needs a server update. Re-run supabase-setup.sql in Supabase.'
                    : 'Friends are not set up yet. Re-run supabase-setup.sql in Supabase.' : error.message);
            return data;
        }

        // Classroom RPCs (teacher classes, student joins, class flashcard sets, progress snapshots).
        async classCall(fn, args = {}) {
            if (!/^studbud_(teacher_\w+|my_classes|sync_class_stats)$/.test(fn)) throw new Error('Unknown class action.');
            const { data, error } = await this.getClient().rpc(fn, args);
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'Classes are not set up yet. Re-run supabase-setup.sql in Supabase.' : error.message);
            return data;
        }

        async schoolCall(fn, args = {}) {
            if (!['studbud_school_community', 'studbud_set_school_discovery', 'studbud_community_post',
                'studbud_community_replies', 'studbud_community_delete_post', 'studbud_class_live_game'].includes(fn)) {
                throw new Error('Unknown school community action.');
            }
            const { data, error } = await this.getClient().rpc(fn, args);
            if (error) throw new Error(error.message.includes('Could not find the function')
                ? 'School community needs a server update. Ask the site administrator to apply the latest database setup.'
                : error.message);
            return data;
        }

        async awardSoloCoins(correct, total) {
            const { data, error } = await this.getClient().rpc('studbud_award_solo_coins', { p_correct: correct, p_total: total });
            if (error) throw new Error(`Could not award coins: ${error.message}`);
            return data;
        }

        async recordWaitingGameBest(score) {
            const { data, error } = await this.getClient().rpc('studbud_record_crossing_best', {
                p_score: score
            });
            if (error) throw new Error(`Could not save your warm-up record: ${error.message}`);
            return data;
        }

        async createRoom(roomCode, nickname, deck, mode, options = {}) {
            window.StudBudNameModeration.assertAllowed(nickname, 'Nickname');
            const cards = (deck.cards || []).filter(card => String(card.front || '').trim() && String(card.back || '').trim())
                .map(card => ({ front: String(card.front).trim().slice(0, 1000), back: String(card.back).trim().slice(0, 1000),
                    distractors: (card.distractors || []).map(text => String(text).trim().slice(0, 1000)).filter(Boolean).slice(0, 3) }));
            if (!cards.length) throw new Error('Choose a set with at least one complete card.');
            const { data, error } = await (await this.gameClient()).rpc('studbud_create_game_room', {
                p_code: roomCode,
                p_nickname: nickname,
                p_deck_title: String(deck.title || 'Flashcards').slice(0, 100),
                p_cards: cards,
                p_mode: mode,
                p_options: { ...options, source_deck_id: String(deck.id || '').slice(0, 100), public_deck_id: deck.communityDeckId || deck.communitySourceId || null }
            });
            if (error) {
                const roomError = new Error(`Could not create the game: ${error.message}`);
                roomError.code = error.code;
                throw roomError;
            }
            return this.applyGuestColor(roomCode, data);
        }

        guestColor() {
            const color = String(window.localStorage?.getItem('studbud-guest-color') || '').toLowerCase();
            return this.guestColors.includes(color) ? color : '';
        }

        async applyGuestColor(roomCode, room) {
            const color = this.guestColor();
            if (this.hasAccount() || !color) return room;
            try {
                const client = await this.gameClient();
                const { error } = await client.rpc('studbud_set_guest_color', { p_code: roomCode, p_color: color });
                if (error) return room;
                const { data } = await client.rpc('studbud_get_game_room', { p_code: roomCode });
                return data || room;
            } catch (_) {
                return room;
            }
        }

        async joinRoom(roomCode, nickname) {
            window.StudBudNameModeration.assertAllowed(nickname, 'Nickname');
            const { data, error } = await (await this.gameClient()).rpc('studbud_join_game_room', {
                p_code: roomCode,
                p_nickname: nickname
            });
            if (error) throw new Error(`Could not join the game: ${error.message}`);
            return this.applyGuestColor(roomCode, data);
        }

        async getRoom(roomCode) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_get_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not refresh the game: ${error.message}`);
            return data;
        }

        async startRoom(roomCode) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_start_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not start the game: ${error.message}`);
            return data;
        }

        async setHostMode(roomCode, spectator) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_set_host_mode', {
                p_code: roomCode, p_spectator: Boolean(spectator)
            });
            if (error) throw new Error(`Could not switch host mode: ${error.message}. Apply the latest database setup SQL if this function is missing.`);
            return data;
        }

        async submitAnswer(roomCode, questionNumber, choiceIndex, action = 'steady') {
            const { data, error } = await (await this.gameClient()).rpc('studbud_submit_game_answer', {
                p_code: roomCode,
                p_question_number: questionNumber,
                p_choice_index: choiceIndex,
                p_action: action
            });
            if (error) throw new Error(`Could not submit your answer: ${error.message}`);
            return data;
        }

        async nextQuestion(roomCode) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_advance_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not move to the next question: ${error.message}`);
            return data;
        }

        async finishRoom(roomCode) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_finish_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not end the game: ${error.message}`);
            return data;
        }

        async extendRoom(roomCode, minutes) {
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error('Choose a whole number of minutes from 1 to 60.');
            const { data, error } = await (await this.gameClient()).rpc('studbud_extend_game_room', {
                p_code: roomCode, p_minutes: minutes
            });
            if (error) throw new Error(`Could not add time: ${error.message}. If the function is missing, apply the current database setup SQL.`);
            return data;
        }

        async kickPlayer(roomCode, playerId) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_kick_game_player', {
                p_code: roomCode,
                p_player_id: playerId
            });
            if (error) throw new Error(`Could not remove player: ${error.message}`);
            return data;
        }

        async getCards(roomCode) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_get_game_cards', { p_code: roomCode });
            if (error) throw new Error(`Could not load questions: ${error.message}`);
            return (Array.isArray(data) ? data : []).filter(card => card?.front && card?.back);
        }

        async saveChessState(roomCode, state) {
            const { error } = await (await this.gameClient()).rpc('studbud_save_chess_state', { p_code: roomCode, p_state: state });
            if (error) throw new Error(`Could not save the chess board: ${error.message}`);
        }

        async saveDefenseState(roomCode, state) {
            const { error } = await (await this.gameClient()).rpc('studbud_save_defense_state', { p_code: roomCode, p_state: state });
            if (error) throw new Error(`Could not save the Tower Defense battle: ${error.message}`);
        }

        async reportScore(roomCode, score, answered, correct = 0) {
            const { error } = await (await this.gameClient()).rpc('studbud_report_game_score', {
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
            return this.getGameClient().channel(`studbud-room-${roomCode}`, {
                config: { broadcast: { self: false, ack: false } }
            });
        }

        watchRoom(roomCode, onUpdate) {
            const client = this.getGameClient();
            const channel = client.channel(`studbud-lobby-${roomCode}`, { config: { presence: { key: (window.StudBudCloud?.user || window.StudBudCloud?.guestUser)?.id || 'player' } } });
            let closed = false;
            channel.on('presence', { event: 'sync' }, () => { if (!closed) onUpdate(); });
            channel.subscribe(status => {
                if (!closed && status === 'SUBSCRIBED') {
                    channel.track({ joined: true }).catch(() => {});
                    onUpdate();
                }
            });
            return () => { closed = true; client.removeChannel(channel); };
        }

        async leaveRoom(roomCode) {
            const { data, error } = await (await this.gameClient()).rpc('studbud_leave_game_room', {
                p_code: roomCode
            });
            if (error) throw new Error(`Could not leave the game: ${error.message}`);
            return data;
        }
    }

    window.StudBudCommunityGames = new StudBudCommunityGames();
})(window);
