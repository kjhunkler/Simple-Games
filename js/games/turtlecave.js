/* ============ Shell Knight — a sword turtle cave-crawl for treasure ============ */
(function () {
    "use strict";

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");

        const kids = !!host.kids;

        // ----- tuning -----
        const MAX_HEARTS = kids ? 10 : 5;
        const HIT_INVULN = 5;                       // seconds of mercy after a hit
        const GRAVITY = 2100;
        const MOVE_SPEED = 220;
        const AIR_MOVE = 195;
        const JUMP_V = 770;
        const DASH_SPEED = 660;
        const DASH_TIME = 0.18;
        const DASH_CD = kids ? 0.4 : 0.55;
        const ATTACK_DUR = 0.26;
        const SLASH_ACTIVE = 0.15;
        const SLASH_RANGE = 66;                     // big sword reach
        const SLASH_HEIGHT = 54;
        const STAR_SPEED = 580;
        const PLAYER_DMG = 1;                       // every attack = 1 heart

        const ENEMY_SPEED = kids ? 0.7 : 1;
        const TELEGRAPH = kids ? 1.0 : 0.72;        // obvious wind-up time
        const ENEMY_RECOVER = 0.45;
        const ENEMY_COOLDOWN = kids ? 2.6 : 1.9;    // long delay between attacks
        const CHASE_RANGE = 250;

        // ----- gesture thresholds -----
        const MOVE_THRESH = 16;
        const SWIPE_THRESH = 38;
        const TAP_MAX_MOVE = 16;
        const TAP_MAX_TIME = 260;

        let W, H, groundY;
        let camX;
        let levelLength, level;
        let hero, platforms, enemies, gems, drops, stars, orbs, particles, chest;
        let boss, bossSpawned, levelAdvance, victory;
        let hearts, score, weapon, alive, started;
        let bannerText, bannerTime;
        let time, rafId, lastTs;

        // input state
        let touchMoveDir = 0, touchShell = false;
        let keyLeft = false, keyRight = false, keyDown = false;
        const pointers = new Map();   // id -> { sx, sy, st, mode, isBtn }
        let moveId = null, shellId = null;

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const newGround = H - Math.max(64, Math.round(H * 0.15));
            if (groundY === undefined) {
                groundY = newGround;
            } else if (newGround !== groundY) {
                // Shift the whole world so gameplay survives orientation changes.
                const dy = newGround - groundY;
                groundY = newGround;
                if (hero) hero.y += dy;
                if (platforms) platforms.forEach(p => p.y += dy);
                if (enemies) enemies.forEach(e => e.baseY += dy);
                if (gems) gems.forEach(g => g.y += dy);
                if (drops) drops.forEach(d => d.y += dy);
                if (boss) boss.baseY += dy;
                if (chest) chest.y += dy;
            }
        }

        function weaponBtnRect() {
            return { x: W - 98, y: 14, w: 84, h: 34 };
        }

        /* ---------- level building ---------- */

        function buildLevel(keepStats) {
            levelLength = Math.max(W * 2.2, 2400 + level * 360);
            platforms = [];
            enemies = [];
            gems = [];
            drops = [];
            stars = [];
            orbs = [];
            particles = [];
            chest = null;
            boss = null;
            bossSpawned = false;
            levelAdvance = 0;
            victory = false;

            const types = ["zombie", "marsh", "robot"];

            // Floating platforms with the odd gem or perched enemy.
            let px = 460;
            while (px < levelLength - 520) {
                const pw = 92 + Math.random() * 78;
                const py = groundY - (74 + Math.random() * (H * 0.26));
                platforms.push({ x: px, y: py, w: pw, h: 16 });
                if (Math.random() < 0.7) gems.push(makeGem(px + pw / 2, py - 26));
                if (Math.random() < 0.34) {
                    const t = types[Math.floor(Math.random() * 2)]; // walkers only on ledges
                    enemies.push(makeEnemy(t, px + pw / 2, py, px + 14, px + pw - 14));
                }
                px += pw + 180 + Math.random() * 200;
            }

            // Ground patrol enemies, spaced out and ramping up with the level.
            let ex = 620;
            const gap = Math.max(360 - level * 12, 230);
            while (ex < levelLength - 460) {
                const t = types[Math.floor(Math.random() * types.length)];
                enemies.push(makeEnemy(t, ex, groundY, ex - 80, ex + 80));
                ex += gap + Math.random() * 220;
            }

            // Treasure gems on the ground to reward exploring.
            for (let gx = 360; gx < levelLength - 460; gx += 300 + Math.random() * 260) {
                gems.push(makeGem(gx, groundY - 30));
            }

            hero = {
                x: 90, y: groundY, vx: 0, vy: 0, w: 36, h: 30,
                facing: 1, onGround: true, walk: 0,
                dashTime: 0, dashCd: 0, dashIFrame: 0, dashUsed: false,
                shell: false, invuln: 0,
                attackTime: 0, attackCd: 0, slashId: 0, py: groundY
            };
            if (!keepStats) {
                hearts = MAX_HEARTS;
                score = 0;
                weapon = "sword";
            }
            host.setScore(score);
            camX = 0;
            banner("LEVEL " + level, 1.8);
        }

        function makeGem(x, y) {
            return { x: x, y: y, bob: Math.random() * Math.PI * 2 };
        }

        function makeEnemy(kind, x, baseY, patrolMin, patrolMax) {
            const e = {
                kind: kind, x: x, baseY: baseY, vx: 0, facing: -1,
                state: "walk", t: 0, cd: 0.7 + Math.random() * 1.3,
                hitFlash: 0, hop: 0, hopT: Math.random() * 6, lungeV: 0,
                lastHitSlash: -1, patrolMin: patrolMin, patrolMax: patrolMax
            };
            if (kind === "zombie") { e.hp = 2; e.w = 30; e.h = 44; e.speed = 46 * ENEMY_SPEED; e.reward = 10; }
            else if (kind === "marsh") { e.hp = 2; e.w = 40; e.h = 36; e.speed = 34 * ENEMY_SPEED; e.reward = 12; }
            else { e.hp = 3; e.w = 46; e.h = 48; e.speed = 0; e.ranged = true; e.reward = 16; }
            return e;
        }

        function spawnBoss() {
            bossSpawned = true;
            const kind = ["golem", "marshking", "warbot"][(level - 1) % 3];
            boss = {
                kind: kind, x: levelLength - 180, baseY: groundY, vx: 0, facing: -1,
                w: 92, h: 104, maxHp: (kids ? 6 : 9) + level * 3, hp: 0,
                state: "intro", t: 0, cd: 1.6, hitFlash: 0, lungeV: 0, lastHitSlash: -1
            };
            boss.hp = boss.maxHp;
            banner((kind === "warbot" ? "WAR TITAN" : kind === "marshking" ? "MARSH KING" : "CAVE GOLEM") + " APPEARS!", 2.2);
            SGSound.play("gameover");
            host.vibrate([60, 40, 60]);
        }

        function nextLevel() {
            level += 1;
            buildLevel(true);
        }

        /* ---------- actions ---------- */

        function banner(text, t) { bannerText = text; bannerTime = t; }

        function jump() {
            if (!alive || hero.shell || !hero.onGround) return;
            started = true;
            hero.vy = -JUMP_V;
            hero.onGround = false;
            SGSound.play("jump");
            puff(hero.x, hero.y, "#cdebd6", 6);
        }

        function startDash(dx, dy) {
            if (!alive || hero.shell || hero.onGround || hero.dashUsed || hero.dashCd > 0) return;
            started = true;
            const len = Math.hypot(dx, dy) || 1;
            hero.vx = (dx / len) * DASH_SPEED;
            hero.vy = (dy / len) * DASH_SPEED;
            if (Math.abs(dy) < 0.2) hero.vy = 0;
            hero.dashTime = DASH_TIME;
            hero.dashCd = DASH_CD;
            hero.dashIFrame = DASH_TIME + 0.06;
            hero.dashUsed = true;
            if (dx !== 0) hero.facing = dx < 0 ? -1 : 1;
            SGSound.play("flap");
            puff(hero.x, hero.y - hero.h / 2, "#9ad8ff", 8);
        }

        function attack() {
            if (!alive || hero.shell || hero.attackCd > 0) return;
            started = true;
            hero.attackTime = ATTACK_DUR;
            if (weapon === "sword") {
                hero.attackCd = 0.34;
                hero.slashId += 1;
                SGSound.play("whack");
            } else {
                hero.attackCd = 0.3;
                stars.push({
                    x: hero.x + hero.facing * 18, y: hero.y - hero.h / 2,
                    vx: hero.facing * STAR_SPEED, vy: 0, life: 1.1, rot: 0
                });
                SGSound.play("shoot");
            }
            host.vibrate(8);
        }

        function toggleWeapon() {
            weapon = weapon === "sword" ? "star" : "sword";
            SGSound.play("flip");
            host.vibrate(10);
        }

        function hurtHero() {
            if (!alive || hero.invuln > 0 || hero.shell || hero.dashIFrame > 0) return;
            hearts -= 1;
            hero.invuln = HIT_INVULN;
            SGSound.play("hit");
            host.vibrate([70, 50, 90]);
            puff(hero.x, hero.y - hero.h / 2, "#ff5d5d", 12);
            if (hearts <= 0) {
                hearts = 0;
                alive = false;
                SGSound.play("explode");
                setTimeout(() => host.gameOver(score), 850);
            }
        }

        function healHeart() {
            if (hearts < MAX_HEARTS) hearts += 1;
            SGSound.play("perfect");
        }

        function addScore(n, x, y) {
            score += n;
            host.setScore(score);
            if (x !== undefined) puff(x, y, "#ffd166", 5);
        }

        function damageTarget(t, fx, fy) {
            t.hp -= PLAYER_DMG;
            t.hitFlash = 0.16;
            SGSound.play("eat");
            host.vibrate(10);
            puff(fx, fy, "#fff2c2", 6);
        }

        function killEnemy(e) {
            addScore(e.reward, e.x, e.baseY - e.h / 2);
            puff(e.x, e.baseY - e.h / 2, "#9ad8ff", 12);
            SGSound.play("explode");
            if (Math.random() < 0.3) gems.push(makeGem(e.x, e.baseY - 26));
        }

        function defeatBoss() {
            const bonus = 60 + level * 25;
            addScore(bonus);
            banner("TREASURE UNLOCKED!  +" + bonus, 2.4);
            SGSound.play("highscore");
            host.vibrate([90, 50, 140]);
            for (let i = 0; i < 40; i++) {
                particles.push({
                    x: boss.x, y: boss.baseY - boss.h / 2,
                    vx: (Math.random() - 0.5) * 460, vy: (Math.random() - 0.7) * 460,
                    life: 1, color: ["#ffd166", "#ff7b3d", "#9ad8ff"][i % 3], size: Math.random() * 4 + 2
                });
            }
            // Drop exactly as many hearts as the turtle is missing — a full heal.
            const missing = MAX_HEARTS - hearts;
            for (let i = 0; i < missing; i++) {
                drops.push({
                    x: boss.x + (Math.random() - 0.5) * 90,
                    y: boss.baseY - boss.h / 2 - Math.random() * 50,
                    vx: (Math.random() - 0.5) * 120, vy: -160 - Math.random() * 120, bob: 0
                });
            }
            chest = { x: boss.x, y: groundY - 34, open: 0 };
            enemies = [];
            orbs = [];
            boss = null;
            victory = true;
            levelAdvance = 3;
        }

        function puff(x, y, color, n) {
            for (let i = 0; i < n; i++) {
                particles.push({
                    x: x, y: y,
                    vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.7) * 220,
                    life: 0.5 + Math.random() * 0.3, color: color, size: Math.random() * 3 + 2
                });
            }
        }

        /* ---------- collision helpers ---------- */

        function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
            return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
        }
        function heroBox() {
            return { x: hero.x - hero.w / 2, y: hero.y - hero.h, w: hero.w, h: hero.h };
        }
        function enemyBox(e) {
            return { x: e.x - e.w / 2, y: e.baseY - e.h - (e.hop || 0), w: e.w, h: e.h };
        }

        /* ---------- update ---------- */

        function update(dt) {
            time += dt;
            if (bannerTime > 0) bannerTime -= dt;

            const moveDir = touchMoveDir !== 0 ? touchMoveDir : ((keyRight ? 1 : 0) - (keyLeft ? 1 : 0));
            const shellWanted = (touchShell || keyDown) && alive;

            if (alive) {
                if (shellWanted && !hero.shell) { hero.shell = true; SGSound.play("bounce"); }
                if (!shellWanted && hero.shell) hero.shell = false;
                updateHero(dt, moveDir);
            }

            updateStars(dt);
            updateEnemies(dt);
            updateBoss(dt);
            updateOrbs(dt);
            updatePickups(dt);

            // Camera follows the turtle, clamped to the cave bounds.
            const targetCam = Math.max(0, Math.min(hero.x - W * 0.42, Math.max(0, levelLength - W)));
            camX += (targetCam - camX) * Math.min(1, dt * 8);

            if (alive && !bossSpawned && hero.x > levelLength - 430) spawnBoss();

            if (victory && levelAdvance > 0) {
                levelAdvance -= dt;
                if (levelAdvance <= 0) nextLevel();
            }

            // particles
            for (const p of particles) {
                p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; p.life -= dt;
            }
            particles = particles.filter(p => p.life > 0);
        }

        function updateHero(dt, moveDir) {
            hero.py = hero.y;

            if (hero.dashTime > 0) {
                hero.dashTime -= dt;
                if (hero.dashTime <= 0) hero.vy = 0;
            } else {
                let target = moveDir * (hero.onGround ? MOVE_SPEED : AIR_MOVE);
                if (hero.shell) target = 0;
                const accel = hero.onGround ? 2600 : 1700;
                if (hero.vx < target) hero.vx = Math.min(target, hero.vx + accel * dt);
                else hero.vx = Math.max(target, hero.vx - accel * dt);
                if (moveDir === 0 && hero.onGround) hero.vx *= Math.pow(0.0008, dt);
                hero.vy += GRAVITY * dt;
            }
            if (moveDir !== 0 && hero.dashTime <= 0 && !hero.shell) hero.facing = moveDir;

            hero.x += hero.vx * dt;
            hero.y += hero.vy * dt;
            hero.x = Math.max(16, Math.min(hero.x, levelLength - 16));

            hero.onGround = false;
            if (hero.y >= groundY) { hero.y = groundY; hero.vy = 0; hero.onGround = true; }
            for (const p of platforms) {
                if (hero.vy >= 0 && hero.py <= p.y + 2 && hero.y >= p.y && hero.y <= p.y + 26 &&
                    hero.x > p.x - 2 && hero.x < p.x + p.w + 2) {
                    hero.y = p.y; hero.vy = 0; hero.onGround = true;
                }
            }
            if (hero.onGround) hero.dashUsed = false;
            if (hero.onGround && Math.abs(hero.vx) > 20) hero.walk += dt * 9;

            if (hero.invuln > 0) hero.invuln -= dt;
            if (hero.attackCd > 0) hero.attackCd -= dt;
            if (hero.attackTime > 0) hero.attackTime -= dt;
            if (hero.dashCd > 0) hero.dashCd -= dt;
            if (hero.dashIFrame > 0) hero.dashIFrame -= dt;

            // Sword slash: a wide arc that hits each enemy once per swing.
            if (weapon === "sword" && hero.attackTime > ATTACK_DUR - SLASH_ACTIVE) {
                const sx = hero.facing > 0 ? hero.x : hero.x - SLASH_RANGE;
                const sy = hero.y - hero.h - 6;
                const sb = { x: sx, y: sy, w: SLASH_RANGE, h: SLASH_HEIGHT };
                for (const e of enemies) {
                    if (e.lastHitSlash === hero.slashId) continue;
                    const eb = enemyBox(e);
                    if (overlap(sb.x, sb.y, sb.w, sb.h, eb.x, eb.y, eb.w, eb.h)) {
                        e.lastHitSlash = hero.slashId;
                        damageTarget(e, e.x, e.baseY - e.h / 2);
                    }
                }
                if (boss && boss.state !== "dying" && boss.lastHitSlash !== hero.slashId) {
                    const bb = enemyBox(boss);
                    if (overlap(sb.x, sb.y, sb.w, sb.h, bb.x, bb.y, bb.w, bb.h)) {
                        boss.lastHitSlash = hero.slashId;
                        damageTarget(boss, boss.x, boss.baseY - boss.h / 2);
                        if (boss.hp <= 0) defeatBoss();
                    }
                }
            }
        }

        function updateStars(dt) {
            for (const s of stars) {
                s.x += s.vx * dt; s.y += s.vy * dt; s.rot += dt * 18; s.life -= dt;
                const sb = { x: s.x - 9, y: s.y - 9, w: 18, h: 18 };
                for (const e of enemies) {
                    const eb = enemyBox(e);
                    if (overlap(sb.x, sb.y, sb.w, sb.h, eb.x, eb.y, eb.w, eb.h)) {
                        damageTarget(e, s.x, s.y); s.life = 0; break;
                    }
                }
                if (s.life > 0 && boss && boss.state !== "dying") {
                    const bb = enemyBox(boss);
                    if (overlap(sb.x, sb.y, sb.w, sb.h, bb.x, bb.y, bb.w, bb.h)) {
                        damageTarget(boss, s.x, s.y); s.life = 0;
                        if (boss.hp <= 0) defeatBoss();
                    }
                }
            }
            stars = stars.filter(s => s.life > 0 && s.x > camX - 40 && s.x < camX + W + 40);
        }

        function updateEnemies(dt) {
            for (const e of enemies) {
                if (e.hitFlash > 0) e.hitFlash -= dt;
                if (started && alive) stepEnemy(e, dt);
            }
            enemies = enemies.filter(e => {
                if (e.hp <= 0) { killEnemy(e); return false; }
                return true;
            });
        }

        function stepEnemy(e, dt) {
            e.t += dt;
            const dist = hero.x - e.x;
            const adist = Math.abs(dist);
            const faceTo = dist < 0 ? -1 : 1;

            if (e.kind === "marsh") { e.hopT += dt * 6; e.hop = Math.max(0, Math.sin(e.hopT)) * 9; }

            switch (e.state) {
                case "walk": {
                    e.cd -= dt;
                    if (e.ranged) {
                        e.facing = faceTo;
                    } else if (adist < CHASE_RANGE) {
                        e.facing = faceTo;
                        e.x += e.facing * e.speed * dt;
                    } else {
                        e.x += e.facing * e.speed * 0.5 * dt;
                        if (e.x < e.patrolMin) e.facing = 1;
                        if (e.x > e.patrolMax) e.facing = -1;
                    }
                    e.x = Math.max(12, Math.min(e.x, levelLength - 12));
                    const range = e.ranged ? 340 : 58;
                    const sameLevel = Math.abs((hero.y) - e.baseY) < 70;
                    if (e.cd <= 0 && adist < range && (e.ranged ? adist > 60 : true) && sameLevel) {
                        e.state = "windup"; e.t = 0; e.facing = faceTo;
                    }
                    break;
                }
                case "windup":
                    if (e.t >= TELEGRAPH) {
                        e.state = "attack"; e.t = 0;
                        if (e.ranged) {
                            orbs.push({
                                x: e.x + e.facing * 24, y: e.baseY - e.h * 0.6,
                                vx: e.facing * 230 * ENEMY_SPEED, vy: 0, life: 3
                            });
                            SGSound.play("shoot");
                        } else {
                            e.lungeV = 360 * ENEMY_SPEED;
                            SGSound.play("whack");
                        }
                    }
                    break;
                case "attack":
                    if (!e.ranged) {
                        e.x += e.facing * e.lungeV * dt;
                        e.lungeV = Math.max(0, e.lungeV - 700 * dt);
                        e.x = Math.max(12, Math.min(e.x, levelLength - 12));
                        const eb = enemyBox(e); const hb = heroBox();
                        if (overlap(eb.x, eb.y, eb.w, eb.h, hb.x, hb.y, hb.w, hb.h)) hurtHero();
                    }
                    if (e.t >= (e.ranged ? 0.3 : 0.4)) { e.state = "recover"; e.t = 0; }
                    break;
                case "recover":
                    if (e.t >= ENEMY_RECOVER) { e.state = "walk"; e.cd = ENEMY_COOLDOWN; }
                    break;
            }
        }

        function updateBoss(dt) {
            if (!boss) return;
            if (boss.hitFlash > 0) boss.hitFlash -= dt;
            if (!started || !alive) return;
            boss.t += dt;
            const dist = hero.x - boss.x;
            const faceTo = dist < 0 ? -1 : 1;

            switch (boss.state) {
                case "intro":
                    if (boss.t >= 1.2) { boss.state = "walk"; boss.t = 0; boss.cd = 1.4; }
                    break;
                case "walk": {
                    boss.cd -= dt;
                    boss.facing = faceTo;
                    const sp = (boss.kind === "warbot" ? 26 : 52) * ENEMY_SPEED;
                    if (Math.abs(dist) > 120) boss.x += boss.facing * sp * dt;
                    boss.x = Math.max(W * 0.5, Math.min(boss.x, levelLength - 60));
                    const range = boss.kind === "warbot" ? 460 : 150;
                    if (boss.cd <= 0 && Math.abs(dist) < range) { boss.state = "windup"; boss.t = 0; boss.facing = faceTo; }
                    break;
                }
                case "windup":
                    if (boss.t >= TELEGRAPH + 0.35) {
                        boss.state = "attack"; boss.t = 0;
                        if (boss.kind === "warbot") {
                            for (let a = -1; a <= 1; a++) {
                                orbs.push({
                                    x: boss.x + boss.facing * 30, y: boss.baseY - boss.h * 0.6,
                                    vx: boss.facing * 240 * ENEMY_SPEED, vy: a * 90, life: 3.5, big: true
                                });
                            }
                            SGSound.play("shoot");
                        } else {
                            boss.lungeV = 520 * ENEMY_SPEED;
                            SGSound.play("explode");
                        }
                    }
                    break;
                case "attack":
                    if (boss.kind !== "warbot") {
                        boss.x += boss.facing * boss.lungeV * dt;
                        boss.lungeV = Math.max(0, boss.lungeV - 760 * dt);
                        boss.x = Math.max(W * 0.5, Math.min(boss.x, levelLength - 60));
                        const bb = enemyBox(boss); const hb = heroBox();
                        if (overlap(bb.x, bb.y, bb.w, bb.h, hb.x, hb.y, hb.w, hb.h)) hurtHero();
                    }
                    if (boss.t >= 0.5) { boss.state = "recover"; boss.t = 0; }
                    break;
                case "recover":
                    if (boss.t >= 0.6) { boss.state = "walk"; boss.cd = kids ? 2.2 : 1.7; }
                    break;
            }
        }

        function updateOrbs(dt) {
            for (const o of orbs) {
                o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
                const r = o.big ? 16 : 11;
                const hb = heroBox();
                if (overlap(o.x - r, o.y - r, r * 2, r * 2, hb.x, hb.y, hb.w, hb.h)) {
                    hurtHero(); o.life = 0;
                }
            }
            orbs = orbs.filter(o => o.life > 0 && o.x > camX - 60 && o.x < camX + W + 60);
        }

        function updatePickups(dt) {
            const hb = heroBox();
            for (const g of gems) {
                g.bob += dt * 4;
                if (overlap(g.x - 14, g.y - 14, 28, 28, hb.x, hb.y, hb.w, hb.h)) {
                    g.taken = true; addScore(5); SGSound.play("score");
                }
            }
            gems = gems.filter(g => !g.taken);

            for (const d of drops) {
                // Dropped hearts home toward the turtle so they are always caught.
                const dx = hero.x - d.x, dy = (hero.y - hero.h / 2) - d.y;
                const dl = Math.hypot(dx, dy) || 1;
                d.vx += (dx / dl) * 900 * dt;
                d.vy += (dy / dl) * 900 * dt;
                d.vx *= 0.92; d.vy *= 0.92;
                d.x += d.vx * dt; d.y += d.vy * dt; d.bob += dt * 6;
                if (overlap(d.x - 14, d.y - 14, 28, 28, hb.x, hb.y, hb.w, hb.h)) {
                    d.taken = true; healHeart(); puff(d.x, d.y, "#ff8aa0", 6);
                }
            }
            drops = drops.filter(d => !d.taken);

            if (chest) {
                chest.open = Math.min(1, chest.open + dt * 1.5);
                if (overlap(chest.x - 22, chest.y - 30, 44, 30, hb.x, hb.y, hb.w, hb.h) && !chest.looted) {
                    chest.looted = true; addScore(50, chest.x, chest.y - 20); SGSound.play("perfect");
                }
            }
        }

        /* ---------- drawing ---------- */

        function roundRect(x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.fill();
        }

        function drawHeart(x, y, r) {
            ctx.beginPath();
            ctx.moveTo(x, y + r * 0.9);
            ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.7, y - r * 1.2, x, y - r * 0.3);
            ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9);
            ctx.fill();
        }

        function drawStarShape(x, y, r, rot) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2;
                const rr = i % 2 === 0 ? r : r * 0.45;
                ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function draw() {
            drawBackground();

            ctx.save();
            ctx.translate(-camX, 0);

            drawGround();
            for (const p of platforms) {
                if (p.x + p.w < camX - 20 || p.x > camX + W + 20) continue;
                ctx.fillStyle = "#3a3358";
                roundRect(p.x, p.y, p.w, p.h, 6);
                ctx.fillStyle = "#4d4670";
                roundRect(p.x, p.y, p.w, 5, 4);
            }

            for (const g of gems) {
                if (g.x < camX - 20 || g.x > camX + W + 20) continue;
                drawGem(g.x, g.y + Math.sin(g.bob) * 3);
            }
            if (chest) drawChest(chest);

            for (const e of enemies) {
                if (e.x < camX - 60 || e.x > camX + W + 60) continue;
                drawEnemy(e);
            }
            if (boss) drawBoss(boss);

            for (const o of orbs) drawOrb(o);
            for (const s of stars) {
                ctx.fillStyle = "#ffe08a";
                drawStarShape(s.x, s.y, 10, s.rot);
            }

            drawTurtle();

            for (const p of particles) {
                ctx.globalAlpha = Math.max(0, p.life * 1.6);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.globalAlpha = 1;

            ctx.restore();

            drawHud();
        }

        function drawBackground() {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, "#1b1430");
            g.addColorStop(1, "#0d0a18");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            // Parallax rock silhouettes.
            ctx.fillStyle = "#181228";
            const off1 = -(camX * 0.3) % 220;
            for (let x = off1 - 220; x < W + 220; x += 220) {
                ctx.beginPath();
                ctx.moveTo(x, groundY);
                ctx.lineTo(x + 60, groundY - 90);
                ctx.lineTo(x + 130, groundY - 40);
                ctx.lineTo(x + 200, groundY - 110);
                ctx.lineTo(x + 260, groundY);
                ctx.closePath();
                ctx.fill();
            }
            // Stalactites from the ceiling.
            ctx.fillStyle = "#221a36";
            const off2 = -(camX * 0.5) % 180;
            for (let x = off2 - 180; x < W + 180; x += 180) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x + 22, 0);
                ctx.lineTo(x + 11, 46 + ((x | 0) % 30));
                ctx.closePath();
                ctx.fill();
            }
        }

        function drawGround() {
            ctx.fillStyle = "#241c3a";
            ctx.fillRect(camX, groundY, W, H - groundY);
            ctx.fillStyle = "#352b52";
            ctx.fillRect(camX, groundY, W, 6);
            ctx.fillStyle = "#1c1530";
            for (let x = Math.floor(camX / 48) * 48; x < camX + W; x += 48) {
                ctx.fillRect(x, groundY + 16, 2, H - groundY);
            }
        }

        function drawGem(x, y) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = "#ffd166";
            ctx.beginPath();
            ctx.moveTo(0, -11); ctx.lineTo(10, -2); ctx.lineTo(0, 12); ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#fff0b8";
            ctx.beginPath();
            ctx.moveTo(0, -11); ctx.lineTo(4, -3); ctx.lineTo(-4, -3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function drawChest(c) {
            const lift = c.open * 6;
            ctx.fillStyle = "#8a5a2b";
            roundRect(c.x - 22, c.y - 18, 44, 22, 4);
            ctx.fillStyle = "#a9712f";
            roundRect(c.x - 22, c.y - 18 - lift, 44, 14 - c.open * 4, 6);
            ctx.fillStyle = "#ffd166";
            roundRect(c.x - 4, c.y - 12, 8, 12, 2);
            if (c.open > 0.4) {
                ctx.globalAlpha = c.open;
                ctx.fillStyle = "#fff0b8";
                drawStarShape(c.x, c.y - 16, 7, time * 3);
                ctx.globalAlpha = 1;
            }
        }

        function drawOrb(o) {
            const r = o.big ? 15 : 11;
            const grad = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, r);
            grad.addColorStop(0, "#fff2b0");
            grad.addColorStop(0.5, "#ff7b3d");
            grad.addColorStop(1, "rgba(255,80,60,0.1)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawEnemy(e) {
            const winding = e.state === "windup";
            const wob = winding ? Math.sin(time * 30) * 2 : 0;
            const bottom = e.baseY - (e.hop || 0);
            ctx.save();
            ctx.translate(e.x + wob, bottom);
            if (e.hitFlash > 0) { ctx.globalAlpha = 0.6; }

            if (e.kind === "zombie") {
                ctx.fillStyle = winding ? "#a7e07a" : "#7bbf5a";
                roundRect(-e.w / 2, -e.h, e.w, e.h, 7);
                ctx.fillStyle = "#4f8038";
                roundRect(-e.w / 2, -e.h * 0.45, e.w, e.h * 0.45, 5);
                // arms thrust out during the wind-up telegraph
                ctx.strokeStyle = "#6aa84c";
                ctx.lineWidth = 6; ctx.lineCap = "round";
                const reach = winding ? e.facing * 18 : e.facing * 6;
                ctx.beginPath();
                ctx.moveTo(0, -e.h * 0.7);
                ctx.lineTo(reach, -e.h * 0.7 - (winding ? 8 : 0));
                ctx.stroke();
                ctx.fillStyle = "#d23b3b";
                ctx.beginPath();
                ctx.arc(e.facing * 5, -e.h * 0.78, 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (e.kind === "marsh") {
                const squash = winding ? 0.78 : 1;
                ctx.fillStyle = "#fff7ef";
                roundRect(-e.w / 2, -e.h * squash, e.w, e.h * squash, 14);
                ctx.fillStyle = "#ffd2dc";
                ctx.beginPath();
                ctx.arc(-8, -e.h * squash * 0.45, 4, 0, Math.PI * 2);
                ctx.arc(8, -e.h * squash * 0.45, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#3a2f4a";
                ctx.beginPath();
                ctx.arc(e.facing * 4 - 6, -e.h * squash * 0.6, 3, 0, Math.PI * 2);
                ctx.arc(e.facing * 4 + 6, -e.h * squash * 0.6, 3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = "#9aa3b5";
                roundRect(-e.w / 2, -e.h, e.w, e.h * 0.78, 6);
                ctx.fillStyle = "#5b6478";
                roundRect(-e.w / 2, -e.h * 0.24, e.w, e.h * 0.24, 4);
                // charging eye telegraph
                const eye = winding ? "#ffd166" : "#ff5d5d";
                ctx.fillStyle = eye;
                if (winding) { ctx.shadowColor = eye; ctx.shadowBlur = 14; }
                ctx.beginPath();
                ctx.arc(e.facing * 8, -e.h * 0.6, winding ? 8 : 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.restore();

            if (winding) {
                ctx.fillStyle = "rgba(255,209,102,0.9)";
                ctx.font = "800 16px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("!", e.x, e.baseY - e.h - 14 - (e.hop || 0));
            }
        }

        function drawBoss(b) {
            const winding = b.state === "windup";
            const wob = winding ? Math.sin(time * 26) * 3 : 0;
            ctx.save();
            ctx.translate(b.x + wob, b.baseY);
            if (b.hitFlash > 0) ctx.globalAlpha = 0.6;
            const base = winding ? "#ffd166" : (b.kind === "marshking" ? "#fff7ef" : b.kind === "warbot" ? "#9aa3b5" : "#b07a4a");
            ctx.fillStyle = base;
            roundRect(-b.w / 2, -b.h, b.w, b.h, 16);
            ctx.fillStyle = "rgba(0,0,0,0.18)";
            roundRect(-b.w / 2, -b.h * 0.4, b.w, b.h * 0.4, 12);
            // eyes
            ctx.fillStyle = winding ? "#ff3b3b" : "#ffe08a";
            if (winding) { ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 18; }
            ctx.beginPath();
            ctx.arc(-14, -b.h * 0.62, 8, 0, Math.PI * 2);
            ctx.arc(16, -b.h * 0.62, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        function drawTurtle() {
            const flashing = hero.invuln > 0 && Math.floor(time * 12) % 2 === 0;
            ctx.save();
            ctx.translate(hero.x, hero.y);
            if (flashing) ctx.globalAlpha = 0.35;
            if (hero.dashIFrame > 0) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.7);

            const cx = 0;
            const midY = -hero.h / 2;

            if (hero.shell) {
                // Tucked in: armoured dome, no limbs, spinning shell pattern.
                ctx.fillStyle = "#1f7d44";
                ctx.beginPath();
                ctx.ellipse(cx, midY, hero.w / 2 + 2, hero.h / 2 + 4, 0, Math.PI, 0, false);
                ctx.fill();
                ctx.fillStyle = "#2e9e5b";
                ctx.beginPath();
                ctx.ellipse(cx, midY, hero.w / 2 - 4, hero.h / 2, 0, Math.PI, 0, false);
                ctx.fill();
                ctx.strokeStyle = "#1a6b3a";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, midY, 6, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.scale(hero.facing, 1);
                const step = Math.sin(hero.walk) * (hero.onGround ? 4 : 0);
                // legs
                ctx.fillStyle = "#8fd6a0";
                roundRect(-10, -8 + step, 8, 9, 3);
                roundRect(4, -8 - step, 8, 9, 3);
                // head
                ctx.fillStyle = "#8fd6a0";
                ctx.beginPath();
                ctx.arc(hero.w / 2 - 4, -hero.h + 12, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#1c2030";
                ctx.beginPath();
                ctx.arc(hero.w / 2 - 1, -hero.h + 10, 2, 0, Math.PI * 2);
                ctx.fill();
                // shell
                ctx.fillStyle = "#2e9e5b";
                ctx.beginPath();
                ctx.ellipse(-2, -hero.h / 2 - 1, hero.w / 2, hero.h / 2 + 4, 0, Math.PI, 0, false);
                ctx.fill();
                ctx.fillStyle = "#1f7d44";
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.arc(-2 + i * 9, -hero.h / 2 - 1, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                // sword in the front hand
                const swing = hero.attackTime > 0 && weapon === "sword"
                    ? (1 - hero.attackTime / ATTACK_DUR) : 0;
                ctx.save();
                ctx.translate(hero.w / 2 - 2, -10);
                ctx.rotate(-1.1 + swing * 2.0);
                ctx.fillStyle = "#cfd8e6";
                roundRect(0, -3, 24, 5, 2);
                ctx.fillStyle = "#ffd166";
                roundRect(-4, -4, 5, 7, 2);
                ctx.restore();
            }
            ctx.restore();

            // Sword slash arc (drawn in world space, large telegraphed range).
            if (weapon === "sword" && hero.attackTime > ATTACK_DUR - SLASH_ACTIVE && !hero.shell) {
                const prog = 1 - (hero.attackTime - (ATTACK_DUR - SLASH_ACTIVE)) / SLASH_ACTIVE;
                ctx.save();
                ctx.translate(hero.x, hero.y - hero.h / 2);
                ctx.scale(hero.facing, 1);
                ctx.globalAlpha = 0.6 * (1 - prog);
                ctx.strokeStyle = "#eaf2ff";
                ctx.lineWidth = 7;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.arc(6, 0, SLASH_RANGE - 8, -0.9 + prog * 0.6, 0.9 + prog * 0.6);
                ctx.stroke();
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }

        function drawHud() {
            // Hearts
            for (let i = 0; i < MAX_HEARTS; i++) {
                ctx.globalAlpha = i < hearts ? 1 : 0.22;
                ctx.fillStyle = "#ff5d5d";
                drawHeart(22 + i * 20, 24, 7);
            }
            ctx.globalAlpha = 1;

            // Level label
            ctx.fillStyle = "rgba(242,243,255,0.85)";
            ctx.font = "700 12px system-ui, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("CAVE " + level, 22, 46);

            // Weapon toggle button
            const b = weaponBtnRect();
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            roundRect(b.x, b.y, b.w, b.h, 9);
            ctx.fillStyle = weapon === "sword" ? "#eaf2ff" : "#ffe08a";
            if (weapon === "sword") {
                ctx.save();
                ctx.translate(b.x + 18, b.y + b.h / 2);
                ctx.rotate(-0.6);
                roundRect(-2, -2, 18, 4, 2);
                ctx.fillStyle = "#ffd166";
                roundRect(-6, -3, 5, 6, 2);
                ctx.restore();
            } else {
                drawStarShape(b.x + 18, b.y + b.h / 2, 8, time * 4);
            }
            ctx.fillStyle = "#f2f3ff";
            ctx.font = "800 13px system-ui, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(weapon === "sword" ? "SWORD" : "STARS", b.x + 32, b.y + b.h / 2 + 4);

            // Boss health bar
            if (boss && boss.state !== "intro") {
                const bw = Math.min(W - 48, 320);
                const bx = (W - bw) / 2;
                const by = 56;
                ctx.fillStyle = "rgba(0,0,0,0.45)";
                roundRect(bx - 4, by - 4, bw + 8, 20, 8);
                const pct = Math.max(0, boss.hp / boss.maxHp);
                ctx.fillStyle = pct > 0.4 ? "#ff7b3d" : "#ff4d4d";
                roundRect(bx, by, bw * pct, 12, 6);
                ctx.fillStyle = "#f2f3ff";
                ctx.font = "800 11px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("BOSS", W / 2, by + 10);
            }

            // Dash cooldown pip
            if (hero.dashCd > 0) {
                ctx.fillStyle = "rgba(0,0,0,0.35)";
                roundRect(W - 96, H - 26, 72, 10, 5);
                ctx.fillStyle = "#9ad8ff";
                roundRect(W - 94, H - 24, 68 * (1 - hero.dashCd / DASH_CD), 6, 3);
            }

            // Center banner
            if (bannerTime > 0) {
                ctx.globalAlpha = Math.min(1, bannerTime * 1.6);
                ctx.fillStyle = "#ffd166";
                ctx.font = "800 23px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(bannerText, W / 2, H * 0.24);
                ctx.globalAlpha = 1;
            }

            if (!started && alive) {
                ctx.fillStyle = "rgba(242,243,255,0.92)";
                ctx.font = "700 16px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("Swipe & HOLD to move \u2022 swipe UP to jump", W / 2, H * 0.34);
                ctx.font = "500 14px system-ui, sans-serif";
                ctx.fillStyle = "rgba(154,160,195,0.95)";
                ctx.fillText("TAP to attack \u2022 swipe in the air to DASH", W / 2, H * 0.34 + 24);
                ctx.fillText("Swipe DOWN for shell shield \u2022 reach the boss!", W / 2, H * 0.34 + 46);
            }
        }

        function loop(ts) {
            rafId = requestAnimationFrame(loop);
            if (!lastTs) lastTs = ts;
            const dt = Math.min((ts - lastTs) / 1000, 0.05);
            lastTs = ts;
            update(dt);
            draw();
        }

        /* ---------- input ---------- */

        function localPoint(clientX, clientY) {
            const r = canvas.getBoundingClientRect();
            return { x: clientX - r.left, y: clientY - r.top };
        }

        function pressStart(id, x, y) {
            const b = weaponBtnRect();
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                pointers.set(id, { isBtn: true });
                toggleWeapon();
                return;
            }
            pointers.set(id, { isBtn: false, sx: x, sy: y, st: performance.now(), mode: "" });
        }

        function pressMove(id, x, y) {
            const p = pointers.get(id);
            if (!p || p.isBtn) return;
            const dx = x - p.sx, dy = y - p.sy;
            const adx = Math.abs(dx), ady = Math.abs(dy);

            if (p.mode === "") {
                if (Math.max(adx, ady) < MOVE_THRESH) return;
                if (ady > adx) {
                    if (dy < -SWIPE_THRESH) {
                        if (hero.onGround) jump();
                        else startDash(hero.facing * 0.4, -1);
                        p.mode = "swiped";
                    } else if (dy > SWIPE_THRESH) {
                        touchShell = true; shellId = id; p.mode = "shell";
                    }
                } else {
                    const dir = dx < 0 ? -1 : 1;
                    if (!hero.onGround && !hero.shell) startDash(dir, 0);
                    touchMoveDir = dir; moveId = id; p.mode = "move";
                }
            } else if (p.mode === "move") {
                if (adx > 8) { touchMoveDir = dx < 0 ? -1 : 1; }
                if (dy > SWIPE_THRESH * 1.4 && ady > adx) {
                    touchShell = true; shellId = id;
                    if (moveId === id) { moveId = null; touchMoveDir = 0; }
                    p.mode = "shell";
                }
            }
        }

        function pressEnd(id, x, y) {
            const p = pointers.get(id);
            pointers.delete(id);
            if (!p || p.isBtn) return;
            const heldFor = performance.now() - p.st;
            const dist = Math.hypot(x - p.sx, y - p.sy);
            if (p.mode === "" && dist < TAP_MAX_MOVE && heldFor < TAP_MAX_TIME) attack();
            if (moveId === id) { moveId = null; touchMoveDir = 0; }
            if (shellId === id) { shellId = null; touchShell = false; }
        }

        function onTouchStart(e) {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const p = localPoint(t.clientX, t.clientY);
                pressStart(t.identifier, p.x, p.y);
            }
        }
        function onTouchMove(e) {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const p = localPoint(t.clientX, t.clientY);
                pressMove(t.identifier, p.x, p.y);
            }
        }
        function onTouchEnd(e) {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const p = localPoint(t.clientX, t.clientY);
                pressEnd(t.identifier, p.x, p.y);
            }
        }
        function onMouseDown(e) {
            const p = localPoint(e.clientX, e.clientY);
            pressStart("mouse", p.x, p.y);
        }
        function onMouseMove(e) {
            if (!pointers.has("mouse")) return;
            const p = localPoint(e.clientX, e.clientY);
            pressMove("mouse", p.x, p.y);
        }
        function onMouseUp(e) {
            const p = localPoint(e.clientX, e.clientY);
            pressEnd("mouse", p.x, p.y);
        }
        function onKeyDown(e) {
            if (e.repeat) return;
            switch (e.key) {
                case "ArrowLeft": case "a": case "A": keyLeft = true; break;
                case "ArrowRight": case "d": case "D": keyRight = true; break;
                case "ArrowDown": case "s": case "S": keyDown = true; break;
                case "ArrowUp": case "w": case "W": case " ": e.preventDefault(); jump(); break;
                case "z": case "Z": case "j": case "J": attack(); break;
                case "x": case "X": case "k": case "K": startDash(hero.facing, 0); break;
                case "c": case "C": toggleWeapon(); break;
            }
        }
        function onKeyUp(e) {
            switch (e.key) {
                case "ArrowLeft": case "a": case "A": keyLeft = false; break;
                case "ArrowRight": case "d": case "D": keyRight = false; break;
                case "ArrowDown": case "s": case "S": keyDown = false; break;
            }
        }

        function startState() {
            level = 1;
            alive = true;
            started = false;
            time = 0;
            lastTs = 0;
            bannerTime = 0;
            pointers.clear();
            moveId = null; shellId = null;
            touchMoveDir = 0; touchShell = false;
            keyLeft = keyRight = keyDown = false;
            buildLevel(false);
        }

        return {
            start() {
                resize();
                startState();
                window.addEventListener("resize", resize);
                canvas.addEventListener("touchstart", onTouchStart, { passive: false });
                canvas.addEventListener("touchmove", onTouchMove, { passive: false });
                canvas.addEventListener("touchend", onTouchEnd, { passive: false });
                canvas.addEventListener("mousedown", onMouseDown);
                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);
                window.addEventListener("keydown", onKeyDown);
                window.addEventListener("keyup", onKeyUp);
                rafId = requestAnimationFrame(loop);
            },
            restart() {
                startState();
            },
            destroy() {
                cancelAnimationFrame(rafId);
                window.removeEventListener("resize", resize);
                canvas.removeEventListener("touchstart", onTouchStart);
                canvas.removeEventListener("touchmove", onTouchMove);
                canvas.removeEventListener("touchend", onTouchEnd);
                canvas.removeEventListener("mousedown", onMouseDown);
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                window.removeEventListener("keydown", onKeyDown);
                window.removeEventListener("keyup", onKeyUp);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.turtlecave = {
        id: "turtlecave",
        name: "Shell Knight",
        emoji: "\u{1F422}",
        tag: "Sword turtle cave-crawl: swipe to move & dash, tap to slash, beat the boss!",
        scoreLabel: "treasure",
        create: create
    };
})();
