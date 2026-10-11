const fs=require('fs');
let s=fs.readFileSync('app.js','utf8');s=s.replace(/drawBlockyBrook/g,'drawWaitingWarmup').replace("'Restart Blocky Brook'","'Restart warm-up'");s=s.replace("            ctx.fillStyle = '#f5ffe7'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText('BLOCKY BROOK', 14, 21);\r\n            ctx.textAlign = 'right'; ctx.fillText('ROWS ' + runner.score + ' / BEST ' + runner.best, width - 14, 21);", "            ctx.fillStyle = '#f5ffe7'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'right'; ctx.fillText('ROWS ' + runner.score + ' / BEST ' + runner.best, width - 14, 21);");fs.writeFileSync('app.js',s,'utf8');
s=fs.readFileSync('index.html','utf8').replace('Warm-up: Blocky Brook','Warm-up').replace('Blocky Brook endless hopper. Tap to hop forward or swipe to move in any direction.','Pregame warm-up: hop across roads, rivers and tracks. Tap to hop forward or swipe to move in any direction.');fs.writeFileSync('index.html',s,'utf8');
s=fs.readFileSync('multiplayerGames.js','utf8');const a=s.indexOf('        updateCamera(w, h, dt = 0) {'),b=s.indexOf('        edgeArrow(',a);if(a<0||b<0)throw Error('Camera block');s=s.slice(0,a)+`        updateCamera(w, h, dt = 0) {
            const minX = Math.min(...this.solids.map(p => p.x)) - 80;
            const maxX = Math.max(...this.solids.map(p => p.x + p.w)) + 80;
            const minY = Math.min(this.orb.y - 24, ...this.zones.map(zone => zone.y - 150)) - 70;
            const maxY = Math.max(...this.solids.map(p => p.y + p.h)) + 70;
            const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
            const fit = Math.min(w / (maxX - minX), h / (maxY - minY));
            // Session coordinates are already scaled for CSS size and DPR by the engine.
            const cssScale = this.s.scale || 1, cssW = w * cssScale, cssH = h * cssScale;
            const phone = !this.s.preview && (cssW < 600 || (cssW < 1100 && cssH < 500));
            const z = phone ? Math.max(fit, 0.72 / cssScale) : fit;
            const halfW = w / (2 * z), halfH = h / (2 * z);
            const fitsX = halfW * 2 >= maxX - minX - 0.01;
            const fitsY = halfH * 2 >= maxY - minY - 0.01;
            const targetX = fitsX ? centerX : clamp(this.me.x + 17, minX + halfW, maxX - halfW);
            const targetY = fitsY ? centerY : clamp(this.me.y + 28, minY + halfH, maxY - halfH);
            const follow = 1 - Math.exp(-Math.max(0, dt) * 8);
            this.view.x = fitsX ? centerX : clamp(lerp(this.view.x, targetX, follow), minX + halfW, maxX - halfW);
            this.view.y = fitsY ? centerY : clamp(lerp(this.view.y, targetY, follow), minY + halfH, maxY - halfH);
            this.view.z = z;
            this.offX = w / 2 - this.view.x * z;
            this.offY = h / 2 - this.view.y * z;
            this.cameraBounds = { minX, maxX, minY, maxY, fitsX, fitsY };
        }

`+s.slice(b);fs.writeFileSync('multiplayerGames.js',s,'utf8');
