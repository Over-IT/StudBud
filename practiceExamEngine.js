/**
 * practiceExamEngine.js - File 9 of 9
 * Contains Universal Importer, Exam Simulator, and Arcade Engines (Cash Arena, Tower Defense, RPG)
 */

window.PracticeExamEngine = (() => {
  
  // ==========================================
  // 1. UNIVERSAL IMPORTER & PARSER
  // ==========================================
  const UniversalImporter = {
    /**
     * Parses raw tabular flashcard, CSV, or gradebook text.
     * Auto-detects delimiters.
     */
    parseRawText: function (rawText) {
      if (!rawText || rawText.trim() === '') return [];
      
      const lines = rawText.split('\n').filter(line => line.trim() !== '');
      const potentialDelimiters = ['\t', ',', ';', '-', '|', ':', ' - '];
      
      // Auto-detect delimiter based on frequency in the first few lines
      let bestDelimiter = '\t';
      let maxSplits = 0;
      
      for (const delim of potentialDelimiters) {
        const sampleCount = lines.slice(0, 3).reduce((acc, line) => acc + (line.split(delim).length - 1), 0);
        if (sampleCount > maxSplits) {
          maxSplits = sampleCount;
          bestDelimiter = delim;
        }
      }

      const parsedDeck = lines.map((line, index) => {
        const parts = line.split(bestDelimiter);
        return {
          id: `card_${Date.now()}_${index}`,
          term: parts[0] ? parts[0].trim() : `Unknown Term ${index}`,
          definition: parts[1] ? parts.slice(1).join(bestDelimiter).trim() : 'No definition provided',
          masteryScore: 0 // Default BKT mastery
        };
      });

      return parsedDeck;
    }
  };

  // ==========================================
  // 2. PRACTICE EXAM SIMULATOR
  // ==========================================
  const ExamSimulator = {
    generateExam: function (deck, config = { mc: 5, match: 5, fitb: 5, sa: 5 }) {
      const exam = {
        startTime: Date.now(),
        questions: []
      };

      let shuffled = [...deck].sort(() => 0.5 - Math.random());
      
      // Multiple Choice Generator
      for (let i = 0; i < config.mc && shuffled.length > 0; i++) {
        const card = shuffled.pop();
        exam.questions.push({
          type: 'MCQ',
          prompt: `What is the definition of "${card.term}"?`,
          answer: card.definition,
          options: this.getDistractors(card.definition, deck, 3),
          cardRef: card
        });
      }

      // Fill in the Blank Generator
      for (let i = 0; i < config.fitb && shuffled.length > 0; i++) {
        const card = shuffled.pop();
        exam.questions.push({
          type: 'FITB',
          prompt: `Complete the term: ${card.definition.substring(0, 20)}...`,
          answer: card.term,
          cardRef: card
        });
      }
      
      // Matching Columns (Returns a pair of arrays to render)
      exam.matchingPool = shuffled.splice(0, config.match).map(c => ({ term: c.term, definition: c.definition, id: c.id }));
      
      // Short Answer Generator
      for (let i = 0; i < config.sa && shuffled.length > 0; i++) {
        const card = shuffled.pop();
        exam.questions.push({
          type: 'SA',
          prompt: `Explain "${card.term}" in your own words.`,
          answer: card.definition, // Used for semantic grading later
          cardRef: card
        });
      }

      return exam;
    },

    getDistractors: function (correctAnswer, deck, count) {
      let distractors = deck
        .filter(c => c.definition !== correctAnswer)
        .map(c => c.definition)
        .sort(() => 0.5 - Math.random())
        .slice(0, count);
      let options = [correctAnswer, ...distractors].sort(() => 0.5 - Math.random());
      return options;
    },

    evaluateExam: function (userAnswers, timeTakenSeconds, originalDeck) {
      const diagnostic = {
        score: 0,
        total: userAnswers.length,
        stressFactor: timeTakenSeconds < 60 ? 'High' : 'Normal', // Stress timer flag
        missedConcepts: [],
        remediationDeck: []
      };

      userAnswers.forEach(ans => {
        if (ans.isCorrect) {
          diagnostic.score++;
        } else {
          diagnostic.missedConcepts.push(ans.cardRef.term);
          diagnostic.remediationDeck.push(ans.cardRef);
        }
      });

      return diagnostic;
    }
  };

  // ==========================================
  // 3. ARCADE GAME 1: CASH ARENA (Gimkit-Style)
  // ==========================================
  class CashArena {
    constructor() {
      this.balance = 0;
      this.multiplier = 1;
      this.streak = 0;
      this.shieldActive = false;
      this.inflationRate = 1.0;
      
      this.shop = {
        multiplierUpgrade: { cost: 50, level: 1 },
        streakShield: { cost: 200, stock: 0 },
        insurance: { cost: 500, active: false }
      };
    }

    answerQuestion(isCorrect) {
      if (isCorrect) {
        this.streak++;
        const earnings = (10 * this.multiplier * (1 + (this.streak * 0.1))) / this.inflationRate;
        this.balance += earnings;
        this.applyInflation();
        return { success: true, earned: earnings, message: `+${earnings.toFixed(2)} Cash!` };
      } else {
        if (this.shieldActive) {
          this.shieldActive = false;
          this.streak = 0;
          return { success: false, lost: 0, message: "Shield broke! Streak reset." };
        }
        this.streak = 0;
        const penalty = (5 * this.inflationRate);
        this.balance = Math.max(0, this.balance - penalty);
        return { success: false, lost: penalty, message: `Lost ${penalty.toFixed(2)} Cash.` };
      }
    }

    buyUpgrade(itemKey) {
      const item = this.shop[itemKey];
      if (item && this.balance >= item.cost) {
        this.balance -= item.cost;
        if (itemKey === 'multiplierUpgrade') {
          this.multiplier += 0.5;
          item.cost *= 1.5; // Shop price inflation
        } else if (itemKey === 'streakShield') {
          this.shieldActive = true;
        }
        return true;
      }
      return false;
    }

    applyInflation() {
      // Market inflation engine increases difficulty over time
      this.inflationRate += 0.02;
    }
  }

  // ==========================================
  // 4. ARCADE GAME 2: TOWER DEFENSE (Blooket-Style)
  // ==========================================
  class TowerDefenseEngine {
    constructor(canvasWidth, canvasHeight) {
      this.width = canvasWidth;
      this.height = canvasHeight;
      this.path = [
        { x: 0, y: 100 }, { x: 300, y: 100 }, 
        { x: 300, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }
      ]; // Vector pathfinding nodes
      this.enemies = [];
      this.towers = [];
      this.wave = 1;
      this.baseHealth = 100;
    }

    spawnWave() {
      const count = this.wave * 5;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          this.enemies.push({ x: this.path[0].x, y: this.path[0].y, targetNode: 1, hp: 10 * this.wave, speed: 2, freezeTimer: 0 });
        }, i * 1000);
      }
      this.wave++;
    }

    placeTower(type, x, y) {
      const towerStats = {
        'PencilTurret': { range: 100, damage: 5, cooldown: 30, type: 'kinetic' },
        'CalculatorLaser': { range: 250, damage: 15, cooldown: 100, type: 'energy' },
        'TextbookMortar': { range: 150, damage: 25, cooldown: 150, type: 'splash' },
        'ProtractorFreezeField': { range: 80, damage: 1, cooldown: 50, type: 'freeze' }
      };
      if (towerStats[type]) {
        this.towers.push({ type, x, y, ...towerStats[type], currentCooldown: 0 });
      }
    }

    update() {
      // Update Enemies (Vector Pathfinding)
      this.enemies.forEach((e, idx) => {
        if (e.freezeTimer > 0) { e.freezeTimer--; return; } // Frozen by Protractor
        
        let target = this.path[e.targetNode];
        if (!target) {
          this.baseHealth -= e.hp; // Reached end
          this.enemies.splice(idx, 1);
          return;
        }

        let dx = target.x - e.x;
        let dy = target.y - e.y;
        let dist = Math.hypot(dx, dy);

        if (dist < e.speed) {
          e.x = target.x;
          e.y = target.y;
          e.targetNode++;
        } else {
          e.x += (dx / dist) * e.speed;
          e.y += (dy / dist) * e.speed;
        }
      });

      // Update Towers
      this.towers.forEach(t => {
        if (t.currentCooldown > 0) t.currentCooldown--;
        if (t.currentCooldown <= 0) {
          // Find target
          let target = this.enemies.find(e => Math.hypot(e.x - t.x, e.y - t.y) <= t.range);
          if (target) {
            target.hp -= t.damage;
            if (t.type === 'freeze') target.freezeTimer = 60;
            t.currentCooldown = t.cooldown;
          }
        }
      });

      this.enemies = this.enemies.filter(e => e.hp > 0);
    }
  }

  // ==========================================
  // 5. ARCADE GAME 3: BOSS RPG BATTLE
  // ==========================================
  class BossBattleEngine {
    constructor(bossSubject) {
      this.state = 'PLAYER_TURN'; // Turn State Machine
      this.player = { hp: 100, maxHp: 100, inventory: ['Potion', 'Elixir'], masteryBKT: 0.85 };
      
      const bosses = {
        'Science': { name: 'Mecha-Einstein', hp: 500, element: 'Logic', loot: 'Quantum Core' },
        'History': { name: 'Chronos', hp: 600, element: 'Time', loot: 'Sands of Era' }
      };
      this.boss = bosses[bossSubject] || { name: 'Generic Boss', hp: 300, element: 'Neutral', loot: 'Gold Coin' };
    }

    playerAttack(attackType, questionAnsweredCorrectly) {
      if (this.state !== 'PLAYER_TURN') return { log: "Not your turn!" };
      
      if (questionAnsweredCorrectly) {
        // Damage Math scaled by BKT mastery
        let baseDamage = 25;
        let masteryBonus = baseDamage * this.player.masteryBKT;
        let totalDamage = Math.floor(baseDamage + masteryBonus);
        
        this.boss.hp -= totalDamage;
        this.state = 'BOSS_TURN';
        
        if (this.boss.hp <= 0) {
          this.state = 'VICTORY';
          return { log: `Critical Hit! ${totalDamage} damage. Boss defeated! Loot dropped: ${this.boss.loot}` };
        }
        
        return { log: `Correct! You hit ${this.boss.name} for ${totalDamage} damage.`, damage: totalDamage };
      } else {
        this.state = 'BOSS_TURN';
        return { log: "Incorrect! Your attack missed." };
      }
    }

    bossTurn() {
      if (this.state !== 'BOSS_TURN') return;
      
      let damage = Math.floor(Math.random() * 15) + 10;
      this.player.hp -= damage;
      
      if (this.player.hp <= 0) {
        this.state = 'DEFEAT';
        return { log: `${this.boss.name} used Elemental Blast! You took ${damage} damage. Game Over.` };
      }
      
      this.state = 'PLAYER_TURN';
      return { log: `${this.boss.name} strikes back! You took ${damage} damage.` };
    }
  }

  // EXPORTS
  return {
    Importer: UniversalImporter,
    Simulator: ExamSimulator,
    Games: {
      CashArena,
      TowerDefenseEngine,
      BossBattleEngine
    }
  };

})();