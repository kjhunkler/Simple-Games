/* Shell Knight II: Emberwake — a standalone, hand-drawn adventure. */
(function () {
    "use strict";

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        const kids = !!host.kids;
        const maxHealth = kids ? 9 : 6;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const oldTouchAction = canvas.style.touchAction;
        const keys = new Set();
        const pointers = new Map();
        const listeners = [];
        const themes = [
            { name: "Mosslight Trail", sky: "#0d2533", bottom: "#224842", rock: "#27423e", edge: "#9fd18b", glow: "#c2f3a1", length: 2180 },
            { name: "Glasswater Ruins", sky: "#151d3e", bottom: "#334169", rock: "#303759", edge: "#93deed", glow: "#b2eaf8", length: 2380 },
            { name: "The Ember Crown", sky: "#2b1832", bottom: "#6b3540", rock: "#453039", edge: "#ffb66b", glow: "#ffd592", length: 2680 }
        ];
        const bossTypes = [
            { kind: "cinder", pattern: ["charge", "slam"], body: "#91525a", variants: [
                { name: "Cinder Regent", color: "#ffc286", health: 0, speed: 220, count: 1 },
                { name: "Blaze Regent", color: "#ff976b", health: 3, speed: 250, count: 2 },
                { name: "Sunfire Regent", color: "#ffe68a", health: 6, speed: 280, count: 3 }
            ] },
            { kind: "frost", pattern: ["volley", "volley", "slam"], body: "#547caa", variants: [
                { name: "Rime Oracle", color: "#bcefff", health: -3, speed: 190, count: 1 },
                { name: "Glacier Oracle", color: "#80d9ef", health: 0, speed: 215, count: 2 },
                { name: "Blizzard Oracle", color: "#e0d4ff", health: 3, speed: 240, count: 3 }
            ] },
            { kind: "storm", pattern: ["charge", "charge", "slam"], body: "#74649e", variants: [
                { name: "Thunder Lancer", color: "#d5b9ff", health: 0, speed: 350, count: 1 },
                { name: "Tempest Lancer", color: "#97f0df", health: 3, speed: 390, count: 2 },
                { name: "Cyclone Lancer", color: "#f1d6ff", health: 6, speed: 430, count: 3 }
            ] }
        ];
        let width = 1, height = 1, dpr = 1, scale = 1, sceneHeight = 1, offsetY = 0;
        let frame = 0, lastTime = 0, destroyed = false, started = false;
        let state = "title", stage = 0, bossesDefeated = 0, score = 0, time = 0, endTime = 0, reported = false;
        let player, platforms = [], enemies = [], gems = [], particles = [], ghosts = [], waves = [];
        let camera = 0, shake = 0, hitstop = 0, banner = 0, checkpoint = 90, boss = null;
        let jumpBuffer = 0, slashBuffer = 0, dashBuffer = 0, shellBuffer = 0, previousSlash = false;
        let jumpDirection = 0;
        let effectTime = 0;
        let paused = false, blurred = false;

        function listen(target, name, fn, options) {
            target.addEventListener(name, fn, options);
            listeners.push(() => target.removeEventListener(name, fn, options));
        }
        function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
        function approach(value, target, amount) {
            return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
        }
        function sound(name) { if (window.SGSound) window.SGSound.play(name); }
        function addScore(amount) { score += amount; host.setScore(score); }
        function clearInput() {
            keys.clear();
            pointers.clear();
            jumpBuffer = slashBuffer = dashBuffer = shellBuffer = 0;
            jumpDirection = 0;
            previousSlash = false;
            if (player) { player.shell = 0; player.slam = false; }
        }
        function blocked() {
            const dialog = document.getElementById("game-confirm");
            return document.hidden || blurred || !!(dialog && !dialog.classList.contains("hidden"));
        }
        function resize() {
            width = Math.max(1, canvas.clientWidth);
            height = Math.max(1, canvas.clientHeight);
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            const tray = Math.min(96, Math.max(68, height * 0.16));
            sceneHeight = height - tray;
            scale = Math.max(0.2, Math.min(sceneHeight / 460, width / 480, 1.7));
            offsetY = (sceneHeight - 460 * scale) / 2;
            clearInput();
        }
        function emit(x, y, color, count, force, gravity = 390) {
            const n = motion.matches ? Math.min(count, 4) : count;
            for (let i = 0; i < n; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = (0.25 + Math.random() * 0.75) * force;
                particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - force * 0.2,
                    life: 0.3 + Math.random() * 0.25, max: 0.55, color, gravity, size: 2 + Math.random() * 3 });
            }
            const limit = motion.matches ? 40 : 180;
            if (particles.length > limit) particles.splice(0, particles.length - limit);
        }
        function makeEnemy(x, kind) {
            return { x, y: 370, home: x, kind, hp: kind === "guard" ? 4 : 3, maxHp: kind === "guard" ? 4 : 3,
                phase: "idle", timer: 0.6, facing: -1, knock: 0, flash: 0, hitId: -1, attackX: x, cycle: 0 };
        }
        function makeBoss() {
            const type = bossTypes[bossesDefeated % bossTypes.length];
            const variant = Math.floor(bossesDefeated / bossTypes.length) % type.variants.length;
            const form = type.variants[variant];
            const hp = (kids ? 21 : 27) + form.health;
            return { ...makeEnemy(2360, "boss"), type, form, variant, hp, maxHp: hp, move: "charge" };
        }
        function loadStage(index, health) {
            stage = index;
            const length = themes[stage].length;
            platforms = [];
            // Broad, fixed islands keep every gap within one ordinary jump.
            const gaps = stage === 0 ? [[920, 1000], [1570, 1660]] :
                stage === 1 ? [[700, 800], [1350, 1460]] : [[820, 920], [1500, 1600]];
            let x = 0;
            gaps.forEach(gap => {
                platforms.push({ x, y: 370, w: gap[0] - x, h: 130, ground: true });
                x = gap[1];
            });
            platforms.push({ x, y: 370, w: length - x, h: 130, ground: true });
            [350, 610, 1090, 1260, 1740].forEach((px, i) => {
                platforms.push({ x: px, y: i % 2 ? 224 : 285, w: 150, h: 20, ground: false });
            });
            gems = [];
            platforms.forEach((p, i) => {
                if (!p.ground) {
                    for (let j = 0; j < 3; j++) gems.push({ x: p.x + 35 + j * 36, y: p.y - 32, taken: false, chest: false });
                    if (i % 2 === 0) gems.push({ x: p.x + 75, y: p.y - 70, taken: false, chest: true });
                }
            });
            for (let gx = 200; gx < length - 180; gx += 175) {
                if (!gaps.some(g => gx > g[0] - 20 && gx < g[1] + 20))
                    gems.push({ x: gx, y: 335, taken: false, chest: false });
            }
            enemies = [540, 1130, 1810].map((ex, i) => makeEnemy(ex, (i + stage) % 2 ? "guard" : "beetle"));
            if (stage === 2) enemies = enemies.filter(e => e.x < 1700);
            boss = stage === 2 ? makeBoss() : null;
            if (boss) enemies.push(boss);
            player = { x: 90, y: 370, vx: 0, vy: 0, facing: 1, health: health ?? maxHealth,
                grounded: true, coyote: 0.12, jumps: 0, invuln: 0, dash: 0, dashCooldown: 0,
                shell: 0, shellCooldown: 0, slam: false,
                attack: 0, combo: 0, comboWindow: 0, attackId: 0, squash: 0, gait: 0, ghostTime: 0 };
            checkpoint = 90;
            camera = 0;
            waves = []; particles = []; ghosts = [];
            hitstop = shake = effectTime = 0;
            banner = 3;
            clearInput();
        }
        function reset() {
            clearInput();
            score = 0; time = 0; endTime = 0; reported = false; bossesDefeated = 0;
            host.setScore(0);
            state = "title";
            loadStage(0, maxHealth);
            lastTime = 0;
        }
        function begin() {
            if (window.SGSound) window.SGSound.unlock();
            state = "playing";
            clearInput();
            sound("match");
        }
        function finish() {
            if (state !== "playing") return;
            state = "gameover";
            endTime = 0;
            clearInput();
            sound("hit");
        }
        function held(action) {
            if (action === "left" && (keys.has("ArrowLeft") || keys.has("KeyA"))) return true;
            if (action === "right" && (keys.has("ArrowRight") || keys.has("KeyD"))) return true;
            if (action === "slash" && (keys.has("KeyJ") || keys.has("KeyZ"))) return true;
            for (const p of pointers.values()) {
                if (action === "left" && p.move < 0 || action === "right" && p.move > 0 ||
                    action === "slash" && p.mode === "hold") return true;
            }
            return false;
        }
        function trigger(action, direction = 0) {
            if (action === "jump") { jumpBuffer = 0.16; jumpDirection = direction; }
            if (action === "slash") slashBuffer = 0.5;
            if (action === "dash") dashBuffer = 0.14;
            if (action === "shell") shellBuffer = 0.16;
        }
        const bindings = {
            ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
            Space: "jump", ArrowUp: "jump", KeyW: "jump", KeyJ: "slash", KeyZ: "slash",
            KeyK: "dash", KeyX: "dash", ShiftLeft: "dash", ShiftRight: "dash",
            ArrowDown: "shell", KeyS: "shell"
        };
        function onKeyDown(event) {
            if (!bindings[event.code] && event.code !== "Enter" && event.code !== "KeyR") return;
            if (blocked() || (state !== "title" && state !== "playing")) return;
            event.preventDefault();
            if (state === "title") { if (!event.repeat) begin(); return; }
            if (!keys.has(event.code)) trigger(bindings[event.code]);
            keys.add(event.code);
        }
        function onKeyUp(event) {
            keys.delete(event.code);
        }
        function pointerPosition(event) {
            const rect = canvas.getBoundingClientRect();
            return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
        }
        function onPointerDown(event) {
            if (blocked() || (event.pointerType === "mouse" && event.button !== 0)) return;
            event.preventDefault();
            if (state === "title") { begin(); return; }
            if (state !== "playing") return;
            if (window.SGSound) window.SGSound.unlock();
            const pos = pointerPosition(event);
            pointers.set(event.pointerId, { sx: pos.x, sy: pos.y, ax: pos.x, ay: pos.y,
                lx: pos.x, ly: pos.y, lt: event.timeStamp, mode: "", move: 0, age: 0 });
            try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Pointer may already have ended. */ }
        }
        function onPointerMove(event) {
            const p = pointers.get(event.pointerId);
            if (!p) return;
            if (blocked() || state !== "playing") { clearInput(); return; }
            event.preventDefault();
            const pos = pointerPosition(event);
            const dx = pos.x - p.ax, dy = pos.y - p.ay;
            const sx = pos.x - p.lx, sy = pos.y - p.ly;
            const speed = Math.hypot(sx, sy) * 1000 / Math.max(1, event.timeStamp - p.lt);
            p.lx = pos.x; p.ly = pos.y; p.lt = event.timeStamp;
            const horizontal = Math.abs(dx) > Math.abs(dy) * (dy < 0 ? 3.73 : 1.7);
            if (horizontal && Math.abs(dx) >= 18) {
                p.move = Math.sign(dx);
                p.mode = "move";
                player.shell = 0;
                if (speed > 1100 && Math.abs(sx) > Math.abs(sy) * 1.7) {
                    player.facing = p.move;
                    trigger("dash");
                }
                p.ax = pos.x; p.ay = pos.y;
            } else if (dy <= -26 && p.mode !== "jump") {
                if (Math.abs(dx) > 12) p.move = Math.sign(dx);
                p.mode = "jump";
                player.shell = 0;
                trigger("jump", p.move);
                p.ax = pos.x; p.ay = pos.y;
            } else if (dy >= 26 && p.mode !== "shell") {
                p.mode = "shell"; p.move = 0;
                trigger("shell");
                p.ax = pos.x; p.ay = pos.y;
            } else if (p.mode === "jump" && sy < 0 || p.mode === "shell" && sy > 0) {
                // Follow a committed stroke, so one long swipe cannot consume both jumps.
                p.ax = pos.x; p.ay = pos.y;
            }
        }
        function onPointerEnd(event) {
            if (event.type === "pointerup" && !blocked() && state === "playing") {
                // Some devices only deliver the final position on release.
                onPointerMove(event);
                const p = pointers.get(event.pointerId);
                if (p && !p.mode) trigger("slash");
            }
            pointers.delete(event.pointerId);
        }

        function damage(direction, falling) {
            if (state !== "playing" || (!falling && (player.invuln > 0 || player.dash > 0))) return;
            if (!falling && player.shell > 0) {
                player.shell = 0;
                player.invuln = 0.35;
                emit(player.x + direction * 15, player.y - 24, "#b9f3e0", 14, 150);
                sound("bounce");
                return;
            }
            player.health--;
            player.invuln = kids ? 2.1 : 1.5;
            player.vx = direction * 230;
            player.vy = -260;
            player.attack = 0;
            player.shell = 0; player.slam = false;
            player.squash = -0.22;
            emit(player.x, player.y - 28, "#ffe7ac", 15, 165);
            shake = motion.matches ? 0 : 4;
            hitstop = motion.matches ? 0 : 0.055;
            sound("hit");
            host.vibrate([18]);
            if (player.health <= 0) finish();
        }
        function attack() {
            player.shell = 0;
            player.combo = player.comboWindow > 0 ? player.combo % 3 + 1 : 1;
            player.attack = player.combo === 3 ? 0.48 : 0.36;
            player.comboWindow = 0.82;
            player.attackId++;
            player.squash = 0.1;
            slashBuffer = 0;
            sound(player.combo === 3 ? "perfect" : "tap");
        }
        function shellSlam() {
            player.slam = false;
            emit(player.x, player.y - 3, themes[stage].glow, 32, 220);
            shake = motion.matches ? 0 : 4;
            sound("bossslam");
            host.vibrate([18]);
            enemies.forEach(enemy => {
                if (enemy.hp <= 0 || Math.abs(enemy.x - player.x) > 105 ||
                    Math.abs(enemy.y - player.y) > 45) return;
                enemy.hp -= 2;
                enemy.flash = 0.2;
                enemy.knock = (Math.sign(enemy.x - player.x) || player.facing) * 180;
                if (enemy.kind !== "boss") { enemy.phase = "recover"; enemy.timer = 0.6; }
                emit(enemy.x, enemy.y - 25, "#ffe1a5", 12, 150);
                if (enemy.hp <= 0) defeatEnemy(enemy);
            });
        }
        function enemyWidth(enemy) { return enemy.kind === "boss" ? 43 : 22; }
        function defeatEnemy(enemy) {
            addScore(enemy.kind === "boss" ? 300 : 45);
            emit(enemy.x, enemy.y - 35, "#ffc77d", 25, 240);
            if (enemy.kind === "boss") {
                waves = [];
                bossesDefeated++;
                addScore(500 + player.health * 25);
                sound("perfect");
            }
        }
        function strikeEnemies() {
            const duration = player.combo === 3 ? 0.48 : 0.36;
            const elapsed = duration - player.attack;
            if (player.attack <= 0 || elapsed < 0.085 || elapsed > (player.combo === 3 ? 0.33 : 0.23)) return;
            const reach = player.combo === 3 ? 117 : 91;
            enemies.forEach(enemy => {
                const dx = enemy.x - player.x;
                if (enemy.hp <= 0 || enemy.hitId === player.attackId || Math.abs(dx) > reach + enemyWidth(enemy) ||
                    dx * player.facing < -18 || Math.abs((enemy.y - (enemy.kind === "boss" ? 45 : 22)) - (player.y - 28)) > 62) return;
                enemy.hitId = player.attackId;
                enemy.hp -= player.combo === 3 ? 3 : 1;
                enemy.flash = 0.16;
                enemy.knock = player.facing * (enemy.kind === "boss" ? 65 : player.combo === 3 ? 310 : 160);
                if (enemy.kind !== "boss") { enemy.phase = "recover"; enemy.timer = 0.48; }
                emit(enemy.x, enemy.y - 32, themes[stage].glow, player.combo === 3 ? 22 : 12, 180);
                hitstop = motion.matches ? 0 : player.combo === 3 ? 0.065 : 0.035;
                shake = motion.matches ? 0 : player.combo === 3 ? 4 : 1.8;
                sound("hit");
                host.vibrate([player.combo === 3 ? 18 : 8]);
                if (enemy.hp <= 0) defeatEnemy(enemy);
            });
        }
        function updateEnemy(enemy, dt) {
            if (enemy.hp <= 0) return;
            const isBoss = enemy.kind === "boss";
            const dx = player.x - enemy.x;
            enemy.flash = Math.max(0, enemy.flash - dt);
            enemy.x += enemy.knock * dt;
            enemy.knock = approach(enemy.knock, 0, dt * 650);
            // Grounded enemies never walk (or get knocked) into the gaps.
            const island = platforms.find(p => p.ground && enemy.home >= p.x && enemy.home <= p.x + p.w);
            if (island) enemy.x = clamp(enemy.x, island.x + 28, island.x + island.w - 28);
            if (isBoss) enemy.x = clamp(enemy.x, 2040, 2540);
            enemy.timer -= dt;
            if (enemy.phase === "idle") {
                enemy.facing = dx < 0 ? -1 : 1;
                if (Math.abs(dx) < (isBoss ? 490 : 340)) {
                    if (Math.abs(dx) > (isBoss ? 170 : 85)) enemy.x += enemy.facing * (isBoss ? 42 : 45) * (kids ? 0.75 : 1) * dt;
                    if (enemy.timer <= 0 && Math.abs(dx) < (isBoss ? 430 : 130)) {
                        enemy.phase = "warn";
                        enemy.timer = (kids ? 1.15 : 0.8) + (isBoss ? 0.2 : 0);
                        enemy.attackX = enemy.x;
                        enemy.cycle++;
                        if (isBoss) enemy.move = enemy.type.pattern[(enemy.cycle - 1) % enemy.type.pattern.length];
                    }
                }
            } else if (enemy.phase === "warn" && enemy.timer <= 0) {
                enemy.phase = "attack";
                enemy.timer = isBoss ? (enemy.type.kind === "storm" ? 0.38 + enemy.variant * 0.06 : 0.34) : 0.24;
                if (isBoss && enemy.move === "slam") {
                    const speed = enemy.type.kind === "cinder" ? enemy.form.speed : 220;
                    for (let i = 0; i < enemy.form.count; i++) {
                        for (const direction of [-1, 1]) {
                            waves.push({ x: enemy.x, y: 365, vx: direction * speed, vy: 0, life: 3,
                                delay: i * 0.3, color: enemy.form.color, kind: "wave" });
                        }
                    }
                    emit(enemy.x, 366, enemy.form.color, 25, 180);
                    shake = motion.matches ? 0 : 3;
                } else if (isBoss && enemy.move === "volley") {
                    const angle = Math.atan2(player.y - 28 - (enemy.y - 55), dx);
                    for (let i = 0; i < enemy.form.count; i++) {
                        const spread = angle + (i - (enemy.form.count - 1) / 2) * 0.24;
                        waves.push({ x: enemy.x, y: enemy.y - 55, vx: Math.cos(spread) * enemy.form.speed,
                            vy: Math.sin(spread) * enemy.form.speed, life: 3, delay: 0, color: enemy.form.color, kind: "shard" });
                    }
                }
                sound("bounce");
            } else if (enemy.phase === "attack") {
                const move = isBoss ? enemy.move : "charge";
                if (move === "charge") {
                    enemy.x += enemy.facing * (isBoss ? (enemy.type.kind === "storm" ? enemy.form.speed : 310) : 185) * dt;
                    const front = (player.x - enemy.x) * enemy.facing;
                    if (front > -enemyWidth(enemy) && front < (isBoss ? 105 : 53) && player.y > enemy.y - (isBoss ? 105 : 50) && player.y < enemy.y + 35)
                        damage(enemy.facing, false);
                } else if (move === "slam" && Math.abs(player.x - enemy.x) < 78 && player.y > 290) damage(Math.sign(dx) || 1, false);
                if (enemy.timer <= 0) { enemy.phase = "recover"; enemy.timer = isBoss ? 1.25 : 0.9; }
            } else if (enemy.phase === "recover" && enemy.timer <= 0) {
                enemy.phase = "idle";
                enemy.timer = isBoss ? 0.4 : 0.7;
            }
        }
        function step(dt) {
            time += dt;
            banner = Math.max(0, banner - dt);
            particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt; });
            particles = particles.filter(p => p.life > 0);
            ghosts.forEach(g => { g.life -= dt; });
            ghosts = ghosts.filter(g => g.life > 0);
            shake = Math.max(0, shake - dt * 22);
            if (state !== "playing") {
                if (state === "gameover") {
                    endTime += dt;
                    if (endTime > 3.8 && !reported) { reported = true; host.gameOver(score); }
                }
                return;
            }
            if (hitstop > 0) { hitstop = Math.max(0, hitstop - dt); return; }
            pointers.forEach(p => {
                p.age += dt;
                if (!p.mode && p.age >= 0.3 && Math.hypot(p.lx - p.sx, p.ly - p.sy) < 12) p.mode = "hold";
            });
            jumpBuffer = Math.max(0, jumpBuffer - dt);
            slashBuffer = Math.max(0, slashBuffer - dt);
            dashBuffer = Math.max(0, dashBuffer - dt);
            shellBuffer = Math.max(0, shellBuffer - dt);
            player.invuln = Math.max(0, player.invuln - dt);
            player.shell = Math.max(0, player.shell - dt);
            player.shellCooldown = Math.max(0, player.shellCooldown - dt);
            player.dashCooldown = Math.max(0, player.dashCooldown - dt);
            player.comboWindow = Math.max(0, player.comboWindow - dt);
            player.attack = Math.max(0, player.attack - dt);
            player.squash = approach(player.squash, 0, dt * 2.2);
            const move = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
            const slash = held("slash");
            if (slash && (!previousSlash || player.attack <= 0)) slashBuffer = 0.18;
            previousSlash = slash;
            if (move && player.dash <= 0 && player.attack <= 0) player.facing = move;
            if (jumpBuffer > 0 && (player.coyote > 0 || player.jumps < 2) && player.dash <= 0) {
                player.shell = 0; player.slam = false;
                const grounded = player.coyote > 0;
                player.jumps = grounded ? 1 : 2;
                player.vy = grounded ? -530 : -475;
                if (jumpDirection && !move) {
                    player.vx = jumpDirection * 235;
                    player.facing = jumpDirection;
                }
                jumpDirection = 0;
                player.grounded = false;
                player.coyote = 0;
                player.squash = -0.18;
                jumpBuffer = 0;
                emit(player.x, player.y - (grounded ? 2 : 15), grounded ? "#b1c8b1" : "#b3f1e1", grounded ? 9 : 16, 95);
                sound("jump");
            }
            if (dashBuffer > 0 && player.dashCooldown <= 0) {
                if (move) player.facing = move;
                player.dash = 0.18;
                player.shell = 0; player.slam = false;
                player.dashCooldown = kids ? 0.68 : 0.85;
                player.attack = 0;
                player.vy = 0;
                dashBuffer = 0;
                sound("flap");
            }
            if (shellBuffer > 0 && player.shellCooldown <= 0) {
                player.shell = 0.65;
                player.shellCooldown = 0.9;
                player.slam = !player.grounded;
                player.dash = player.attack = slashBuffer = shellBuffer = 0;
                if (player.slam) player.vy = 820;
                emit(player.x, player.y - 25, themes[stage].glow, 10, 100);
                sound("drop");
            }
            if (slashBuffer > 0 && player.attack <= 0 && player.dash <= 0 && !player.slam) attack();
            if (player.dash > 0) {
                player.dash = Math.max(0, player.dash - dt);
                player.vx = player.facing * 650;
                player.vy = 0;
                player.ghostTime -= dt;
                if (player.ghostTime <= 0 && !motion.matches) {
                    ghosts.push({ x: player.x, y: player.y, facing: player.facing, gait: player.gait, life: 0.22 });
                    player.ghostTime = 0.035;
                }
            } else {
                player.vx = approach(player.vx, player.shell > 0 || player.slam ? 0 : move * 235, (player.grounded ? 1900 : 1100) * dt);
                player.vy = Math.min(820, player.vy + 1450 * dt);
            }
            const oldY = player.y;
            player.x = clamp(player.x + player.vx * dt, 18, themes[stage].length - 24);
            player.y += player.vy * dt;
            const wasGrounded = player.grounded;
            player.grounded = false;
            if (player.vy >= 0) {
                let landing = Infinity;
                platforms.forEach(p => {
                    if (player.x + 14 > p.x && player.x - 14 < p.x + p.w && oldY <= p.y + 0.5 && player.y >= p.y)
                        landing = Math.min(landing, p.y);
                });
                if (Number.isFinite(landing)) {
                    if (!wasGrounded && player.vy > 180) {
                        player.squash = clamp(player.vy / 2300, 0.1, 0.28);
                        emit(player.x, landing, "#c1c8ba", 11, 105);
                        sound("tap");
                    }
                    player.y = landing; player.vy = 0; player.grounded = true; player.jumps = 0;
                    if (player.slam) shellSlam();
                }
            }
            if (player.grounded) {
                player.coyote = 0.12;
                if (player.y === 370) {
                    const floor = platforms.find(p => p.ground && player.x > p.x + 60 && player.x < p.x + p.w - 60);
                    if (floor) checkpoint = player.x;
                }
            } else {
                player.coyote = Math.max(0, player.coyote - dt);
                if (player.coyote <= 0 && player.jumps === 0) player.jumps = 1;
            }
            player.gait += Math.abs(player.vx) * dt / 20;
            if (player.y > 570) {
                damage(0, true);
                if (state === "playing") {
                    player.x = checkpoint; player.y = 300; player.vx = 0; player.vy = 0;
                    player.dash = 0; player.jumps = 1;
                }
            }
            strikeEnemies();
            if (state !== "playing") return;
            enemies.forEach(e => updateEnemy(e, dt));
            waves.forEach(w => {
                if (w.delay > 0) { w.delay -= dt; return; }
                w.x += w.vx * dt; w.y += w.vy * dt; w.life -= dt;
                if (Math.abs(w.x - player.x) < 24 && player.y > w.y - 26 && player.y < w.y + 37) damage(Math.sign(w.vx), false);
            });
            waves = waves.filter(w => w.life > 0);
            if (state !== "playing") return;
            gems.forEach(g => {
                if (!g.taken && Math.abs(player.x - g.x) < 30 && Math.abs(player.y - 26 - g.y) < 37) {
                    g.taken = true;
                    addScore(g.chest ? 60 : 10);
                    if (g.chest) player.health = Math.min(maxHealth, player.health + 1);
                    emit(g.x, g.y, "#ffda85", g.chest ? 18 : 6, 100);
                    sound(g.chest ? "perfect" : "score");
                }
            });
            if ((boss && boss.hp <= 0) || (!boss && player.x > themes[stage].length - 100)) {
                if (!boss) addScore(150);
                loadStage((stage + 1) % themes.length, Math.min(maxHealth, player.health + 2));
                sound("match");
            }
            const visible = width / scale;
            const target = clamp(player.x - visible * 0.35, 0, Math.max(0, themes[stage].length - visible));
            camera = motion.matches ? target : approach(camera, target, Math.max(220, Math.abs(target - camera) * 8) * dt);
            effectTime -= dt;
            if (effectTime <= 0 && !motion.matches) {
                effectTime = 0.07;
                if (player.dash > 0 || player.slam) {
                    emit(player.x - player.facing * 20, player.y - 25, themes[stage].glow, 3, 45, -30);
                } else if (player.grounded && Math.abs(player.vx) > 80) {
                    emit(player.x - player.facing * 12, player.y - 2, themes[stage].edge, 2, 35, 80);
                }
                if (player.attack > 0.12 && player.attack < 0.28) {
                    emit(player.x + player.facing * 65, player.y - 35, player.combo === 3 ? "#ffce86" : "#c0fff1", 3, 90, 30);
                }
                waves.forEach(w => {
                    if (w.delay <= 0 && w.x >= camera && w.x <= camera + visible) emit(w.x, w.y - 12, w.color, 2, 70, -20);
                });
                const gate = themes[stage].length - 68;
                if (stage < 2 && Math.abs(gate - player.x) < visible) {
                    emit(gate + Math.sin(time * 3) * 20, 340 - Math.random() * 50, themes[stage].glow, 1, 25, -70);
                }
                const gem = gems.find(g => !g.taken && Math.abs(g.x - player.x) < 180);
                if (gem) emit(gem.x, gem.y - 8, "#ffe4a1", 1, 18, -25);
            }
        }

        function ellipse(x, y, rx, ry, color) {
            ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        }
        function line(points, color, lineWidth) {
            ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.beginPath(); points.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
        }
        function text(label, x, y, size, color, align) {
            ctx.fillStyle = color || "#f2f5e9"; ctx.font = `700 ${size}px system-ui, sans-serif`;
            ctx.textAlign = align || "left"; ctx.textBaseline = "middle"; ctx.fillText(label, x, y);
        }
        function drawKnight(p, ghost) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.facing, 1);
            if (ghost) ctx.globalAlpha = ghost;
            const running = !motion.matches && player.grounded ? Math.min(1, Math.abs(player.vx) / 200) : 0;
            const stride = Math.sin(p.gait) * 10 * running;
            const bob = motion.matches ? 0 : Math.abs(Math.cos(p.gait)) * 2 * running;
            const squish = motion.matches ? 0 : player.squash;
            ctx.scale(1 + squish, 1 - squish);
            ctx.translate(0, -bob);
            if (!ghost) ellipse(0, 0, 23, 5, "#081b2544");
            if (player.shell > 0 || player.slam) {
                ellipse(0, -21, 25, 23, "#153f3f");
                ellipse(-2, -23, 21, 19, "#83ba85");
                line([[-17, -34], [0, -40], [17, -30], [8, -13], [-12, -12], [-17, -34]], "#d7e6ac", 3);
                line([[0, -40], [1, -25], [17, -30]], "#315f57", 2);
                line([[1, -25], [-12, -12]], "#315f57", 2);
                if (!ghost) {
                    ctx.scale(p.facing, 1);
                    text(player.slam ? "SLAM" : "GUARD", 0, -59, 10, "#c0ffe0", "center");
                }
                ctx.restore();
                return;
            }
            const airborne = !player.grounded;
            const leg1 = airborne ? -8 : stride, leg2 = airborne ? 9 : -stride;
            line([[-6, -23], [-10 - leg1 * 0.4, -13], [-9 + leg1, -4]], "#244d42", 10);
            line([[-9 + leg1, -4], [-2 + leg1, -4]], "#d3c598", 7);
            line([[6, -23], [9 - leg2 * 0.4, -14], [7 + leg2, -3]], "#83ba85", 10);
            line([[7 + leg2, -3], [15 + leg2, -3]], "#e9d6a3", 7);
            ellipse(-6, -33, 20, 23, "#153f3f");
            ellipse(-9, -35, 16, 19, "#6caa86");
            line([[-15, -48], [-4, -38], [-8, -20]], "#315f57", 2);
            line([[-23, -35], [-4, -38]], "#315f57", 2);
            ellipse(5, -32, 11, 18, "#d7c98d");
            const flutter = motion.matches ? 0 : Math.sin(time * 13) * (3 + Math.abs(player.vx) / 60);
            line([[6, -51], [-13, -49], [-29, -46 + flutter], [-39, -51 - flutter * 0.5]], "#f28767", 7);
            ellipse(8, -54, 14, 12, "#9dce94");
            ellipse(17, -51, 10, 7, "#b5dc9c");
            line([[-3, -62], [10, -67], [20, -60]], "#e3dfb8", 5);
            ellipse(14, -56, 2.3, 3, "#132b31");
            line([[19, -47], [23, -48]], "#356457", 1.5);
            let angle = -0.85;
            if (player.dash > 0) angle = 0.1;
            if (player.attack > 0) {
                const duration = player.combo === 3 ? 0.48 : 0.36;
                const elapsed = duration - player.attack;
                if (elapsed < 0.085) angle = -1.1 - elapsed / 0.085 * 1.1;
                else if (elapsed < 0.23) angle = -2.2 + (elapsed - 0.085) / 0.145 * 3.45;
                else angle = 1.25 - (elapsed - 0.23) / (duration - 0.23) * 2.1;
                if (player.combo === 2) angle = -angle;
            }
            const handX = 15 + Math.cos(angle) * 10, handY = -33 + Math.sin(angle) * 10;
            line([[8, -38], [16, -29], [handX, handY]], "#9ac88a", 8);
            ctx.save(); ctx.translate(handX, handY); ctx.rotate(angle);
            line([[-6, 0], [6, 0]], "#75464b", 5);
            line([[5, -7], [5, 7]], "#efc97b", 4);
            ctx.fillStyle = "#e8faff"; ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(46, -3);
            ctx.lineTo(55, 0); ctx.lineTo(46, 4); ctx.lineTo(8, 4); ctx.fill();
            line([[12, 1], [45, 1]], "#8edee5", 1.5);
            ctx.restore();
            if (!ghost && player.attack > 0) {
                const duration = player.combo === 3 ? 0.48 : 0.36;
                const elapsed = duration - player.attack;
                if (elapsed > 0.085 && elapsed < 0.31) {
                    const radius = player.combo === 3 ? 106 : 80;
                    ctx.save(); ctx.translate(3, -33);
                    if (player.combo === 2) ctx.scale(1, -1);
                    const sweep = clamp((elapsed - 0.085) / 0.17, 0, 1);
                    ctx.globalAlpha = Math.max(0, 1 - (elapsed - 0.16) * 5);
                    ctx.strokeStyle = player.combo === 3 ? "#ffd18b" : "#c0fff1";
                    ctx.lineWidth = player.combo === 3 ? 13 : 8;
                    ctx.beginPath(); ctx.arc(0, 0, radius, -1.55, -1.55 + sweep * 2.85); ctx.stroke();
                    ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.beginPath();
                    ctx.arc(0, 0, radius + 8, -1.3, -1.55 + sweep * 2.85); ctx.stroke();
                    ctx.restore();
                }
            }
            ctx.restore();
        }
        function drawEnemy(e) {
            if (e.hp <= 0) return;
            const big = e.kind === "boss";
            const warn = e.phase === "warn";
            const attack = e.phase === "attack";
            const recover = e.phase === "recover";
            const bob = motion.matches ? 0 : Math.sin(time * 5 + e.home) * (warn ? 0.5 : 2);
            if (warn) {
                ctx.save(); ctx.globalAlpha = 0.2 + (motion.matches ? 0 : Math.sin(time * 10) * 0.07);
                ctx.fillStyle = big ? e.form.color : "#ffb668";
                if (big && e.move === "slam") ctx.fillRect(e.x - 110, 359, 220, 11);
                else if (big && e.move === "volley") {
                    line([[e.x, e.y - 55], [player.x, player.y - 28]], e.form.color, 3);
                } else {
                    const reach = big ? (e.type.kind === "storm" ? e.form.speed * (0.38 + e.variant * 0.06) + 105 : 210) : 100;
                    ctx.fillRect(e.facing > 0 ? e.x : e.x - reach, 353, reach, 17);
                }
                ctx.restore();
            }
            ctx.save(); ctx.translate(e.x, e.y); ctx.scale(e.facing, 1);
            ellipse(0, 0, big ? 55 : 27, big ? 9 : 5, "#06131c66");
            ctx.translate(0, bob);
            const body = e.flash > 0 ? "#fff3d0" : big ? e.type.body : e.kind === "guard" ? "#707eae" : "#df856d";
            if (big) {
                const lean = attack ? 9 : warn ? -6 : 0;
                line([[-21, -40], [-28, -20], [-31, -5]], "#452e42", 18);
                line([[21, -40], [28, -20], [31, -5]], "#664051", 18);
                ellipse(lean, -57, 42, recover ? 36 : 43, body);
                line([[-20, -77], [0, -91], [22, -77], [0, -48], [-20, -77]], e.form.color, 4);
                ellipse(lean + 6, -94, 25, 21, "#573745");
                if (e.type.kind === "frost") {
                    line([[-24, -108], [0, -143], [26, -108], [-24, -108]], e.form.color, 6);
                } else if (e.type.kind === "storm") {
                    line([[-20, -109], [-38, -122], [-28, -99]], e.form.color, 6);
                    line([[20, -109], [38, -122], [28, -99]], e.form.color, 6);
                } else line([[-14, -108], [-23, -128], [0, -117], [15, -132], [24, -108]], e.form.color, 6);
                line([[0, -94], [10, -94]], "#fff3b4", 4);
                line([[24, -67], [45, warn ? -95 : -48], [66, warn ? -113 : -37]], body, 17);
                if (e.type.kind === "frost") {
                    line([[68, -16], [68, -119]], e.form.color, 5);
                    ellipse(68, -126, 11, 15, e.form.color);
                } else if (e.type.kind === "storm") {
                    line([[49, -45], [114, -45], [103, -54]], e.form.color, 6);
                } else line([[60, warn ? -116 : -45], [85, warn ? -116 : -45]], e.form.color, 15);
                for (let i = 0; i <= e.variant; i++) ellipse(-10 + i * 10, -66, 3, 4, e.form.color);
            } else if (e.kind === "guard") {
                line([[-10, -23], [-13, -4]], "#383b60", 10);
                line([[10, -23], [14, -4]], "#464867", 10);
                ellipse(0, -32, 21, 24, body);
                ctx.fillStyle = "#b0bce0"; ctx.fillRect(-15, -58, 30, 19);
                line([[3, -47], [12, -47]], "#f6d087", 3);
                line([[13, -33], [warn ? -5 : 36, warn ? -67 : -26]], "#ddeaff", 6);
                ellipse(-13, -28, 12, 18, "#a9c7c7");
            } else {
                for (let j = -1; j <= 1; j += 2) {
                    const walk = motion.matches ? 0 : Math.sin(time * 9 + j) * 4;
                    line([[j * 9, -13], [j * 23, -10], [j * 27 + walk, -2]], "#af7968", 5);
                }
                ellipse(0, -21, 25, warn ? 15 : 19, body);
                line([[0, -37], [0, -10]], "#753f49", 3);
                ellipse(20, -18, 11, 12, "#613948");
                ellipse(25, -21, 3, 3, "#ffe4a0");
                line([[23, -28], [warn ? 15 : 30, -43]], "#ffcb88", 3);
            }
            ctx.restore();
            if (warn) text(big ? (e.move === "slam" ? "JUMP!" : e.move === "volley" ? "DODGE!" : "DASH!") : "!",
                e.x, e.y - (big ? 155 : 82), big ? 16 : 23, "#ffe4a1", "center");
            if (recover && big) text("STRIKE!", e.x, e.y - 149, 14, "#c0ffe0", "center");
            if (!big && e.hp < e.maxHp) {
                ctx.fillStyle = "#162b36"; ctx.fillRect(e.x - 23, e.y - 66, 46, 4);
                ctx.fillStyle = "#ffd08c"; ctx.fillRect(e.x - 23, e.y - 66, 46 * e.hp / e.maxHp, 4);
            }
        }
        function drawBackground() {
            const theme = themes[stage];
            const gradient = ctx.createLinearGradient(0, 0, 0, sceneHeight);
            gradient.addColorStop(0, theme.sky); gradient.addColorStop(1, theme.bottom);
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, sceneHeight);
            ctx.save();
            ctx.translate(0, offsetY); ctx.scale(scale, scale);
            const span = width / scale;
            const ambientTime = motion.matches ? 0 : time;
            for (let i = 0; i < 3; i++) {
                const x = span * (i + 0.3) / 3 - camera * 0.035;
                const light = ctx.createRadialGradient(x, 110, 4, x, 110, 210);
                light.addColorStop(0, `${theme.glow}18`);
                light.addColorStop(1, `${theme.glow}00`);
                ctx.fillStyle = light; ctx.fillRect(x - 210, -100, 420, 420);
            }
            ellipse(span * 0.74 - camera * 0.025, 90, 43, 43, stage === 2 ? "#e7886255" : "#b2d9d51c");
            for (let layer = 0; layer < 2; layer++) {
                const parallax = camera * (layer ? 0.28 : 0.12);
                const spacing = stage === 0 ? 180 : 210;
                ctx.fillStyle = layer ? "#091e2b60" : "#9fc1c00d";
                for (let i = Math.floor(parallax / spacing) - 1; i < (parallax + span) / spacing + 1; i++) {
                    const x = i * spacing - parallax;
                    const top = 80 + (Math.sin(i * 13.7) + 1) * 75 + layer * 55;
                    if (stage === 0) {
                        ctx.fillRect(x + 47, top, 20, 330);
                        ctx.beginPath(); ctx.moveTo(x - 18, top + 100); ctx.lineTo(x + 58, top - 50);
                        ctx.lineTo(x + 125, top + 100); ctx.fill();
                    } else if (stage === 1) {
                        ctx.fillRect(x + 20, top, 28, 340); ctx.fillRect(x + 132, top, 28, 340);
                        ctx.fillRect(x + 12, top, 158, 23);
                        ctx.beginPath(); ctx.arc(x + 91, top + 56, 48, Math.PI, 0); ctx.lineWidth = 15;
                        ctx.strokeStyle = layer ? "#091e2b60" : "#9fc1c00d"; ctx.stroke();
                    } else {
                        ctx.beginPath(); ctx.moveTo(x - 40, 410); ctx.lineTo(x + 50, top);
                        ctx.lineTo(x + 165, 410); ctx.fill();
                    }
                }
            }
            // Analytical weather stays bounded and never competes with combat particles.
            for (let i = 0; i < (motion.matches ? 8 : 48); i++) {
                const depth = i % 3 + 1;
                const drift = stage === 1 ? ambientTime * 12 : Math.sin(ambientTime * 0.6 + i) * 16;
                const x = ((i * 137.3 - camera * depth * 0.09 + drift) % (span + 40) + span + 40) % (span + 40) - 20;
                const speed = stage === 1 ? 110 : stage === 2 ? -24 : -5;
                const y = ((i * 63.7 + ambientTime * speed * depth) % 390 + 390) % 390;
                if (stage === 1) {
                    line([[x, y], [x - 2, y + 7 + depth * 2]], "#b2eaf833", 1);
                    if (i % 8 === 0) ellipse(x, 363, 7 + Math.sin(ambientTime * 3 + i) * 3, 1.2, "#b2eaf822");
                } else {
                    const pulse = 0.5 + Math.sin(ambientTime * 2 + i) * 0.2;
                    ctx.globalAlpha = pulse;
                    ellipse(x, y, depth * 3.5, depth * 3.5, `${theme.glow}15`);
                    ellipse(x, y, depth * 0.8, stage === 2 ? depth * 1.5 : depth * 0.8, theme.glow);
                    if (stage === 0 && i % 7 === 0) ellipse(x + 13, y + 8, 4, 1.5, "#b2d89077");
                    ctx.globalAlpha = 1;
                }
            }
            for (let i = 0; i < 3; i++) {
                const x = span * (i + 0.5) / 3 + Math.sin(ambientTime * 0.18 + i) * 35;
                const mist = ctx.createRadialGradient(x, 345, 1, x, 345, 210);
                mist.addColorStop(0, `${theme.glow}0d`); mist.addColorStop(1, `${theme.glow}00`);
                ctx.save(); ctx.translate(0, 285); ctx.scale(1, 0.2);
                ctx.fillStyle = mist; ctx.fillRect(x - 210, 135, 420, 420);
                ctx.restore();
            }
            ctx.restore();
        }
        function drawWorld() {
            const theme = themes[stage];
            ctx.save();
            ctx.beginPath(); ctx.rect(0, 0, width, sceneHeight); ctx.clip();
            ctx.translate(motion.matches ? 0 : Math.sin(time * 113) * shake, offsetY);
            ctx.scale(scale, scale); ctx.translate(-camera, 0);
            const left = camera - 160, right = camera + width / scale + 160;
            platforms.forEach(p => {
                if (p.x > right || p.x + p.w < left) return;
                ctx.fillStyle = theme.rock; ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = theme.edge; ctx.fillRect(p.x, p.y, p.w, 5);
                ctx.fillStyle = "#ffffff0b"; ctx.fillRect(p.x, p.y + 9, p.w, 6);
                if (!p.ground) {
                    ctx.fillStyle = "#0a162633";
                    ctx.beginPath(); ctx.moveTo(p.x, p.y + p.h); ctx.lineTo(p.x + p.w * 0.4, p.y + 43);
                    ctx.lineTo(p.x + p.w, p.y + p.h); ctx.fill();
                } else {
                    for (let x = Math.max(p.x + 20, Math.floor(left / 70) * 70); x < Math.min(p.x + p.w, right); x += 70) {
                        line([[x, p.y + 35], [x + 12, p.y + 53], [x + 7, p.y + 70]], "#0c1e2533", 2);
                    }
                }
                for (let x = Math.max(p.x + 30, Math.ceil(left / 95) * 95); x < Math.min(p.x + p.w - 15, right); x += 95) {
                    const sway = motion.matches ? 0 : Math.sin(time * 1.8 + x) * 3;
                    if (stage === 0) {
                        line([[x, p.y], [x - 3 + sway, p.y - 13], [x + 3 + sway, p.y - 22]], "#87bc8e", 2);
                        ellipse(x + 3 + sway, p.y - 22, 4, 3, "#d4efab");
                    } else if (stage === 1) {
                        line([[x - 4, p.y], [x, p.y - 18], [x + 5, p.y]], "#a5e5ee88", 3);
                    } else {
                        ellipse(x, p.y - 3, 9, 3, "#ffb56b33");
                        ellipse(x + sway, p.y - 5, 3, 4, "#ffc781aa");
                    }
                }
            });
            gems.forEach(g => {
                if (g.taken || g.x < left || g.x > right) return;
                const y = g.y + (motion.matches ? 0 : Math.sin(time * 3 + g.x) * 3);
                if (g.chest) {
                    ctx.fillStyle = "#95633f"; ctx.fillRect(g.x - 15, y - 10, 30, 23);
                    ctx.strokeStyle = "#ffd484"; ctx.lineWidth = 3; ctx.strokeRect(g.x - 15, y - 10, 30, 23);
                    ctx.fillStyle = "#ffe29d"; ctx.fillRect(g.x - 3, y - 2, 6, 9);
                    text("+♥", g.x, y - 23, 12, "#ffe3ad", "center");
                } else {
                    ctx.fillStyle = "#ffdb8a"; ctx.beginPath(); ctx.moveTo(g.x, y - 9); ctx.lineTo(g.x + 7, y);
                    ctx.lineTo(g.x, y + 9); ctx.lineTo(g.x - 7, y); ctx.fill();
                    line([[g.x, y - 5], [g.x - 3, y]], "#fff6cc", 2);
                }
            });
            const gate = theme.length - 68;
            if (stage < 2) {
                line([[gate - 30, 368], [gate - 30, 280], [gate + 30, 280], [gate + 30, 368]], theme.glow, 8);
                ctx.fillStyle = `${theme.glow}25`; ctx.fillRect(gate - 25, 285, 50, 80);
                text("NEXT →", gate, 253, 15, theme.glow, "center");
            } else {
                text(boss.form.name.toUpperCase(), 2360, 168, 22, boss.form.color, "center");
                line([[2180, 370], [2180, 190]], "#d78a6933", 4);
                line([[2540, 370], [2540, 190]], "#d78a6933", 4);
            }
            waves.forEach(w => {
                if (w.delay > 0) return;
                if (w.kind === "shard") {
                    line([[w.x - 12, w.y], [w.x, w.y - 14], [w.x + 12, w.y], [w.x, w.y + 10], [w.x - 12, w.y]], w.color, 4);
                } else line([[w.x - 19, w.y], [w.x - 8, w.y - 14], [w.x + 1, w.y - 30], [w.x + 10, w.y - 9], [w.x + 20, w.y]], w.color, 5);
            });
            enemies.forEach(e => { if (e.x > left && e.x < right) drawEnemy(e); });
            ghosts.forEach(g => drawKnight(g, g.life / 0.22 * 0.22));
            if (player.invuln <= 0 || motion.matches || Math.floor(time * 15) % 2 === 0) drawKnight(player, 0);
            particles.forEach(p => {
                ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
                ellipse(p.x, p.y, p.size, p.size * 0.65, p.color);
                if (!motion.matches) {
                    ctx.globalAlpha *= 0.15;
                    ellipse(p.x, p.y, p.size * 2.5, p.size * 2, p.color);
                }
            });
            ctx.globalAlpha = 1;
            if (player.attack > 0 && player.combo === 3) text("III • BREAKER", player.x, player.y - 102, 14, "#ffdc94", "center");
            ctx.restore();
        }
        function drawHUD() {
            ctx.fillStyle = "#081724d9"; ctx.fillRect(0, 0, width, 66);
            const heartSize = width < 380 ? 13 : 15;
            for (let i = 0; i < maxHealth; i++) text("♥", 13 + i * (heartSize + 2), 20, heartSize, i < player.health ? "#f89582" : "#445361");
            text(`${score} ✦`, width - 13, 20, 17, "#ffdd94", "right");
            text(`R${bossesDefeated + 1} · ${stage + 1}/3  ${themes[stage].name}`, 13, 44, width < 370 ? 10 : 12, "#c3d5dc");
            const barWidth = Math.min(84, width * 0.23);
            ctx.fillStyle = "#34485b"; ctx.fillRect(width - barWidth - 14, 40, barWidth, 6);
            ctx.fillStyle = "#a6ecd5";
            ctx.fillRect(width - barWidth - 14, 40, barWidth * (1 - player.dashCooldown / (kids ? 0.68 : 0.85)), 6);
            text(player.dashCooldown > 0 ? "DASH RECHARGING" : "DASH READY", width - 14, 56, 8, "#c2e8e1", "right");
            ctx.fillStyle = "#90e1cb"; ctx.fillRect(0, 64, width * (stage + player.x / themes[stage].length) / 3, 2);
            if (boss && boss.hp > 0 && player.x > 1920) {
                const bw = Math.min(width - 44, 350);
                ctx.fillStyle = "#211a2de6"; ctx.fillRect((width - bw) / 2, 77, bw, 33);
                text(boss.form.name.toUpperCase(), width / 2, 87, 10, boss.form.color, "center");
                ctx.fillStyle = "#613c50"; ctx.fillRect((width - bw) / 2 + 8, 98, bw - 16, 5);
                ctx.fillStyle = boss.form.color; ctx.fillRect((width - bw) / 2 + 8, 98, (bw - 16) * Math.max(0, boss.hp / boss.maxHp), 5);
            } else if (banner > 0 && state === "playing") {
                ctx.fillStyle = "#102431cc"; ctx.fillRect(width * 0.1, 80, width * 0.8, 42);
                text(stage === 0 ? (bossesDefeated ? `Boss defeated! Round ${bossesDefeated + 1} • +2 hearts` : "Nine bosses. An endless adventure.") :
                    "Checkpoint • +2 hearts", width / 2, 94, 12, "#f9e5bc", "center");
                text(kids ? "KIDS MODE • extra hearts & slower warnings" : "Chests heal • third slash breaks armor", width / 2, 111, 10, "#c7dcd9", "center");
            }
        }
        function drawControls() {
            ctx.fillStyle = "#0a1727"; ctx.fillRect(0, sceneHeight, width, height - sceneHeight);
            ctx.fillStyle = "#b9d9d622"; ctx.fillRect(0, sceneHeight, width, 1);
            const size = width < 380 ? 10 : 12;
            text("↔ SWIPE & HOLD: MOVE  •  FLICK: DASH", width / 2, sceneHeight + 17, size, "#c2e8e1", "center");
            text("↑ JUMP ×2   •   ↓ SHELL / AIR SLAM", width / 2, sceneHeight + 37, size, "#c2e8e1", "center");
            text("TAP: SLASH  •  HOLD: COMBO  •  USE ANYWHERE", width / 2, sceneHeight + 57, size - 1, "#f5c39b", "center");
        }
        function drawOverlay() {
            if (state === "playing") return;
            ctx.fillStyle = "#061522dc"; ctx.fillRect(0, 0, width, sceneHeight);
            const center = width / 2;
            if (state === "title") {
                // Keep the complete instruction card legible in short landscape canvases.
                const cardScale = Math.min(1, sceneHeight / 315);
                ctx.save();
                ctx.translate(center, 0);
                ctx.scale(cardScale, cardScale);
                ctx.translate(-center, 0);
                const cardHeight = sceneHeight / cardScale;
                const base = Math.max(30, cardHeight * 0.13);
                text("A NEW SHELL. A NEW LEGEND.", center, base, 10, "#9ad2c9", "center");
                text("SHELL KNIGHT II", center, base + 37, Math.min(32, width / 12), "#f7e9c6", "center");
                text("E M B E R W A K E", center, base + 68, 15, "#f5a787", "center");
                text("Nine bosses. Endless rounds. Keep your hearts!", center, base + 104, 12, "#b6d0d7", "center");
                text("Swipe & hold to move • flick sideways to dash", center, base + 135, 11, "#e0e8dc", "center");
                text("Swipe up to jump ×2 • down to shell / air slam", center, base + 155, 11, "#e0e8dc", "center");
                text("Tap anywhere to slash • hold for a 3-hit combo", center, base + 179, 10, "#b0d9d0", "center");
                text("Use a second finger to attack while moving.", center, base + 196, 10, "#b0d9d0", "center");
                if (!window.matchMedia("(pointer: coarse)").matches)
                    text("Keys: A/D move • Space jump • J slash • K dash • S shell", center, base + 213, 9, "#9bbacb", "center");
                const by = Math.min(cardHeight - 29, base + 239);
                ctx.fillStyle = "#c3e4be"; ctx.fillRect(center - 116, by - 19, 232, 38);
                text("TAP ANYWHERE TO BEGIN", center, by, 11, "#183a3b", "center");
                ctx.restore();
            } else {
                text("REST, BRAVE KNIGHT", center, sceneHeight * 0.34, Math.min(25, width / 15), "#ffe0a5", "center");
                text(`${bossesDefeated} bosses defeated • Round ${bossesDefeated + 1}`, center, sceneHeight * 0.46, 11, "#c1d9df", "center");
                text(`${score} TREASURE`, center, sceneHeight * 0.57, 22, "#fbcd83", "center");
                text("Your next adventure awaits…", center, sceneHeight * 0.7 + 18, 12, "#bddfc5", "center");
                text("Score saved by the arcade in a moment…", center, sceneHeight * 0.9, 10, "#9bbacb", "center");
            }
        }
        function draw() {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);
            drawBackground(); drawWorld(); drawHUD(); drawControls(); drawOverlay();
        }
        function loop(now) {
            if (destroyed) return;
            const stop = blocked();
            if (stop) {
                if (!paused) clearInput();
                paused = true; lastTime = now;
            } else {
                let dt = lastTime ? clamp((now - lastTime) / 1000, 0, 0.05) : 0;
                lastTime = now;
                if (paused) { paused = false; dt = 0; }
                // Small swept top-surface steps prevent fast dashes/falls tunnelling.
                while (dt > 0) { const slice = Math.min(dt, 1 / 120); step(slice); dt -= slice; }
            }
            draw();
            frame = window.requestAnimationFrame(loop);
        }

        canvas.style.touchAction = "none";
        listen(window, "resize", resize);
        listen(window, "keydown", onKeyDown);
        listen(window, "keyup", onKeyUp);
        listen(window, "blur", () => { blurred = true; clearInput(); });
        listen(window, "focus", () => { blurred = false; lastTime = 0; });
        listen(document, "visibilitychange", () => { clearInput(); lastTime = 0; });
        listen(canvas, "pointerdown", onPointerDown, { passive: false });
        listen(canvas, "contextmenu", event => event.preventDefault());
        listen(canvas, "pointermove", onPointerMove, { passive: false });
        listen(canvas, "pointerup", onPointerEnd);
        listen(canvas, "pointercancel", onPointerEnd);
        listen(canvas, "lostpointercapture", onPointerEnd);
        resize();
        reset();
        return {
            start() {
                if (destroyed || started) return;
                started = true;
                lastTime = 0;
                frame = window.requestAnimationFrame(loop);
            },
            restart() {
                if (destroyed) return;
                reset();
                begin();
                if (!started) this.start();
            },
            destroy() {
                if (destroyed) return;
                destroyed = true;
                window.cancelAnimationFrame(frame);
                clearInput();
                listeners.forEach(remove => remove());
                canvas.style.touchAction = oldTouchAction;
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.shellknight2 = {
        id: "shellknight2",
        name: "Shell Knight II",
        emoji: "🐢",
        tag: "Emberwake: three lands, nine bosses, endless rounds. Keep your hearts!",
        scoreLabel: "treasure",
        create
    };
})();
