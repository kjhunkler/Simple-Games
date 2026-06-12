/* ============ Astro Blaster — drag to fly, auto-fire ============ */
(function () {
    "use strict";

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");

        let W, H;
        let ship, bullets, rocks, particles, stars;
        let score, alive, started, elapsed;
        let lastShot, spawnTimer, spawnEvery;
        let rafId, lastTs;
        let touchId = null, touchOffsetX = 0, touchOffsetY = 0;

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function reset() {
            ship = { x: W / 2, y: H * 0.8, r: 16, tx: W / 2, ty: H * 0.8 };
            bullets = [];
            rocks = [];
            particles = [];
            stars = [];
            for (let i = 0; i < 60; i++) {
                stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 + 0.4, v: Math.random() * 26 + 14 });
            }
            score = 0;
            alive = true;
            started = false;
            elapsed = 0;
            lastShot = 0;
            spawnTimer = 0;
            spawnEvery = 1.1;
            lastTs = 0;
            host.setScore(0);
        }

        function spawnRock() {
            const r = Math.random() * 22 + 14;
            const x = Math.random() * (W - r * 2) + r;
            const speed = (Math.random() * 40 + 55) + Math.min(elapsed * 2.2, 130);
            rocks.push({
                x: x, y: -r - 10, r: r,
                vx: (Math.random() - 0.5) * 50,
                vy: speed,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() - 0.5) * 2.4,
                hp: r > 26 ? 2 : 1,
                verts: makeVerts(r)
            });
        }

        function makeVerts(r) {
            const n = 9;
            const verts = [];
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                const d = r * (0.74 + Math.random() * 0.3);
                verts.push({ x: Math.cos(a) * d, y: Math.sin(a) * d });
            }
            return verts;
        }

        function explode(x, y, color, count) {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = Math.random() * 160 + 40;
                particles.push({
                    x: x, y: y,
                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                    life: 1, decay: Math.random() * 1.6 + 1.2,
                    color: color, size: Math.random() * 3.5 + 1.5
                });
            }
        }

        function update(dt) {
            elapsed += dt;

            // Stars scroll
            for (const st of stars) {
                st.y += st.v * dt;
                if (st.y > H) { st.y = -2; st.x = Math.random() * W; }
            }

            if (!alive) {
                updateParticles(dt);
                return;
            }

            // Ship eases toward touch target
            ship.x += (ship.tx - ship.x) * Math.min(dt * 14, 1);
            ship.y += (ship.ty - ship.y) * Math.min(dt * 14, 1);
            ship.x = Math.max(ship.r, Math.min(W - ship.r, ship.x));
            ship.y = Math.max(ship.r, Math.min(H - ship.r, ship.y));

            if (!started) return;

            // Auto-fire
            lastShot += dt;
            const fireEvery = 0.22;
            if (lastShot >= fireEvery) {
                lastShot = 0;
                bullets.push({ x: ship.x, y: ship.y - ship.r - 2, vy: -520 });
                host.vibrate(4);
                SGSound.play("shoot");
            }

            // Bullets
            for (let i = bullets.length - 1; i >= 0; i--) {
                bullets[i].y += bullets[i].vy * dt;
                if (bullets[i].y < -12) bullets.splice(i, 1);
            }

            // Spawn rocks
            spawnTimer += dt;
            spawnEvery = Math.max(0.34, 1.1 - elapsed * 0.012);
            if (spawnTimer >= spawnEvery) {
                spawnTimer = 0;
                spawnRock();
            }

            // Rocks
            for (let i = rocks.length - 1; i >= 0; i--) {
                const rock = rocks[i];
                rock.x += rock.vx * dt;
                rock.y += rock.vy * dt;
                rock.rot += rock.vr * dt;
                if (rock.x < rock.r) { rock.x = rock.r; rock.vx *= -1; }
                if (rock.x > W - rock.r) { rock.x = W - rock.r; rock.vx *= -1; }
                if (rock.y > H + rock.r + 20) { rocks.splice(i, 1); continue; }

                // Bullet hits
                for (let j = bullets.length - 1; j >= 0; j--) {
                    const b = bullets[j];
                    const dx = b.x - rock.x, dy = b.y - rock.y;
                    if (dx * dx + dy * dy < rock.r * rock.r) {
                        bullets.splice(j, 1);
                        rock.hp -= 1;
                        if (rock.hp <= 0) {
                            explode(rock.x, rock.y, "#ffd166", 14);
                            score += rock.r > 26 ? 2 : 1;
                            host.setScore(score);
                            host.vibrate(12);
                            SGSound.play("hit");
                            rocks.splice(i, 1);
                        } else {
                            explode(b.x, b.y, "#9aa0c3", 5);
                            SGSound.play("flip");
                        }
                        break;
                    }
                }
            }

            // Ship collision
            for (const rock of rocks) {
                const dx = ship.x - rock.x, dy = ship.y - rock.y;
                const rr = rock.r * 0.82 + ship.r * 0.7;
                if (dx * dx + dy * dy < rr * rr) {
                    alive = false;
                    explode(ship.x, ship.y, "#39d0ff", 26);
                    explode(ship.x, ship.y, "#ff4d8d", 18);
                    host.vibrate([80, 50, 110]);
                    SGSound.play("explode");
                    setTimeout(() => host.gameOver(score), 700);
                    break;
                }
            }

            updateParticles(dt);
        }

        function updateParticles(dt) {
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= p.decay * dt;
                if (p.life <= 0) particles.splice(i, 1);
            }
        }

        function draw() {
            ctx.fillStyle = "#0d0d1a";
            ctx.fillRect(0, 0, W, H);

            // Stars
            ctx.fillStyle = "#8a8fb9";
            for (const st of stars) {
                ctx.globalAlpha = 0.5 + (st.s / 2) * 0.5;
                ctx.fillRect(st.x, st.y, st.s, st.s);
            }
            ctx.globalAlpha = 1;

            // Bullets
            ctx.fillStyle = "#5ef58a";
            for (const b of bullets) {
                ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
            }

            // Rocks
            for (const rock of rocks) {
                ctx.save();
                ctx.translate(rock.x, rock.y);
                ctx.rotate(rock.rot);
                ctx.fillStyle = rock.hp > 1 ? "#6b6b94" : "#55557d";
                ctx.strokeStyle = "#8a8fb9";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(rock.verts[0].x, rock.verts[0].y);
                for (let i = 1; i < rock.verts.length; i++) ctx.lineTo(rock.verts[i].x, rock.verts[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }

            // Ship
            if (alive) {
                ctx.save();
                ctx.translate(ship.x, ship.y);
                // Flame
                if (started) {
                    ctx.fillStyle = "rgba(255, 160, 60, " + (0.5 + Math.random() * 0.5) + ")";
                    ctx.beginPath();
                    ctx.moveTo(-6, ship.r * 0.9);
                    ctx.lineTo(0, ship.r * 1.7 + Math.random() * 8);
                    ctx.lineTo(6, ship.r * 0.9);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.fillStyle = "#39d0ff";
                ctx.beginPath();
                ctx.moveTo(0, -ship.r);
                ctx.lineTo(ship.r * 0.85, ship.r * 0.9);
                ctx.lineTo(0, ship.r * 0.45);
                ctx.lineTo(-ship.r * 0.85, ship.r * 0.9);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "#d6f4ff";
                ctx.beginPath();
                ctx.arc(0, -ship.r * 0.25, ship.r * 0.28, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Particles
            for (const p of particles) {
                ctx.globalAlpha = Math.max(p.life, 0);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.globalAlpha = 1;

            if (!started && alive) {
                ctx.fillStyle = "rgba(242, 243, 255, 0.85)";
                ctx.font = "700 17px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("Touch & drag to fly", W / 2, H * 0.4);
                ctx.font = "500 14px system-ui, sans-serif";
                ctx.fillStyle = "rgba(154, 160, 195, 0.9)";
                ctx.fillText("Your ship fires automatically", W / 2, H * 0.4 + 26);
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

        function getTouch(e) {
            for (const t of e.changedTouches) {
                if (touchId === null || t.identifier === touchId) return t;
            }
            return null;
        }

        function onTouchStart(e) {
            e.preventDefault();
            const t = e.changedTouches[0];
            touchId = t.identifier;
            const rect = canvas.getBoundingClientRect();
            const x = t.clientX - rect.left;
            const y = t.clientY - rect.top;
            // Keep finger offset so the ship isn't hidden under the finger.
            touchOffsetX = ship.x - x;
            touchOffsetY = ship.y - y;
            started = true;
        }

        function onTouchMove(e) {
            e.preventDefault();
            const t = getTouch(e);
            if (!t) return;
            const rect = canvas.getBoundingClientRect();
            ship.tx = (t.clientX - rect.left) + touchOffsetX;
            ship.ty = (t.clientY - rect.top) + touchOffsetY;
        }

        function onTouchEnd(e) {
            const t = getTouch(e);
            if (t) touchId = null;
        }

        function onMouseDown(e) {
            started = true;
            const rect = canvas.getBoundingClientRect();
            touchOffsetX = ship.x - (e.clientX - rect.left);
            touchOffsetY = ship.y - (e.clientY - rect.top);
            canvas.addEventListener("mousemove", onMouseMove);
        }

        function onMouseMove(e) {
            const rect = canvas.getBoundingClientRect();
            ship.tx = (e.clientX - rect.left) + touchOffsetX;
            ship.ty = (e.clientY - rect.top) + touchOffsetY;
        }

        function onMouseUp() {
            canvas.removeEventListener("mousemove", onMouseMove);
        }

        return {
            start() {
                resize();
                reset();
                window.addEventListener("resize", resize);
                canvas.addEventListener("touchstart", onTouchStart, { passive: false });
                canvas.addEventListener("touchmove", onTouchMove, { passive: false });
                canvas.addEventListener("touchend", onTouchEnd);
                canvas.addEventListener("mousedown", onMouseDown);
                window.addEventListener("mouseup", onMouseUp);
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
                canvas.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.astro = {
        id: "astro",
        name: "Astro Blaster",
        emoji: "\u{1F680}",
        tag: "Drag to fly. Blast the asteroids.",
        scoreLabel: "rocks",
        create: create
    };
})();
