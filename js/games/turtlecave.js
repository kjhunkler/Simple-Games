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
        const SPIN_DUR = 0.42;                       // 3rd combo hit: spin attack
        const SPIN_ACTIVE = 0.32;
        const SPIN_RANGE = 82;                       // spin reaches both sides
        const COMBO_WINDOW = 0.5;                    // time to chain the next combo hit
        const STAR_SPEED = 580;
        const PLAYER_DMG = 1;                       // every attack = 1 heart

        const ENEMY_SPEED = kids ? 0.7 : 1;
        const TELEGRAPH = kids ? 1.0 : 0.72;        // obvious wind-up time
        const ENEMY_RECOVER = 0.45;
        const ENEMY_COOLDOWN = kids ? 2.6 : 1.9;    // long delay between attacks
        const CHASE_RANGE = 250;
        const DASH_DMG_KNOCK = 360;                 // sideways knockback a dash deals
        const ENEMY_POP = 150;                      // upward pop when an enemy is dash-hit
        const STAL_APPROACH = 80;                   // cracked stalactite drops within this X gap
        const SHELL_DROP_TIME = 1.0;                // hold shell on a ledge this long to fall through
        const BOUNCE_V = JUMP_V * 1.35;             // mushroom platform launch speed
        const DOUBLE_JUMP_V = JUMP_V * 0.9;         // second, mid-air jump
        const STAR_DASH_MULT = 1.8;                 // stars make the dash travel farther
        const SLOW_FALL_MAX = 150;                  // glide speed while holding stars
        const SHELL_FALL_MIN = 1150;                // shell plummets at least this fast
        const SHELL_GRAVITY_MULT = 1.7;             // extra gravity while shelled mid-air
        const SHELL_SLAM_MINVY = 680;               // fall speed needed to trigger a slam
        const SHELL_SLAM_RANGE = 100;               // slam shock radius
        const SHELL_SLAM_KNOCK = 320;               // slam knockback strength
        const GROUND_DASH_SPEED = 1500;             // swipe px/s that triggers a ground dash

        // ----- gesture thresholds -----
        const MOVE_THRESH = 16;
        const SWIPE_THRESH = 38;
        const TAP_MAX_MOVE = 16;
        const TAP_MAX_TIME = 260;
        const JUMP_ANGLE_MIN = Math.PI / 6;          // 30°: lean the jump past this
        const JUMP_LEAN = 0.55;                      // how much sideways speed a leaning jump gets

        // Each cave level recolours the cave a little.
        const BG_PALETTES = [
            { top: "#1b1430", bot: "#0d0a18", rock: "#241c3a", spike: "#352b52", spikeCrack: "#5a4a76" },
            { top: "#102330", bot: "#07121a", rock: "#16303f", spike: "#274a5b", spikeCrack: "#3f6a7e" },
            { top: "#241326", bot: "#120814", rock: "#34203a", spike: "#4e2f54", spikeCrack: "#744a78" },
            { top: "#0f2620", bot: "#06140f", rock: "#173a2c", spike: "#285243", spikeCrack: "#3f7c63" },
            { top: "#2a1c12", bot: "#140c07", rock: "#3a2716", spike: "#553d28", spikeCrack: "#7c5d3f" }
        ];

        let W, H, groundY, ceilingY;
        let camX;
        let levelLength, level;
        let hero, platforms, enemies, gems, drops, stars, orbs, particles, chest, stalactites, ceilingDecor;
        let pal;
        let enemyIdSeq = 0;
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
            // Sit the ground higher up so there is roomy dead space below for
            // thumbs to swipe/tap without covering the action.
            const newGround = H - Math.max(150, Math.round(H * 0.32));
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
                // Fallen stalactites rest on the floor, so keep them grounded.
                if (stalactites) stalactites.forEach(s => { if (s.fallen) s.y += dy; });
            }
            // Lower cave ceiling: stalactites dangle from here, dark soil above.
            const newCeiling = Math.max(56, Math.round(H * 0.15));
            if (ceilingDecor && ceilingY) {
                const cs = newCeiling / ceilingY;
                ceilingDecor.forEach(d => { d.y *= cs; });
            }
            ceilingY = newCeiling;
            if (stalactites) stalactites.forEach(s => { if (s.state === "hang") s.y = ceilingY; });
        }
        function weaponBtnRect() {
            const w = 108, h = 46;
            const x = W - w - 18;
            const y = H - h - 20;
            return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2, r: h / 2 };
        }

        /* ---------- level building ---------- */

        function buildLevel(keepStats) {
            levelLength = Math.max(W * 2.2, 2400 + level * 360);
            pal = BG_PALETTES[(level - 1) % BG_PALETTES.length];
            platforms = [];
            enemies = [];
            gems = [];
            drops = [];
            stars = [];
            orbs = [];
            particles = [];
            stalactites = [];
            ceilingDecor = [];
            chest = null;
            boss = null;
            bossSpawned = false;
            levelAdvance = 0;
            victory = false;

            const types = ["zombie", "marsh", "robot"];

            // Floating stone ledges with the odd gem or perched enemy.
            let px = 460;
            let platId = 1;
            while (px < levelLength - 520) {
                const pw = 92 + Math.random() * 78;
                const py = groundY - (74 + Math.random() * (H * 0.26));
                platforms.push({ id: platId++, x: px, y: py, w: pw, h: 16, mushroom: false, bounce: 0 });
                if (Math.random() < 0.7) gems.push(makeGem(px + pw / 2, py - 26));
                if (Math.random() < 0.34) {
                    const t = types[Math.floor(Math.random() * 2)]; // walkers only on ledges
                    enemies.push(makeEnemy(t, px + pw / 2, py, px + 14, px + pw - 14));
                }
                px += pw + 180 + Math.random() * 200;
            }

            // Springy mushroom caps sprout from the ground (rarely) and launch
            // the turtle skyward.
            let mx = 720;
            while (mx < levelLength - 560) {
                if (Math.random() < 0.5) {
                    const mw = 70 + Math.random() * 26;
                    platforms.push({ id: platId++, x: mx, y: groundY - 50, w: mw, h: 18, mushroom: true, bounce: 0 });
                }
                mx += 520 + Math.random() * 520;
            }

            // Stalactites hang from the lowered ceiling. Cracked ones shake and
            // crash down when the turtle walks underneath (or when shot).
            let sx = 320;
            while (sx < levelLength - 200) {
                const cracked = Math.random() < 0.4;
                const len = 34 + Math.random() * 30;
                stalactites.push({
                    x: sx, y: ceilingY, len: len, w: 20 + Math.random() * 10,
                    cracked: cracked, state: "hang", shake: 0, vy: 0, hp: 1,
                    fallen: false, hitId: -1
                });
                sx += 150 + Math.random() * 230;
            }

            // Decoration buried in the dark soil above the ceiling: bones and
            // the occasional half-buried treasure chest.
            let dx2 = 240;
            while (dx2 < levelLength - 120) {
                const r = Math.random();
                const kind = r < 0.18 ? "chest" : "bone";
                ceilingDecor.push({
                    x: dx2, y: ceilingY * (0.3 + Math.random() * 0.5),
                    kind: kind, rot: (Math.random() - 0.5) * 0.8
                });
                dx2 += 180 + Math.random() * 200;
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
                dashTime: 0, dashCd: 0, dashIFrame: 0, dashUsed: false, dashHit: {},
                shell: false, invuln: 0, shellHold: 0, fallThrough: 0, jumpsUsed: 0,
                attackTime: 0, attackDur: ATTACK_DUR, attackCd: 0, slashId: 0,
                comboStep: 0, comboTimer: 0, attackSpin: false, py: groundY
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
                id: enemyIdSeq++,
                kind: kind, x: x, baseY: baseY, vx: 0, vy: 0, facing: -1,
                state: "walk", t: 0, cd: 0.7 + Math.random() * 1.3,
                hitFlash: 0, hop: 0, hopT: Math.random() * 6, lungeV: 0,
                lastHitSlash: -1, patrolMin: patrolMin, patrolMax: patrolMax,
                onGround: true, floorY: baseY, falling: false, knock: 0
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

        function jump(leanX) {
            if (!alive || hero.shell) return;
            // First jump needs the ground; a second mid-air swipe double-jumps.
            if (hero.onGround) {
                hero.jumpsUsed = 1;
            } else {
                if (hero.jumpsUsed >= 2) return;
                hero.jumpsUsed += 1;
            }
            started = true;
            hero.vy = -(hero.jumpsUsed >= 2 ? DOUBLE_JUMP_V : JUMP_V);
            // Swiping at a steep enough angle leans the jump that way.
            if (leanX) {
                hero.vx = leanX * JUMP_V * JUMP_LEAN;
                hero.facing = leanX < 0 ? -1 : 1;
            }
            hero.onGround = false;
            SGSound.play("jump");
            puff(hero.x, hero.y, "#cdebd6", hero.jumpsUsed >= 2 ? 10 : 6);
        }

        function startDash(dx, dy) {
            if (!alive || hero.shell || hero.dashUsed || hero.dashCd > 0) return;
            started = true;
            const len = Math.hypot(dx, dy) || 1;
            hero.vx = (dx / len) * DASH_SPEED;
            hero.vy = (dy / len) * DASH_SPEED;
            if (Math.abs(dy) < 0.2) hero.vy = 0;
            // Stars trade the sword's dash-damage for a longer glide-dash.
            const dur = DASH_TIME * (weapon === "star" ? STAR_DASH_MULT : 1);
            hero.dashTime = dur;
            hero.dashCd = DASH_CD;
            hero.dashIFrame = dur + 0.06;
            hero.dashUsed = true;
            hero.dashHit = {};      // a fresh dash can damage each enemy once
            if (dx !== 0) hero.facing = dx < 0 ? -1 : 1;
            SGSound.play("flap");
            puff(hero.x, hero.y - hero.h / 2, "#9ad8ff", 8);
        }

        function attack(aim) {
            if (!alive || hero.shell || hero.attackCd > 0) return;
            started = true;

            if (weapon === "sword") {
                // The sword ignores tap direction and instead auto-turns toward
                // the nearest enemy (or boss) within reach.
                const target = nearestEnemy();
                if (target && Math.abs(target.x - hero.x) > 6) {
                    hero.facing = target.x < hero.x ? -1 : 1;
                }

                // Advance the 3-hit combo; the window resets if you wait too long.
                const chained = hero.comboTimer > 0 && hero.comboStep < 3;
                hero.comboStep = chained ? hero.comboStep + 1 : 1;
                hero.attackSpin = hero.comboStep === 3;
                hero.slashId += 1;
                if (hero.attackSpin) {
                    hero.attackDur = SPIN_DUR;
                    hero.attackTime = SPIN_DUR;
                    hero.attackCd = 0.46;
                    hero.comboTimer = 0;             // spin ends the combo
                    SGSound.play("explode");
                    host.vibrate([12, 20, 14]);
                } else {
                    hero.attackDur = ATTACK_DUR;
                    hero.attackTime = ATTACK_DUR;
                    hero.attackCd = 0.22;
                    hero.comboTimer = COMBO_WINDOW;
                    SGSound.play("whack");
                    host.vibrate(8);
                }
            } else {
                // A click/tap turns the turtle to face the press before throwing.
                if (aim) {
                    const ax = aim.x + camX;
                    if (Math.abs(ax - hero.x) > 6) hero.facing = ax < hero.x ? -1 : 1;
                }
                hero.attackDur = ATTACK_DUR;
                hero.attackTime = ATTACK_DUR;
                hero.attackCd = 0.3;
                // Stars fly toward the press; otherwise straight ahead.
                let vx = hero.facing * STAR_SPEED, vy = 0;
                if (aim) {
                    const tx = aim.x + camX, ty = aim.y;
                    let dx = tx - (hero.x + hero.facing * 18);
                    let dy = ty - (hero.y - hero.h / 2);
                    const len = Math.hypot(dx, dy) || 1;
                    vx = (dx / len) * STAR_SPEED;
                    vy = (dy / len) * STAR_SPEED;
                }
                stars.push({
                    x: hero.x + hero.facing * 18, y: hero.y - hero.h / 2,
                    vx: vx, vy: vy, life: 1.1, rot: 0
                });
                SGSound.play("shoot");
                host.vibrate(8);
            }
        }

        // Closest living enemy/boss to the turtle, used for sword auto-facing.
        function nearestEnemy() {
            let best = null, bestD = Infinity;
            for (const e of enemies) {
                const d = Math.abs(e.x - hero.x);
                if (d < bestD) { bestD = d; best = e; }
            }
            if (boss && boss.state !== "dying" && boss.state !== "intro") {
                const d = Math.abs(boss.x - hero.x);
                if (d < bestD) { bestD = d; best = boss; }
            }
            return best;
        }

        function toggleWeapon() {
            weapon = weapon === "sword" ? "star" : "sword";
            SGSound.play("flip");
            host.vibrate(10);
        }

        // A hard shell landing: shockwave that damages and knocks back enemies.
        function shellSlam() {
            SGSound.play("explode");
            host.vibrate([16, 24, 16]);
            puff(hero.x, groundY, "#bdbad0", 16);
            for (const e of enemies) {
                if (Math.abs(e.x - hero.x) < SHELL_SLAM_RANGE && Math.abs(e.baseY - hero.y) < 90) {
                    const dir = e.x < hero.x ? -1 : 1;
                    e.knock = dir * SHELL_SLAM_KNOCK;
                    e.vy = -ENEMY_POP;
                    damageTarget(e, e.x, e.baseY - e.h / 2);
                }
            }
            if (boss && boss.state !== "dying" && Math.abs(boss.x - hero.x) < SHELL_SLAM_RANGE + 20) {
                damageTarget(boss, boss.x, boss.baseY - boss.h / 2);
                if (boss.hp <= 0) defeatBoss();
            }
            // The crash can also dislodge nearby hanging stalactites.
            for (const st of stalactites) {
                if (st.state === "hang" && Math.abs(st.x - hero.x) < SHELL_SLAM_RANGE) dropStalactite(st);
            }
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
            // Enemies drop gold coins, and rarely a heart.
            const top = e.baseY - e.h / 2;
            if (Math.random() < 0.07) {
                spawnDrop(e.x, top, "heart");
            } else {
                const coins = 1 + (Math.random() < 0.35 ? 1 : 0);
                for (let i = 0; i < coins; i++) spawnDrop(e.x + (Math.random() - 0.5) * 18, top, "coin");
            }
        }

        function spawnDrop(x, y, type) {
            drops.push({
                type: type, x: x, y: y, bob: Math.random() * 6,
                vx: (Math.random() - 0.5) * 120, vy: -150 - Math.random() * 120,
                grounded: false
            });
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
                spawnDrop(boss.x + (Math.random() - 0.5) * 90, boss.baseY - boss.h / 2 - Math.random() * 50, "heart");
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
                if (shellWanted && !hero.shell) {
                    hero.shell = true;
                    // Tucking into the shell cancels any in-progress sword combo.
                    hero.attackTime = 0;
                    hero.comboStep = 0;
                    hero.comboTimer = 0;
                    hero.attackSpin = false;
                    SGSound.play("bounce");
                }
                if (!shellWanted && hero.shell) hero.shell = false;
                updateHero(dt, moveDir);
            }

            updateStars(dt);
            updateEnemies(dt);
            updateBoss(dt);
            updateOrbs(dt);
            updatePickups(dt);
            updateStalactites(dt);

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
                if (hero.shell && !hero.onGround) {
                    // Shell makes the turtle plummet hard for a ground slam.
                    hero.vy += GRAVITY * SHELL_GRAVITY_MULT * dt;
                    if (hero.vy > 0 && hero.vy < SHELL_FALL_MIN) hero.vy = SHELL_FALL_MIN;
                } else if (weapon === "star" && !hero.onGround && hero.vy > 0 && !hero.shell) {
                    // Stars equipped: glide down gently unless tucked into the shell.
                    hero.vy += GRAVITY * 0.25 * dt;
                    if (hero.vy > SLOW_FALL_MAX) hero.vy = SLOW_FALL_MAX;
                } else {
                    hero.vy += GRAVITY * dt;
                }
            }
            // Movement steers facing — but a sword swing keeps the facing the
            // tap chose, so a click commits the attack direction for that hit.
            const swingLock = weapon === "sword" && hero.attackTime > 0 && !hero.attackSpin;
            if (moveDir !== 0 && hero.dashTime <= 0 && !hero.shell && !swingLock) hero.facing = moveDir;

            hero.x += hero.vx * dt;
            hero.y += hero.vy * dt;
            hero.x = Math.max(16, Math.min(hero.x, levelLength - 16));

            // Bonk against the cave ceiling.
            const headY = hero.y - hero.h;
            if (headY < ceilingY) { hero.y = ceilingY + hero.h; if (hero.vy < 0) hero.vy = 0; }

            const wasOnGround = hero.onGround;
            const fallVy = hero.vy;       // remember impact speed for the shell slam
            hero.onGround = false;
            let standingPlatform = null;
            if (hero.y >= groundY) { hero.y = groundY; hero.vy = 0; hero.onGround = true; }
            for (const p of platforms) {
                if (hero.vy >= 0 && hero.py <= p.y + 2 && hero.y >= p.y && hero.y <= p.y + 26 &&
                    hero.x > p.x - 2 && hero.x < p.x + p.w + 2) {
                    // Holding the shell on a platform for a beat drops through it.
                    if (hero.fallThrough > 0 && hero.fallThrough === p.id) continue;
                    if (p.mushroom) {
                        // Springy cap launches the turtle up and out of the shell.
                        hero.vy = -BOUNCE_V;
                        hero.onGround = false;
                        p.bounce = 1;
                        SGSound.play("bounce");
                        host.vibrate(12);
                        puff(hero.x, p.y, "#ff9ad4", 8);
                        standingPlatform = null;
                        break;
                    }
                    hero.y = p.y; hero.vy = 0; hero.onGround = true; standingPlatform = p;
                }
            }
            hero.standing = standingPlatform;
            if (hero.onGround) hero.dashUsed = false;
            if (hero.onGround) hero.jumpsUsed = 0;       // refresh the double jump
            if (!hero.onGround) hero.fallThrough = 0;   // clear once we are airborne
            if (hero.onGround && Math.abs(hero.vx) > 20) hero.walk += dt * 9;

            // Shell slam: landing hard while tucked sends a shockwave that
            // knocks back and damages nearby enemies.
            if (hero.onGround && !wasOnGround && hero.shell && fallVy >= SHELL_SLAM_MINVY) {
                shellSlam();
            }

            // Shell-drop: tuck on a platform and hold for a second to fall through.
            if (hero.shell && hero.onGround && standingPlatform) {
                hero.shellHold += dt;
                if (hero.shellHold >= SHELL_DROP_TIME) {
                    hero.fallThrough = standingPlatform.id;
                    hero.shellHold = 0;
                    hero.y += 4; hero.onGround = false; hero.vy = 60;
                    puff(hero.x, standingPlatform.y, "#8fd6a0", 6);
                }
            } else {
                hero.shellHold = 0;
            }

            if (hero.invuln > 0) hero.invuln -= dt;
            if (hero.attackCd > 0) hero.attackCd -= dt;
            if (hero.attackTime > 0) hero.attackTime -= dt;
            if (hero.comboTimer > 0) {
                hero.comboTimer -= dt;
                if (hero.comboTimer <= 0) hero.comboStep = 0;   // combo expired
            }
            if (hero.dashCd > 0) hero.dashCd -= dt;
            if (hero.dashIFrame > 0) hero.dashIFrame -= dt;

            // A sword dash slices through enemies, dealing damage and knockback.
            // (Stars trade this for a longer glide-dash, so they don't bite.)
            if (hero.dashTime > 0 && weapon === "sword") {
                const hb = heroBox();
                for (const e of enemies) {
                    if (hero.dashHit[e.id]) continue;
                    const eb = enemyBox(e);
                    if (overlap(hb.x, hb.y, hb.w, hb.h, eb.x, eb.y, eb.w, eb.h)) {
                        hero.dashHit[e.id] = true;
                        const dir = e.x < hero.x ? -1 : 1;
                        e.knock = dir * DASH_DMG_KNOCK;
                        e.vy = -ENEMY_POP;
                        damageTarget(e, e.x, e.baseY - e.h / 2);
                        host.vibrate(12);
                    }
                }
                if (boss && boss.state !== "dying" && !hero.dashHit["boss"]) {
                    const bb = enemyBox(boss);
                    if (overlap(hb.x, hb.y, hb.w, hb.h, bb.x, bb.y, bb.w, bb.h)) {
                        hero.dashHit["boss"] = true;
                        damageTarget(boss, boss.x, boss.baseY - boss.h / 2);
                        if (boss.hp <= 0) defeatBoss();
                    }
                }
            }

            // Sword strike: normal hits reach in front; the spin finisher hits
            // a wider arc on BOTH sides. Each enemy is hit once per swing.
            const spin = hero.attackSpin;
            const activeWin = spin ? SPIN_ACTIVE : SLASH_ACTIVE;
            if (weapon === "sword" && hero.attackTime > hero.attackDur - activeWin) {
                const range = spin ? SPIN_RANGE : SLASH_RANGE;
                const sx = spin ? hero.x - range : (hero.facing > 0 ? hero.x : hero.x - range);
                const sw = spin ? range * 2 : range;
                const sy = hero.y - hero.h - (spin ? 14 : 6);
                const sh = spin ? SLASH_HEIGHT + 16 : SLASH_HEIGHT;
                const sb = { x: sx, y: sy, w: sw, h: sh };
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
                // A star can knock a hanging stalactite loose.
                if (s.life > 0) {
                    for (const st of stalactites) {
                        if (st.state !== "hang") continue;
                        if (overlap(sb.x, sb.y, sb.w, sb.h, st.x - st.w / 2, st.y, st.w, st.len)) {
                            dropStalactite(st);
                            s.life = 0; puff(s.x, s.y, "#9a8fb0", 6); break;
                        }
                    }
                }
                // Stars cannot pass through platforms — they shatter on contact.
                if (s.life > 0) {
                    for (const p of platforms) {
                        if (overlap(sb.x, sb.y, sb.w, sb.h, p.x, p.y, p.w, p.h)) {
                            s.life = 0; puff(s.x, s.y, "#eaf2ff", 5); break;
                        }
                    }
                }
                if (s.life > 0 && s.y > groundY) { s.life = 0; puff(s.x, groundY, "#eaf2ff", 5); }
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

        function enemyFloorAt(x, feetY) {
            // The nearest surface at or below the enemy's feet — ground or a
            // platform it is standing on. Used so enemies fall when they walk off.
            let floor = groundY;
            for (const p of platforms) {
                if (x > p.x - 2 && x < p.x + p.w + 2 && p.y >= feetY - 2 && p.y < floor) {
                    floor = p.y;
                }
            }
            return floor;
        }

        function stepEnemy(e, dt) {
            e.t += dt;
            const dist = hero.x - e.x;
            const adist = Math.abs(dist);
            const faceTo = dist < 0 ? -1 : 1;

            // ---- vertical physics: enemies fall when unsupported ----
            const floor = enemyFloorAt(e.x, e.baseY);
            if (e.baseY < floor - 0.5 || e.vy < 0) {
                e.vy += GRAVITY * dt;
                e.baseY += e.vy * dt;
                if (e.vy >= 0 && e.baseY >= floor) { e.baseY = floor; e.vy = 0; e.onGround = true; }
                else e.onGround = false;
            } else {
                e.baseY = floor; e.vy = 0; e.onGround = true;
            }

            // ---- knockback from the turtle's dash ----
            if (e.knock) {
                e.x += e.knock * dt;
                e.knock *= Math.pow(0.015, dt);
                if (Math.abs(e.knock) < 6) e.knock = 0;
                e.x = Math.max(12, Math.min(e.x, levelLength - 12));
            }

            if (e.kind === "marsh") { e.hopT += dt * 6; e.hop = Math.max(0, Math.sin(e.hopT)) * 9; }

            switch (e.state) {
                case "walk": {
                    e.cd -= dt;
                    if (e.ranged) {
                        e.facing = faceTo;
                    } else if (adist < CHASE_RANGE) {
                        e.facing = faceTo;
                        if (e.onGround) e.x += e.facing * e.speed * dt;
                    } else {
                        if (e.onGround) e.x += e.facing * e.speed * 0.5 * dt;
                        if (e.x < e.patrolMin) e.facing = 1;
                        if (e.x > e.patrolMax) e.facing = -1;
                    }
                    e.x = Math.max(12, Math.min(e.x, levelLength - 12));
                    const range = e.ranged ? 340 : 58;
                    const sameLevel = Math.abs((hero.y) - e.baseY) < 70;
                    if (e.onGround && e.cd <= 0 && adist < range && (e.ranged ? adist > 60 : true) && sameLevel) {
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
                d.bob += dt * 6;
                const heroMidY = hero.y - hero.h / 2;
                const distToHero = Math.hypot(hero.x - d.x, heroMidY - d.y);
                if (distToHero < 90) {
                    // Magnet: nearby loot homes in so it is always caught.
                    const dx = hero.x - d.x, dy = heroMidY - d.y;
                    const dl = Math.hypot(dx, dy) || 1;
                    d.vx += (dx / dl) * 1200 * dt;
                    d.vy += (dy / dl) * 1200 * dt;
                    d.vx *= 0.9; d.vy *= 0.9;
                    d.grounded = false;
                } else if (!d.grounded) {
                    // Otherwise fall under gravity and settle on the ground.
                    d.vy += 1400 * dt;
                    d.vx *= Math.pow(0.2, dt);
                    let rest = groundY - 12;
                    for (const p of platforms) {
                        if (d.x > p.x && d.x < p.x + p.w && d.y <= p.y) { rest = Math.min(rest, p.y - 12); }
                    }
                    if (d.y >= rest && d.vy >= 0) { d.y = rest; d.vy = 0; d.vx = 0; d.grounded = true; }
                }
                d.x += d.vx * dt; d.y += d.vy * dt;
                if (overlap(d.x - 14, d.y - 14, 28, 28, hb.x, hb.y, hb.w, hb.h)) {
                    d.taken = true;
                    if (d.type === "heart") { healHeart(); puff(d.x, d.y, "#ff8aa0", 6); }
                    else { addScore(8); SGSound.play("score"); puff(d.x, d.y, "#ffd166", 5); }
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

        function dropStalactite(s) {
            if (s.state !== "hang") return;
            s.state = "falling";
            s.vy = 60;
            SGSound.play("whack");
        }

        function updateStalactites(dt) {
            const hb = heroBox();
            for (const s of stalactites) {
                if (s.state === "hang") {
                    // Cracked ones rattle and let go as the turtle nears below.
                    if (s.cracked && alive && started) {
                        const near = Math.abs(hero.x - s.x) < STAL_APPROACH && hero.x !== undefined;
                        if (near) {
                            s.shake = Math.min(1, s.shake + dt * 2.2);
                            if (s.shake >= 1) dropStalactite(s);
                        } else {
                            s.shake = Math.max(0, s.shake - dt * 2);
                        }
                    }
                } else if (s.state === "falling") {
                    s.vy += GRAVITY * dt;
                    s.y += s.vy * dt;
                    // Hits the turtle on the way down.
                    const tipY = s.y + s.len;
                    if (overlap(s.x - s.w / 2, s.y, s.w, s.len, hb.x, hb.y, hb.w, hb.h)) {
                        hurtHero();
                        s.state = "broken"; s.life = 0.3;
                        puff(s.x, tipY, "#9a8fb0", 10);
                        SGSound.play("explode");
                        continue;
                    }
                    // Lands and shatters on the floor.
                    if (tipY >= groundY) {
                        s.state = "broken"; s.life = 0.3;
                        puff(s.x, groundY, "#9a8fb0", 12);
                        SGSound.play("drop");
                    }
                } else if (s.state === "broken") {
                    s.life -= dt;
                }
            }
            stalactites = stalactites.filter(s => s.state !== "broken" || s.life > 0);
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
            drawCeiling();
            for (const p of platforms) {
                if (p.x + p.w < camX - 20 || p.x > camX + W + 20) continue;
                if (p.bounce > 0) p.bounce = Math.max(0, p.bounce - 0.06);
                drawPlatform(p);
            }

            drawStalactites();

            for (const g of gems) {
                if (g.x < camX - 20 || g.x > camX + W + 20) continue;
                drawGem(g.x, g.y + Math.sin(g.bob) * 3);
            }
            if (chest) drawChest(chest);

            for (const d of drops) {
                if (d.x < camX - 30 || d.x > camX + W + 30) continue;
                drawDrop(d);
            }

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
            g.addColorStop(0, pal.top);
            g.addColorStop(1, pal.bot);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            // Parallax rock silhouettes.
            ctx.fillStyle = pal.bot;
            ctx.globalAlpha = 0.7;
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
            ctx.globalAlpha = 1;
        }

        function drawGround() {
            ctx.fillStyle = pal.rock;
            ctx.fillRect(camX, groundY, W, H - groundY);
            ctx.fillStyle = pal.spike;
            ctx.fillRect(camX, groundY, W, 6);
            ctx.fillStyle = "#1c1530";
            for (let x = Math.floor(camX / 48) * 48; x < camX + W; x += 48) {
                ctx.fillRect(x, groundY + 16, 2, H - groundY);
            }
        }

        function drawCeiling() {
            // Dark soil slab capping the cave.
            ctx.fillStyle = pal.rock;
            ctx.fillRect(camX, 0, W, ceilingY);
            ctx.fillStyle = pal.bot;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(camX, 0, W, ceilingY);
            ctx.globalAlpha = 1;
            // Soil speckle detail.
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            for (let x = Math.floor(camX / 40) * 40; x < camX + W; x += 40) {
                const h = 4 + ((x * 7) % 9);
                ctx.fillRect(x + ((x * 3) % 18), 6 + ((x * 5) % (ceilingY - 14)), 3, h);
            }
            // Buried decorations: bones and half-sunk chests.
            for (const d of ceilingDecor) {
                if (d.x < camX - 40 || d.x > camX + W + 40) continue;
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(d.rot);
                if (d.kind === "chest") {
                    ctx.fillStyle = "#6b4423";
                    roundRect(-13, -9, 26, 16, 3);
                    ctx.fillStyle = "#8a5a2b";
                    roundRect(-13, -9, 26, 6, 3);
                    ctx.fillStyle = "#caa64a";
                    ctx.fillRect(-2, -7, 4, 12);
                } else {
                    // A crossed pair of bones.
                    ctx.strokeStyle = "rgba(220,222,235,0.55)";
                    ctx.lineWidth = 4; ctx.lineCap = "round";
                    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(10, 6); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(10, -6); ctx.stroke();
                    ctx.fillStyle = "rgba(220,222,235,0.55)";
                    ctx.beginPath(); ctx.arc(-10, -6, 2.6, 0, Math.PI * 2); ctx.arc(-10, 6, 2.6, 0, Math.PI * 2);
                    ctx.arc(10, -6, 2.6, 0, Math.PI * 2); ctx.arc(10, 6, 2.6, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
            // Lip of the ceiling.
            ctx.fillStyle = pal.spike;
            ctx.fillRect(camX, ceilingY - 4, W, 4);
        }

        function drawPlatform(p) {
            const yb = p.y + p.bounce;
            if (p.mushroom) {
                // Springy mushroom growing from the ground.
                ctx.fillStyle = "#caa64a";
                ctx.fillRect(p.x + p.w / 2 - 8, yb + p.h, 16, Math.max(0, groundY - (yb + p.h)));
                ctx.fillStyle = "#e2557a";
                ctx.beginPath();
                ctx.moveTo(p.x, yb + p.h);
                ctx.quadraticCurveTo(p.x + p.w / 2, yb - 18 - p.bounce, p.x + p.w, yb + p.h);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "#ffd1de";
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(p.x + p.w * (0.28 + i * 0.22), yb - 1 - p.bounce * 0.5, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                ctx.fillStyle = "#3a3358";
                roundRect(p.x, yb, p.w, p.h, 6);
                ctx.fillStyle = "#4d4670";
                roundRect(p.x, yb, p.w, 5, 4);
            }
        }

        function drawStalactites() {
            for (const s of stalactites) {
                if (s.x < camX - 60 || s.x > camX + W + 60) continue;
                if (s.state === "broken") {
                    ctx.globalAlpha = Math.max(0, s.life * 3);
                }
                const shx = s.state === "hang" ? Math.sin(performance.now() / 40) * s.shake * 3 : 0;
                ctx.save();
                ctx.translate(s.x + shx, s.y);
                ctx.fillStyle = s.cracked ? "#3a3050" : "#2c2442";
                ctx.beginPath();
                ctx.moveTo(-s.w / 2, 0);
                ctx.lineTo(s.w / 2, 0);
                ctx.lineTo(0, s.len);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "#241c3a";
                ctx.beginPath();
                ctx.moveTo(-s.w / 2, 0);
                ctx.lineTo(s.w / 2, 0);
                ctx.lineTo(0, 8);
                ctx.closePath();
                ctx.fill();
                if (s.cracked && s.state === "hang") {
                    ctx.strokeStyle = "#6b5a8a";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-s.w / 4, s.len * 0.3);
                    ctx.lineTo(2, s.len * 0.5);
                    ctx.lineTo(-s.w / 6, s.len * 0.7);
                    ctx.stroke();
                }
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }

        function drawDrop(d) {
            const y = d.y + Math.sin(d.bob) * 2;
            if (d.type === "heart") {
                ctx.fillStyle = "#ff6b8a";
                drawHeart(d.x, y, 8);
            } else {
                ctx.save();
                ctx.translate(d.x, y);
                ctx.fillStyle = "#ffcf3f";
                ctx.beginPath();
                ctx.arc(0, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#e0a712";
                ctx.beginPath();
                ctx.arc(0, 0, 8, Math.PI * 0.2, Math.PI * 0.8);
                ctx.fill();
                ctx.fillStyle = "#fff0b8";
                ctx.font = "bold 9px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("$", 0, 1);
                ctx.restore();
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
                // sword in the front hand — animation differs per combo step
                let blade = 0;       // shoulder rotation of the sword
                if (hero.attackTime > 0 && weapon === "sword") {
                    const prog = 1 - hero.attackTime / hero.attackDur;
                    if (hero.attackSpin) {
                        blade = -1.1 + prog * Math.PI * 2;          // full spin
                    } else if (hero.comboStep === 2) {
                        blade = 1.1 - prog * 2.0;                    // upward back-swing
                    } else {
                        blade = -1.1 + prog * 2.0;                   // downward chop
                    }
                } else {
                    blade = -1.1;
                }
                ctx.save();
                ctx.translate(hero.w / 2 - 2, -10);
                ctx.rotate(blade);
                ctx.fillStyle = "#cfd8e6";
                roundRect(0, -3, 24, 5, 2);
                ctx.fillStyle = "#ffd166";
                roundRect(-4, -4, 5, 7, 2);
                ctx.restore();
            }
            ctx.restore();

            // Sword slash arc (world space). Each combo step looks different;
            // the third hit is a full spin that sweeps both sides.
            const slashWin = hero.attackSpin ? SPIN_ACTIVE : SLASH_ACTIVE;
            if (weapon === "sword" && hero.attackTime > hero.attackDur - slashWin && !hero.shell) {
                const prog = 1 - (hero.attackTime - (hero.attackDur - slashWin)) / slashWin;
                ctx.save();
                ctx.translate(hero.x, hero.y - hero.h / 2);
                ctx.lineCap = "round";
                if (hero.attackSpin) {
                    // Spin: a bright ring that whips all the way around.
                    const rad = SPIN_RANGE - 12;
                    const a0 = -Math.PI / 2 + prog * Math.PI * 2;
                    ctx.globalAlpha = 0.7 * (1 - prog * 0.5);
                    ctx.strokeStyle = "#fff2c2";
                    ctx.lineWidth = 9;
                    ctx.beginPath();
                    ctx.arc(0, 0, rad, a0, a0 + Math.PI * 1.4);
                    ctx.stroke();
                    ctx.globalAlpha = 0.35 * (1 - prog);
                    ctx.strokeStyle = "#eaf2ff";
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(0, 0, rad, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    ctx.scale(hero.facing, 1);
                    ctx.globalAlpha = 0.6 * (1 - prog);
                    ctx.strokeStyle = "#eaf2ff";
                    ctx.lineWidth = 7;
                    if (hero.comboStep === 2) {
                        // Second hit sweeps upward.
                        ctx.beginPath();
                        ctx.arc(6, 0, SLASH_RANGE - 8, 0.9 - prog * 0.6, -0.9 - prog * 0.6, true);
                        ctx.stroke();
                    } else {
                        ctx.beginPath();
                        ctx.arc(6, 0, SLASH_RANGE - 8, -0.9 + prog * 0.6, 0.9 + prog * 0.6);
                        ctx.stroke();
                    }
                }
                ctx.restore();
                ctx.globalAlpha = 1;
            }

            // A sword dash carries a slashing streak in the dash direction.
            if (weapon === "sword" && hero.dashTime > 0 && !hero.shell) {
                const prog = 1 - hero.dashTime / (DASH_TIME);
                ctx.save();
                ctx.translate(hero.x, hero.y - hero.h / 2);
                ctx.scale(hero.facing, 1);
                ctx.lineCap = "round";
                ctx.globalAlpha = 0.7 * (1 - prog);
                ctx.strokeStyle = "#eaf2ff";
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.arc(2, 0, SLASH_RANGE - 6, -1.0, 1.0);
                ctx.stroke();
                ctx.globalAlpha = 0.5 * (1 - prog);
                ctx.strokeStyle = "#fff2c2";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-6, 0);
                ctx.lineTo(SLASH_RANGE - 2, 0);
                ctx.stroke();
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }
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
            roundRect(b.x, b.y, b.w, b.h, b.h / 2);
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
                ctx.fillText("TAP to face & attack \u2022 chain 3 for a spin!", W / 2, H * 0.34 + 24);
                ctx.fillText("Swipe in the air to DASH \u2022 swipe DOWN for shell", W / 2, H * 0.34 + 46);
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
                        if (hero.onGround) {
                            // Lean the jump when the upward swipe is angled > 30°.
                            const ang = Math.atan2(adx, ady);   // 0 = straight up
                            const lean = ang > JUMP_ANGLE_MIN ? (dx < 0 ? -1 : 1) : 0;
                            jump(lean);
                        } else if (hero.jumpsUsed < 2 && ady > adx * 2) {
                            // A clean upward swipe in the air is a double jump.
                            jump(0);
                        } else {
                            startDash(hero.facing * 0.4, -1);
                        }
                        p.mode = "swiped";
                    } else if (dy > SWIPE_THRESH) {
                        touchShell = true; shellId = id; p.mode = "shell";
                    }
                } else {
                    const dir = dx < 0 ? -1 : 1;
                    // A fast horizontal flick dashes (on the ground or in the air).
                    const speed = (Math.hypot(dx, dy) / Math.max(1, performance.now() - p.st)) * 1000;
                    if (!hero.shell && (speed > GROUND_DASH_SPEED || !hero.onGround)) startDash(dir, 0);
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
            if (p.mode === "" && dist < TAP_MAX_MOVE && heldFor < TAP_MAX_TIME) attack({ x: x, y: y });
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
