/* ============ Lane Dash — swipe between lanes, dodge the traffic ============ */
(function () {
    "use strict";

    const LANES = 3;
    const OBSTACLES = ["\u{1F698}", "\u{1F69A}", "\u{1F69C}", "\u{1F6A7}"];
    const COIN = "\u2B50";

    // Pre-render emoji sprites — rotated/scaled emoji text can render as dark
    // silhouettes on some canvas backends (same fix as Fruit Slice).
    const SPRITE = 96;
    let obSprites = null, coinSprite = null, playerSprite = null;

    function makeSprite(text) {
        const c = document.createElement("canvas");
        c.width = SPRITE;
        c.height = SPRITE;
        const sctx = c.getContext("2d");
        sctx.font = Math.floor(SPRITE * 0.8) + "px system-ui, sans-serif";
        sctx.textAlign = "center";
        sctx.textBaseline = "middle";
        sctx.fillText(text, SPRITE / 2, SPRITE / 2 + SPRITE * 0.03);
        return c;
    }

    function ensureSprites() {
        if (obSprites) return;
        obSprites = OBSTACLES.map(makeSprite);
        coinSprite = makeSprite(COIN);
        playerSprite = makeSprite("\u{1F3CE}\uFE0F");
    }

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        ensureSprites();

        let W, H, laneW;
        let player, things, dashes, score, coins, distance, alive, started;
        let spawnTimer, speed;
        let rafId, lastTs;
        let touchStartX = 0, touchStartY = 0, touchMoved = false;

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            laneW = Math.min(W / LANES, 150);
        }

        function laneX(lane) {
            const roadW = laneW * LANES;
            return (W - roadW) / 2 + lane * laneW + laneW / 2;
        }

        function reset() {
            player = { lane: 1, x: laneX(1), size: 46, tilt: 0 };
            things = [];
            dashes = [];
            for (let i = 0; i < 10; i++) {
                dashes.push({ y: i * (H / 8) });
            }
            score = 0;
            coins = 0;
            distance = 0;
            alive = true;
            started = false;
            spawnTimer = 0.4;
            speed = 300;
            lastTs = 0;
            host.setScore(0);
        }

        function spawnRow() {
            // Pick 1-2 lanes for obstacles, sometimes a coin in a free lane.
            const lanes = [0, 1, 2];
            const obCount = Math.random() < Math.min(0.18 + distance / 4000, 0.5) ? 2 : 1;
            for (let i = 0; i < obCount; i++) {
                const li = Math.floor(Math.random() * lanes.length);
                const lane = lanes.splice(li, 1)[0];
                things.push({
                    lane: lane,
                    y: -60,
                    coin: false,
                    sprite: obSprites[Math.floor(Math.random() * obSprites.length)],
                    size: 48
                });
            }
            if (lanes.length && Math.random() < 0.45) {
                const lane = lanes[Math.floor(Math.random() * lanes.length)];
                things.push({ lane: lane, y: -60, coin: true, sprite: coinSprite, size: 34, spin: 0 });
            }
        }

        function steer(dx) {
            if (!alive) return;
            started = true;
            const next = Math.max(0, Math.min(LANES - 1, player.lane + dx));
            if (next !== player.lane) {
                player.lane = next;
                player.tilt = dx * 0.35;
                host.vibrate(8);
                SGSound.play("flip");
            }
        }

        function update(dt) {
            // Road animation runs even before start for life.
            const dashSpeed = started && alive ? speed : 120;
            for (const d of dashes) {
                d.y += dashSpeed * dt;
                if (d.y > H) d.y -= H + H / 8;
            }

            // Ease the car toward its lane.
            player.x += (laneX(player.lane) - player.x) * Math.min(dt * 14, 1);
            player.tilt *= Math.pow(0.02, dt);

            if (!alive || !started) return;

            distance += speed * dt;
            speed = 300 + Math.min(distance / 30, 320);

            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                spawnTimer = Math.max(0.42, 0.85 - distance / 9000);
                spawnRow();
            }

            const py = H - 110;
            for (let i = things.length - 1; i >= 0; i--) {
                const t = things[i];
                t.y += speed * dt;
                if (t.coin) t.spin += dt * 5;

                if (t.y > H + 60) {
                    things.splice(i, 1);
                    continue;
                }

                // Collision when vertically overlapping in the same lane.
                if (t.lane === player.lane && Math.abs(t.y - py) < (t.size + player.size) * 0.42) {
                    if (t.coin) {
                        things.splice(i, 1);
                        coins += 1;
                        host.vibrate(10);
                        SGSound.play("score");
                    } else {
                        alive = false;
                        host.vibrate([80, 50, 110]);
                        SGSound.play("explode");
                        setTimeout(() => host.gameOver(score), 700);
                        return;
                    }
                }
            }

            // Score = distance ticks + 5 per star.
            const total = Math.floor(distance / 400) + coins * 5;
            if (total !== score) {
                score = total;
                host.setScore(score);
            }
        }

        function draw() {
            // Grass
            ctx.fillStyle = "#16281b";
            ctx.fillRect(0, 0, W, H);

            // Road
            const roadW = laneW * LANES;
            const rx = (W - roadW) / 2;
            ctx.fillStyle = "#23233c";
            ctx.fillRect(rx, 0, roadW, H);

            // Edges
            ctx.fillStyle = "#ffd166";
            ctx.fillRect(rx - 5, 0, 5, H);
            ctx.fillRect(rx + roadW, 0, 5, H);

            // Lane dashes
            ctx.fillStyle = "rgba(242, 243, 255, 0.35)";
            for (let l = 1; l < LANES; l++) {
                const x = rx + l * laneW;
                for (const d of dashes) {
                    ctx.fillRect(x - 3, d.y, 6, H / 16);
                }
            }

            // Things
            for (const t of things) {
                const x = laneX(t.lane);
                const s = t.size * (t.coin ? 1 + Math.sin(t.spin) * 0.12 : 1);
                ctx.drawImage(t.sprite, x - s / 2, t.y - s / 2, s, s);
            }

            // Player car
            const py = H - 110;
            ctx.save();
            ctx.translate(player.x, py);
            ctx.rotate(player.tilt);
            ctx.drawImage(playerSprite, -player.size / 2, -player.size / 2, player.size, player.size);
            ctx.restore();

            if (!started && alive) {
                ctx.fillStyle = "rgba(242, 243, 255, 0.85)";
                ctx.font = "700 17px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("Swipe left & right to dodge!", W / 2, H * 0.32);
                ctx.font = "500 14px system-ui, sans-serif";
                ctx.fillStyle = "rgba(154, 160, 195, 0.9)";
                ctx.fillText("Grab \u2B50 for bonus points", W / 2, H * 0.32 + 26);
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

        function onTouchStart(e) {
            const t = e.changedTouches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
            touchMoved = false;
        }

        function onTouchMove(e) {
            e.preventDefault();
            if (touchMoved) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy)) return;
            touchMoved = true;
            steer(dx > 0 ? 1 : -1);
        }

        function onTouchEnd(e) {
            // A simple tap (no swipe) steers toward the side tapped.
            if (touchMoved) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.changedTouches[0].clientX - rect.left;
            steer(x > player.x ? 1 : -1);
        }

        function onKey(e) {
            if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); steer(-1); }
            else if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); steer(1); }
        }

        function onMouseDown(e) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            steer(x > player.x ? 1 : -1);
        }

        return {
            start() {
                resize();
                reset();
                window.addEventListener("resize", resize);
                canvas.addEventListener("touchstart", onTouchStart, { passive: true });
                canvas.addEventListener("touchmove", onTouchMove, { passive: false });
                canvas.addEventListener("touchend", onTouchEnd);
                canvas.addEventListener("mousedown", onMouseDown);
                window.addEventListener("keydown", onKey);
                rafId = requestAnimationFrame(loop);
            },
            restart() {
                reset();
            },
            destroy() {
                cancelAnimationFrame(rafId);
                window.removeEventListener("resize", resize);
                canvas.removeEventListener("touchstart", onTouchStart);
                canvas.removeEventListener("touchmove", onTouchMove);
                canvas.removeEventListener("touchend", onTouchEnd);
                canvas.removeEventListener("mousedown", onMouseDown);
                window.removeEventListener("keydown", onKey);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.lanedash = {
        id: "lanedash",
        name: "Lane Dash",
        emoji: "\u{1F3CE}\uFE0F",
        tag: "Swipe lanes. Dodge traffic. Grab stars.",
        scoreLabel: "points",
        create: create
    };
})();
