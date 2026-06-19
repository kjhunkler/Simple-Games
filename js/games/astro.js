/* ============ Astro Blaster — waves, upgrades & deep-space backdrop ============ */
(function () {
    "use strict";

    // ── Upgrade catalogue ────────────────────────────────────────────────────
    const UPGRADE_DEFS = [
        { id: "fireRate", name: "Rapid Fire",     icon: "⚡", maxLevel: 3,
          descs: ["Faster firing rate", "Even faster", "Maximum fire rate"] },
        { id: "spread",   name: "Spread Shot",    icon: "✦",  maxLevel: 2,
          descs: ["Fire two bullets wide", "Triple spread barrage"] },
        { id: "pierce",   name: "Piercing Rounds",icon: "◈",  maxLevel: 1,
          descs: ["Bullets pierce through rocks"] },
        { id: "shield",   name: "Energy Shield",  icon: "🛡",  maxLevel: 2,
          descs: ["Permanent shield — 1 charge", "Permanent shield — 2 charges"] },
    ];

    // Planet archetypes drawn in the background
    const PLANET_DEFS = [
        { r: 38, light: "#ffa869", mid: "#e8803a", dark: "#7a3d10", hasRing: false },
        { r: 52, light: "#7dc5ff", mid: "#4a9ee8", dark: "#1a3f80", hasRing: true  },
        { r: 24, light: "#6effc0", mid: "#3acb8a", dark: "#0f5c38", hasRing: false },
        { r: 30, light: "#d4a0ff", mid: "#9b5de5", dark: "#3d1668", hasRing: false },
    ];

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        const kids = !!host.kids;

        const ROCK_SPD_SCALE = kids ? 0.68 : 1;
        const SPAWN_BASE     = kids ? 1.5  : 1.1;
        const SPAWN_MIN      = kids ? 0.55 : 0.34;
        const BASE_EASE      = kids ? 10   : 14;

        let W, H;

        // Game objects
        let ship, bullets, rocks, particles, engineParts;
        let stars, galaxies, planets, debris;

        // State
        let score, alive, started, elapsed;
        let phase;      // "idle" | "playing" | "wave_clear" | "shop" | "dead"
        let wave, rocksThisWave, rocksKilled, phaseTimer;
        let fireEvery;
        let shieldCharges, shieldMax, invuln, rechargeQueue;
        let upgrades;   // { fireRate, spread, pierce, shield }
        let shopChoices, shopSelected;
        let lastShot, spawnTimer;
        let touchId = null, touchOffX = 0, touchOffY = 0;
        let rafId, lastTs;

        // ── Helpers ──────────────────────────────────────────────────────────
        function rocksForWave(w) { return 8 + w * 4; }

        const SHIELD_RECHARGE = 30;   // seconds for one spent charge to come back
        const INVULN_TIME     = 2;    // seconds of invulnerability after a break

        function applyUpgrades() {
            fireEvery = [0.22, 0.16, 0.12, 0.09][Math.min(upgrades.fireRate, 3)];
            shieldMax = upgrades.shield;   // 1 charge per level
        }

        function makeVerts(r) {
            const n = 9, v = [];
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                v.push({ x: Math.cos(a) * r * (0.74 + Math.random() * 0.3),
                         y: Math.sin(a) * r * (0.74 + Math.random() * 0.3) });
            }
            return v;
        }

        function makeDebrisVerts(r) {
            const n = 5 + Math.floor(Math.random() * 3), v = [];
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                v.push({ x: Math.cos(a) * r * (0.6 + Math.random() * 0.45),
                         y: Math.sin(a) * r * (0.6 + Math.random() * 0.45) });
            }
            return v;
        }

        function explode(x, y, color, count, spd) {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = Math.random() * (spd || 160) + 40;
                particles.push({ x, y,
                    vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                    life: 1, decay: Math.random() * 1.6 + 1.2,
                    color, size: Math.random() * 3.5 + 1.5 });
            }
        }

        // ── Scene setup ──────────────────────────────────────────────────────
        function buildScene() {
            stars = [];
            for (let i = 0; i < 90; i++) {
                stars.push({ x: Math.random() * W, y: Math.random() * H,
                    s: Math.random() * 1.8 + 0.3, v: Math.random() * 14 + 6,
                    tw: Math.random() * Math.PI * 2 });
            }

            galaxies = [];
            for (let i = 0; i < 3; i++) {
                galaxies.push({
                    x: Math.random() * W, y: Math.random() * H,
                    rx: 55 + Math.random() * 90, ry: 18 + Math.random() * 35,
                    angle: Math.random() * Math.PI,
                    hue: [200, 260, 320][i % 3],
                    v: 1.5 + Math.random() * 2.5
                });
            }

            planets = [];
            // Shuffle planet archetypes and pick 2
            const pool = PLANET_DEFS.slice().sort(() => Math.random() - 0.5);
            for (let i = 0; i < 2; i++) {
                const def = pool[i];
                planets.push({
                    x: W * (0.12 + Math.random() * 0.76),
                    y: H  * (0.08 + Math.random() * 0.55),
                    r: def.r, light: def.light, mid: def.mid, dark: def.dark,
                    hasRing: def.hasRing, ringTilt: 0.18 + Math.random() * 0.28,
                    v: 3 + Math.random() * 5, vx: (Math.random() - 0.5) * 2.5
                });
            }

            debris = [];
            for (let i = 0; i < 14; i++) {
                const r = Math.random() * 5 + 2;
                debris.push({
                    x: Math.random() * W, y: Math.random() * H,
                    vx: (Math.random() - 0.5) * 14, vy: Math.random() * 9 + 3,
                    rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 1.8,
                    alpha: 0.1 + Math.random() * 0.2,
                    verts: makeDebrisVerts(r)
                });
            }
        }

        // ── Reset ────────────────────────────────────────────────────────────
        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width  = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function reset() {
            ship = { x: W / 2, y: H * 0.8, r: 16, tx: W / 2, ty: H * 0.8 };
            bullets      = [];
            rocks        = [];
            particles    = [];
            engineParts  = [];
            score        = 0;
            alive        = true;
            started      = false;
            elapsed      = 0;
            wave         = 0;
            rocksThisWave = 0;
            rocksKilled  = 0;
            phase        = "idle";
            phaseTimer   = 0;
            lastShot     = 0;
            spawnTimer   = 0;
            shieldCharges = 0;
            shieldMax     = 0;
            invuln        = 0;
            rechargeQueue = [];
            shopChoices  = null;
            shopSelected = -1;
            touchId      = null;
            lastTs       = 0;
            upgrades = { fireRate: 0, spread: 0, pierce: 0, shield: 0 };
            applyUpgrades();
            buildScene();
            host.setScore(0);
        }

        // ── Wave management ──────────────────────────────────────────────────
        function startWave() {
            wave         += 1;
            rocksThisWave = rocksForWave(wave);
            rocksKilled  = 0;
            spawnTimer   = 0.5;
            phase        = "playing";
        }

        function spawnRock() {
            const r = Math.random() * 22 + 14;
            const x = Math.random() * (W - r * 2) + r;
            const waveBump = 1 + (wave - 1) * 0.14;
            const speed = ((Math.random() * 40 + 55) + Math.min(elapsed * 1.5, 90))
                          * ROCK_SPD_SCALE * waveBump;
            const toughBonus = Math.floor((wave - 1) / 4);   // +1 HP every 4 waves
            rocks.push({
                x, y: -r - 10, r,
                vx: (Math.random() - 0.5) * (50 + (wave - 1) * 6),
                vy: speed,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() - 0.5) * 2.4,
                hp: (r > 26 ? 2 : 1) + toughBonus,
                verts: makeVerts(r),
                flashT: 0
            });
        }

        function fireBullets() {
            const vy = -530;
            if (upgrades.spread === 0) {
                bullets.push({ x: ship.x, y: ship.y - ship.r - 2, vx: 0, vy, pierced: 0 });
            } else if (upgrades.spread === 1) {
                bullets.push({ x: ship.x - 9, y: ship.y - ship.r, vx: -28, vy, pierced: 0 });
                bullets.push({ x: ship.x + 9, y: ship.y - ship.r, vx:  28, vy, pierced: 0 });
            } else {
                bullets.push({ x: ship.x - 11, y: ship.y - ship.r, vx: -55, vy, pierced: 0 });
                bullets.push({ x: ship.x,      y: ship.y - ship.r - 2, vx: 0, vy, pierced: 0 });
                bullets.push({ x: ship.x + 11, y: ship.y - ship.r, vx:  55, vy, pierced: 0 });
            }
        }

        // ── Shop ─────────────────────────────────────────────────────────────
        function buildShopChoices() {
            const avail = UPGRADE_DEFS.filter(u => upgrades[u.id] < u.maxLevel);
            return avail.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(3, avail.length));
        }

        function applyChoice(idx) {
            if (!shopChoices || idx < 0 || idx >= shopChoices.length) return;
            const pick = shopChoices[idx];
            upgrades[pick.id] += 1;
            applyUpgrades();
            if (pick.id === "shield") {           // top off to new max on purchase
                shieldCharges = shieldMax;
                rechargeQueue = [];
            }
            shopSelected = idx;
        }

        function shopTapAt(x, y) {
            if (!shopChoices || shopChoices.length === 0) { startWave(); return; }

            const cardW = Math.min(W * 0.78, 280);
            const cardH = 108;
            const gap   = 12;
            const total = shopChoices.length * cardH + (shopChoices.length - 1) * gap;
            let cy = (H - total) / 2 + 14;
            const cx = (W - cardW) / 2;

            for (let i = 0; i < shopChoices.length; i++) {
                if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
                    if (shopSelected !== i) {
                        applyChoice(i);
                        SGSound.play("match");
                        host.vibrate(15);
                    }
                    return;
                }
                cy += cardH + gap;
            }

            // "Launch" button
            if (shopSelected >= 0) {
                const bw = 190, bh = 48;
                const bx = (W - bw) / 2, by = H * 0.87;
                if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
                    SGSound.play("tap");
                    host.vibrate(10);
                    startWave();
                }
            }
        }

        // ── Update ───────────────────────────────────────────────────────────
        function updateBackground(dt) {
            for (const st of stars) {
                st.y  += st.v * dt;
                st.tw += dt * 1.4;
                if (st.y > H) { st.y = -2; st.x = Math.random() * W; }
            }
            for (const g of galaxies) {
                g.y += g.v * dt;
                if (g.y > H + g.ry * 2) { g.y = -g.ry * 2; g.x = Math.random() * W; }
            }
            for (const p of planets) {
                p.y += p.v * dt;
                p.x += p.vx * dt;
                if (p.x < -p.r * 3) p.x = W + p.r * 3;
                if (p.x > W + p.r * 3) p.x = -p.r * 3;
                if (p.y > H + p.r * 3) { p.y = -p.r * 3; p.x = W * (0.1 + Math.random() * 0.8); }
            }
            for (const d of debris) {
                d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
                if (d.y > H + 20) { d.y = -20; d.x = Math.random() * W; }
                if (d.x < -20) d.x = W + 20;
                if (d.x > W + 20) d.x = -20;
            }
        }

        function updateParticles(dt) {
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.life -= p.decay * dt;
                if (p.life <= 0) particles.splice(i, 1);
            }
            for (let i = engineParts.length - 1; i >= 0; i--) {
                const p = engineParts[i];
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.life -= dt * 3.5; p.size *= 0.90;
                if (p.life <= 0 || p.size < 0.4) engineParts.splice(i, 1);
            }
        }

        function emitEngineParts() {
            const dx = ship.tx - ship.x, dy = ship.ty - ship.y;
            if (Math.hypot(dx, dy) < 6) return;
            const inv = 1 / Math.hypot(dx, dy);
            const nx = -dx * inv, ny = -dy * inv;
            const spread = 0.55;
            const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * spread;
            const spd = 50 + Math.random() * 70;
            engineParts.push({
                x: ship.x + nx * ship.r * 0.9 + (Math.random() - 0.5) * 5,
                y: ship.y + ny * ship.r * 0.9 + (Math.random() - 0.5) * 5,
                vx: Math.cos(a) * spd, vy: Math.sin(a) * spd + 35,
                life: 1, size: Math.random() * 5 + 2.5,
                color: Math.random() < 0.6 ? "#ff9a3c" : "#ffd166"
            });
        }

        function update(dt) {
            elapsed += dt;
            updateBackground(dt);
            updateParticles(dt);

            if (phase === "wave_clear") {
                phaseTimer -= dt;
                if (phaseTimer <= 0) {
                    phase = "shop";
                    shopChoices  = buildShopChoices();
                    shopSelected = -1;
                }
                return;
            }
            if (phase === "shop" || phase === "idle" || !alive) return;

            // Shield: invulnerability countdown + spent-charge recharge
            if (invuln > 0) invuln = Math.max(0, invuln - dt);
            for (let i = rechargeQueue.length - 1; i >= 0; i--) {
                rechargeQueue[i] -= dt;
                if (rechargeQueue[i] <= 0) {
                    rechargeQueue.splice(i, 1);
                    shieldCharges = Math.min(shieldMax, shieldCharges + 1);
                }
            }

            // Ship ease toward target
            const ease = BASE_EASE;
            ship.x += (ship.tx - ship.x) * Math.min(dt * ease, 1);
            ship.y += (ship.ty - ship.y) * Math.min(dt * ease, 1);
            ship.x = Math.max(ship.r, Math.min(W - ship.r, ship.x));
            ship.y = Math.max(ship.r, Math.min(H - ship.r, ship.y));

            if (Math.random() < 0.65) emitEngineParts();
            if (!started) return;

            // Auto-fire
            lastShot += dt;
            if (lastShot >= fireEvery) {
                lastShot = 0;
                fireBullets();
                host.vibrate(4);
                SGSound.play("shoot");
            }

            // Bullets
            for (let i = bullets.length - 1; i >= 0; i--) {
                const b = bullets[i];
                b.x += b.vx * dt; b.y += b.vy * dt;
                if (b.y < -12) bullets.splice(i, 1);
            }

            // Spawn rocks (up to quota)
            const inFlight = rocks.length;
            if (rocksKilled + inFlight < rocksThisWave) {
                spawnTimer += dt;
                const ramp = Math.max(SPAWN_MIN, SPAWN_BASE - elapsed * 0.007 - (wave - 1) * 0.07);
                if (spawnTimer >= ramp) {
                    spawnTimer = 0;
                    const burst = Math.min(1 + Math.floor((wave - 1) / 2), rocksThisWave - rocksKilled - inFlight);
                    for (let k = 0; k < burst; k++) spawnRock();
                }
            }

            // Rock physics + collisions
            for (let i = rocks.length - 1; i >= 0; i--) {
                const rock = rocks[i];
                rock.x  += rock.vx * dt; rock.y  += rock.vy * dt;
                rock.rot += rock.vr * dt;
                if (rock.flashT > 0) rock.flashT = Math.max(0, rock.flashT - dt * 9);
                if (rock.x < rock.r)     { rock.x = rock.r;     rock.vx *= -1; }
                if (rock.x > W - rock.r) { rock.x = W - rock.r; rock.vx *= -1; }
                if (rock.y > H + rock.r + 20) { rocks.splice(i, 1); continue; }

                // Bullet–rock collision
                let destroyed = false;
                for (let j = bullets.length - 1; j >= 0; j--) {
                    const b = bullets[j];
                    const dx = b.x - rock.x, dy = b.y - rock.y;
                    if (dx * dx + dy * dy >= rock.r * rock.r) continue;

                    if (upgrades.pierce) {
                        b.pierced = (b.pierced || 0) + 1;
                        if (b.pierced > 2) bullets.splice(j, 1);
                    } else {
                        bullets.splice(j, 1);
                    }
                    rock.hp   -= 1;
                    rock.flashT = 1;

                    if (rock.hp <= 0) {
                        score += rock.r > 26 ? 2 : 1;
                        host.setScore(score);
                        rocksKilled += 1;
                        host.vibrate(12);
                        SGSound.play("hit");
                        explode(rock.x, rock.y, "#ffd166", 14 + wave, 170);
                        explode(rock.x, rock.y, "#6b6b94", 6, 80);
                        rocks.splice(i, 1);
                        destroyed = true;
                    } else {
                        explode(b.x, b.y, "#9aa0c3", 5, 90);
                        SGSound.play("flip");
                    }
                    break;
                }
                if (destroyed) continue;

                // Ship–rock collision
                const ddx = ship.x - rock.x, ddy = ship.y - rock.y;
                const rr  = rock.r * 0.82 + ship.r * 0.7;
                if (ddx * ddx + ddy * ddy < rr * rr) {
                    if (invuln > 0) {
                        // Briefly invulnerable after a break — shrug the rock off
                        const dist = Math.hypot(ddx, ddy) || 1;
                        rock.vx -= (ddx / dist) * 200;
                        rock.vy -= (ddy / dist) * 200;
                    } else if (shieldCharges > 0) {
                        // Break a shield charge, gain brief invulnerability, queue recharge
                        shieldCharges -= 1;
                        invuln = INVULN_TIME;
                        rechargeQueue.push(SHIELD_RECHARGE);
                        const dist = Math.hypot(ddx, ddy) || 1;
                        rock.vx -= (ddx / dist) * 240;
                        rock.vy -= (ddy / dist) * 240;
                        explode(ship.x, ship.y, "#39d0ff", 22, 150);
                        host.vibrate([30, 40, 30]);
                        SGSound.play("bounce");
                    } else {
                        alive = false;
                        phase = "dead";
                        explode(ship.x, ship.y, "#39d0ff", 28, 180);
                        explode(ship.x, ship.y, "#ff4d8d", 18, 140);
                        host.vibrate([80, 50, 110]);
                        SGSound.play("explode");
                        setTimeout(() => host.gameOver(score), 700);
                        break;
                    }
                }
            }

            // Wave complete?
            if (rocksKilled >= rocksThisWave && rocks.length === 0) {
                phase      = "wave_clear";
                phaseTimer = 1.8;
                SGSound.play("perfect");
                host.vibrate([15, 30, 15, 30, 15]);
            }
        }

        // ── Draw helpers ─────────────────────────────────────────────────────
        function rrFill(x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.fill();
        }

        function rrStroke(x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.stroke();
        }

        // ── Draw background ──────────────────────────────────────────────────
        function drawBackground() {
            ctx.fillStyle = "#060612";
            ctx.fillRect(0, 0, W, H);

            // Galaxies — soft glowing ellipses
            for (const g of galaxies) {
                ctx.save();
                ctx.translate(g.x, g.y);
                ctx.rotate(g.angle);
                ctx.scale(1, g.ry / g.rx);
                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.rx);
                grad.addColorStop(0,   `hsla(${g.hue},65%,70%,0.16)`);
                grad.addColorStop(0.4, `hsla(${g.hue},55%,50%,0.07)`);
                grad.addColorStop(1,   `hsla(${g.hue},40%,30%,0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, g.rx, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Planets
            for (const p of planets) {
                ctx.save();
                ctx.globalAlpha = 0.52;
                ctx.translate(p.x, p.y);

                // Glow halo
                const halo = ctx.createRadialGradient(0, 0, p.r * 0.6, 0, 0, p.r * 2.2);
                halo.addColorStop(0, p.mid + "38");
                halo.addColorStop(1, "transparent");
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(0, 0, p.r * 2.2, 0, Math.PI * 2);
                ctx.fill();

                // Ring (before body so body overlaps it)
                if (p.hasRing) {
                    ctx.save();
                    ctx.scale(1, p.ringTilt);
                    ctx.strokeStyle = p.mid + "88";
                    ctx.lineWidth   = p.r * 0.4;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.r * 1.7, 0, Math.PI * 2);
                    ctx.stroke();
                    // Ring inner darker band
                    ctx.strokeStyle = p.dark + "55";
                    ctx.lineWidth   = p.r * 0.15;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.r * 1.55, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // Planet body with radial gradient
                const body = ctx.createRadialGradient(-p.r * 0.32, -p.r * 0.32, 0, 0, 0, p.r);
                body.addColorStop(0,   p.light);
                body.addColorStop(0.55, p.mid);
                body.addColorStop(1,   p.dark);
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                ctx.fill();

                // Terminator shadow (right side)
                const shadow = ctx.createRadialGradient(p.r * 0.3, 0, 0, p.r * 0.3, 0, p.r * 1.1);
                shadow.addColorStop(0, "transparent");
                shadow.addColorStop(1, "rgba(0,0,0,0.55)");
                ctx.fillStyle = shadow;
                ctx.beginPath();
                ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }

            // Stars — twinkle
            for (const st of stars) {
                ctx.globalAlpha = (0.5 + 0.5 * Math.sin(st.tw)) * 0.7;
                ctx.fillStyle   = "#c8d0ff";
                ctx.fillRect(st.x, st.y, st.s, st.s);
            }
            ctx.globalAlpha = 1;

            // Space debris — slow tumbling fragments
            for (const d of debris) {
                ctx.save();
                ctx.globalAlpha = d.alpha;
                ctx.translate(d.x, d.y);
                ctx.rotate(d.rot);
                ctx.fillStyle = "#4a4a6a";
                ctx.beginPath();
                ctx.moveTo(d.verts[0].x, d.verts[0].y);
                for (let i = 1; i < d.verts.length; i++) ctx.lineTo(d.verts[i].x, d.verts[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }

        // ── Draw game objects ─────────────────────────────────────────────────
        function drawGame() {
            // Engine trail
            for (const p of engineParts) {
                ctx.globalAlpha = Math.max(p.life, 0) * 0.85;
                ctx.fillStyle   = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // Bullets + glow
            ctx.shadowColor = "#5ef58a";
            ctx.shadowBlur  = 10;
            ctx.fillStyle   = "#5ef58a";
            for (const b of bullets) {
                ctx.fillRect(b.x - 2, b.y - 9, 4, 13);
                if (upgrades.pierce) {
                    ctx.fillStyle   = "#ffd166";
                    ctx.shadowColor = "#ffd166";
                    ctx.fillRect(b.x - 2, b.y - 9, 4, 13);
                    ctx.fillStyle   = "#5ef58a";
                    ctx.shadowColor = "#5ef58a";
                }
            }
            ctx.shadowBlur = 0;

            // Rocks
            for (const rock of rocks) {
                ctx.save();
                ctx.translate(rock.x, rock.y);
                ctx.rotate(rock.rot);
                const lit = rock.flashT > 0;
                ctx.fillStyle   = lit ? `rgba(255,255,255,${0.6 + rock.flashT * 0.4})`
                                      : (rock.hp > 1 ? "#6b6b94" : "#55557d");
                ctx.strokeStyle = lit ? "#ffffff" : "#8a8fb9";
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.moveTo(rock.verts[0].x, rock.verts[0].y);
                for (let i = 1; i < rock.verts.length; i++) ctx.lineTo(rock.verts[i].x, rock.verts[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // Gold dot on tough rocks
                if (rock.hp > 1 && !lit) {
                    ctx.fillStyle = "#ffd166";
                    ctx.beginPath();
                    ctx.arc(0, 0, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            // Ship
            if (alive) {
                ctx.save();
                ctx.translate(ship.x, ship.y);

                // Shield ring — steady glow while charged, fast flash while invulnerable
                if (shieldCharges > 0 || invuln > 0) {
                    const pulse = invuln > 0
                        ? 0.5 + 0.5 * Math.sin(elapsed * 30)
                        : 0.4 + 0.25 * Math.sin(elapsed * 4);
                    ctx.save();
                    ctx.shadowColor = "#39d0ff";
                    ctx.shadowBlur  = invuln > 0 ? 26 : 16;
                    ctx.strokeStyle = `rgba(57,208,255,${pulse})`;
                    ctx.lineWidth   = invuln > 0 ? 3.5 : 2.5;
                    ctx.beginPath();
                    ctx.arc(0, 0, ship.r + 18, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // Engine flames
                if (started) {
                    ctx.fillStyle = `rgba(255,155,50,${0.5 + Math.random() * 0.45})`;
                    ctx.beginPath();
                    ctx.moveTo(-7, ship.r * 0.85);
                    ctx.lineTo(0,  ship.r * 1.75 + Math.random() * 9);
                    ctx.lineTo(7,  ship.r * 0.85);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = `rgba(255,220,80,${0.55 + Math.random() * 0.4})`;
                    ctx.beginPath();
                    ctx.moveTo(-3.5, ship.r * 0.88);
                    ctx.lineTo(0,    ship.r * 1.45 + Math.random() * 5);
                    ctx.lineTo(3.5,  ship.r * 0.88);
                    ctx.closePath();
                    ctx.fill();
                }

                // Hull
                ctx.shadowColor = "#39d0ff";
                ctx.shadowBlur  = 12;
                ctx.fillStyle   = "#39d0ff";
                ctx.beginPath();
                ctx.moveTo(0, -ship.r);
                ctx.lineTo(ship.r * 0.85,  ship.r * 0.9);
                ctx.lineTo(0,              ship.r * 0.45);
                ctx.lineTo(-ship.r * 0.85, ship.r * 0.9);
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;

                // Cockpit
                ctx.fillStyle = "#d6f4ff";
                ctx.beginPath();
                ctx.arc(0, -ship.r * 0.25, ship.r * 0.28, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }

            // Particle debris
            for (const p of particles) {
                ctx.globalAlpha = Math.max(p.life, 0);
                ctx.fillStyle   = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.globalAlpha = 1;
        }

        // ── Draw HUD ─────────────────────────────────────────────────────────
        function drawHUD() {
            // Wave + progress
            if (phase === "playing" || phase === "wave_clear") {
                ctx.fillStyle  = "rgba(154,160,195,0.9)";
                ctx.font       = "700 13px system-ui, sans-serif";
                ctx.textAlign  = "right";
                ctx.fillText(`Wave ${wave}  ✦ ${rocksKilled}/${rocksThisWave}`, W - 12, 30);

                const bw = 110, bh = 5, bx = W - 12 - bw, by = 36;
                ctx.fillStyle = "rgba(255,255,255,0.1)";
                ctx.fillRect(bx, by, bw, bh);
                ctx.fillStyle = "#5ef58a";
                ctx.fillRect(bx, by, bw * Math.min(rocksKilled / rocksThisWave, 1), bh);
            }

            // Shield charges — filled pips for ready, dim pips for recharging
            const hasShield = shieldMax > 0;
            if (hasShield) {
                ctx.fillStyle = "#39d0ff";
                ctx.font      = "600 12px system-ui, sans-serif";
                ctx.textAlign = "left";
                ctx.fillText("🛡", 12, 30);
                for (let i = 0; i < shieldMax; i++) {
                    ctx.fillStyle = i < shieldCharges ? "#39d0ff" : "rgba(57,208,255,0.22)";
                    ctx.beginPath();
                    ctx.arc(36 + i * 13, 26, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Active upgrade icons (shield shown via pips above)
            const active = UPGRADE_DEFS.filter(u => upgrades[u.id] > 0 && u.id !== "shield");
            if (active.length > 0) {
                let ix = 12;
                const iy = hasShield ? 46 : 30;
                ctx.font      = "12px system-ui, sans-serif";
                ctx.textAlign = "left";
                for (const u of active) {
                    const lv = upgrades[u.id];
                    ctx.fillStyle = "rgba(0,0,0,0.45)";
                    rrFill(ix - 2, iy - 13, 36, 20, 6);
                    ctx.fillStyle = "#f2f3ff";
                    ctx.fillText(u.icon + (lv > 1 ? lv : ""), ix + 1, iy + 1);
                    ix += 40;
                }
            }

            // Wave-clear banner
            if (phase === "wave_clear") {
                const t = Math.max(0, 1.8 - phaseTimer);
                ctx.globalAlpha = Math.min(1, t * 2.5);
                ctx.fillStyle   = "#ffd166";
                ctx.font        = "800 30px system-ui, sans-serif";
                ctx.textAlign   = "center";
                ctx.fillText(`Wave ${wave} Clear!`, W / 2, H * 0.44);
                ctx.fillStyle = "#5ef58a";
                ctx.font      = "600 15px system-ui, sans-serif";
                ctx.fillText("Upgrade incoming ▸", W / 2, H * 0.44 + 38);
                ctx.globalAlpha = 1;
            }

            // Idle prompt
            if (phase === "idle") {
                ctx.fillStyle  = "rgba(242,243,255,0.85)";
                ctx.font       = "700 17px system-ui, sans-serif";
                ctx.textAlign  = "center";
                ctx.fillText("Touch & drag to fly", W / 2, H * 0.4);
                ctx.font       = "500 14px system-ui, sans-serif";
                ctx.fillStyle  = "rgba(154,160,195,0.9)";
                ctx.fillText("Your ship fires automatically", W / 2, H * 0.4 + 26);
            }
        }

        // ── Draw shop ────────────────────────────────────────────────────────
        function drawShop() {
            ctx.fillStyle = "rgba(6,6,18,0.90)";
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle  = "#ffd166";
            ctx.font       = "800 21px system-ui, sans-serif";
            ctx.textAlign  = "center";
            ctx.fillText("UPGRADE YOUR SHIP", W / 2, H * 0.14);

            ctx.fillStyle = "rgba(154,160,195,0.8)";
            ctx.font      = "500 13px system-ui, sans-serif";
            ctx.fillText(`Wave ${wave + 1} incoming — pick one`, W / 2, H * 0.14 + 26);

            if (!shopChoices || shopChoices.length === 0) {
                ctx.fillStyle  = "#5ef58a";
                ctx.font       = "700 16px system-ui, sans-serif";
                ctx.fillText("All systems maxed! Tap to launch.", W / 2, H / 2);
                return;
            }

            const cardW = Math.min(W * 0.78, 280);
            const cardH = 108;
            const gap   = 12;
            const total = shopChoices.length * cardH + (shopChoices.length - 1) * gap;
            let cy = (H - total) / 2 + 14;
            const cx = (W - cardW) / 2;

            for (let i = 0; i < shopChoices.length; i++) {
                const u       = shopChoices[i];
                const nextLv  = upgrades[u.id] + 1;
                const picked  = shopSelected === i;

                // Card
                ctx.fillStyle = picked ? "rgba(57,208,255,0.18)" : "rgba(28,28,52,0.95)";
                rrFill(cx, cy, cardW, cardH, 16);
                ctx.strokeStyle = picked ? "#39d0ff" : "rgba(130,136,200,0.35)";
                ctx.lineWidth   = picked ? 2.5 : 1.5;
                rrStroke(cx, cy, cardW, cardH, 16);

                // Icon
                ctx.font      = "30px system-ui, sans-serif";
                ctx.textAlign = "left";
                ctx.fillStyle = "#f2f3ff";
                ctx.fillText(u.icon, cx + 18, cy + 46);

                // Name
                ctx.font      = "800 14px system-ui, sans-serif";
                ctx.fillStyle = picked ? "#39d0ff" : "#f2f3ff";
                ctx.fillText(u.name, cx + 62, cy + 28);

                // Level pips
                for (let l = 0; l < u.maxLevel; l++) {
                    ctx.fillStyle = l < nextLv ? "#ffd166" : "rgba(255,255,255,0.18)";
                    ctx.beginPath();
                    ctx.arc(cx + 62 + l * 15, cy + 43, 5, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Description
                ctx.font      = "500 12px system-ui, sans-serif";
                ctx.fillStyle = "rgba(154,160,195,0.9)";
                ctx.fillText(u.descs[nextLv - 1] || "", cx + 62, cy + 62);

                // Selected badge
                if (picked) {
                    ctx.font      = "700 11px system-ui, sans-serif";
                    ctx.fillStyle = "#39d0ff";
                    ctx.textAlign = "right";
                    ctx.fillText("SELECTED ✓", cx + cardW - 14, cy + cardH - 12);
                }

                cy += cardH + gap;
            }

            // Launch button (appears after selection)
            if (shopSelected >= 0) {
                const bw = 190, bh = 48;
                const bx = (W - bw) / 2, by = H * 0.87;
                ctx.fillStyle = "#5ef58a";
                rrFill(bx, by, bw, bh, 24);
                ctx.fillStyle  = "#06281a";
                ctx.font       = "800 15px system-ui, sans-serif";
                ctx.textAlign  = "center";
                ctx.fillText(`LAUNCH WAVE ${wave + 1}`, W / 2, by + 31);
            }
        }

        // ── Main draw ────────────────────────────────────────────────────────
        function draw() {
            drawBackground();
            drawGame();
            drawHUD();
            if (phase === "shop") drawShop();
        }

        // ── Loop ─────────────────────────────────────────────────────────────
        function loop(ts) {
            rafId = requestAnimationFrame(loop);
            if (!lastTs) lastTs = ts;
            const dt = Math.min((ts - lastTs) / 1000, 0.05);
            lastTs = ts;
            update(dt);
            draw();
        }

        // ── Input ─────────────────────────────────────────────────────────────
        function getTouch(e) {
            for (const t of e.changedTouches) {
                if (touchId === null || t.identifier === touchId) return t;
            }
            return null;
        }

        function handleStart(clientX, clientY) {
            const rect = canvas.getBoundingClientRect();
            const x = clientX - rect.left, y = clientY - rect.top;
            if (phase === "shop")   { shopTapAt(x, y); return; }
            if (phase === "idle")   { started = true; startWave(); }
            else if (!started)      { started = true; }
            touchOffX = ship.x - x;
            touchOffY = ship.y - y;
        }

        function handleMove(clientX, clientY) {
            if (phase === "shop" || phase === "idle") return;
            const rect = canvas.getBoundingClientRect();
            ship.tx = (clientX - rect.left) + touchOffX;
            ship.ty = (clientY - rect.top)  + touchOffY;
        }

        function onTouchStart(e) {
            e.preventDefault();
            const t = e.changedTouches[0];
            touchId = t.identifier;
            handleStart(t.clientX, t.clientY);
        }
        function onTouchMove(e) {
            e.preventDefault();
            const t = getTouch(e);
            if (t) handleMove(t.clientX, t.clientY);
        }
        function onTouchEnd(e) {
            const t = getTouch(e);
            if (t) touchId = null;
        }
        function onMouseDown(e) {
            handleStart(e.clientX, e.clientY);
            canvas.addEventListener("mousemove", onMouseMove);
        }
        function onMouseMove(e) { handleMove(e.clientX, e.clientY); }
        function onMouseUp()    { canvas.removeEventListener("mousemove", onMouseMove); }

        return {
            start() {
                resize();
                reset();
                window.addEventListener("resize", resize);
                canvas.addEventListener("touchstart", onTouchStart, { passive: false });
                canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
                canvas.addEventListener("touchend",   onTouchEnd);
                canvas.addEventListener("mousedown",  onMouseDown);
                window.addEventListener("mouseup",    onMouseUp);
                rafId = requestAnimationFrame(loop);
            },
            restart() { reset(); },
            destroy() {
                cancelAnimationFrame(rafId);
                window.removeEventListener("resize", resize);
                canvas.removeEventListener("touchstart", onTouchStart);
                canvas.removeEventListener("touchmove",  onTouchMove);
                canvas.removeEventListener("touchend",   onTouchEnd);
                canvas.removeEventListener("mousedown",  onMouseDown);
                canvas.removeEventListener("mousemove",  onMouseMove);
                window.removeEventListener("mouseup",    onMouseUp);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.astro = {
        id:         "astro",
        name:       "Astro Blaster",
        emoji:      "\u{1F680}",
        tag:        "Blast waves of rocks. Upgrade between rounds.",
        scoreLabel: "rocks",
        create:     create
    };
})();
