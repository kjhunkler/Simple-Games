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
        const AIR_MOVE = 185;                        // air steering top speed — close to walking for strong drift control
        const AIR_ACCEL = 2400;                      // how fast air steering changes velocity (near-ground for snappy drift)
        const JUMP_V = 770;
        const DASH_SPEED = 660;
        const DASH_TIME = 0.18;
        const DASH_CD = kids ? 0.4 : 0.55;
        const DASH_JUMP_V = JUMP_V * 1.7;            // very high launch when jumping out of a dash
        const DASH_JUMP_WINDOW = 0.12;               // grace after a dash ends to still dash-jump
        const ATTACK_DUR = 0.26;
        const SLASH_ACTIVE = 0.15;
        const SLASH_RANGE = 86;                     // big sword reach
        const SLASH_HEIGHT = 54;
        const SWORD_LUNGE_V = 300;                  // slight hop toward an out-of-reach foe
        const TARGET_RANGE = 520;                   // ignore auto-target foes farther than this
        const SPIN_DUR = 0.42;                       // 3rd combo hit: spin attack
        const SPIN_ACTIVE = 0.32;
        const SPIN_RANGE = 107;                      // spin reaches both sides
        const RISE_SLASH_DUR = 0.34;                 // dash-jump rising slash duration
        const RISE_SLASH_ACTIVE = 0.28;              // active hit window of the rising slash
        const RISE_RANGE = 76;                       // rising slash horizontal reach
        const RISE_HEIGHT = 104;                     // rising slash tall vertical reach (anti-air)
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
        const DOUBLE_JUMP_V = JUMP_V * 1.05;        // second, mid-air jump — a touch higher than the first
        const SHELL_FALL_MIN = 1150;                // shell plummets at least this fast
        const SHELL_GRAVITY_MULT = 1.7;             // extra gravity while shelled mid-air
        const SHELL_GROUND_FRICTION = 0.22;         // shelled slide drags to a gentle stop (retains momentum)
        const SHELL_SLAM_MINVY = 1400;              // fall speed needed to trigger a slam (above SHELL_FALL_MIN so a real dive is required)
        const SHELL_SLAM_RANGE = 100;               // slam shock radius
        const SHELL_SLAM_KNOCK = 320;               // slam knockback strength
        const GROUND_DASH_SPEED = 1500;             // swipe px/s that triggers a ground dash

        // ----- gesture thresholds -----
        const MOVE_THRESH = 16;
        const SWIPE_THRESH = 38;
        const TAP_MAX_MOVE = 16;
        const TAP_MAX_TIME = 260;
        const DASH_X_DOMINANCE = 1.7;                // a dash/move swipe must be this much more horizontal than vertical (~30°); steeper swipes jump/shell
        const JUMP_LEAN = 0.55;                      // how much sideways speed a leaning jump gets

        // Each cave level recolours the cave a little.
        const BG_PALETTES = [
            { top: "#1b1430", bot: "#0d0a18", rock: "#241c3a", spike: "#352b52", spikeCrack: "#5a4a76" },
            { top: "#102330", bot: "#07121a", rock: "#16303f", spike: "#274a5b", spikeCrack: "#3f6a7e" },
            { top: "#241326", bot: "#120814", rock: "#34203a", spike: "#4e2f54", spikeCrack: "#744a78" },
            { top: "#0f2620", bot: "#06140f", rock: "#173a2c", spike: "#285243", spikeCrack: "#3f7c63" },
            { top: "#2a1c12", bot: "#140c07", rock: "#3a2716", spike: "#553d28", spikeCrack: "#7c5d3f" }
        ];

        // ----- ambient atmosphere -----
        // Each cave biome gets a subtle signature: a sprinkle of drifting motes
        // plus a faint floor mist. Kept deliberately low-alpha so it adds depth
        // and mood without ever competing with the gameplay layer. Indexed in
        // lockstep with BG_PALETTES.
        const AMBIENCE = [
            // Crystal cavern: lavender sparks rising on a slow draft.
            { kind: "spark", mote: "210,190,255", count: 42, alpha: 0.20, drift: 7, rise: -9, mist: "120,96,190", mistA: 0.12 },
            // Frozen grotto: pale cyan bubbles wobbling upward.
            { kind: "bubble", mote: "175,225,240", count: 34, alpha: 0.16, drift: 5, rise: -12, mist: "90,150,170", mistA: 0.13 },
            // Fungal hollow: pink spores settling gently downward.
            { kind: "spore", mote: "235,175,220", count: 46, alpha: 0.17, drift: 9, rise: 7, mist: "150,80,140", mistA: 0.12 },
            // Mossy depths: soft green pollen adrift.
            { kind: "spore", mote: "180,230,170", count: 44, alpha: 0.16, drift: 8, rise: 4, mist: "70,140,95", mistA: 0.13 },
            // Earthen tunnels: warm dust sifting down.
            { kind: "dust", mote: "220,190,150", count: 50, alpha: 0.15, drift: 11, rise: 9, mist: "150,110,70", mistA: 0.14 }
        ];

        // ----- boss roster -----
        // Each boss has a distinct silhouette, palette, movement style and a set
        // of attacks. The flying wyvern hovers out of melee reach, nudging the
        // player toward throwing stars. Order cycles by level.
        const BOSS_ORDER = ["golem", "warbot", "marshking", "prowler", "wyvern", "siegebot"];
        const BOSSES = {
            golem: {
                name: "CAVE GOLEM", w: 100, h: 110, flying: false,
                body: "#7c5536", bodyLit: "#caa06a", trim: "#4a3220", eye: "#ffd166",
                speed: 60, hpMul: 1.15, contactKnock: 360,
                attacks: ["slam", "boulder"]
            },
            marshking: {
                name: "MARSH KING", w: 96, h: 96, flying: false,
                body: "#5a8f6a", bodyLit: "#bfe8c8", trim: "#33543c", eye: "#d6ff8a",
                speed: 52, hpMul: 1.0, contactKnock: 300,
                attacks: ["hop", "spit"]
            },
            // ----- The robot family: one chassis, three loadouts -----
            warbot: {
                name: "WAR TITAN", w: 104, h: 108, flying: false, shape: "warbot", variant: "titan",
                body: "#8a93a8", bodyLit: "#cfd6e6", trim: "#4a5060", eye: "#7be6ff",
                speed: 30, hpMul: 1.3, contactKnock: 340, keep: 230, range: 520,
                attacks: ["salvo", "beam"]
            },
            siegebot: {
                // Hulking artillery mech: lobs arcing mortar shells, then sweeps a beam.
                name: "SIEGE WALKER", w: 116, h: 116, flying: false, shape: "warbot", variant: "siege",
                body: "#6f7a5e", bodyLit: "#bcc7a0", trim: "#3a4030", eye: "#ffd166",
                speed: 20, hpMul: 1.5, contactKnock: 360, keep: 300, range: 640,
                attacks: ["mortar", "beam"]
            },
            prowler: {
                // Lean assault droid: rushing rams and fast autocannon bursts.
                name: "ASSAULT DROID", w: 90, h: 94, flying: false, shape: "warbot", variant: "assault",
                body: "#b0505a", bodyLit: "#ecb3ba", trim: "#5c2730", eye: "#ff6464",
                speed: 70, hpMul: 1.05, contactKnock: 380, keep: 90, range: 360, coolMul: 0.7,
                attacks: ["charge", "rapid"]
            },
            wyvern: {
                name: "CAVE WYVERN", w: 96, h: 70, flying: true,
                body: "#7a3f86", bodyLit: "#d09ad6", trim: "#4a2350", eye: "#ff7be6",
                speed: 168, hpMul: 0.95, contactKnock: 320, coolMul: 0.62,
                attacks: ["dive", "fireball", "strafe"]
            }
        };
        const BOSS_ENRAGE = 0.4;                     // below this HP fraction the boss enrages

        let W, H, groundY, ceilingY;
        let camX;
        let levelLength, level;
        let hero, platforms, enemies, gems, drops, stars, orbs, particles, chest, stalactites, ceilingDecor;
        let pal;
        let amb, motes;                             // ambient biome flavour + drifting motes
        let enemyIdSeq = 0;
        let boss, bossSpawned, levelAdvance, victory;
        let hearts, score, weapon, alive, started;
        let bannerText, bannerTime;
        let time, rafId, lastTs;
        let shakeT = 0, shakeMag = 0;               // screen-shake timer / strength

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
            amb = AMBIENCE[(level - 1) % AMBIENCE.length];
            buildMotes();
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
                shell: false, slamming: false, invuln: 0, shellHold: 0, fallThrough: 0, jumpsUsed: 0,
                attackTime: 0, attackDur: ATTACK_DUR, attackCd: 0, slashId: 0,
                comboStep: 0, comboTimer: 0, attackSpin: false, attackRise: false, dashJumpTime: 0, py: groundY, lunge: 0
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

        // Seed the drifting ambient motes for the current biome. They live in a
        // screen-sized field that wraps around, so a small fixed pool covers the
        // whole level no matter how far the camera travels.
        function buildMotes() {
            motes = [];
            if (!amb) return;
            const fieldW = W + 120;
            const fieldH = H + 120;
            for (let i = 0; i < amb.count; i++) {
                motes.push({
                    x: Math.random() * fieldW,
                    y: Math.random() * fieldH,
                    // Depth 0 (far, small, slow parallax) .. 1 (near, larger).
                    z: Math.random(),
                    r: 0.6 + Math.random() * 1.8,
                    ph: Math.random() * Math.PI * 2,        // wobble phase
                    sp: 0.6 + Math.random() * 0.8           // per-mote speed jitter
                });
            }
        }

        // Drift the motes within their wrapping field. Movement is biome-driven:
        // a gentle vertical rise/fall plus a lateral sway, scaled by depth so the
        // nearer ones move a touch faster for a soft sense of parallax.
        function updateMotes(dt) {
            if (!motes || !amb) return;
            const fieldW = W + 120;
            const fieldH = H + 120;
            for (const m of motes) {
                const depth = 0.45 + m.z * 0.55;
                m.ph += dt * m.sp;
                m.y += amb.rise * depth * m.sp * dt;
                m.x += (amb.drift * depth + Math.sin(m.ph) * 6) * dt;
                // Wrap around the field so the pool covers the level endlessly.
                if (m.y < -10) m.y = fieldH + 10;
                else if (m.y > fieldH + 10) m.y = -10;
                if (m.x < -10) m.x = fieldW + 10;
                else if (m.x > fieldW + 10) m.x = -10;
            }
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
            const kind = BOSS_ORDER[(level - 1) % BOSS_ORDER.length];
            const cfg = BOSSES[kind];
            // Flyers hover above the ground; ground bosses stand on the floor.
            const hoverY = cfg.flying ? groundY - 150 : groundY;
            boss = {
                kind: kind, cfg: cfg, x: levelLength - 180, baseY: hoverY, hoverY: hoverY,
                vx: 0, vy: 0, facing: -1, w: cfg.w, h: cfg.h,
                maxHp: Math.round(((kids ? 6 : 9) + level * 3) * cfg.hpMul), hp: 0,
                state: "intro", t: 0, cd: 1.6, hitFlash: 0, lungeV: 0, lastHitSlash: -1,
                attackIx: 0, move: "", enraged: false, beamT: 0, wing: 0, anim: 0,
                burst: 0, burstT: 0, strafeDrop: 0, diveTargetX: 0
            };
            boss.hp = boss.maxHp;
            banner(cfg.name + " APPEARS!", 2.2);
            SGSound.play("bossroar");
            screenShake(0.6, 9);
            host.vibrate([60, 40, 60, 40, 80]);
        }

        function nextLevel() {
            level += 1;
            buildLevel(true);
        }

        /* ---------- actions ---------- */

        function banner(text, t) { bannerText = text; bannerTime = t; }

        function jump(leanX) {
            if (!alive || hero.shell) return;
            // Jumping during a dash, or just after it, launches a high dash-jump.
            const dashJumping = hero.dashTime > 0 || hero.dashJumpTime > 0;
            // First jump needs the ground; a second mid-air swipe double-jumps.
            if (hero.onGround) {
                hero.jumpsUsed = 1;
            } else {
                // A dash-jump is allowed mid-air (it spends the dash window);
                // otherwise a second swipe double-jumps.
                if (!dashJumping && hero.jumpsUsed >= 2) return;
                hero.jumpsUsed += 1;
            }
            started = true;

            if (dashJumping) {
                // Rocketing out of a dash sends the turtle very high while
                // keeping the dash's horizontal momentum for a soaring leap.
                hero.dashTime = 0;            // end the dash so normal physics resume
                hero.dashJumpTime = 0;
                hero.vy = -DASH_JUMP_V;
                if (leanX) hero.facing = leanX < 0 ? -1 : 1;
                hero.onGround = false;
                SGSound.play("jump");
                puff(hero.x, hero.y, "#bde6ff", 14);
                host.vibrate([8, 14, 10]);
                // With a sword equipped the leap becomes a rising slash.
                if (weapon === "sword") riseSlash();
                return;
            }

            hero.vy = -(hero.jumpsUsed >= 2 ? DOUBLE_JUMP_V : JUMP_V);
            // Lean the jump along the swipe: leanX is the swipe's horizontal
            // component (-1..1), so a more sideways swipe carries further across.
            if (leanX) {
                hero.vx = leanX * JUMP_V * JUMP_LEAN;
                hero.facing = leanX < 0 ? -1 : 1;
            }
            hero.onGround = false;
            SGSound.play("jump");
            puff(hero.x, hero.y, "#cdebd6", hero.jumpsUsed >= 2 ? 10 : 6);
        }

        function riseSlash() {
            // The rising slash launched from a dash-jump: a tall anti-air uppercut.
            hero.comboStep = 0;
            hero.comboTimer = 0;
            hero.attackSpin = false;
            hero.attackRise = true;
            hero.slashId += 1;
            hero.attackDur = RISE_SLASH_DUR;
            hero.attackTime = RISE_SLASH_DUR;
            hero.attackCd = 0.3;
            SGSound.play("whack");
            host.vibrate([10, 16, 10]);
        }

        function startDash(dx, dy) {
            if (!alive || hero.shell || hero.dashUsed || hero.dashCd > 0) return;
            started = true;
            const len = Math.hypot(dx, dy) || 1;
            hero.vx = (dx / len) * DASH_SPEED;
            hero.vy = (dy / len) * DASH_SPEED;
            if (Math.abs(dy) < 0.2) hero.vy = 0;
            const dur = DASH_TIME;
            hero.dashTime = dur;
            hero.dashCd = DASH_CD;
            hero.dashIFrame = dur + 0.06;
            hero.dashUsed = true;
            hero.dashJumpTime = DASH_TIME + DASH_JUMP_WINDOW;   // brief window to jump out of the dash
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

                // If the nearest foe is just out of the sword's reach, hop a
                // little toward it so the swing isn't wasted on empty air.
                if (target) {
                    const gap = Math.abs(target.x - hero.x) - (target.w || 0) / 2;
                    if (gap > SLASH_RANGE) {
                        hero.lunge = (target.x < hero.x ? -1 : 1) * SWORD_LUNGE_V;
                    }
                }

                // Advance the 3-hit combo; the window resets if you wait too long.
                const chained = hero.comboTimer > 0 && hero.comboStep < 3;
                hero.comboStep = chained ? hero.comboStep + 1 : 1;
                hero.attackSpin = hero.comboStep === 3;
                hero.attackRise = false;
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
                // Clicking in the floor area auto-targets the closest enemy;
                // clicking above the floor throws the star toward the press.
                const floorAim = aim && aim.y >= groundY;
                const target = floorAim ? nearestEnemy() : null;

                // Turn the turtle to face the auto-target, or the press.
                if (target) {
                    if (Math.abs(target.x - hero.x) > 6) hero.facing = target.x < hero.x ? -1 : 1;
                } else if (aim && !floorAim) {
                    const ax = aim.x + camX;
                    if (Math.abs(ax - hero.x) > 6) hero.facing = ax < hero.x ? -1 : 1;
                }
                hero.attackDur = ATTACK_DUR;
                hero.attackTime = ATTACK_DUR;
                hero.attackCd = 0.3;
                // Stars home on the auto-target, fly toward the press, or go straight ahead.
                const ox = hero.x + hero.facing * 18, oy = hero.y - hero.h / 2;
                let vx = hero.facing * STAR_SPEED, vy = 0;
                if (target) {
                    const dx = target.x - ox;
                    const dy = (target.baseY - target.h / 2) - oy;
                    const len = Math.hypot(dx, dy) || 1;
                    vx = (dx / len) * STAR_SPEED;
                    vy = (dy / len) * STAR_SPEED;
                } else if (aim && !floorAim) {
                    const tx = aim.x + camX, ty = aim.y;
                    const dx = tx - ox;
                    const dy = ty - oy;
                    const len = Math.hypot(dx, dy) || 1;
                    vx = (dx / len) * STAR_SPEED;
                    vy = (dy / len) * STAR_SPEED;
                }
                stars.push({
                    x: ox, y: oy,
                    vx: vx, vy: vy, life: 1.1, rot: 0
                });
                SGSound.play("shoot");
                host.vibrate(8);
            }
        }

        // Closest living enemy/boss to the turtle, used for sword auto-facing.
        // Foes beyond TARGET_RANGE are ignored so attacks don't lock onto
        // something off-screen or across the cave.
        function nearestEnemy() {
            let best = null, bestD = TARGET_RANGE;
            for (const e of enemies) {
                const d = Math.hypot(e.x - hero.x, e.baseY - hero.y);
                if (d < bestD) { bestD = d; best = e; }
            }
            if (boss && boss.state !== "dying" && boss.state !== "intro") {
                const d = Math.hypot(boss.x - hero.x, boss.baseY - hero.y);
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
            chest = { x: boss.x, y: groundY - 4, open: 0 };
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

        // Kick off a screen shake; stronger/larger calls win over a fading one.
        function screenShake(dur, mag) {
            if (dur > shakeT) shakeT = dur;
            if (mag > shakeMag) shakeMag = mag;
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
                    // Tucking into the shell while airborne commits to a ground
                    // slam: once started it always drops to the floor, so the
                    // player doesn't have to keep holding down to finish it.
                    if (!hero.onGround) hero.slamming = true;
                    // Tucking into the shell cancels any in-progress sword combo.
                    hero.attackTime = 0;
                    hero.comboStep = 0;
                    hero.comboTimer = 0;
                    hero.attackSpin = false;
                    hero.attackRise = false;
                    SGSound.play("bounce");
                }
                // A committed slam stays tucked until it lands; otherwise the
                // shell simply follows whether the player is holding the gesture.
                if (!shellWanted && hero.shell && !hero.slamming) hero.shell = false;
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

            updateMotes(dt);

            // Screen-shake decays over time.
            if (shakeT > 0) {
                shakeT -= dt;
                if (shakeT <= 0) { shakeT = 0; shakeMag = 0; }
            }
        }

        function updateHero(dt, moveDir) {
            hero.py = hero.y;

            if (hero.dashTime > 0) {
                hero.dashTime -= dt;
                if (hero.dashTime <= 0) hero.vy = 0;
            } else if (hero.shell) {
                // Tucked in: no active steering, but horizontal momentum is kept.
                // Airborne the turtle holds its speed for a diving slam; grounded
                // it slides to a gentle stop instead of halting on the spot.
                if (hero.onGround) {
                    hero.vx *= Math.pow(SHELL_GROUND_FRICTION, dt);
                    hero.vy += GRAVITY * dt;
                } else {
                    // Shell makes the turtle plummet hard for a ground slam.
                    hero.vy += GRAVITY * SHELL_GRAVITY_MULT * dt;
                    if (hero.vy > 0 && hero.vy < SHELL_FALL_MIN) hero.vy = SHELL_FALL_MIN;
                }
            } else {
                let target = moveDir * (hero.onGround ? MOVE_SPEED : AIR_MOVE);
                const accel = hero.onGround ? 2600 : AIR_ACCEL;
                if (hero.vx < target) hero.vx = Math.min(target, hero.vx + accel * dt);
                else hero.vx = Math.max(target, hero.vx - accel * dt);
                if (moveDir === 0 && hero.onGround) hero.vx *= Math.pow(0.0008, dt);
                hero.vy += GRAVITY * dt;
            }
            // Movement steers facing — but a sword swing keeps the facing the
            // tap chose, so a click commits the attack direction for that hit.
            const swingLock = weapon === "sword" && hero.attackTime > 0 && !hero.attackSpin;
            if (moveDir !== 0 && hero.dashTime <= 0 && !hero.shell && !swingLock) hero.facing = moveDir;

            hero.x += hero.vx * dt;
            hero.y += hero.vy * dt;
            // A sword attack's slight lunge toward an out-of-reach foe, decaying fast.
            if (hero.lunge) {
                hero.x += hero.lunge * dt;
                hero.lunge *= Math.pow(0.0005, dt);
                if (Math.abs(hero.lunge) < 12) hero.lunge = 0;
            }
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
                        hero.slamming = false;   // a bounce cancels a committed slam
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
            // The committed mid-air slam is done once it reaches the ground; from
            // here the shell only stays tucked while the player holds the gesture.
            if (hero.onGround && hero.slamming) hero.slamming = false;

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
            if (hero.dashJumpTime > 0) hero.dashJumpTime -= dt;
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
            // a wider arc on BOTH sides; the dash-jump rising slash reaches tall
            // overhead. Each enemy is hit once per swing.
            const spin = hero.attackSpin;
            const rise = hero.attackRise;
            const activeWin = rise ? RISE_SLASH_ACTIVE : (spin ? SPIN_ACTIVE : SLASH_ACTIVE);
            if (weapon === "sword" && hero.attackTime > hero.attackDur - activeWin) {
                let sx, sw, sy, sh;
                if (rise) {
                    // Tall column in front for an anti-air uppercut.
                    sw = RISE_RANGE;
                    sx = hero.facing > 0 ? hero.x - 14 : hero.x - sw + 14;
                    sh = RISE_HEIGHT;
                    sy = hero.y - sh;
                } else if (spin) {
                    sw = SPIN_RANGE * 2;
                    sx = hero.x - SPIN_RANGE;
                    sy = hero.y - hero.h - 14;
                    sh = SLASH_HEIGHT + 16;
                } else {
                    sw = SLASH_RANGE;
                    sx = hero.facing > 0 ? hero.x : hero.x - SLASH_RANGE;
                    sy = hero.y - hero.h - 6;
                    sh = SLASH_HEIGHT;
                }
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
            boss.anim += dt;
            const cfg = boss.cfg;
            const dist = hero.x - boss.x;
            const adist = Math.abs(dist);
            const faceTo = dist < 0 ? -1 : 1;

            // Enrage once badly hurt: faster, with an extra angry roar.
            if (!boss.enraged && boss.hp > 0 && boss.hp <= boss.maxHp * BOSS_ENRAGE) {
                boss.enraged = true;
                banner(cfg.name + " ENRAGED!", 1.4);
                SGSound.play("bossroar");
                screenShake(0.5, 8);
                puff(boss.x, boss.baseY - boss.h / 2, "#ff5d5d", 22);
            }
            const rage = boss.enraged ? 1.4 : 1;       // speed/aggression multiplier
            // Aggressive bosses (flyers, the assault droid) reset attacks faster.
            const baseCool = (kids ? 2.2 : 1.7) * (cfg.coolMul || 1);
            const cool = baseCool / rage;

            // Flyers gently bob and flap wings whatever they're doing.
            if (cfg.flying) boss.wing = Math.sin(boss.anim * 16);

            switch (boss.state) {
                case "intro":
                    if (cfg.flying) boss.baseY = boss.hoverY + Math.sin(boss.anim * 2) * 8;
                    if (boss.t >= 1.2) { boss.state = "walk"; boss.t = 0; boss.cd = 1.4; }
                    break;

                case "walk": {
                    boss.cd -= dt * rage;
                    boss.facing = faceTo;
                    if (cfg.flying) {
                        // Stalk the hero from a modest stand-off, weaving up and
                        // down. It presses in close enough to stay threatening
                        // and snaps off an attack the moment its timer is ready.
                        boss.baseY = boss.hoverY + Math.sin(boss.anim * 2.4) * 20;
                        const want = hero.x - faceTo * 150;     // hover nearer than before
                        const fsp = cfg.speed * rage * (Math.abs(want - boss.x) > 40 ? 1 : 0.4);
                        boss.x += Math.sign(want - boss.x) * fsp * dt;
                    } else {
                        const sp = cfg.speed * ENEMY_SPEED * rage;
                        const keep = cfg.keep || 120;
                        if (adist > keep) boss.x += boss.facing * sp * dt;
                    }
                    boss.x = Math.max(W * 0.5, Math.min(boss.x, levelLength - 60));

                    // Long-range bosses fire from afar; bruisers wait until close.
                    const wantRange = cfg.range || (cfg.flying ? 640 : 170);
                    if (boss.cd <= 0 && adist < wantRange) {
                        // Alternate through the boss's attack list for variety.
                        boss.move = cfg.attacks[boss.attackIx % cfg.attacks.length];
                        boss.attackIx++;
                        boss.state = "windup"; boss.t = 0; boss.facing = faceTo;
                        SGSound.play("bosscharge");
                    }
                    break;
                }

                case "windup": {
                    if (cfg.flying) boss.baseY = boss.hoverY + Math.sin(boss.anim * 2.2) * 14;
                    // Shorter, snappier telegraph when enraged.
                    const tele = (TELEGRAPH + 0.35) / rage;
                    if (boss.t >= tele) { boss.state = "attack"; boss.t = 0; startBossAttack(); }
                    break;
                }

                case "attack":
                    updateBossAttack(dt, rage);
                    break;

                case "beam": {
                    // Sustained sweeping energy beam (war titan).
                    boss.beamT += dt;
                    const bx = boss.x + boss.facing * 40;
                    const by = boss.baseY - boss.h * 0.62;
                    // The beam tilts to track the hero a little as it fires.
                    const aimY = hero.y - 18;
                    boss.beamAng = Math.atan2(aimY - by, boss.facing) * 0.15;
                    // Damage along the beam line if the hero stands in it.
                    const hb = heroBox();
                    const beamLen = 620;
                    const ex = bx + boss.facing * beamLen;
                    const ey = by + Math.tan(boss.beamAng) * beamLen;
                    if (segHitsBox(bx, by, ex, ey, 16, hb) && hero.invuln <= 0 && hero.dashIFrame <= 0) {
                        hurtHero();
                    }
                    if (boss.beamT >= (boss.enraged ? 1.4 : 1.0)) { boss.state = "recover"; boss.t = 0; }
                    break;
                }

                case "recover":
                    if (cfg.flying) boss.baseY = boss.hoverY + Math.sin(boss.anim * 2.2) * 18;
                    if (boss.t >= 0.55 / rage) { boss.state = "walk"; boss.cd = cool; }
                    break;
            }
        }

        // Fire off whatever attack was queued in boss.move.
        function startBossAttack() {
            const b = boss;
            const cx = b.x + b.facing * 30;
            const cy = b.baseY - b.h * 0.6;
            switch (b.move) {
                case "slam":
                    // Golem leaps forward and crashes down for a shockwave.
                    b.lungeV = 560 * ENEMY_SPEED;
                    b.vy = -460;
                    SGSound.play("bosscharge");
                    break;
                case "boulder":
                    // Golem hurls an arcing boulder that lands near the hero.
                    spawnProjectile(cx, cy, b.facing * 300, -260, "rock");
                    SGSound.play("missile");
                    break;
                case "hop":
                    // Marsh king springs toward the hero.
                    b.lungeV = 420 * ENEMY_SPEED;
                    b.vy = -540;
                    SGSound.play("bossswoop");
                    break;
                case "spit": {
                    // Marsh king sprays a fan of poison globs.
                    for (let a = -1; a <= 1; a++) {
                        spawnProjectile(cx, cy, b.facing * 300, a * 150 - 60, "poison");
                    }
                    SGSound.play("shoot");
                    break;
                }
                case "salvo": {
                    // War titan launches a slow homing-ish missile spread.
                    for (let a = -1; a <= 1; a++) {
                        spawnProjectile(cx, cy, b.facing * 230, a * 120, "missile");
                    }
                    SGSound.play("missile");
                    break;
                }
                case "mortar": {
                    // Siege walker lobs a cluster of arcing shells that rain down
                    // across the hero's position, forcing the player to keep moving.
                    const spread = b.enraged ? 4 : 3;
                    for (let i = 0; i < spread; i++) {
                        const land = hero.x + (i - (spread - 1) / 2) * 120;
                        const dx = land - cx;
                        const flight = 1.1;                 // seconds aloft
                        const vx = dx / flight;
                        const vy = -0.5 * 320 * flight;     // arc to land after ~flight secs
                        spawnProjectile(cx, cy - 20, vx, vy, "rock", i * 0.14);
                    }
                    SGSound.play("missile");
                    screenShake(0.2, 4);
                    break;
                }
                case "charge":
                    // Assault droid dashes along the ground to ram the hero.
                    b.lungeV = 720 * ENEMY_SPEED;
                    SGSound.play("bosscharge");
                    break;
                case "rapid":
                    // Assault droid opens up with a rapid autocannon burst; the
                    // bullets are fired one-by-one in updateBossAttack.
                    b.burst = b.enraged ? 6 : 4;
                    b.burstT = 0;
                    SGSound.play("shoot");
                    break;
                case "beam":
                    // Switch into the sustained-beam state.
                    b.state = "beam"; b.beamT = 0; b.beamAng = 0;
                    SGSound.play("bosslaser");
                    screenShake(0.4, 4);
                    break;
                case "dive":
                    // Wyvern swoops down along an arc and homes toward the hero,
                    // committing to the target's position at launch.
                    b.diveTargetX = hero.x;
                    b.facing = b.diveTargetX < b.x ? -1 : 1;
                    b.vy = 140; b.lungeV = 460 * ENEMY_SPEED;
                    SGSound.play("bossswoop");
                    break;
                case "strafe":
                    // Wyvern makes a fast horizontal strafing pass, dropping
                    // fireballs straight down as it crosses overhead.
                    b.diveTargetX = hero.x;
                    b.facing = b.diveTargetX < b.x ? -1 : 1;
                    b.lungeV = 620 * ENEMY_SPEED;
                    b.strafeDrop = 0;
                    SGSound.play("bossswoop");
                    break;
                case "fireball": {
                    // Wyvern spits a quick volley of fireballs aimed at the hero.
                    const n = b.enraged ? 4 : 3;
                    for (let i = 0; i < n; i++) {
                        const dx = hero.x - cx, dy = (hero.y - 20) - cy;
                        const len = Math.hypot(dx, dy) || 1;
                        spawnProjectile(cx, cy, (dx / len) * 380, (dy / len) * 380, "fire", i * 0.1);
                    }
                    SGSound.play("shoot");
                    break;
                }
            }
        }

        // Per-frame behaviour while an attack is mid-swing.
        function updateBossAttack(dt, rage) {
            const b = boss;
            const cfg = b.cfg;
            switch (b.move) {
                case "slam":
                case "hop": {
                    // Airborne leap with gravity; a ground impact slams.
                    b.x += b.facing * b.lungeV * dt;
                    b.lungeV = Math.max(0, b.lungeV - 760 * dt);
                    b.vy += GRAVITY * 0.55 * dt;
                    b.baseY += b.vy * dt;
                    b.x = Math.max(W * 0.5, Math.min(b.x, levelLength - 60));
                    const bb = enemyBox(b); const hb = heroBox();
                    if (overlap(bb.x, bb.y, bb.w, bb.h, hb.x, hb.y, hb.w, hb.h)) hurtHero();
                    if (b.baseY >= b.hoverY && b.vy > 0) {
                        // Landed: shockwave + screen shake, then recover.
                        b.baseY = b.hoverY; b.vy = 0;
                        bossShockwave();
                        b.state = "recover"; b.t = 0;
                    }
                    break;
                }
                case "dive": {
                    // Wyvern arcs down and steers toward the hero, then climbs back.
                    const steer = b.diveTargetX < b.x ? -1 : 1;
                    if (b.t < 0.55) b.facing = steer;       // home in during the descent
                    b.x += b.facing * b.lungeV * dt;
                    b.lungeV = Math.max(0, b.lungeV - 200 * dt);
                    b.vy += GRAVITY * 0.5 * dt;
                    b.baseY += b.vy * dt;
                    b.x = Math.max(W * 0.5, Math.min(b.x, levelLength - 60));
                    const bb = enemyBox(b); const hb = heroBox();
                    if (overlap(bb.x, bb.y, bb.w, bb.h, hb.x, hb.y, hb.w, hb.h)) hurtHero();
                    const floor = b.hoverY + 150;       // dive bottom near the ground
                    if (b.baseY >= floor) { b.baseY = floor; b.vy = -300; puff(b.x, b.baseY, "#d09ad6", 10); SGSound.play("whack"); }
                    if (b.t >= 0.85) {
                        // Climb back to the hover line and recover.
                        b.baseY += (b.hoverY - b.baseY) * Math.min(1, dt * 7);
                        if (Math.abs(b.baseY - b.hoverY) < 6) { b.baseY = b.hoverY; b.state = "recover"; b.t = 0; }
                    }
                    break;
                }
                case "strafe": {
                    // Wyvern streaks horizontally across the arena, dropping fire.
                    b.x += b.facing * b.lungeV * dt;
                    b.baseY = b.hoverY + 40 + Math.sin(b.anim * 5) * 6;
                    b.x = Math.max(W * 0.5, Math.min(b.x, levelLength - 60));
                    const bb = enemyBox(b); const hb = heroBox();
                    if (overlap(bb.x, bb.y, bb.w, bb.h, hb.x, hb.y, hb.w, hb.h)) hurtHero();
                    // Rain a fireball straight down at a steady cadence.
                    b.strafeDrop -= dt;
                    if (b.strafeDrop <= 0) {
                        b.strafeDrop = 0.16;
                        spawnProjectile(b.x, b.baseY - b.h * 0.4, b.facing * 60, 220, "fire");
                    }
                    if (b.t >= 0.85) {
                        b.baseY += (b.hoverY - b.baseY) * Math.min(1, dt * 7);
                        if (Math.abs(b.baseY - b.hoverY) < 6) { b.baseY = b.hoverY; b.state = "recover"; b.t = 0; }
                    }
                    break;
                }
                case "charge": {
                    // Assault droid barrels forward; ramming the hero hurts and
                    // knocks them back, and it stops once its momentum bleeds off.
                    b.x += b.facing * b.lungeV * dt;
                    b.lungeV = Math.max(0, b.lungeV - 620 * dt);
                    b.x = Math.max(W * 0.5, Math.min(b.x, levelLength - 60));
                    const bb = enemyBox(b); const hb = heroBox();
                    if (overlap(bb.x, bb.y, bb.w, bb.h, hb.x, hb.y, hb.w, hb.h) && hero.invuln <= 0 && hero.dashIFrame <= 0) {
                        hurtHero();
                        hero.vx = b.facing * 420; hero.vy = -220;
                        puff(hero.x, hero.y - hero.h / 2, "#ff8a8a", 10);
                    }
                    if (b.lungeV <= 4) { b.state = "recover"; b.t = 0; }
                    break;
                }
                case "rapid": {
                    // Fire one autocannon round at a time until the burst is spent.
                    b.burstT -= dt;
                    if (b.burst > 0 && b.burstT <= 0) {
                        b.burstT = 0.12;
                        b.burst--;
                        const cx = b.x + b.facing * 36, cy = b.baseY - b.h * 0.62;
                        const dx = hero.x - cx, dy = (hero.y - 24) - cy;
                        const len = Math.hypot(dx, dy) || 1;
                        const spread = (Math.random() - 0.5) * 0.12;
                        spawnProjectile(cx, cy, (dx / len) * 520 + spread * 200, (dy / len) * 520, "fire");
                        SGSound.play("shoot");
                    }
                    if (b.burst <= 0) { b.state = "recover"; b.t = 0; }
                    break;
                }
                default:
                    // Projectile attacks have no follow-through; brief recovery.
                    if (b.t >= 0.35) { b.state = "recover"; b.t = 0; }
                    break;
            }
        }

        // Ground shock from a heavy landing: knockback + damage near the impact.
        function bossShockwave() {
            SGSound.play("bossslam");
            screenShake(0.45, 11);
            host.vibrate([20, 30, 20]);
            puff(boss.x, boss.baseY, "#caa06a", 20);
            const hb = heroBox();
            // A grounded hero within the blast gets hurt and knocked.
            if (hero.onGround && Math.abs(hero.x - boss.x) < 150 && hero.invuln <= 0 && hero.dashIFrame <= 0) {
                hurtHero();
                hero.vx = (hero.x < boss.x ? -1 : 1) * 360;
                hero.vy = -260;
            }
        }

        // Spawn a typed boss projectile into the shared orbs pool.
        function spawnProjectile(x, y, vx, vy, type, delay) {
            orbs.push({
                x: x, y: y, vx: vx, vy: vy, life: 3.4, type: type,
                big: type === "rock" || type === "missile",
                grav: type === "rock" || type === "poison" ? 320 : 0,
                spin: Math.random() * Math.PI, delay: delay || 0
            });
        }

        // Distance from a box centre to a line segment, for the sweeping beam.
        function segHitsBox(x1, y1, x2, y2, pad, box) {
            const cxb = box.x + box.w / 2, cyb = box.y + box.h / 2;
            const dx = x2 - x1, dy = y2 - y1;
            const len2 = dx * dx + dy * dy || 1;
            let t = ((cxb - x1) * dx + (cyb - y1) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
            const px = x1 + dx * t, py = y1 + dy * t;
            const d = Math.hypot(cxb - px, cyb - py);
            return d < pad + Math.max(box.w, box.h) / 2;
        }

        function updateOrbs(dt) {
            for (const o of orbs) {
                // Staggered volley shots wait out their delay before flying.
                if (o.delay > 0) { o.delay -= dt; continue; }
                if (o.grav) o.vy += o.grav * dt;
                o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
                if (o.spin !== undefined) o.spin += dt * 6;
                const r = o.big ? 16 : 11;
                const hb = heroBox();
                if (overlap(o.x - r, o.y - r, r * 2, r * 2, hb.x, hb.y, hb.w, hb.h)) {
                    if (hero.invuln <= 0 && hero.dashIFrame <= 0) hurtHero();
                    o.life = 0;
                    puff(o.x, o.y, o.type === "poison" ? "#bdf08a" : "#ff9a5d", 8);
                }
                // Gravity-bound shots shatter on the cave floor.
                if (o.grav && o.y > groundY) {
                    o.life = 0;
                    puff(o.x, groundY, o.type === "poison" ? "#bdf08a" : "#caa06a", 8);
                }
            }
            orbs = orbs.filter(o => o.life > 0 && o.x > camX - 80 && o.x < camX + W + 80);
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
            // Screen-shake jitters the world layer (HUD stays steady).
            let shx = 0, shy = 0;
            if (shakeT > 0) {
                const s = shakeMag * Math.min(1, shakeT * 3);
                shx = (Math.random() - 0.5) * s * 2;
                shy = (Math.random() - 0.5) * s * 2;
            }
            ctx.translate(-camX + shx, shy);

            drawGround();
            drawCeiling();
            drawMist();
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

            drawMotes();

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

        // Soft mist hugging the cave floor. Drawn in the world layer so it sits
        // behind the action; a low-alpha gradient plus a couple of slow swells
        // give a faint sense of settling fog without obscuring anything.
        function drawMist() {
            if (!amb) return;
            const bandH = 88;
            const top = groundY - bandH;
            const g = ctx.createLinearGradient(0, top, 0, groundY);
            g.addColorStop(0, "rgba(" + amb.mist + ",0)");
            g.addColorStop(1, "rgba(" + amb.mist + "," + amb.mistA + ")");
            ctx.fillStyle = g;
            ctx.fillRect(camX, top, W, bandH);
            // A few broad swells drifting along the floor for subtle motion.
            ctx.fillStyle = "rgba(" + amb.mist + "," + (amb.mistA * 0.6).toFixed(3) + ")";
            for (let i = 0; i < 5; i++) {
                const cx = camX + ((i * 260 + time * 14) % (W + 320)) - 160;
                const sw = 150 + Math.sin(time * 0.6 + i) * 26;
                const cy = groundY - 16 - Math.sin(time * 0.5 + i * 1.7) * 8;
                ctx.beginPath();
                ctx.ellipse(cx, cy, sw, 26, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Drifting ambient motes rendered in screen space. A gentle parallax tied
        // to the camera gives depth; styling varies per biome (sparks, bubbles,
        // spores, dust). Everything stays very low-alpha to avoid distraction.
        function drawMotes() {
            if (!motes || !amb) return;
            const fieldW = W + 120;
            const kind = amb.kind;
            ctx.save();
            for (const m of motes) {
                const depth = 0.45 + m.z * 0.55;
                // Parallax: nearer motes (higher depth) slide more with the camera.
                let sx = (m.x - camX * depth * 0.35) % fieldW;
                if (sx < 0) sx += fieldW;
                sx -= 60;
                const sy = m.y - 60;
                if (sx < -10 || sx > W + 10) continue;
                const a = amb.alpha * (0.5 + m.z * 0.5);
                const rr = m.r * (0.7 + m.z * 0.8);
                if (kind === "bubble") {
                    ctx.globalAlpha = a;
                    ctx.strokeStyle = "rgba(" + amb.mote + ",1)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(sx, sy, rr + 0.6, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = a * 0.5;
                    ctx.fillStyle = "rgba(" + amb.mote + ",1)";
                    ctx.beginPath();
                    ctx.arc(sx - rr * 0.3, sy - rr * 0.3, rr * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                } else if (kind === "spark") {
                    // Twinkle: alpha pulses with the wobble phase.
                    ctx.globalAlpha = a * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(m.ph * 2)));
                    ctx.fillStyle = "rgba(" + amb.mote + ",1)";
                    ctx.beginPath();
                    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // spore / dust: plain soft dot.
                    ctx.globalAlpha = a;
                    ctx.fillStyle = "rgba(" + amb.mote + ",1)";
                    ctx.beginPath();
                    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
            ctx.restore();
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
                let bodyColor = s.cracked ? "#3a3050" : "#2c2442";
                if (s.state === "falling") {
                    // Flash red while plummeting to warn of incoming danger.
                    bodyColor = Math.sin(performance.now() / 60) > 0 ? "#ff3b3b" : "#7a1f1f";
                }
                ctx.fillStyle = bodyColor;
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
            if (o.delay > 0) return;        // not launched yet
            const type = o.type || "fire";
            const r = o.big ? 15 : 11;
            if (type === "rock") {
                // Tumbling boulder.
                ctx.save();
                ctx.translate(o.x, o.y);
                ctx.rotate(o.spin || 0);
                ctx.fillStyle = "#6f4d30";
                roundRect(-r, -r, r * 2, r * 2, 5);
                ctx.fillStyle = "#8a6440";
                roundRect(-r + 3, -r + 3, r, r, 3);
                ctx.restore();
                return;
            }
            if (type === "poison") {
                // Wobbling green glob with a glow.
                const grad = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, r);
                grad.addColorStop(0, "#eaffc2");
                grad.addColorStop(0.5, "#8fd94f");
                grad.addColorStop(1, "rgba(80,150,40,0.1)");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            if (type === "missile") {
                // Steel slug with a flame tail.
                ctx.save();
                ctx.translate(o.x, o.y);
                ctx.rotate(Math.atan2(o.vy, o.vx));
                ctx.fillStyle = "rgba(255,160,80,0.6)";
                ctx.beginPath();
                ctx.moveTo(-r, 0); ctx.lineTo(-r - 14, -4); ctx.lineTo(-r - 14, 4);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#cfd6e6";
                roundRect(-r, -5, r * 2, 10, 4);
                ctx.fillStyle = "#7be6ff";
                roundRect(r - 4, -3, 4, 6, 2);
                ctx.restore();
                return;
            }
            // Default fireball (fire / generic).
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
            const cfg = b.cfg;
            const winding = b.state === "windup";
            const wob = winding ? Math.sin(time * 26) * 3 : 0;
            const eye = (winding || b.enraged) ? "#ff3b3b" : cfg.eye;

            // Ground shadow — emphasises that the wyvern is airborne.
            if (cfg.flying) {
                ctx.save();
                ctx.translate(b.x, b.baseY);
                ctx.fillStyle = "rgba(0,0,0,0.22)";
                ctx.beginPath();
                ctx.ellipse(0, groundY - b.baseY, b.w * 0.42, 10, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.translate(b.x + wob, b.baseY);
            if (b.hitFlash > 0) ctx.globalAlpha = 0.6;
            if (winding) { ctx.shadowColor = "#ffcf5d"; ctx.shadowBlur = 22; }
            else if (b.enraged) { ctx.shadowColor = "#ff4d4d"; ctx.shadowBlur = 14; }
            ctx.scale(b.facing, 1);             // local +x faces the hero

            const W2 = b.w, H2 = b.h;
            const lineSeg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

            if (b.kind === "golem") {
                // ----- Hulking rock golem -----
                const stomp = (b.move === "slam" && b.state === "attack") ? 4 : 0;
                ctx.fillStyle = cfg.trim;
                roundRect(-W2 * 0.34, -26, 26, 26, 6);                       // legs
                roundRect(W2 * 0.34 - 26, -26, 26, 26, 6);
                ctx.fillStyle = cfg.body;
                roundRect(-W2 / 2, -H2 * 0.78, W2, H2 * 0.6, 22);            // torso boulder
                ctx.fillStyle = cfg.bodyLit;
                roundRect(-W2 / 2 + 8, -H2 * 0.78, W2 - 16, H2 * 0.22, 16);  // lit shoulders
                // glowing cracks
                ctx.strokeStyle = b.enraged ? "rgba(255,90,60,0.7)" : "rgba(255,209,102,0.4)";
                ctx.lineWidth = 3; ctx.lineCap = "round";
                lineSeg(-10, -H2 * 0.7, 6, -H2 * 0.5);
                lineSeg(6, -H2 * 0.5, -4, -H2 * 0.3);
                // arms
                ctx.fillStyle = cfg.body;
                roundRect(-W2 / 2 - 14, -H2 * 0.62, 20, H2 * 0.46, 9);       // back arm
                roundRect(W2 / 2 - 8, -H2 * 0.64 + stomp, 24, H2 * 0.5, 10); // front arm
                ctx.fillStyle = cfg.trim;
                roundRect(W2 / 2 - 12, -H2 * 0.2 + stomp, 30, 26, 9);        // big fist
                // head
                ctx.fillStyle = cfg.bodyLit;
                roundRect(-22, -H2, 44, H2 * 0.28, 12);
                ctx.fillStyle = eye;
                if (winding || b.enraged) { ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 14; }
                ctx.fillRect(-14, -H2 * 0.9, 11, 7);
                ctx.fillRect(5, -H2 * 0.9, 11, 7);
            } else if (b.kind === "marshking") {
                // ----- Bloated marsh toad-king -----
                const breathe = Math.sin(b.anim * 4) * 2;
                ctx.fillStyle = cfg.trim;
                roundRect(-W2 / 2 + 4, -20, 22, 20, 8);                      // squat legs
                roundRect(W2 / 2 - 26, -20, 22, 20, 8);
                ctx.fillStyle = cfg.body;
                ctx.beginPath();
                ctx.ellipse(0, -H2 * 0.42, W2 * 0.52, H2 * 0.46 + breathe, 0, 0, Math.PI * 2); // body dome
                ctx.fill();
                ctx.fillStyle = cfg.bodyLit;
                ctx.beginPath();
                ctx.ellipse(-6, -H2 * 0.52, W2 * 0.3, H2 * 0.22, 0, 0, Math.PI * 2);           // belly sheen
                ctx.fill();
                // wide mouth
                ctx.fillStyle = "#2c3d2c";
                roundRect(-W2 * 0.34, -H2 * 0.34, W2 * 0.68, 10, 5);
                if (b.state === "attack" && b.move === "spit") {
                    ctx.fillStyle = "#9fe04f";
                    roundRect(W2 * 0.2, -H2 * 0.38, 16, 14, 6);             // puffed cheek
                }
                // bulging eyes
                ctx.fillStyle = "#f6fff0";
                ctx.beginPath();
                ctx.arc(-13, -H2 * 0.66, 11, 0, Math.PI * 2);
                ctx.arc(15, -H2 * 0.66, 11, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = eye;
                ctx.beginPath();
                ctx.arc(-13, -H2 * 0.66, 5, 0, Math.PI * 2);
                ctx.arc(15, -H2 * 0.66, 5, 0, Math.PI * 2);
                ctx.fill();
                // little crown
                ctx.fillStyle = "#ffd54a";
                ctx.beginPath();
                ctx.moveTo(-20, -H2 * 0.82);
                ctx.lineTo(-12, -H2 * 0.98); ctx.lineTo(-4, -H2 * 0.84);
                ctx.lineTo(4, -H2 * 0.98); ctx.lineTo(12, -H2 * 0.84);
                ctx.lineTo(20, -H2 * 0.98); ctx.lineTo(22, -H2 * 0.8);
                ctx.lineTo(-22, -H2 * 0.8); ctx.closePath();
                ctx.fill();
            } else if (cfg.shape === "warbot") {
                // ----- Armoured robot chassis (war titan / siege / assault) -----
                const variant = cfg.variant || "titan";
                // Sweeping energy beam (drawn behind the chassis).
                if (b.state === "beam") {
                    const cxn = 40, cyn = -H2 * 0.62;
                    const exn = cxn + 620, eyn = cyn + Math.tan(b.beamAng || 0) * 620;
                    const flick = 1 + Math.sin(time * 50) * 0.18;
                    ctx.save();
                    ctx.globalCompositeOperation = "lighter";
                    ctx.lineCap = "round";
                    ctx.strokeStyle = "rgba(123,230,255,0.22)"; ctx.lineWidth = 30 * flick; lineSeg(cxn, cyn, exn, eyn);
                    ctx.strokeStyle = "rgba(170,240,255,0.5)"; ctx.lineWidth = 14 * flick; lineSeg(cxn, cyn, exn, eyn);
                    ctx.strokeStyle = "#eaffff"; ctx.lineWidth = 5 * flick; lineSeg(cxn, cyn, exn, eyn);
                    ctx.restore();
                }
                ctx.fillStyle = cfg.trim;
                if (variant === "siege") {
                    // Tracked base instead of legs.
                    ctx.fillStyle = "#2c3022";
                    roundRect(-W2 / 2 - 4, -26, W2 + 8, 26, 8);             // tread housing
                    ctx.fillStyle = cfg.trim;
                    for (let tx = -W2 / 2 + 4; tx < W2 / 2 - 4; tx += 16) {
                        roundRect(tx, -20, 10, 14, 3);                       // tread links
                    }
                    ctx.fillStyle = cfg.bodyLit;
                    ctx.beginPath(); ctx.arc(-W2 / 2 + 6, -13, 6, 0, Math.PI * 2);
                    ctx.arc(W2 / 2 - 6, -13, 6, 0, Math.PI * 2); ctx.fill(); // drive wheels
                } else if (variant === "assault") {
                    // Lean digitigrade legs.
                    roundRect(-W2 * 0.3, -26, 14, 26, 5);
                    roundRect(W2 * 0.3 - 14, -26, 14, 26, 5);
                    ctx.fillStyle = cfg.body;
                    roundRect(-W2 * 0.3 - 2, -8, 20, 8, 3);                 // back foot
                    roundRect(W2 * 0.3 - 18, -8, 20, 8, 3);                 // front foot
                } else {
                    roundRect(-W2 * 0.32, -28, 22, 28, 5);                   // piston legs
                    roundRect(W2 * 0.32 - 22, -28, 22, 28, 5);
                }
                ctx.fillStyle = cfg.body;
                roundRect(-W2 / 2, -H2 * 0.8, W2, H2 * 0.64, 10);            // chassis
                ctx.fillStyle = cfg.bodyLit;
                roundRect(-W2 / 2 + 7, -H2 * 0.78, W2 - 14, H2 * 0.16, 6);   // chest plate
                ctx.fillStyle = cfg.trim;
                roundRect(-W2 / 2 + 10, -H2 * 0.5, W2 - 20, 8, 3);          // vent slats
                roundRect(-W2 / 2 + 10, -H2 * 0.4, W2 - 20, 8, 3);
                // Forward weapon — differs per loadout.
                const firing = b.state === "attack" || b.state === "beam";
                if (variant === "siege") {
                    // Big upward-angled mortar tube + side bracing.
                    ctx.fillStyle = cfg.body;
                    roundRect(W2 / 2 - 10, -H2 * 0.74, 22, 30, 5);           // shoulder mount
                    ctx.save();
                    ctx.translate(W2 / 2 + 6, -H2 * 0.72);
                    ctx.rotate(-0.5);
                    ctx.fillStyle = cfg.trim;
                    roundRect(0, -10, 40, 20, 6);                            // mortar barrel
                    ctx.fillStyle = "#26120a";
                    ctx.beginPath(); ctx.ellipse(40, 0, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
                    if (b.state === "attack" && b.move === "mortar") {
                        ctx.fillStyle = "#ffd166";
                        ctx.beginPath(); ctx.arc(44, 0, 6, 0, Math.PI * 2); ctx.fill(); // muzzle flash
                    }
                    ctx.restore();
                } else if (variant === "assault") {
                    // Twin autocannons that flicker while bursting.
                    ctx.fillStyle = cfg.body;
                    roundRect(W2 / 2 - 6, -H2 * 0.72, 16, 22, 4);
                    ctx.fillStyle = cfg.trim;
                    roundRect(W2 / 2 + 6, -H2 * 0.7, 28, 7, 3);              // upper barrel
                    roundRect(W2 / 2 + 6, -H2 * 0.58, 28, 7, 3);            // lower barrel
                    const flashAss = (b.state === "attack" && b.move === "rapid" && Math.floor(time * 30) % 2 === 0);
                    ctx.fillStyle = flashAss ? "#fff2a0" : eye;
                    ctx.beginPath(); ctx.arc(W2 / 2 + 36, -H2 * 0.665, 4, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(W2 / 2 + 36, -H2 * 0.545, 4, 0, Math.PI * 2); ctx.fill();
                } else {
                    // War titan beam cannon.
                    ctx.fillStyle = cfg.body;
                    roundRect(W2 / 2 - 6, -H2 * 0.7, 20, 26, 5);
                    ctx.fillStyle = cfg.trim;
                    roundRect(W2 / 2 + 10, -H2 * 0.7, 26, 22, 6);            // barrel
                    ctx.fillStyle = (b.state === "beam") ? "#eaffff" : eye;
                    ctx.beginPath(); ctx.arc(W2 / 2 + 36, -H2 * 0.59, 7, 0, Math.PI * 2); ctx.fill(); // muzzle
                }
                // head + visor
                ctx.fillStyle = cfg.body;
                roundRect(-18, -H2, 36, H2 * 0.22, 6);
                ctx.fillStyle = eye;
                if (winding || b.enraged) { ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 12; }
                roundRect(-12, -H2 * 0.92, 24, 6, 3);                        // visor slit
                ctx.shadowBlur = 0;
                ctx.fillStyle = cfg.trim;
                ctx.fillRect(-1, -H2 - 12, 2, 12);                           // antenna
                ctx.fillStyle = eye;
                ctx.beginPath(); ctx.arc(0, -H2 - 13, 3, 0, Math.PI * 2); ctx.fill();
            } else {
                // ----- Flying cave wyvern -----
                const flap = b.wing || Math.sin(b.anim * 16);
                const diving = b.state === "attack" && b.move === "dive";
                // wings (behind body)
                ctx.fillStyle = cfg.trim;
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.translate(0, -H2 * 0.6);
                    ctx.rotate(side * (0.5 + flap * 0.5));
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(side * W2 * 0.55, -H2 * 0.4, side * W2 * 0.7, H2 * 0.1);
                    ctx.quadraticCurveTo(side * W2 * 0.4, H2 * 0.05, 0, H2 * 0.18);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                // membrane highlight
                ctx.fillStyle = cfg.bodyLit;
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.translate(0, -H2 * 0.6);
                    ctx.rotate(side * (0.5 + flap * 0.5));
                    ctx.globalAlpha = 0.4;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(side * W2 * 0.4, -H2 * 0.25, side * W2 * 0.55, H2 * 0.05);
                    ctx.quadraticCurveTo(side * W2 * 0.3, 0, 0, H2 * 0.12);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                ctx.globalAlpha = (b.hitFlash > 0) ? 0.6 : 1;
                // body
                ctx.fillStyle = cfg.body;
                ctx.beginPath();
                ctx.ellipse(0, -H2 * 0.5, W2 * 0.26, H2 * 0.4, 0, 0, Math.PI * 2);
                ctx.fill();
                // tail trailing back
                ctx.strokeStyle = cfg.body; ctx.lineWidth = 8; ctx.lineCap = "round";
                lineSeg(-W2 * 0.18, -H2 * 0.4, -W2 * 0.5, -H2 * 0.1);
                ctx.fillStyle = cfg.trim;
                ctx.beginPath();
                ctx.moveTo(-W2 * 0.5, -H2 * 0.1);
                ctx.lineTo(-W2 * 0.62, -H2 * 0.02); ctx.lineTo(-W2 * 0.5, -H2 * 0.22);
                ctx.closePath(); ctx.fill();
                // clawed legs
                ctx.strokeStyle = cfg.trim; ctx.lineWidth = 5;
                lineSeg(-6, -H2 * 0.18, -8, 0);
                lineSeg(8, -H2 * 0.18, 10, 0);
                // head (forward) with horn
                ctx.fillStyle = cfg.bodyLit;
                ctx.beginPath();
                ctx.ellipse(W2 * 0.22, -H2 * (diving ? 0.42 : 0.62), W2 * 0.16, H2 * 0.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = cfg.trim;
                ctx.beginPath();
                ctx.moveTo(W2 * 0.3, -H2 * 0.78);
                ctx.lineTo(W2 * 0.4, -H2 * 0.95); ctx.lineTo(W2 * 0.34, -H2 * 0.72);
                ctx.closePath(); ctx.fill();                                 // horn
                ctx.fillStyle = eye;
                if (winding || b.enraged) { ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 12; }
                ctx.beginPath();
                ctx.arc(W2 * 0.28, -H2 * (diving ? 0.46 : 0.66), 5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        function drawTurtle() {
            const flashing = hero.invuln > 0 && Math.floor(time * 12) % 2 === 0;
            ctx.save();
            ctx.translate(hero.x, hero.y);
            if (flashing) ctx.globalAlpha = 0.35;
            if (hero.dashIFrame > 0) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.7);

            // Drawn a touch larger than the hitbox so the turtle reads clearly.
            // Attack arcs below stay in world space, so true ranges are unchanged.
            ctx.scale(1.53, 1.53);

            const cx = 0;

            // Shared palette for the turtle.
            const skin = "#8fd6a0";
            const skinDark = "#63b07c";
            const shellMid = "#2e9e5b";
            const shellDark = "#1f7d44";
            const shellRim = "#1a6b3a";
            const shellLight = "#5fc487";
            const belly = "#e9dca6";
            const bellyLine = "#cdbd86";
            const band = "#d65a4f";        // cloth accent for wrist / knee wraps
            const belt = "#1f6b3c";        // dark-green belt / sash
            const beltDark = "#114d29";

            if (hero.shell) {
                // Tucked in: a domed carapace resting on the ground (base at y=0).
                const rx = hero.w / 2 + 4;
                const ry = hero.h / 2 + 4;
                ctx.fillStyle = shellRim;
                ctx.beginPath();
                ctx.ellipse(cx, 0, rx, ry, 0, Math.PI, 0, false);
                ctx.fill();
                ctx.fillStyle = shellMid;
                ctx.beginPath();
                ctx.ellipse(cx, 0, rx - 2.5, ry - 2, 0, Math.PI, 0, false);
                ctx.fill();
                // Central scute ridge.
                ctx.fillStyle = shellDark;
                ctx.beginPath();
                ctx.ellipse(cx, -1, 6, ry - 7, 0, Math.PI, 0, false);
                ctx.fill();
                // Pale plastron along the base.
                ctx.fillStyle = belly;
                roundRect(cx - rx + 5, -3, (rx - 5) * 2, 3, 1.5);
                // Highlight.
                ctx.fillStyle = shellLight;
                ctx.beginPath();
                ctx.ellipse(cx - 7, -ry * 0.5, 4, 2.4, -0.5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // ----- Upright, bipedal ninja-turtle stance -----
                ctx.scale(hero.facing, 1);
                const onG = hero.onGround;
                const runPhase = Math.sin(hero.walk);                        // run cycle
                const bob = (onG && Math.abs(hero.vx) < 20) ? Math.sin(time * 3) * 0.6 : 0;  // idle breathing
                // Legs pivot from the hip: on the ground they scissor through the
                // run cycle; airborne they hold a slight leaping split.
                const backAng = onG ? runPhase * 0.6 : 0.4;
                const frontAng = onG ? -runPhase * 0.6 : -0.5;
                const hipY = -11;

                // ===== back limbs (behind the torso) =====
                ctx.save();
                ctx.translate(1, hipY);
                ctx.rotate(backAng);
                ctx.fillStyle = skinDark;
                roundRect(-3, 0, 6, 10, 3);                                 // back leg
                roundRect(-3, 8, 9, 4, 2);                                  // back foot
                ctx.restore();
                ctx.strokeStyle = skinDark; ctx.lineWidth = 5; ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(-3, -21 + bob);
                ctx.lineTo(-8, -14 + bob);                                  // back arm
                ctx.stroke();

                // ===== shell (carapace) carried on the back =====
                ctx.save();
                ctx.translate(-3, -16.5 + bob);
                ctx.fillStyle = shellRim;
                ctx.beginPath();
                ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = shellMid;
                ctx.beginPath();
                ctx.ellipse(0, 0, 10, 8.2, 0, 0, Math.PI * 2);
                ctx.fill();
                // central scute
                ctx.fillStyle = shellDark;
                ctx.beginPath();
                ctx.ellipse(-1, 0, 4, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                // surrounding scute plates
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2 + 0.4;
                    ctx.beginPath();
                    ctx.ellipse(Math.cos(a) * 6.5 - 1, Math.sin(a) * 5.4, 2, 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                // highlight
                ctx.fillStyle = shellLight;
                ctx.beginPath();
                ctx.ellipse(-4.5, -4.5, 3, 2, -0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // ===== front leg =====
                ctx.save();
                ctx.translate(4, hipY);
                ctx.rotate(frontAng);
                ctx.fillStyle = skin;
                roundRect(-3, 0, 6, 10, 3);                                 // front leg
                roundRect(-3, 8, 10, 4, 2);                                 // front foot
                ctx.restore();

                // ===== torso with plastron (belly) =====
                ctx.fillStyle = skin;
                roundRect(-3, -24 + bob, 12, 16, 6);
                ctx.fillStyle = belly;
                roundRect(0, -23 + bob, 8, 14, 5);
                ctx.strokeStyle = bellyLine; ctx.lineWidth = 1;
                for (let i = 1; i <= 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(1, -23 + bob + i * 3.4);
                    ctx.lineTo(7, -23 + bob + i * 3.4);
                    ctx.stroke();
                }

                // ===== belt / sash =====
                ctx.fillStyle = belt;
                roundRect(-3, -12.5 + bob, 12, 3, 1);
                ctx.fillStyle = beltDark;
                roundRect(4, -13 + bob, 3, 4.5, 1);                        // knot

                // ===== head =====
                const hx = 3, hy = -29 + bob;
                ctx.fillStyle = skin;
                ctx.beginPath();
                ctx.arc(hx, hy, 7.5, 0, Math.PI * 2);
                ctx.fill();
                // jaw / beak hint
                ctx.fillStyle = skinDark;
                roundRect(hx + 3.5, hy + 1.5, 5, 4, 2);
                // eyes
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.ellipse(hx + 1.5, hy - 1.5, 2.5, 3, 0, 0, Math.PI * 2);
                ctx.ellipse(hx + 6, hy - 1.5, 2.5, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#1c2030";
                ctx.beginPath();
                ctx.arc(hx + 2.3, hy - 1.2, 1.2, 0, Math.PI * 2);
                ctx.arc(hx + 6.8, hy - 1.2, 1.2, 0, Math.PI * 2);
                ctx.fill();

                // ===== front arm + equipped weapon =====
                const shx = 6, shy = -20 + bob;        // front shoulder pivot
                if (weapon === "sword") {
                    // The arm + sword swing as one piece; the swing maths are
                    // unchanged so the slash visuals stay perfectly in sync.
                    let blade;
                    if (hero.attackTime > 0) {
                        const prog = 1 - hero.attackTime / hero.attackDur;
                        if (hero.attackSpin) {
                            blade = -1.1 + prog * Math.PI * 2;          // full spin
                        } else if (hero.attackRise) {
                            blade = 1.4 - prog * 3.0;                    // rising uppercut
                        } else if (hero.comboStep === 2) {
                            blade = 1.1 - prog * 2.0;                    // upward back-swing
                        } else {
                            blade = -1.1 + prog * 2.0;                   // downward chop
                        }
                    } else {
                        blade = -0.7;                                    // ready stance
                    }
                    ctx.save();
                    ctx.translate(shx, shy);
                    ctx.rotate(blade);
                    // forearm
                    ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = "round";
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 0); ctx.stroke();
                    // wrist wrap
                    ctx.strokeStyle = band; ctx.lineWidth = 5;
                    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(11.5, 0); ctx.stroke();
                    // sword
                    ctx.translate(12, 0);
                    ctx.fillStyle = "#cfd8e6";
                    roundRect(0, -3, 24, 5, 2);
                    ctx.fillStyle = "#aeb8c8";
                    roundRect(1, -1, 21, 1.4, 1);                        // blade fuller
                    ctx.fillStyle = "#ffd166";
                    roundRect(-4, -4, 5, 8, 2);                          // guard
                    ctx.fillStyle = "#b9892f";
                    roundRect(-7, -2, 4, 4, 2);                          // pommel
                    ctx.restore();
                } else {
                    // A throwing star spins in the front hand; a tap flicks it forward.
                    let reach = 0;
                    if (hero.attackTime > 0) {
                        const prog = 1 - hero.attackTime / hero.attackDur;
                        reach = Math.sin(prog * Math.PI) * 8;
                    }
                    const hxw = shx + 9 + reach, hyw = shy + 5;          // hand position
                    ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = "round";
                    ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(hxw, hyw); ctx.stroke();
                    ctx.strokeStyle = band; ctx.lineWidth = 5;
                    ctx.beginPath(); ctx.moveTo(hxw - 2, hyw - 1); ctx.lineTo(hxw, hyw); ctx.stroke();
                    ctx.fillStyle = "#ffe08a";
                    drawStarShape(hxw + 2, hyw, 6, time * 8);
                    ctx.fillStyle = "#bda23a";
                    ctx.beginPath(); ctx.arc(hxw + 2, hyw, 1.5, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.restore();

            // Sword slash arc (world space). Each combo step looks different;
            // the third hit is a full spin that sweeps both sides.
            const slashWin = hero.attackRise ? RISE_SLASH_ACTIVE : (hero.attackSpin ? SPIN_ACTIVE : SLASH_ACTIVE);
            if (weapon === "sword" && hero.attackTime > hero.attackDur - slashWin && !hero.shell) {
                const prog = 1 - (hero.attackTime - (hero.attackDur - slashWin)) / slashWin;
                ctx.save();
                ctx.translate(hero.x, hero.y - hero.h / 2);
                ctx.lineCap = "round";
                if (hero.attackRise) {
                    // Rising slash: a tall crescent sweeping upward in front.
                    ctx.scale(hero.facing, 1);
                    ctx.globalAlpha = 0.7 * (1 - prog);
                    ctx.strokeStyle = "#eaf2ff";
                    ctx.lineWidth = 8;
                    ctx.beginPath();
                    ctx.arc(0, -10, RISE_HEIGHT * 0.5, 1.5 - prog * 0.9, -1.6 - prog * 0.9, true);
                    ctx.stroke();
                    ctx.globalAlpha = 0.5 * (1 - prog);
                    ctx.strokeStyle = "#fff2c2";
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(10, 16);
                    ctx.lineTo(-2, -RISE_HEIGHT * 0.62);
                    ctx.stroke();
                } else if (hero.attackSpin) {
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
                ctx.fillText(boss.cfg ? boss.cfg.name : "BOSS", W / 2, by + 10);
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
                ctx.fillText("Swipe & HOLD to move \u2022 swipe UP to jump (x2)", W / 2, H * 0.34);
                ctx.font = "500 14px system-ui, sans-serif";
                ctx.fillStyle = "rgba(154,160,195,0.95)";
                ctx.fillText("TAP to attack \u2022 flick fast to DASH \u2022 chain 3 for a spin!", W / 2, H * 0.34 + 24);
                ctx.fillText("Swipe DOWN for shell \u2022 slam down to crush foes", W / 2, H * 0.34 + 46);
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
            const t = performance.now();
            pointers.set(id, { isBtn: false, sx: x, sy: y, st: t, mode: "", lx: x, ly: y, lt: t });
        }

        function pressMove(id, x, y) {
            const p = pointers.get(id);
            if (!p || p.isBtn) return;
            const dx = x - p.sx, dy = y - p.sy;
            const adx = Math.abs(dx), ady = Math.abs(dy);

            // Instantaneous finger speed since the previous sample. Measuring the
            // recent motion (not the average since touchdown) means a quick flick
            // is detected even when the press began with a brief pause or drift.
            const now = performance.now();
            const sdx = x - p.lx, sdy = y - p.ly;     // movement since the previous sample
            const flickSpeed = (Math.hypot(sdx, sdy) / Math.max(1, now - p.lt)) * 1000;
            p.lx = x; p.ly = y; p.lt = now;

            if (p.mode === "") {
                if (Math.max(adx, ady) < MOVE_THRESH) return;
                // Only a narrowly-horizontal swipe dashes/moves; anything steeper
                // is treated as a vertical intent (jump up / shell down) so a
                // diagonal flick meant as a jump doesn't dash by mistake.
                if (adx > ady * DASH_X_DOMINANCE) {
                    const dir = dx < 0 ? -1 : 1;
                    // A fast horizontal flick dashes; a gentler swipe just moves
                    // (and steers left/right, including while airborne).
                    if (!hero.shell && flickSpeed > GROUND_DASH_SPEED) startDash(dir, 0);
                    touchMoveDir = dir; moveId = id; p.mode = "move";
                    p.anchorY = y;       // baseline for vertical swipes while moving
                } else {
                    if (dy < -SWIPE_THRESH) {
                        // Swipe up to jump; in the air this double-jumps. jump()
                        // guards the jump count and leans by the swipe's slant.
                        const len = Math.hypot(dx, dy) || 1;
                        jump(dx / len);
                        p.mode = "swiped"; p.anchorY = y;
                    } else if (dy > SWIPE_THRESH) {
                        touchShell = true; shellId = id; p.mode = "shell"; p.anchorY = y;
                    }
                }
            } else if (p.mode === "move") {
                if (adx > 8) { touchMoveDir = dx < 0 ? -1 : 1; }
                // Without lifting the finger, a vertical swipe from the current
                // height jumps (up) or shells (down). While the finger travels
                // mostly sideways the anchor stays glued to it, so only a
                // deliberate vertical flick builds enough offset to trigger.
                const vUp = p.anchorY - y, vDown = y - p.anchorY;
                if (vUp > SWIPE_THRESH) {
                    // A running jump (ground only). The double jump deliberately
                    // requires lifting and swiping up again, so don't jump in mid-air here.
                    if (hero.onGround) jump(touchMoveDir);
                    p.anchorY = y;
                } else if (vDown > SWIPE_THRESH * 1.4) {
                    touchShell = true; shellId = id;
                    if (moveId === id) { moveId = null; touchMoveDir = 0; }
                    p.mode = "shell"; p.anchorY = y;
                } else if (Math.abs(sdy) <= Math.abs(sdx)) {
                    // A fast horizontal flick mid-move dashes without lifting off;
                    // startDash is cooldown-gated so this can't spam.
                    if (!hero.shell && flickSpeed > GROUND_DASH_SPEED) startDash(sdx < 0 ? -1 : 1, 0);
                    p.anchorY = y;       // mostly-horizontal motion keeps the baseline current
                }
            } else if (p.mode === "swiped") {
                // Airborne after the launch swipe: keep reacting so an air dash or
                // air shell slam can follow without lifting the finger. The anchor
                // trails the finger up to its peak so only a deliberate dive down
                // (or sideways flick) triggers the next action.
                const vDown = y - p.anchorY;
                if (vDown > SWIPE_THRESH * 1.4) {
                    // Tuck into the shell mid-air; the hard landing slams.
                    touchShell = true; shellId = id;
                    if (moveId === id) { moveId = null; touchMoveDir = 0; }
                    p.mode = "shell"; p.anchorY = y;
                } else if (Math.abs(sdx) > 8 && Math.abs(sdy) <= Math.abs(sdx)) {
                    // Sideways motion steers in the air; a fast flick air-dashes.
                    // Hand off to move mode so steering and chaining keep working.
                    const dir = sdx < 0 ? -1 : 1;
                    if (!hero.shell && flickSpeed > GROUND_DASH_SPEED) startDash(dir, 0);
                    touchMoveDir = dir; moveId = id; p.mode = "move"; p.anchorY = y;
                } else if (sdy <= 0) {
                    p.anchorY = y;       // follow the finger up so a later dive reads true
                }
            } else if (p.mode === "shell") {
                // An upward swipe pops back out of the shell without lifting off,
                // handing control back to the move/idle state.
                const vUp = p.anchorY - y;
                if (vUp > SWIPE_THRESH) {
                    touchShell = false;
                    if (shellId === id) shellId = null;
                    p.mode = "move"; moveId = id; touchMoveDir = 0; p.anchorY = y;
                } else if (Math.abs(sdy) <= Math.abs(sdx)) {
                    p.anchorY = y;       // keep the baseline current during sideways drift
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
