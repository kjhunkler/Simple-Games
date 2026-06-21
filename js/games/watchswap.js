/* ============ Watch Swap — guard the wall (night core) ============ */
/* Phase 0+1: landscape lock + the Knight Owl's night watch.
   Patrol the wall, shine the lantern to scare wolves back into the trees,
   or stow it to dash. Survive each night; the dial fills to dawn.        */
(function () {
    "use strict";

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        const kids = !!host.kids;

        // --- Tunables (kids mode is gentler) ---
        const START_HEARTS = kids ? 5 : 3;
        const NIGHT_MS = kids ? 40000 : 46000;
        const SLOW_FRAC = 0.30;            // patrol speed, lantern out (×W / sec)
        const FAST_FRAC = 0.66;            // dash speed, lantern stowed
        const BEAM_HALF = 0.40;            // beam cone half-angle (radians)
        const BUSH_COUNT = 6;
        const TORCH_COUNT = 4;
        const OIL_MAX = kids ? 130 : 100;
        const OIL_DRAIN = kids ? 2.0 : 3.4;    // per lit torch, per second
        const TORCH_HALF = 0.34;               // torch light-cone half-angle
        const DAY_MS = kids ? 32000 : 36000;
        const DAY_SPEED = 0.52;                // bird patrol speed (×W / sec)
        const NOISE_MAX = 100;

        let W, H, unit, wallY, fieldTop, lanternY, ox, targetX, facing;
        let bushes, wolves, torches, oil, hearts, score, night;
        let lanternOut, started, alive, paused;
        let spawnTimer, spawnInterval, wolfTravel, nightT;
        let phase, dayT, noise, owlRested, beamHalfMul, beamRangeMul;
        let disturbances, distSpawnTimer, distInterval, errand;
        let owlSleepX, oilBarrel, flash;
        let rafId, lastTs;
        let dragging = false;
        const keys = { left: false, right: false };
        let stow = { x: 0, y: 0, r: 0 };

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            unit = Math.min(W, H);
            wallY = H * 0.82;
            fieldTop = H * 0.30;
            lanternY = wallY - unit * 0.14;
            const r = unit * 0.085;
            stow = { x: W - r - unit * 0.05, y: H - r - unit * 0.05, r: r };
            layoutBushes();
            layoutTorches();
            owlSleepX = W * 0.16;
            oilBarrel = { x: W * 0.84 };
        }

        function layoutBushes() {
            bushes = [];
            for (let i = 0; i < BUSH_COUNT; i++) {
                const t = (i + 0.5) / BUSH_COUNT;
                bushes.push({ x: W * (0.08 + t * 0.84), y: fieldTop + Math.sin(i * 1.7) * (unit * 0.02) });
            }
        }

        function layoutTorches() {
            const keep = torches;                  // preserve lit state across resizes
            torches = [];
            for (let i = 0; i < TORCH_COUNT; i++) {
                const t = (i + 0.5) / TORCH_COUNT;
                torches.push({ x: W * (0.12 + t * 0.76), lit: keep && keep[i] ? keep[i].lit : false });
            }
        }

        function reset() {
            ox = W / 2;
            targetX = ox;
            facing = 1;
            wolves = [];
            hearts = START_HEARTS;
            score = 0;
            night = 1;
            lanternOut = true;
            started = false;
            alive = true;
            paused = false;
            nightT = 0;
            oil = OIL_MAX;
            for (const t of torches) t.lit = false;
            phase = "night";
            dayT = 0;
            noise = 0;
            owlRested = true;
            beamHalfMul = 1;
            beamRangeMul = 1;
            disturbances = [];
            errand = null;
            flash = 0;
            applyNight();
            spawnTimer = spawnInterval * 0.6;
            lastTs = 0;
            host.setScore(0);
        }

        // Difficulty scales gently with each night survived.
        function applyNight() {
            const n = night - 1;
            spawnInterval = Math.max(kids ? 1.5 : 1.0, (kids ? 3.2 : 2.3) - n * 0.22);
            wolfTravel = Math.max(kids ? 6.5 : 4.4, (kids ? 9.5 : 7.2) - n * 0.45); // seconds tree→wall
        }
        function applyDay() {
            distInterval = Math.max(kids ? 2.4 : 1.7, (kids ? 3.8 : 2.9) - (night - 1) * 0.18);
        }

        // Dawn: the night is survived — hand off to the Early Bird's day watch.
        function enterDay() {
            phase = "day";
            dayT = 0;
            score += 5;                 // survived the night
            host.setScore(score);
            wolves = [];
            noise = 0;
            owlRested = true;
            disturbances = [];
            errand = null;
            ox = W / 2; targetX = ox; facing = 1;
            applyDay();
            distSpawnTimer = distInterval * 0.5;
            flash = 0.5;
            host.vibrate([20, 40, 20]);
            SGSound.play("score");
        }

        // Dusk: hand the watch back to the Owl. A kept-awake owl guards poorly.
        function enterNight() {
            phase = "night";
            night += 1;
            applyNight();
            nightT = 0;
            wolves = [];
            for (const t of torches) t.lit = false;
            beamHalfMul = owlRested ? 1 : 0.62;
            beamRangeMul = owlRested ? 1 : 0.68;
            if (owlRested) { score += 3; host.setScore(score); }   // quiet-day bonus
            ox = W / 2; targetX = ox; facing = 1;
            lanternOut = true;
            errand = null;
            spawnTimer = spawnInterval * 0.6;
            flash = 0.5;
            host.vibrate([20, 40, 20]);
            SGSound.play(owlRested ? "score" : "wrong");
        }

        function spawnDisturbance() {
            const types = ["bell", "rooster", "chatter"];
            disturbances.push({
                x: W * (0.34 + Math.random() * 0.58),   // keep clear of the sleeping owl
                type: types[Math.floor(Math.random() * types.length)],
                rate: (kids ? 5 : 8) + (night - 1) * 0.6,
                shake: Math.random() * 6.28
            });
        }

        function hush(d) {
            const idx = disturbances.indexOf(d);
            if (idx >= 0) disturbances.splice(idx, 1);
            noise = Math.max(0, noise - 6);
            host.vibrate(8);
            SGSound.play("flip");
        }

        function refillOil() {
            oil = OIL_MAX;
            noise = Math.min(NOISE_MAX, noise + 14);   // hauling oil is noisy
            host.vibrate(12);
            SGSound.play("drop");
            if (noise >= NOISE_MAX && owlRested) wakeOwl();
        }

        function doErrand() {
            if (errand.kind === "oil") refillOil();
            else hush(errand.ref);
            errand = null;
        }

        function wakeOwl() {
            owlRested = false;   // locked in — the owl will guard poorly tonight
            flash = 0.6;
            host.vibrate([60, 40, 60]);
            SGSound.play("wrong");
        }

        function spawnWolf() {
            const b = bushes[Math.floor(Math.random() * bushes.length)];
            // Stalkers show up from night 2 on — faster, darker, exploit dark gaps.
            const stalker = night >= 2 && Math.random() < Math.min(0.45, 0.12 + (night - 2) * 0.08);
            wolves.push({
                x: b.x + (Math.random() - 0.5) * unit * 0.06,
                y: b.y,
                wait: (stalker ? 0.3 : 0.5) + Math.random() * 0.8,   // lurk in the bush first
                state: "lurk",                      // lurk → creep → flee
                stalker: stalker,
                wob: Math.random() * 6.28
            });
        }

        function toggleLantern() {
            lanternOut = !lanternOut;
            started = true;
            host.vibrate(8);
            SGSound.play(lanternOut ? "flip" : "tap");
        }

        function toggleTorch(i) {
            const t = torches[i];
            if (t.lit) { t.lit = false; SGSound.play("tap"); }
            else {
                if (oil <= 1) { host.vibrate(40); SGSound.play("wrong"); return; }  // out of oil
                t.lit = true; SGSound.play("eat");
            }
            host.vibrate(8); started = true;
        }

        /* ---------- Geometry ---------- */
        function clampX(x) { return Math.max(W * 0.06, Math.min(W * 0.94, x)); }

        // Is the wolf inside the lit cone projecting up from the lantern?
        function inBeam(w) {
            if (!lanternOut) return false;
            const dx = w.x - ox;
            const dy = lanternY - w.y;            // positive = above the owl
            if (dy <= 0) return false;
            const dist = Math.hypot(dx, dy);
            if (dist > unit * 1.5 * beamRangeMul) return false;
            const ang = Math.atan2(Math.abs(dx), dy); // 0 = straight up
            return ang < BEAM_HALF * beamHalfMul;
        }

        // Lit by any wall torch's stationary cone?
        function inTorchLight(w) {
            const apexY = wallY - unit * 0.05;
            for (const t of torches) {
                if (!t.lit) continue;
                const dx = w.x - t.x, dy = apexY - w.y;
                if (dy <= 0) continue;
                if (Math.hypot(dx, dy) > unit * 0.9) continue;
                if (Math.atan2(Math.abs(dx), dy) < TORCH_HALF) return true;
            }
            return false;
        }
        function isLit(w) { return inBeam(w) || inTorchLight(w); }

        /* ---------- Update ---------- */
        function update(dt) {
            if (flash > 0) flash = Math.max(0, flash - dt);
            if (phase === "night") updateNight(dt);
            else updateDay(dt);
        }

        function moveGuard(speedFrac, dt) {
            const speed = speedFrac * W;
            if (keys.left) targetX = W * 0.06;
            else if (keys.right) targetX = W * 0.94;
            const dx = targetX - ox;
            if (Math.abs(dx) > 1) {
                const move = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
                ox += move;
                facing = Math.sign(dx);
            }
        }

        function updateNight(dt) {
            moveGuard(lanternOut ? SLOW_FRAC : FAST_FRAC, dt);
            if (!started) return;

            nightT += dt;
            if (nightT >= NIGHT_MS / 1000) { enterDay(); return; }

            // Lit torches burn oil; when it runs dry they gutter out.
            let litCount = 0;
            for (const t of torches) if (t.lit) litCount++;
            if (litCount > 0) {
                oil = Math.max(0, oil - litCount * OIL_DRAIN * dt);
                if (oil <= 0) for (const t of torches) t.lit = false;
            }

            // Spawn wolves.
            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                spawnTimer = spawnInterval * (0.7 + Math.random() * 0.6);
                if (wolves.length < 7) spawnWolf();
            }

            const baseFall = (wallY - fieldTop) / wolfTravel; // px/sec downward
            for (let i = wolves.length - 1; i >= 0; i--) {
                const w = wolves[i];
                w.wob += dt * 4;
                const fall = baseFall * (w.stalker ? 1.45 : 1);

                if (w.state === "lurk") {
                    w.wait -= dt;
                    if (isLit(w)) { scare(w); }
                    else if (w.wait <= 0) w.state = "creep";
                } else if (w.state === "creep") {
                    w.y += fall * dt;
                    if (isLit(w)) scare(w);
                    else if (w.y >= wallY - unit * 0.04) {  // reached the wall
                        breach();
                        wolves.splice(i, 1);
                    }
                } else if (w.state === "flee") {
                    w.y -= fall * 2.2 * dt;
                    if (w.y < fieldTop - unit * 0.08) wolves.splice(i, 1);
                }
            }
        }

        function updateDay(dt) {
            moveGuard(DAY_SPEED, dt);

            dayT += dt;
            if (dayT >= DAY_MS / 1000) { enterNight(); return; }

            // Walk an errand to its target, then act on arrival.
            if (errand) {
                const tx = errand.kind === "oil" ? oilBarrel.x : errand.ref.x;
                if (Math.abs(ox - tx) < unit * 0.1) doErrand();
            }

            // Spawn disturbances.
            distSpawnTimer -= dt;
            if (distSpawnTimer <= 0) {
                distSpawnTimer = distInterval * (0.7 + Math.random() * 0.6);
                if (disturbances.length < 5) spawnDisturbance();
            }

            // Active disturbances pump the noise up; quiet lets it settle.
            let rate = 0;
            for (const d of disturbances) { d.shake += dt * 16; rate += d.rate; }
            if (rate > 0) noise = Math.min(NOISE_MAX, noise + rate * dt);
            else noise = Math.max(0, noise - dt * 4);
            if (noise >= NOISE_MAX && owlRested) wakeOwl();
        }

        function scare(w) {
            if (w.state === "flee") return;
            w.state = "flee";
            score += 1;
            host.setScore(score);
            host.vibrate(10);
            SGSound.play("flap");
        }

        function breach() {
            hearts -= 1;
            host.vibrate([50, 30, 60]);
            SGSound.play("hit");
            if (hearts <= 0) {
                alive = false;
                SGSound.play("gameover");
                host.gameOver(score);
            }
        }

        /* ---------- Drawing ---------- */
        function draw() {
            if (phase === "night") drawNight();
            else drawDay();
            if (flash > 0) {
                ctx.fillStyle = "rgba(255,247,235," + (flash * 0.5) + ")";
                ctx.fillRect(0, 0, W, H);
            }
        }

        function drawNight() {
            // Sky
            const sky = ctx.createLinearGradient(0, 0, 0, wallY);
            sky.addColorStop(0, "#13153a");
            sky.addColorStop(0.6, "#231f4c");
            sky.addColorStop(1, "#3a3566");
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);

            drawMoonAndStars();

            // Grass field
            const grass = ctx.createLinearGradient(0, fieldTop, 0, wallY);
            grass.addColorStop(0, "#2c3a30");
            grass.addColorStop(1, "#161f17");
            ctx.fillStyle = grass;
            ctx.fillRect(0, fieldTop, W, wallY - fieldTop);

            for (const b of bushes) drawBush(b.x, b.y);

            // Lurking wolves' eyes shine from the bushes; creeping ones in the open.
            for (const w of wolves) if (w.state !== "lurk") drawWolf(w);
            for (const w of wolves) if (w.state === "lurk") drawEyes(w.x, w.y, !w.stalker);

            drawTorchCones();
            if (lanternOut) drawBeam();
            drawOwl();
            drawWall();
            drawTorches();
            drawHUD();

            if (!started) {
                ctx.fillStyle = "rgba(242,243,255,0.9)";
                ctx.font = "600 " + Math.round(unit * 0.05) + "px Georgia, serif";
                ctx.textAlign = "center";
                ctx.fillText("Drag to patrol the wall", W / 2, fieldTop + unit * 0.16);
                ctx.font = "500 " + Math.round(unit * 0.038) + "px Georgia, serif";
                ctx.fillStyle = "rgba(242,243,255,0.7)";
                ctx.fillText("Lantern lit: slow but scares wolves · stow it to dash", W / 2, fieldTop + unit * 0.24);
                ctx.fillText("Tap a wall torch to light it — but it burns oil", W / 2, fieldTop + unit * 0.30);
            }
        }

        function drawMoonAndStars() {
            const mx = W * 0.84, my = H * 0.18, mr = unit * 0.07;
            const g = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3);
            g.addColorStop(0, "rgba(238,240,255,0.5)");
            g.addColorStop(1, "rgba(238,240,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#eef0ff";
            ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.28); ctx.fill();

            ctx.fillStyle = "rgba(223,226,255,0.85)";
            for (let i = 0; i < 22; i++) {
                const sx = (i * 97 % 100) / 100 * W;
                const sy = ((i * 53) % 100) / 100 * fieldTop * 0.95;
                ctx.beginPath(); ctx.arc(sx, sy, (i % 3 === 0 ? 1.6 : 1), 0, 6.28); ctx.fill();
            }
        }

        function drawBush(x, y) {
            const r = unit * 0.07;
            ctx.fillStyle = "#22341d";
            ctx.beginPath(); ctx.ellipse(x, y + r * 0.5, r * 1.1, r * 0.6, 0, 0, 6.28); ctx.fill();
            const bumps = [[-0.7, 0.1, 0.55], [0, -0.25, 0.7], [0.7, 0.1, 0.55], [-0.35, -0.1, 0.4], [0.35, -0.1, 0.4]];
            for (let i = 0; i < bumps.length; i++) {
                ctx.fillStyle = i % 2 ? "#33502c" : "#2c4426";
                ctx.beginPath();
                ctx.arc(x + bumps[i][0] * r, y + bumps[i][1] * r, bumps[i][2] * r, 0, 6.28);
                ctx.fill();
            }
        }

        function drawEyes(x, y, warm) {
            const s = unit * 0.012;
            ctx.fillStyle = warm ? "#ffe14d" : "#9af0a0";
            ctx.beginPath(); ctx.arc(x - s * 1.4, y, s, 0, 6.28); ctx.arc(x + s * 1.4, y, s, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#1a1206";
            ctx.beginPath(); ctx.arc(x - s * 1.4, y, s * 0.4, 0, 6.28); ctx.arc(x + s * 1.4, y, s * 0.4, 0, 6.28); ctx.fill();
        }

        function drawWolf(w) {
            const lit = w.state === "flee" || isLit(w);
            const s = unit * (w.stalker ? 0.042 : 0.05);
            const bob = Math.sin(w.wob) * s * 0.06;
            ctx.save();
            ctx.translate(w.x, w.y + bob);
            if (w.state === "flee") ctx.scale(-1, 1);   // turn tail and run
            ctx.fillStyle = lit ? "#6a6e78" : (w.stalker ? "#23272f" : "#3f434c");
            ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.7, s * 0.36, 0, 0, 6.28); ctx.fill();
            // legs
            ctx.fillStyle = lit ? "#565a63" : "#33373f";
            for (const lx of [-0.45, -0.15, 0.15, 0.45]) ctx.fillRect(lx * s - s * 0.05, s * 0.4, s * 0.1, s * 0.35);
            // head
            ctx.beginPath(); ctx.arc(-s * 0.55, -s * 0.1, s * 0.3, 0, 6.28); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-s * 0.8, -s * 0.05); ctx.lineTo(-s * 1.15, s * 0.08); ctx.lineTo(-s * 0.78, s * 0.18); ctx.fill();
            // ears
            ctx.beginPath(); ctx.moveTo(-s * 0.65, -s * 0.35); ctx.lineTo(-s * 0.55, -s * 0.55); ctx.lineTo(-s * 0.45, -s * 0.3); ctx.fill();
            ctx.restore();
            drawEyes(w.x - s * 0.55, w.y - s * 0.12 + bob, !w.stalker);
        }

        function drawBeam() {
            const half = BEAM_HALF * beamHalfMul;
            const len = unit * 1.4 * beamRangeMul;
            const ax = ox, ay = lanternY;
            const lx = ax - Math.sin(half) * len, rx = ax + Math.sin(half) * len;
            const ty = ay - Math.cos(half) * len;
            const g = ctx.createLinearGradient(ax, ay, ax, ty);
            const a = beamRangeMul < 1 ? 0.22 : 0.34;   // a tired owl's beam is dimmer
            g.addColorStop(0, "rgba(255,231,168," + a + ")");
            g.addColorStop(1, "rgba(255,231,168,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(ax, ay); ctx.lineTo(lx, ty); ctx.lineTo(rx, ty); ctx.closePath();
            ctx.fill();
        }

        function drawTorchCones() {
            const len = unit * 0.9, apexY = wallY - unit * 0.05;
            for (const t of torches) {
                if (!t.lit) continue;
                const lx = t.x - Math.sin(TORCH_HALF) * len, rx = t.x + Math.sin(TORCH_HALF) * len;
                const ty = apexY - Math.cos(TORCH_HALF) * len;
                const g = ctx.createLinearGradient(t.x, apexY, t.x, ty);
                g.addColorStop(0, "rgba(255,210,120,0.28)");
                g.addColorStop(1, "rgba(255,210,120,0)");
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(t.x, apexY); ctx.lineTo(lx, ty); ctx.lineTo(rx, ty); ctx.closePath(); ctx.fill();
            }
        }

        function drawTorches() {
            const baseY = wallY - unit * 0.04;
            for (const t of torches) {
                ctx.fillStyle = t.lit ? "#4a3a26" : "#3a2e1e";
                ctx.fillRect(t.x - unit * 0.008, baseY, unit * 0.016, unit * 0.055);
                if (t.lit) {
                    const g = ctx.createRadialGradient(t.x, baseY, 2, t.x, baseY, unit * 0.09);
                    g.addColorStop(0, "rgba(255,217,138,0.85)"); g.addColorStop(1, "rgba(255,206,106,0)");
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, baseY, unit * 0.09, 0, 6.28); ctx.fill();
                    ctx.fillStyle = "#ff9a36";
                    ctx.beginPath();
                    ctx.moveTo(t.x, baseY - unit * 0.05);
                    ctx.quadraticCurveTo(t.x - unit * 0.018, baseY - unit * 0.01, t.x, baseY);
                    ctx.quadraticCurveTo(t.x + unit * 0.018, baseY - unit * 0.01, t.x, baseY - unit * 0.05);
                    ctx.fill();
                    ctx.fillStyle = "#ffd24a";
                    ctx.beginPath();
                    ctx.moveTo(t.x, baseY - unit * 0.032);
                    ctx.quadraticCurveTo(t.x - unit * 0.009, baseY - unit * 0.006, t.x, baseY);
                    ctx.quadraticCurveTo(t.x + unit * 0.009, baseY - unit * 0.006, t.x, baseY - unit * 0.032);
                    ctx.fill();
                } else {
                    // Dark sconce with a wisp of smoke — this is a gap wolves can use.
                    ctx.strokeStyle = "rgba(120,120,140,0.45)"; ctx.lineWidth = unit * 0.005;
                    ctx.beginPath();
                    ctx.moveTo(t.x, baseY - unit * 0.01);
                    ctx.quadraticCurveTo(t.x - unit * 0.02, baseY - unit * 0.04, t.x, baseY - unit * 0.06);
                    ctx.stroke();
                }
            }
        }

        function drawOwl() {
            const cx = ox, baseY = wallY, h = unit * 0.2;
            const headR = h * 0.42, bodyW = h * 0.5, bodyH = h * 0.6;
            const bodyCy = baseY - bodyH * 0.55;
            const headCy = bodyCy - bodyH * 0.55;

            // body (armor)
            ctx.fillStyle = "#7e8694";
            ctx.beginPath(); ctx.ellipse(cx, bodyCy, bodyW, bodyH * 0.62, 0, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#9aa1ad";
            ctx.beginPath(); ctx.ellipse(cx - bodyW * 0.12, bodyCy + bodyH * 0.05, bodyW * 0.55, bodyH * 0.45, 0, 0, 6.28); ctx.fill();
            // head
            ctx.fillStyle = "#8a6840";
            ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, 6.28); ctx.fill();
            // helmet dome
            ctx.fillStyle = "#aab1bd";
            ctx.beginPath(); ctx.arc(cx, headCy, headR, Math.PI, 0); ctx.lineTo(cx + headR * 0.85, headCy); ctx.arc(cx, headCy, headR * 0.85, 0, Math.PI, true); ctx.fill();
            ctx.fillStyle = "#878e9c";
            ctx.fillRect(cx - headR * 0.1, headCy - headR * 0.8, headR * 0.2, headR * 0.85);
            // face disc + eyes
            ctx.fillStyle = "#dcc99e";
            ctx.beginPath(); ctx.ellipse(cx, headCy + headR * 0.2, headR * 0.78, headR * 0.72, 0, 0, 6.28); ctx.fill();
            const er = headR * 0.3;
            for (const side of [-1, 1]) {
                const exx = cx + side * headR * 0.34;
                ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(exx, headCy + headR * 0.12, er, 0, 6.28); ctx.fill();
                ctx.fillStyle = "#e8a93a"; ctx.beginPath(); ctx.arc(exx + facing * er * 0.18, headCy + headR * 0.14, er * 0.6, 0, 6.28); ctx.fill();
                ctx.fillStyle = "#20140a"; ctx.beginPath(); ctx.arc(exx + facing * er * 0.18, headCy + headR * 0.14, er * 0.3, 0, 6.28); ctx.fill();
            }
            ctx.fillStyle = "#d98a34";
            ctx.beginPath(); ctx.moveTo(cx - er * 0.3, headCy + headR * 0.5); ctx.lineTo(cx + er * 0.3, headCy + headR * 0.5); ctx.lineTo(cx, headCy + headR * 0.8); ctx.fill();

            // lantern (glows when out)
            const lx = cx + facing * bodyW * 0.95, ly = bodyCy;
            if (lanternOut) {
                const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, h * 0.6);
                g.addColorStop(0, "rgba(255,243,204,0.9)"); g.addColorStop(1, "rgba(255,206,120,0)");
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, h * 0.6, 0, 6.28); ctx.fill();
            }
            ctx.strokeStyle = "#4a3a26"; ctx.lineWidth = h * 0.03;
            ctx.beginPath(); ctx.moveTo(cx + facing * bodyW * 0.5, bodyCy - bodyH * 0.1); ctx.lineTo(lx, ly - h * 0.12); ctx.stroke();
            ctx.fillStyle = "#6e5a38"; ctx.fillRect(lx - h * 0.07, ly - h * 0.1, h * 0.14, h * 0.2);
            ctx.fillStyle = lanternOut ? "#fff0b0" : "#5a4a2c"; ctx.fillRect(lx - h * 0.045, ly - h * 0.06, h * 0.09, h * 0.13);
        }

        function drawWall() {
            const top = wallY + unit * 0.02;
            ctx.fillStyle = "#5f5a4d";
            ctx.fillRect(0, top, W, H - top);
            ctx.fillStyle = "#726c5c";
            ctx.fillRect(0, top - unit * 0.012, W, unit * 0.018);
            // merlons
            ctx.fillStyle = "#6b6456";
            const mw = unit * 0.07, gap = mw * 1.4;
            for (let x = -gap * 0.5; x < W; x += mw + gap) ctx.fillRect(x, top - unit * 0.045, mw, unit * 0.05);
        }

        function heart(x, y, r, filled) {
            ctx.fillStyle = filled ? "#ff5d7d" : "rgba(255,255,255,0.22)";
            ctx.beginPath();
            ctx.moveTo(x, y + r * 0.3);
            ctx.bezierCurveTo(x, y, x - r, y - r * 0.1, x - r, y + r * 0.35);
            ctx.bezierCurveTo(x - r, y + r * 0.8, x, y + r * 1.1, x, y + r * 1.4);
            ctx.bezierCurveTo(x, y + r * 1.1, x + r, y + r * 0.8, x + r, y + r * 0.35);
            ctx.bezierCurveTo(x + r, y - r * 0.1, x, y, x, y + r * 0.3);
            ctx.fill();
        }

        function roundRectFill(x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.fill();
        }

        function drawOilGauge(labelColor) {
            const ogw = unit * 0.22, ogh = unit * 0.028, ogx = W - ogw - unit * 0.05, ogy = unit * 0.045;
            ctx.fillStyle = labelColor;
            ctx.font = "600 " + Math.round(unit * 0.028) + "px Georgia, serif";
            ctx.textAlign = "right";
            ctx.fillText("oil", ogx - unit * 0.012, ogy + ogh * 0.85);
            ctx.fillStyle = "rgba(191,166,118,0.45)";
            roundRectFill(ogx, ogy, ogw, ogh, ogh * 0.5);
            ctx.fillStyle = oil > OIL_MAX * 0.25 ? "#e0922e" : "#e05a3a";
            if (oil > 0) roundRectFill(ogx, ogy, ogw * (oil / OIL_MAX), ogh, ogh * 0.5);
            ctx.textAlign = "center";
        }

        // Sun→moon arc with a token showing how far through the phase we are.
        function drawDial(p, label, labelColor) {
            p = Math.min(1, p);
            const cx = W / 2, ay = unit * 0.07, aw = unit * 0.34, ah = unit * 0.05;
            ctx.strokeStyle = "rgba(216,195,154,0.85)"; ctx.lineWidth = unit * 0.012;
            ctx.beginPath(); ctx.moveTo(cx - aw, ay); ctx.quadraticCurveTo(cx, ay - ah, cx + aw, ay); ctx.stroke();
            ctx.fillStyle = "#ffd86a"; ctx.beginPath(); ctx.arc(cx - aw, ay, unit * 0.014, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#eef0ff"; ctx.beginPath(); ctx.arc(cx + aw, ay, unit * 0.016, 0, 6.28); ctx.fill();
            const tx = cx - aw + p * aw * 2, ty = ay - ah * (1 - (2 * p - 1) * (2 * p - 1));
            ctx.fillStyle = "#fff1c0"; ctx.strokeStyle = "#c98a2e"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(tx, ty, unit * 0.018, 0, 6.28); ctx.fill(); ctx.stroke();
            ctx.fillStyle = labelColor;
            ctx.font = "600 " + Math.round(unit * 0.032) + "px Georgia, serif";
            ctx.textAlign = "center";
            ctx.fillText(label, cx, ay + unit * 0.06);
        }

        function drawNoiseMeter() {
            const bw = unit * 0.26, bh = unit * 0.03, bx = unit * 0.06, by = unit * 0.055;
            ctx.fillStyle = "rgba(40,40,60,0.9)";
            ctx.font = "600 " + Math.round(unit * 0.028) + "px Georgia, serif";
            ctx.textAlign = "left";
            ctx.fillText("noise", bx, by - unit * 0.012);
            ctx.fillStyle = "rgba(120,110,90,0.4)"; roundRectFill(bx, by, bw, bh, bh * 0.5);
            const p = noise / NOISE_MAX;
            ctx.fillStyle = p > 0.75 ? "#e0503a" : "#e0922e";
            if (p > 0) roundRectFill(bx, by, bw * p, bh, bh * 0.5);
            ctx.textAlign = "center";
        }

        function drawHUD() {
            const hr = unit * 0.025;
            for (let i = 0; i < START_HEARTS; i++) heart(unit * 0.06 + i * hr * 3, unit * 0.05, hr, i < hearts);
            drawOilGauge("rgba(242,243,255,0.85)");
            drawDial(nightT / (NIGHT_MS / 1000), "Night " + night, "rgba(242,243,255,0.85)");

            // Stow / lantern button (bottom-right)
            ctx.fillStyle = lanternOut ? "rgba(205,184,134,0.95)" : "rgba(120,110,150,0.95)";
            ctx.strokeStyle = "#8a6d3f"; ctx.lineWidth = unit * 0.008;
            ctx.beginPath(); ctx.arc(stow.x, stow.y, stow.r, 0, 6.28); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#6e5a38"; ctx.fillRect(stow.x - stow.r * 0.22, stow.y - stow.r * 0.35, stow.r * 0.44, stow.r * 0.6);
            ctx.fillStyle = lanternOut ? "#fff0b0" : "#3a3322";
            ctx.fillRect(stow.x - stow.r * 0.13, stow.y - stow.r * 0.22, stow.r * 0.26, stow.r * 0.4);
            ctx.fillStyle = lanternOut ? "#5a4326" : "#ffe9c2";
            ctx.font = "600 " + Math.round(unit * 0.026) + "px Georgia, serif";
            ctx.fillText(lanternOut ? "stow" : "light", stow.x, stow.y + stow.r * 1.5);
        }

        function drawHUDDay() {
            drawNoiseMeter();
            drawOilGauge("rgba(40,40,60,0.9)");
            drawDial(dayT / (DAY_MS / 1000), "Day " + night, "rgba(40,40,60,0.9)");
        }

        function drawDay() {
            const sky = ctx.createLinearGradient(0, 0, 0, wallY);
            sky.addColorStop(0, "#79b1e6");
            sky.addColorStop(1, "#cfe6f3");
            ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
            drawSun();

            const grass = ctx.createLinearGradient(0, fieldTop, 0, wallY);
            grass.addColorStop(0, "#7bb05a"); grass.addColorStop(1, "#5e9243");
            ctx.fillStyle = grass; ctx.fillRect(0, fieldTop, W, wallY - fieldTop);
            for (const b of bushes) drawBush(b.x, b.y);

            drawSleepingOwl(owlSleepX);
            drawBird(ox);
            drawWall();
            for (const d of disturbances) drawDisturbance(d);
            drawOilBarrel();
            drawHUDDay();

            if (night === 1 && dayT < 4.5) {
                ctx.fillStyle = "rgba(38,38,58,0.92)"; ctx.textAlign = "center";
                ctx.font = "600 " + Math.round(unit * 0.05) + "px Georgia, serif";
                ctx.fillText("Daytime — keep the owl asleep", W / 2, fieldTop + unit * 0.15);
                ctx.font = "500 " + Math.round(unit * 0.036) + "px Georgia, serif";
                ctx.fillText("Tap a noise to hush it · tap the oil barrel to refill for tonight", W / 2, fieldTop + unit * 0.22);
            }
        }

        function drawSun() {
            const sx = W * 0.82, sy = H * 0.16, sr = unit * 0.06;
            const g = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 2.6);
            g.addColorStop(0, "rgba(255,244,200,0.9)"); g.addColorStop(1, "rgba(255,244,200,0)");
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr * 2.6, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#ffe9a0"; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.28); ctx.fill();
        }

        function drawSleepingOwl(x) {
            const baseY = wallY, h = unit * 0.17;
            const bodyH = h * 0.62, bodyCy = baseY - bodyH * 0.5;
            const headR = h * 0.4, headCy = bodyCy - bodyH * 0.5;
            ctx.fillStyle = "#8a92a0";
            ctx.beginPath(); ctx.ellipse(x, bodyCy, h * 0.5, bodyH * 0.6, 0, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#8a6840"; ctx.beginPath(); ctx.arc(x, headCy, headR, 0, 6.28); ctx.fill();
            // nightcap
            ctx.fillStyle = "#6a6aa8";
            ctx.beginPath();
            ctx.moveTo(x - headR * 0.95, headCy - headR * 0.1);
            ctx.quadraticCurveTo(x - headR * 0.2, headCy - headR * 1.7, x + headR * 1.2, headCy - headR * 1.2);
            ctx.quadraticCurveTo(x + headR * 0.2, headCy - headR * 0.55, x + headR * 0.95, headCy - headR * 0.1);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#ececf8"; ctx.beginPath(); ctx.arc(x + headR * 1.2, headCy - headR * 1.2, headR * 0.22, 0, 6.28); ctx.fill();
            // closed eyes
            ctx.strokeStyle = "#3a2412"; ctx.lineWidth = h * 0.018; ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x - headR * 0.5, headCy + headR * 0.1); ctx.quadraticCurveTo(x - headR * 0.3, headCy + headR * 0.3, x - headR * 0.1, headCy + headR * 0.1);
            ctx.moveTo(x + headR * 0.1, headCy + headR * 0.1); ctx.quadraticCurveTo(x + headR * 0.3, headCy + headR * 0.3, x + headR * 0.5, headCy + headR * 0.1);
            ctx.stroke();
            ctx.fillStyle = "#d98a34"; ctx.beginPath();
            ctx.moveTo(x - headR * 0.12, headCy + headR * 0.4); ctx.lineTo(x + headR * 0.12, headCy + headR * 0.4); ctx.lineTo(x, headCy + headR * 0.62); ctx.fill();
            // Zzz drifting up
            const zt = (Date.now() % 2600) / 2600;
            ctx.fillStyle = "rgba(60,60,90," + (0.85 - zt * 0.7) + ")";
            ctx.font = "600 " + Math.round(h * (0.2 + zt * 0.12)) + "px Georgia, serif"; ctx.textAlign = "left";
            ctx.fillText("z", x + headR * 1.0, headCy - headR * 1.3 - zt * h * 0.4);
        }

        function drawBird(x) {
            const s = unit * 0.07, cy = wallY - s * 0.7;
            ctx.save(); ctx.translate(x, cy); ctx.scale(facing, 1);
            ctx.fillStyle = "#7c5230"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.6, 0, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#db7f37"; ctx.beginPath(); ctx.ellipse(s * 0.12, s * 0.1, s * 0.32, s * 0.42, 0, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#7c5230"; ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.55, s * 0.36, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#9aa0a8"; ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.6, s * 0.37, Math.PI, 0); ctx.fill();
            ctx.fillRect(s * 0.04, -s * 1.05, s * 0.12, s * 0.14);
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.55, s * 0.1, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#20140a"; ctx.beginPath(); ctx.arc(s * 0.25, -s * 0.55, s * 0.05, 0, 6.28); ctx.fill();
            ctx.fillStyle = "#e09a33"; ctx.beginPath();
            ctx.moveTo(s * 0.4, -s * 0.5); ctx.lineTo(s * 0.62, -s * 0.45); ctx.lineTo(s * 0.4, -s * 0.38); ctx.fill();
            ctx.restore();
        }

        function drawDisturbance(d) {
            const sh = Math.sin(d.shake) * unit * 0.006;
            const x = d.x + sh, y = wallY - unit * 0.03, s = unit * 0.05;
            // a sound arc that pulses
            const ring = (d.shake % 6.28) / 6.28;
            ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = unit * 0.004;
            ctx.beginPath(); ctx.arc(x, y - s * 0.6, s * (0.6 + ring * 0.9), -1.2, 1.2); ctx.stroke();
            if (d.type === "bell") {
                ctx.fillStyle = "#e8b84a"; ctx.beginPath();
                ctx.moveTo(x - s * 0.4, y); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.7, x, y - s * 0.7);
                ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.7, x + s * 0.4, y); ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#8a6a1f"; ctx.beginPath(); ctx.arc(x, y + s * 0.05, s * 0.1, 0, 6.28); ctx.fill();
            } else if (d.type === "rooster") {
                ctx.fillStyle = "#b5543f"; ctx.beginPath(); ctx.ellipse(x, y - s * 0.2, s * 0.34, s * 0.42, 0, 0, 6.28); ctx.fill();
                ctx.fillStyle = "#e0533a";
                ctx.beginPath(); ctx.arc(x - s * 0.06, y - s * 0.6, s * 0.1, 0, 6.28); ctx.arc(x + s * 0.06, y - s * 0.62, s * 0.1, 0, 6.28); ctx.fill();
                ctx.fillStyle = "#e0a24a"; ctx.beginPath();
                ctx.moveTo(x + s * 0.3, y - s * 0.3); ctx.lineTo(x + s * 0.55, y - s * 0.25); ctx.lineTo(x + s * 0.3, y - s * 0.18); ctx.fill();
            } else {
                ctx.fillStyle = "#f2efe2"; ctx.beginPath(); ctx.ellipse(x, y - s * 0.3, s * 0.4, s * 0.3, 0, 0, 6.28); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x - s * 0.1, y); ctx.lineTo(x + s * 0.1, y); ctx.lineTo(x - s * 0.15, y - s * 0.2); ctx.fill();
                ctx.fillStyle = "#9a8f72";
                for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(x + k * s * 0.16, y - s * 0.3, s * 0.05, 0, 6.28); ctx.fill(); }
            }
        }

        function drawOilBarrel() {
            const x = oilBarrel.x, y = wallY - unit * 0.02, w = unit * 0.07, h = unit * 0.085;
            ctx.fillStyle = "#6e4a2a"; roundRectFill(x - w / 2, y - h, w, h, unit * 0.01);
            ctx.strokeStyle = "#4a3018"; ctx.lineWidth = unit * 0.006;
            ctx.beginPath();
            ctx.moveTo(x - w / 2, y - h * 0.66); ctx.lineTo(x + w / 2, y - h * 0.66);
            ctx.moveTo(x - w / 2, y - h * 0.33); ctx.lineTo(x + w / 2, y - h * 0.33); ctx.stroke();
            ctx.fillStyle = "#e0922e"; ctx.beginPath(); ctx.arc(x, y - h * 0.5, w * 0.16, 0, 6.28); ctx.fill();
        }

        function drawRotateHint() {
            ctx.fillStyle = "#13153a"; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "#f2f3ff"; ctx.textAlign = "center";
            ctx.font = "600 " + Math.round(Math.min(W, H) * 0.07) + "px Georgia, serif";
            ctx.fillText("\u{1F504}", W / 2, H / 2 - Math.min(W, H) * 0.06);
            ctx.font = "500 " + Math.round(Math.min(W, H) * 0.05) + "px Georgia, serif";
            ctx.fillText("Rotate to landscape", W / 2, H / 2 + Math.min(W, H) * 0.04);
        }

        /* ---------- Orientation ---------- */
        function lockLandscape() {
            try {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock("landscape").catch(function () { /* unsupported (iOS) — overlay handles it */ });
                }
            } catch (e) { /* ignore */ }
        }
        function unlockOrientation() {
            try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* ignore */ }
        }
        function isPortrait() { return canvas.clientHeight > canvas.clientWidth * 1.05; }

        /* ---------- Loop ---------- */
        function loop(ts) {
            rafId = requestAnimationFrame(loop);
            if (isPortrait()) { resize(); paused = true; lastTs = ts; drawRotateHint(); return; }
            if (paused) { paused = false; resize(); }
            const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
            lastTs = ts;
            if (alive) update(dt);
            draw();
        }

        /* ---------- Input ---------- */
        function localPoint(clientX, clientY) {
            const r = canvas.getBoundingClientRect();
            return { x: clientX - r.left, y: clientY - r.top };
        }
        function inStow(x, y) { return Math.hypot(x - stow.x, y - stow.y) <= stow.r * 1.25; }

        function onDown(x, y) {
            if (!alive) return;
            if (phase === "day") { onDownDay(x, y); return; }
            if (inStow(x, y)) { toggleLantern(); return; }
            for (let i = 0; i < torches.length; i++) {
                if (Math.hypot(x - torches[i].x, y - (wallY - unit * 0.02)) <= unit * 0.07) { toggleTorch(i); return; }
            }
            dragging = true; started = true; targetX = clampX(x);
        }
        function onDownDay(x, y) {
            for (const d of disturbances) {
                if (Math.hypot(x - d.x, y - (wallY - unit * 0.03)) <= unit * 0.08) { errand = { kind: "hush", ref: d }; targetX = clampX(d.x); return; }
            }
            if (Math.hypot(x - oilBarrel.x, y - (wallY - unit * 0.04)) <= unit * 0.08) { errand = { kind: "oil" }; targetX = clampX(oilBarrel.x); return; }
            errand = null; dragging = true; targetX = clampX(x);
        }
        function onMove(x) { if (dragging) { targetX = clampX(x); errand = null; } }
        function onUp() { dragging = false; }

        function onTouchStart(e) { const t = e.changedTouches[0]; const p = localPoint(t.clientX, t.clientY); onDown(p.x, p.y); }
        function onTouchMove(e) { e.preventDefault(); const t = e.changedTouches[0]; const p = localPoint(t.clientX, t.clientY); onMove(p.x); }
        function onTouchEnd() { onUp(); }
        function onMouseDown(e) { const p = localPoint(e.clientX, e.clientY); onDown(p.x, p.y); }
        function onMouseMove(e) { const p = localPoint(e.clientX, e.clientY); onMove(p.x); }
        function onMouseUp() { onUp(); }
        function onKey(e) {
            if (e.key === "ArrowLeft" || e.key === "a") { keys.left = true; started = true; e.preventDefault(); }
            else if (e.key === "ArrowRight" || e.key === "d") { keys.right = true; started = true; e.preventDefault(); }
            else if (e.key === " " || e.key === "ArrowUp") { if (phase === "night") toggleLantern(); e.preventDefault(); }
        }
        function onKeyUp(e) {
            if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
            else if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
        }

        return {
            start() {
                lockLandscape();
                resize();
                reset();
                window.addEventListener("resize", resize);
                canvas.addEventListener("touchstart", onTouchStart, { passive: true });
                canvas.addEventListener("touchmove", onTouchMove, { passive: false });
                canvas.addEventListener("touchend", onTouchEnd, { passive: true });
                canvas.addEventListener("mousedown", onMouseDown);
                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);
                window.addEventListener("keydown", onKey);
                window.addEventListener("keyup", onKeyUp);
                rafId = requestAnimationFrame(loop);
            },
            restart() { reset(); },
            destroy() {
                cancelAnimationFrame(rafId);
                unlockOrientation();
                window.removeEventListener("resize", resize);
                canvas.removeEventListener("touchstart", onTouchStart);
                canvas.removeEventListener("touchmove", onTouchMove);
                canvas.removeEventListener("touchend", onTouchEnd);
                canvas.removeEventListener("mousedown", onMouseDown);
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                window.removeEventListener("keydown", onKey);
                window.removeEventListener("keyup", onKeyUp);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.watchswap = {
        id: "watchswap",
        name: "Watch Swap",
        emoji: "\u{1F989}",
        tag: "Guard the wall. Shine the lantern, shoo the wolves.",
        scoreLabel: "wolves shooed",
        create: create
    };
})();
