/* ============ Deep Digger — mine, loot, upgrade ============
   A pocket roguelike: dig downward through dirt and rock, grab treasure,
   then climb back to the surface to sell your haul and buy better gear
   from the shopkeeper. Better gear lets you dig deeper for richer loot.

   Controls
     - Swipe up/down/left/right to dig & move that way. Hold and drag to
       keep digging in a direction.
     - WASD or arrow keys move & dig.
     - At the surface, tap the shop (or press the SHOP button) to upgrade.
   ========================================================= */
(function () {
    "use strict";

    const COLS = 9;                 // mine width
    const SURFACE_Y = 0;            // walkable ground row; y>0 is underground
    const SKY_ROWS = 2;            // rows of sky drawn above the surface

    // Topsoil: the band just below the surface is always plain dirt (no rock
    // or hazards) so the starting pickaxe can reach all of it. It is seeded
    // with a guaranteed loot budget, so a player who clears it can always
    // afford the first pickaxe (and then mine the rock beneath).
    const TOPSOIL = 6;              // rows 1..TOPSOIL are guaranteed dirt
    const STARTER_LOOT = 70;        // coins guaranteed reachable before any upgrade

    // Tile kinds. `hard` = dig power required to break it.
    const T = {
        EMPTY: 0,   // dug out / air
        DIRT: 1,    // hard 1
        ROCK: 2,    // hard 2
        DENSE: 3,   // hard 3
        OBSID: 4,   // hard 4
        HAZARD: 5,  // gas pocket — hurts when dug
        BEDROCK: 9  // walls at the edges, never breakable
    };

    const HARD = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 1 };

    // Treasure tiers carried inside a dug tile.
    const LOOT = {
        none: 0,
        coin: 3,
        gold: 9,
        gem: 22,
        diamond: 60
    };

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        const kids = !!host.kids;

        let cell, offX, topPad;
        let viewRows, camY;
        let rafId;

        // World: sparse map of "x,y" -> { type, hard, loot }
        const world = new Map();
        let player, stats, carry, banked, depthBest, mode, shopRects, msg, msgT;
        let flash = 0;            // damage flash timer
        let particles = [];

        // ----- Upgradeable stats -----
        function baseStats() {
            return {
                dig: 1,             // dig power (breaks HARD <= dig)
                digLvl: 0,
                lamp: 0,            // light radius levels
                bagLvl: 0,
                stamLvl: 0,
                hpLvl: 0,
                hp: 3,              // current hp
                stam: 20            // current stamina
            };
        }

        function maxHP() { return 3 + stats.hpLvl; }
        function maxStam() { return (kids ? 28 : 20) + stats.stamLvl * 10; }
        function bagCap() { return 30 + stats.bagLvl * 30; }
        function lampR() { return 2.4 + stats.lamp * 0.8; }

        // Shop catalogue. cost() reads current level so prices scale.
        const SHOP = [
            {
                key: "dig", name: "Pickaxe", emoji: "⛏️",
                desc: () => "Break tier-" + (stats.dig + 1) + " rock",
                max: 3, lvl: () => stats.digLvl,
                cost: () => [40, 110, 240][stats.digLvl],
                buy: () => { stats.digLvl++; stats.dig++; }
            },
            {
                key: "lamp", name: "Lantern", emoji: "\u{1F3EE}",
                desc: () => "See further underground",
                max: 4, lvl: () => stats.lamp,
                cost: () => [25, 70, 150, 280][stats.lamp],
                buy: () => { stats.lamp++; }
            },
            {
                key: "stam", name: "Battery", emoji: "\u{1F50B}",
                desc: () => "+10 max stamina",
                max: 4, lvl: () => stats.stamLvl,
                cost: () => [30, 80, 170, 320][stats.stamLvl],
                buy: () => { stats.stamLvl++; }
            },
            {
                key: "bag", name: "Big Bag", emoji: "\u{1F392}",
                desc: () => "+30 carry capacity",
                max: 4, lvl: () => stats.bagLvl,
                cost: () => [30, 85, 180, 340][stats.bagLvl],
                buy: () => { stats.bagLvl++; }
            },
            {
                key: "hp", name: "Armor", emoji: "\u{1F6E1}️",
                desc: () => "+1 max heart",
                max: 4, lvl: () => stats.hpLvl,
                cost: () => [50, 120, 250, 450][stats.hpLvl],
                buy: () => { stats.hpLvl++; }
            }
        ];

        // ---------- World generation ----------
        function key(x, y) { return x + "," + y; }

        function genTile(x, y) {
            if (x < 0 || x >= COLS) return { type: T.BEDROCK, hard: 99, loot: 0 };
            if (y <= SURFACE_Y) return { type: T.EMPTY, hard: 0, loot: 0 };
            // Topsoil is plain dirt; seedTopsoil() fills in its guaranteed loot.
            if (y <= TOPSOIL) return { type: T.DIRT, hard: 1, loot: 0 };

            const depth = y;
            const r = Math.random();

            // Hazard (gas) chance grows with depth.
            const hazChance = Math.min(0.12, 0.02 + depth * 0.004);
            if (r < hazChance) return { type: T.HAZARD, hard: 1, loot: 0 };

            // Rock hardness distribution shifts down with depth.
            let type = T.DIRT;
            const rr = Math.random();
            if (depth > 22 && rr < 0.22) type = T.OBSID;
            else if (depth > 12 && rr < 0.40) type = T.DENSE;
            else if (depth > 4 && rr < 0.52) type = T.ROCK;
            else if (rr < 0.30) type = T.ROCK;

            // Treasure embedded in the tile, richer & likelier deeper.
            let loot = 0;
            const tChance = Math.min(0.32, 0.08 + depth * 0.006);
            if (Math.random() < tChance) {
                const t = Math.random();
                if (depth > 24 && t < 0.06) loot = LOOT.diamond;
                else if (depth > 14 && t < 0.16) loot = LOOT.gem;
                else if (depth > 6 && t < 0.40) loot = LOOT.gold;
                else loot = LOOT.coin;
            }
            return { type: type, hard: HARD[type] || 1, loot: loot };
        }

        function tileAt(x, y) {
            const k = key(x, y);
            let t = world.get(k);
            if (!t) { t = genTile(x, y); world.set(k, t); }
            return t;
        }

        // Lay the topsoil as plain dirt and scatter a guaranteed loot budget
        // across it, so the accessible (dig-1) dirt always holds enough coins
        // to buy the first pickaxe — the gate that unlocks mining rock.
        function seedTopsoil() {
            const cells = [];
            for (let y = 1; y <= TOPSOIL; y++) {
                for (let x = 0; x < COLS; x++) {
                    world.set(key(x, y), { type: T.DIRT, hard: 1, loot: 0 });
                    cells.push({ x: x, y: y });
                }
            }
            // Fisher–Yates shuffle so loot lands in random tiles each run.
            for (let i = cells.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = cells[i]; cells[i] = cells[j]; cells[j] = tmp;
            }
            // Hand out the budget in coin/gold chunks across distinct tiles.
            let budget = STARTER_LOOT, ci = 0;
            while (budget > 0 && ci < cells.length) {
                const c = cells[ci++];
                const val = (budget >= LOOT.gold && Math.random() < 0.4) ? LOOT.gold : LOOT.coin;
                world.get(key(c.x, c.y)).loot = val;
                budget -= val;
            }
        }

        // ---------- Sizing ----------
        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const W = canvas.clientWidth;
            const H = canvas.clientHeight;
            topPad = 64;                       // HUD band
            cell = Math.floor(W / COLS);
            offX = Math.floor((W - cell * COLS) / 2);
            viewRows = Math.ceil((H - topPad) / cell) + 2;
        }

        // ---------- Game state ----------
        function reset() {
            world.clear();
            seedTopsoil();
            stats = baseStats();
            player = { x: Math.floor(COLS / 2), y: SURFACE_Y };
            carry = 0;
            banked = 0;
            depthBest = 0;
            mode = "play";          // "play" | "shop"
            shopRects = [];
            msg = "Swipe to dig! ⬇️";
            msgT = 240;
            particles = [];
            camY = 0;
            host.setScore(0);
        }

        function setMsg(text, frames) { msg = text; msgT = frames || 150; }

        function spawnParticles(px, py, color, n) {
            for (let i = 0; i < n; i++) {
                particles.push({
                    x: px, y: py,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -Math.random() * 3 - 1,
                    life: 26 + Math.random() * 14,
                    color: color
                });
            }
        }

        // ---------- Actions ----------
        function tryMove(dx, dy) {
            if (mode !== "play") return;
            const nx = player.x + dx;
            const ny = player.y + dy;
            if (nx < 0 || nx >= COLS) return;
            if (ny < SURFACE_Y) return;             // can't fly into the sky

            // Surface row & above are always walkable.
            if (ny <= SURFACE_Y) {
                player.x = nx; player.y = ny;
                arriveSurface();
                return;
            }

            const t = tileAt(nx, ny);
            if (t.type === T.EMPTY) {
                player.x = nx; player.y = ny;
                onEnter(nx, ny);
                return;
            }
            if (t.type === T.BEDROCK) { SGSound.play("wrong"); return; }

            // It's solid — try to dig it.
            dig(nx, ny, t);
        }

        function dig(x, y, t) {
            if (stats.stam <= 0) {
                setMsg("Out of stamina — head up! ↑", 120);
                SGSound.play("wrong");
                host.vibrate(20);
                return;
            }
            if (HARD[t.type] > stats.dig && t.type !== T.HAZARD) {
                setMsg("Rock too hard — upgrade pickaxe", 120);
                SGSound.play("wrong");
                host.vibrate([20, 30, 20]);
                spawnParticles(cx(x), cyRow(y), "#6b7280", 4);
                return;
            }

            stats.stam--;
            const cxp = cx(x), cyp = cyRow(y);

            if (t.type === T.HAZARD) {
                world.set(key(x, y), { type: T.EMPTY, hard: 0, loot: 0 });
                damage(1, "Gas pocket! −❤️");
                spawnParticles(cxp, cyp, "#7CFF9E", 14);
                player.x = x; player.y = y;
                return;
            }

            // Break it.
            const loot = t.loot;
            world.set(key(x, y), { type: T.EMPTY, hard: 0, loot: 0 });
            SGSound.play("drop");
            host.vibrate(10);
            spawnParticles(cxp, cyp, tileColor(t.type), 6);
            player.x = x; player.y = y;

            if (loot > 0) collect(loot, cxp, cyp);
            onEnter(x, y);
        }

        function collect(value, px, py) {
            const space = bagCap() - carry;
            if (space <= 0) {
                setMsg("Bag full! Sell at the surface", 120);
                SGSound.play("wrong");
                return;
            }
            const got = Math.min(value, space);
            carry += got;
            const label = value >= LOOT.diamond ? "\u{1F48E} Diamond!" :
                value >= LOOT.gem ? "\u{1F537} Gem!" :
                value >= LOOT.gold ? "Gold!" : "Coins";
            setMsg("+" + got + " — " + label, 90);
            SGSound.play(value >= LOOT.gem ? "perfect" : "eat");
            host.vibrate(value >= LOOT.gem ? [15, 30, 30] : 12);
            spawnParticles(px, py, "#ffd35a", value >= LOOT.gem ? 16 : 8);
        }

        function onEnter(x, y) {
            if (y > depthBest) depthBest = y;
            if (y <= SURFACE_Y) arriveSurface();
        }

        function arriveSurface() {
            // Cash in the haul and refill.
            if (carry > 0) {
                banked += carry;
                setMsg("Sold haul: +" + carry + " coins \u{1F4B0}", 150);
                SGSound.play("score");
                host.vibrate([10, 20, 10]);
                carry = 0;
                host.setScore(banked);
            }
            if (stats.hp < maxHP() || stats.stam < maxStam()) {
                stats.hp = maxHP();
                stats.stam = maxStam();
            }
        }

        function damage(n, text) {
            stats.hp -= n;
            flash = 14;
            setMsg(text || "Ouch!", 110);
            SGSound.play("hit");
            host.vibrate([30, 40, 40]);
            if (stats.hp <= 0) collapse();
        }

        function collapse() {
            // Roguelike setback: lose the carried haul, wake at the surface.
            // Banked coins and upgrades are kept.
            SGSound.play("gameover");
            host.vibrate([60, 40, 80, 40, 120]);
            carry = 0;
            player.x = Math.floor(COLS / 2);
            player.y = SURFACE_Y;
            stats.hp = maxHP();
            stats.stam = maxStam();
            setMsg("You blacked out! Hauled back up empty-handed.", 220);
        }

        // ---------- Shop ----------
        function openShop() {
            if (player.y !== SURFACE_Y) { setMsg("Return to the surface to shop", 90); return; }
            mode = "shop";
            SGSound.play("tap");
        }
        function closeShop() { mode = "play"; SGSound.play("tap"); }

        function buy(item) {
            if (item.lvl() >= item.max) { SGSound.play("wrong"); return; }
            const cost = item.cost();
            if (banked < cost) { setMsg("Not enough coins", 80); SGSound.play("wrong"); return; }
            banked -= cost;
            item.buy();
            // Refill to new maxima so upgrades feel immediate.
            stats.hp = maxHP();
            stats.stam = maxStam();
            host.setScore(banked);
            SGSound.play("match");
            host.vibrate(20);
            setMsg(item.name + " upgraded!", 90);
        }

        // ---------- Coordinate helpers ----------
        function cx(col) { return offX + col * cell + cell / 2; }
        function cyRow(row) { return topPad + (row - camY) * cell + cell / 2; }

        // ---------- Drawing ----------
        function tileColor(type) {
            switch (type) {
                case T.DIRT: return "#7a4a28";
                case T.ROCK: return "#6b6f76";
                case T.DENSE: return "#4a5560";
                case T.OBSID: return "#2b2438";
                case T.HAZARD: return "#3a7d4a";
                case T.BEDROCK: return "#15151f";
                default: return "#1c1320";
            }
        }

        function update() {
            // Camera eases toward keeping the miner a bit above centre.
            const targetCam = player.y - Math.floor((viewRows - 2) * 0.42);
            camY += (Math.max(SURFACE_Y - SKY_ROWS, targetCam) - camY) * 0.18;

            if (flash > 0) flash--;
            if (msgT > 0) msgT--;

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--;
                if (p.life <= 0) particles.splice(i, 1);
            }
        }

        function draw() {
            const W = canvas.clientWidth, H = canvas.clientHeight;
            ctx.clearRect(0, 0, W, H);

            const startRow = Math.floor(camY) - 1;
            const endRow = startRow + viewRows + 2;
            const lr = lampR();
            const pcx = cx(player.x), pcy = cyRow(player.y);

            for (let row = startRow; row <= endRow; row++) {
                for (let col = 0; col < COLS; col++) {
                    const x = offX + col * cell;
                    const y = topPad + (row - camY) * cell;

                    if (row < SURFACE_Y) {
                        // Sky
                        ctx.fillStyle = "#2a2f5a";
                        ctx.fillRect(x, y, cell + 1, cell + 1);
                        continue;
                    }
                    if (row === SURFACE_Y) {
                        ctx.fillStyle = "#3f8a45";   // grass
                        ctx.fillRect(x, y, cell + 1, cell + 1);
                        ctx.fillStyle = "#357a3c";
                        ctx.fillRect(x, y, cell + 1, cell * 0.28);
                        continue;
                    }

                    const t = tileAt(col, row);

                    // Distance-based lighting.
                    const dx = col - player.x, dy = row - player.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    let light = 1 - (dist - lr) / 2.2;
                    light = Math.max(0.08, Math.min(1, light));

                    if (t.type === T.EMPTY) {
                        ctx.fillStyle = shade("#1c1320", light);
                        ctx.fillRect(x, y, cell + 1, cell + 1);
                    } else {
                        ctx.fillStyle = shade(tileColor(t.type), light);
                        ctx.fillRect(x, y, cell + 1, cell + 1);
                        // texture speckle
                        if (light > 0.25 && t.type !== T.BEDROCK) {
                            ctx.fillStyle = shade("#000000", 1 - light * 0.5);
                            ctx.globalAlpha = 0.12;
                            ctx.fillRect(x + cell * 0.18, y + cell * 0.2, cell * 0.16, cell * 0.16);
                            ctx.fillRect(x + cell * 0.6, y + cell * 0.55, cell * 0.14, cell * 0.14);
                            ctx.globalAlpha = 1;
                        }
                        // Treasure glint (only when lit).
                        if (t.loot > 0 && light > 0.35) {
                            drawGem(x + cell / 2, y + cell / 2, t.loot, light);
                        }
                        // Hazard bubbles.
                        if (t.type === T.HAZARD && light > 0.25) {
                            ctx.fillStyle = shade("#9affb4", light);
                            ctx.globalAlpha = 0.8;
                            ctx.beginPath();
                            ctx.arc(x + cell * 0.4, y + cell * 0.45, cell * 0.1, 0, 7);
                            ctx.arc(x + cell * 0.62, y + cell * 0.62, cell * 0.07, 0, 7);
                            ctx.fill();
                            ctx.globalAlpha = 1;
                        }
                    }
                }
            }

            // Shop building on the surface (top-right corner of the mine).
            drawShopBuilding();

            // Particles
            for (const p of particles) {
                ctx.globalAlpha = Math.max(0, p.life / 36);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
            ctx.globalAlpha = 1;

            // Player (miner)
            drawMiner(pcx, pcy);

            // Vignette under HUD
            ctx.fillStyle = "#12121f";
            ctx.fillRect(0, 0, W, topPad);

            drawHUD();

            if (flash > 0) {
                ctx.fillStyle = "rgba(255,60,60," + (flash / 14) * 0.35 + ")";
                ctx.fillRect(0, topPad, W, H - topPad);
            }

            if (mode === "shop") drawShop();
        }

        function drawGem(cxp, cyp, loot, light) {
            let color = "#ffd35a";
            if (loot >= LOOT.diamond) color = "#9be8ff";
            else if (loot >= LOOT.gem) color = "#5ad1ff";
            else if (loot >= LOOT.gold) color = "#ffcf3f";
            ctx.fillStyle = shade(color, light);
            ctx.beginPath();
            const r = cell * (loot >= LOOT.gem ? 0.22 : 0.16);
            ctx.moveTo(cxp, cyp - r);
            ctx.lineTo(cxp + r, cyp);
            ctx.lineTo(cxp, cyp + r);
            ctx.lineTo(cxp - r, cyp);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillRect(cxp - r * 0.2, cyp - r * 0.5, r * 0.3, r * 0.5);
        }

        function drawMiner(px, py) {
            const r = cell * 0.34;
            // body
            ctx.fillStyle = "#3b7bd6";
            roundRect(px - r, py - r * 0.2, r * 2, r * 1.5, r * 0.4);
            // head
            ctx.fillStyle = "#f0c08a";
            ctx.beginPath();
            ctx.arc(px, py - r * 0.5, r * 0.7, 0, 7);
            ctx.fill();
            // helmet
            ctx.fillStyle = "#ffcf3f";
            ctx.beginPath();
            ctx.arc(px, py - r * 0.7, r * 0.72, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(px - r * 0.72, py - r * 0.72, r * 1.44, r * 0.18);
            // headlamp glow
            ctx.fillStyle = "rgba(255,240,180,0.9)";
            ctx.beginPath();
            ctx.arc(px, py - r * 0.95, r * 0.16, 0, 7);
            ctx.fill();
        }

        let shopBtnRect = null;
        function drawShopBuilding() {
            const col = COLS - 1;
            const x = offX + col * cell;
            const y = topPad + (SURFACE_Y - camY) * cell - cell * 0.9;
            const w = cell, h = cell * 0.9;
            // hut
            ctx.fillStyle = "#8a5a3c";
            ctx.fillRect(x + cell * 0.08, y + h * 0.4, w * 0.84, h * 0.6);
            // roof
            ctx.fillStyle = "#c0492f";
            ctx.beginPath();
            ctx.moveTo(x, y + h * 0.45);
            ctx.lineTo(x + w / 2, y);
            ctx.lineTo(x + w, y + h * 0.45);
            ctx.closePath();
            ctx.fill();
            // sign
            ctx.fillStyle = "#ffd35a";
            ctx.font = "700 " + Math.floor(cell * 0.3) + "px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("\u{1F6D2}", x + w / 2, y + h * 0.85);
            shopBtnRect = { x: x, y: y, w: w, h: h + cell * 0.4 };
        }

        function drawHUD() {
            const W = canvas.clientWidth;
            ctx.textAlign = "left";
            ctx.font = "700 15px system-ui, sans-serif";

            // Hearts
            let hx = 12;
            for (let i = 0; i < maxHP(); i++) {
                ctx.fillStyle = i < stats.hp ? "#ff5d6c" : "#46324a";
                heart(hx, 14, 11);
                hx += 22;
            }

            // Stamina bar
            const sbW = 110, sbX = 12, sbY = 34;
            ctx.fillStyle = "#2a2336";
            roundRect(sbX, sbY, sbW, 12, 6);
            ctx.fillStyle = "#5fd0ff";
            const sf = Math.max(0, stats.stam / maxStam());
            roundRect(sbX, sbY, Math.max(6, sbW * sf), 12, 6);
            ctx.fillStyle = "#cfe9ff";
            ctx.font = "600 11px system-ui, sans-serif";
            ctx.fillText("⚡ " + stats.stam, sbX + sbW + 8, sbY + 11);

            // Coins (carry / banked) + depth, right aligned
            ctx.textAlign = "right";
            ctx.font = "700 15px system-ui, sans-serif";
            ctx.fillStyle = "#ffd35a";
            ctx.fillText("\u{1F45C} " + carry + "/" + bagCap(), W - 12, 18);
            ctx.fillStyle = "#9be8ff";
            ctx.fillText("\u{1F4B0} " + banked, W - 12, 38);
            ctx.fillStyle = "#b9b9d6";
            ctx.font = "600 12px system-ui, sans-serif";
            ctx.fillText("Depth " + Math.max(0, player.y) + "m", W - 12, 56);

            // SHOP button (only useful at surface, but always visible)
            const atSurface = player.y === SURFACE_Y;
            ctx.textAlign = "center";
            const bw = 64, bh = 26, bx = W / 2 - bw / 2, by = 6;
            ctx.fillStyle = atSurface ? "#3f8a45" : "#2a2336";
            roundRect(bx, by, bw, bh, 8);
            ctx.fillStyle = atSurface ? "#eafff0" : "#6b6b86";
            ctx.font = "700 13px system-ui, sans-serif";
            ctx.fillText("\u{1F6D2} SHOP", W / 2, by + 17);
            hudShopRect = { x: bx, y: by, w: bw, h: bh };

            // Message ticker
            if (msgT > 0 && msg) {
                ctx.textAlign = "center";
                ctx.globalAlpha = Math.min(1, msgT / 30);
                ctx.fillStyle = "rgba(18,18,31,0.85)";
                const mw = ctx.measureText(msg).width + 28;
                roundRect(W / 2 - mw / 2, topPad + 8, mw, 26, 8);
                ctx.fillStyle = "#f2f3ff";
                ctx.font = "600 13px system-ui, sans-serif";
                ctx.fillText(msg, W / 2, topPad + 25);
                ctx.globalAlpha = 1;
            }
        }
        let hudShopRect = null;

        function drawShop() {
            const W = canvas.clientWidth, H = canvas.clientHeight;
            ctx.fillStyle = "rgba(10,10,18,0.86)";
            ctx.fillRect(0, 0, W, H);

            const panelW = Math.min(W - 24, 380);
            const px = (W - panelW) / 2;
            let py = Math.max(topPad + 8, H * 0.07);

            ctx.textAlign = "center";
            ctx.fillStyle = "#ffd35a";
            ctx.font = "800 22px system-ui, sans-serif";
            ctx.fillText("\u{1F6D2} Shopkeeper", W / 2, py + 6);
            ctx.fillStyle = "#9be8ff";
            ctx.font = "700 15px system-ui, sans-serif";
            ctx.fillText("\u{1F4B0} " + banked + " coins", W / 2, py + 30);

            py += 52;
            const rowH = 60, gap = 8;
            shopRects = [];

            for (const item of SHOP) {
                const lvl = item.lvl();
                const maxed = lvl >= item.max;
                const cost = maxed ? 0 : item.cost();
                const afford = banked >= cost;

                ctx.fillStyle = "#1d1b2e";
                roundRect(px, py, panelW, rowH, 12);

                // icon
                ctx.textAlign = "left";
                ctx.font = "26px system-ui, sans-serif";
                ctx.fillText(item.emoji, px + 14, py + rowH / 2 + 9);

                // name + desc + level pips
                ctx.fillStyle = "#f2f3ff";
                ctx.font = "700 15px system-ui, sans-serif";
                ctx.fillText(item.name, px + 52, py + 22);
                ctx.fillStyle = "#a8a8c8";
                ctx.font = "500 12px system-ui, sans-serif";
                ctx.fillText(item.desc(), px + 52, py + 40);
                // pips
                for (let i = 0; i < item.max; i++) {
                    ctx.fillStyle = i < lvl ? "#5fd0ff" : "#3a3550";
                    ctx.fillRect(px + 52 + i * 12, py + 48, 8, 5);
                }

                // buy button
                const btw = 78, bth = 38, btx = px + panelW - btw - 12, bty = py + (rowH - bth) / 2;
                ctx.fillStyle = maxed ? "#2a2336" : (afford ? "#3f8a45" : "#5a2330");
                roundRect(btx, bty, btw, bth, 9);
                ctx.textAlign = "center";
                ctx.fillStyle = maxed ? "#7a7a96" : "#ffffff";
                ctx.font = "700 13px system-ui, sans-serif";
                if (maxed) {
                    ctx.fillText("MAX", btx + btw / 2, bty + 23);
                } else {
                    ctx.fillText("\u{1F4B0}" + cost, btx + btw / 2, bty + 23);
                }
                if (!maxed) shopRects.push({ x: btx, y: bty, w: btw, h: bth, item: item });

                py += rowH + gap;
            }

            // Close button
            const cbw = 160, cbh = 42, cbx = W / 2 - cbw / 2;
            const cby = Math.min(H - cbh - 14, py + 6);
            ctx.fillStyle = "#3b7bd6";
            roundRect(cbx, cby, cbw, cbh, 10);
            ctx.fillStyle = "#fff";
            ctx.font = "700 15px system-ui, sans-serif";
            ctx.fillText("⛏️ Back to digging", W / 2, cby + 26);
            shopCloseRect = { x: cbx, y: cby, w: cbw, h: cbh };
        }
        let shopCloseRect = null;

        // ---------- Canvas helpers ----------
        function shade(hex, f) {
            const n = parseInt(hex.slice(1), 16);
            const r = Math.round(((n >> 16) & 255) * f);
            const g = Math.round(((n >> 8) & 255) * f);
            const b = Math.round((n & 255) * f);
            return "rgb(" + r + "," + g + "," + b + ")";
        }
        function roundRect(x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.fill();
        }
        function heart(x, y, s) {
            ctx.beginPath();
            ctx.moveTo(x + s / 2, y + s * 0.85);
            ctx.bezierCurveTo(x - s * 0.1, y + s * 0.4, x + s * 0.1, y - s * 0.1, x + s / 2, y + s * 0.3);
            ctx.bezierCurveTo(x + s * 0.9, y - s * 0.1, x + s * 1.1, y + s * 0.4, x + s / 2, y + s * 0.85);
            ctx.fill();
        }

        // ---------- Input ----------
        function hit(rect, mx, my) {
            return rect && mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
        }

        // Returns true if a tap at (mx,my) hit a UI control and was handled.
        function uiTapAt(mx, my) {
            if (mode === "shop") {
                if (hit(shopCloseRect, mx, my)) { closeShop(); return true; }
                for (const r of shopRects) {
                    if (hit(r, mx, my)) { buy(r.item); return true; }
                }
                return true;   // swallow taps anywhere on the shop overlay
            }
            if (hit(hudShopRect, mx, my)) { openShop(); return true; }
            if (hit(shopBtnRect, mx, my) && player.y <= SURFACE_Y) { openShop(); return true; }
            if (my < topPad) return true;   // ignore the HUD band
            return false;
        }

        let drag = null;   // active swipe-to-dig gesture anchor, or null

        function eventPos(e) {
            const rect = canvas.getBoundingClientRect();
            const pt = (e.touches && e.touches[0]) ||
                (e.changedTouches && e.changedTouches[0]) || e;
            return { mx: pt.clientX - rect.left, my: pt.clientY - rect.top };
        }

        function onPointerDown(e) {
            const p = eventPos(e);
            if (e.cancelable) e.preventDefault();
            if (uiTapAt(p.mx, p.my)) { drag = null; return; }
            drag = { x: p.mx, y: p.my };   // begin a swipe gesture
        }

        function onPointerMove(e) {
            if (!drag) return;
            const p = eventPos(e);
            if (e.cancelable) e.preventDefault();
            const dx = p.mx - drag.x, dy = p.my - drag.y;
            const thresh = Math.max(18, cell * 0.5);
            if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
            // Dig/move one tile in the dominant swipe direction (4-dir).
            if (Math.abs(dx) >= Math.abs(dy)) tryMove(Math.sign(dx), 0);
            else tryMove(0, Math.sign(dy));
            // Re-anchor so a held drag keeps digging tile by tile.
            drag = { x: p.mx, y: p.my };
        }

        function onPointerUp() { drag = null; }

        function onKey(e) {
            if (mode === "shop") {
                if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); closeShop(); }
                const idx = parseInt(e.key, 10);
                if (idx >= 1 && idx <= SHOP.length) { e.preventDefault(); buy(SHOP[idx - 1]); }
                return;
            }
            const map = {
                ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
                W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
            };
            if (e.key === "b" || e.key === "B") { e.preventDefault(); openShop(); return; }
            const m = map[e.key];
            if (m) { e.preventDefault(); tryMove(m[0], m[1]); }
        }

        function loop() {
            rafId = requestAnimationFrame(loop);
            update();
            draw();
        }

        return {
            start() {
                resize();
                reset();
                window.addEventListener("resize", resize);
                canvas.addEventListener("touchstart", onPointerDown, { passive: false });
                canvas.addEventListener("touchmove", onPointerMove, { passive: false });
                canvas.addEventListener("touchend", onPointerUp);
                canvas.addEventListener("mousedown", onPointerDown);
                window.addEventListener("mousemove", onPointerMove);
                window.addEventListener("mouseup", onPointerUp);
                window.addEventListener("keydown", onKey);
                rafId = requestAnimationFrame(loop);
            },
            restart() {
                reset();
            },
            destroy() {
                cancelAnimationFrame(rafId);
                window.removeEventListener("resize", resize);
                canvas.removeEventListener("touchstart", onPointerDown);
                canvas.removeEventListener("touchmove", onPointerMove);
                canvas.removeEventListener("touchend", onPointerUp);
                canvas.removeEventListener("mousedown", onPointerDown);
                window.removeEventListener("mousemove", onPointerMove);
                window.removeEventListener("mouseup", onPointerUp);
                window.removeEventListener("keydown", onKey);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.digger = {
        id: "digger",
        name: "Deep Digger",
        emoji: "⛏️",
        tag: "Dig for treasure, then upgrade your gear at the shop.",
        scoreLabel: "coins",
        create: create
    };
})();
