/* ============ Bug Hunt — same-network multiplayer bug collecting ============ */
/* Needs the Python server (see /server/server.py). The page and the socket
   share a host, so when you open the app FROM the server it connects itself. */
(function () {
    "use strict";

    const PLAYER_SPEED = 200;          // world px / second
    const MOVE_SEND_MS = 60;           // how often we push our position
    const STYLE_ID = "bughunt-style";
    const VIEW_W = 640, VIEW_H = 640;  // world units kept visible (camera zoom)

    // Hard-coded server location. The server's port is 8765 (see server.py).
    const SERVER_HOST = "192.168.0.12";
    const SERVER_PORT = 8765;

    const CSS = `
    .bh-hud{position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;
        color:#f2f3ff;-webkit-user-select:none;user-select:none;touch-action:none;}
    .bh-hud button{font-family:inherit;}
    .bh-top{position:absolute;top:0;left:0;right:0;display:flex;flex-direction:column;gap:6px;
        padding:8px 10px;background:linear-gradient(#0b1411cc,#0b141100);pointer-events:none;}
    .bh-targets{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;font-weight:700;}
    .bh-targets .lbl{opacity:.8;font-weight:600;}
    .bh-chip{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
        border-radius:9px;background:#ffffff1f;font-size:18px;position:relative;}
    .bh-chip.done{background:#39d98a33;outline:2px solid #39d98a;}
    .bh-chip.next{outline:2px dashed #ffd166;}
    .bh-chip .ord{position:absolute;top:-7px;left:-7px;width:16px;height:16px;border-radius:50%;
        background:#12121f;font-size:10px;line-height:16px;text-align:center;font-weight:800;}
    .bh-inv{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:36px;}
    .bh-inv .lbl{opacity:.8;font-size:12px;font-weight:600;}
    .bh-inv button{pointer-events:auto;width:34px;height:34px;border-radius:10px;border:none;
        background:#ffffff26;font-size:20px;cursor:pointer;padding:0;}
    .bh-inv button.target{box-shadow:inset 0 0 0 2px #39d98a;}
    .bh-inv button.held{outline:3px solid #ffd166;transform:translateY(-3px);background:#ffd16633;}
    .bh-empty{opacity:.55;font-size:12px;}
    .bh-hint{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);
        background:#12121fcc;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;
        white-space:nowrap;}
    .bh-dpad{position:absolute;left:14px;bottom:18px;width:150px;height:150px;pointer-events:none;}
    .bh-dpad button{position:absolute;width:50px;height:50px;border:none;border-radius:12px;
        background:#ffffff2b;color:#fff;font-size:22px;pointer-events:auto;cursor:pointer;
        display:flex;align-items:center;justify-content:center;}
    .bh-dpad button:active{background:#ffffff4d;}
    .bh-dpad .up{left:50px;top:0;}.bh-dpad .down{left:50px;top:100px;}
    .bh-dpad .left{left:0;top:50px;}.bh-dpad .right{left:100px;top:50px;}
    .bh-ready{position:absolute;right:16px;bottom:24px;pointer-events:auto;border:none;
        padding:14px 20px;border-radius:16px;font-size:16px;font-weight:800;cursor:pointer;
        background:#39d98a;color:#06281a;display:none;}
    .bh-ready.on{background:#ffd166;color:#3a2c00;}
    .bh-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        pointer-events:none;}
    .bh-card{pointer-events:auto;background:#12121fef;border:1px solid #ffffff1f;border-radius:18px;
        padding:22px;width:min(330px,86%);text-align:center;box-shadow:0 18px 50px #000a;}
    .bh-card h2{margin:0 0 6px;font-size:22px;}
    .bh-card p{margin:6px 0 14px;font-size:14px;opacity:.85;line-height:1.4;}
    .bh-errbody{text-align:left;font-size:13px;}
    .bh-errbody p{margin:6px 0;}
    .bh-list{text-align:left;margin:6px 0 12px;padding-left:18px;font-size:13px;opacity:.9;line-height:1.45;}
    .bh-list li{margin:4px 0;}
    .bh-addr{display:block;font-family:ui-monospace,Menlo,Consolas,monospace;background:#0c0c16;
        border:1px solid #ffffff26;border-radius:8px;padding:10px;word-break:break-all;font-size:14px;opacity:1;}
    a.bh-addr,a.bh-link{color:#9fc1ff;text-decoration:underline;cursor:pointer;}
    a.bh-addr{font-weight:700;border-color:#6c7bff66;}
    a.bh-addr:active,a.bh-link:active{color:#fff;}
    .bh-errbody code{background:#ffffff1f;padding:1px 5px;border-radius:5px;font-size:12px;}
    .bh-card input{width:100%;box-sizing:border-box;padding:11px;border-radius:11px;border:1px solid #ffffff33;
        background:#0c0c16;color:#fff;font-size:14px;margin-bottom:12px;}
    .bh-card .field-label{display:block;text-align:left;font-size:12px;opacity:.7;margin:0 0 4px;}
    .bh-btn{display:block;width:100%;border:none;padding:13px;border-radius:13px;font-size:16px;
        font-weight:800;cursor:pointer;background:#6c7bff;color:#fff;margin-top:6px;}
    .bh-btn.alt{background:#ffffff1f;}
    .bh-who{font-size:30px;margin-bottom:6px;}
    .bh-status{position:absolute;top:8px;right:10px;font-size:11px;opacity:.65;pointer-events:none;}
    .bh-hidden{display:none!important;}
    `;

    function defaultWsUrl() {
        // An https page can only use a secure socket (wss); http uses ws.
        // Host/port are hard-coded so it works wherever the page is opened from.
        const scheme = window.location.protocol === "https:" ? "wss" : "ws";
        return scheme + "://" + SERVER_HOST + ":" + SERVER_PORT + "/ws";
    }

    // Tappable links for the error/help cards.
    function addrLink(url) {
        return '<a class="bh-addr bh-link" href="' + url + '" target="_blank" rel="noopener">' + url + "</a>";
    }
    function inlineLink(url) {
        return '<a class="bh-link" href="' + url + '" target="_blank" rel="noopener">' + url + "</a>";
    }

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        const stage = canvas.parentElement;

        const profile = (window.SGStorage && SGStorage.getActiveProfile()) || null;
        const myName = profile ? profile.name : "Player";
        const myAvatar = profile ? profile.avatar : "\u{1F642}";

        let W = 0, H = 0, scale = 1, camX = 500, camY = 350, dpr = 1;
        let world = { w: 1000, h: 700 };
        let ws = null, myId = null, connected = false;
        let state = null;                  // latest shared state from server
        let me = { x: 500, y: 350 };       // locally predicted position
        let havePos = false;
        let captureTime = 3.0;

        let heldBugId = null;              // inventory item selected "in hand"
        let prevInvCount = 0;
        let lastWinner = null;
        const keys = { up: false, down: false, left: false, right: false };
        let lastMoveSent = 0, rafId = null, lastTs = 0;

        // ---- HUD DOM ----------------------------------------------------- //
        let hud, elTargets, elInv, elHint, elReady, elCenter, elStatus;

        function injectStyle() {
            if (document.getElementById(STYLE_ID)) return;
            const s = document.createElement("style");
            s.id = STYLE_ID;
            s.textContent = CSS;
            document.head.appendChild(s);
        }

        function buildHud() {
            hud = document.createElement("div");
            hud.className = "bh-hud";
            hud.innerHTML =
                '<div class="bh-top">' +
                '  <div class="bh-targets"></div>' +
                '  <div class="bh-inv"></div>' +
                '</div>' +
                '<div class="bh-status">connecting…</div>' +
                '<div class="bh-hint bh-hidden"></div>' +
                '<div class="bh-dpad">' +
                '  <button class="up" data-dir="up">▲</button>' +
                '  <button class="down" data-dir="down">▼</button>' +
                '  <button class="left" data-dir="left">◀</button>' +
                '  <button class="right" data-dir="right">▶</button>' +
                '</div>' +
                '<button class="bh-ready">I\'m ready</button>' +
                '<div class="bh-center"></div>';
            stage.appendChild(hud);
            elTargets = hud.querySelector(".bh-targets");
            elInv = hud.querySelector(".bh-inv");
            elHint = hud.querySelector(".bh-hint");
            elReady = hud.querySelector(".bh-ready");
            elCenter = hud.querySelector(".bh-center");
            elStatus = hud.querySelector(".bh-status");

            hud.querySelectorAll(".bh-dpad button").forEach((b) => {
                const dir = b.dataset.dir;
                const down = (e) => { e.preventDefault(); keys[dir] = true; };
                const up = (e) => { e.preventDefault(); keys[dir] = false; };
                b.addEventListener("pointerdown", down);
                b.addEventListener("pointerup", up);
                b.addEventListener("pointerleave", up);
                b.addEventListener("pointercancel", up);
            });

            elReady.addEventListener("click", () => {
                const meP = myPlayer();
                send({ type: "ready", value: !(meP && meP.ready) });
                SGSound.play("tap");
            });
        }

        // Hide the on-screen controls while a card (join/error) is showing, so
        // they can't sit on top of buttons or links the player needs to tap.
        function setControls(visible) {
            const dp = hud && hud.querySelector(".bh-dpad");
            if (dp) dp.classList.toggle("bh-hidden", !visible);
        }

        function showJoin() {
            setControls(false);
            elCenter.innerHTML =
                '<div class="bh-card">' +
                '  <div class="bh-who">' + myAvatar + "</div>" +
                '  <h2>Bug Hunt</h2>' +
                '  <p>Catch your 4 bugs in the right order. Search logs, trees and tall grass — the first to fill the bar nabs the bug!</p>' +
                '  <span class="field-label">Server</span>' +
                '  <input class="bh-server" type="text" autocomplete="off" />' +
                '  <button class="bh-btn bh-join">Join as ' + myName + "</button>" +
                '</div>';
            const input = elCenter.querySelector(".bh-server");
            input.value = defaultWsUrl();
            elCenter.querySelector(".bh-join").addEventListener("click", () => {
                SGSound.unlock();
                SGSound.play("tap");
                connect(input.value.trim() || defaultWsUrl());
            });
        }

        function clearCenter() { elCenter.innerHTML = ""; }

        function showError(title, htmlBody) {
            setControls(false);
            elStatus.textContent = "offline";
            elCenter.innerHTML =
                '<div class="bh-card">' +
                '  <h2>' + title + "</h2>" +
                '  <div class="bh-errbody">' + htmlBody + "</div>" +
                '  <button class="bh-btn bh-retry">Try again</button>' +
                "</div>";
            elCenter.querySelector(".bh-retry").addEventListener("click", showJoin);
        }

        // ---- networking -------------------------------------------------- //
        let connectTimer = null;

        function connect(url) {
            clearCenter();
            elStatus.textContent = "connecting…";

            // An https page can't open an insecure ws:// (mixed content). With the
            // default URL this never happens (https -> wss), but guard a manual one.
            if (window.location.protocol === "https:" && url.indexOf("ws://") === 0) {
                showError("Can't connect (https blocks ws://)",
                    "<p>This page is <b>https</b>, so it can't use an insecure " +
                    "<code>ws://</code> connection.</p>" +
                    "<p>Either use a <code>wss://</code> address, or simply open the game " +
                    "over http (tap to open):</p>" +
                    addrLink("http://" + SERVER_HOST + ":" + SERVER_PORT));
                return;
            }

            try {
                ws = new WebSocket(url);
            } catch (e) {
                showError("That address didn't work", "<p>" + e.message + "</p>");
                return;
            }

            // If it neither opens nor closes, it's almost always a firewall, a
            // wrong IP, or (for wss) an untrusted certificate.
            clearTimeout(connectTimer);
            connectTimer = setTimeout(() => {
                if (ws && ws.readyState === WebSocket.CONNECTING) {
                    try { ws.close(); } catch (e) { /* ignore */ }
                    showError("Couldn't reach the server", causes(url));
                }
            }, 8000);

            ws.addEventListener("open", () => {
                clearTimeout(connectTimer);
                connected = true;
                elStatus.textContent = "connected";
                send({ type: "join", name: myName, avatar: myAvatar });
            });
            ws.addEventListener("message", (ev) => onMessage(ev.data));
            ws.addEventListener("close", (ev) => {
                clearTimeout(connectTimer);
                connected = false;
                elStatus.textContent = "offline";
                if (!hud) return;
                if (myId) {
                    showError("Disconnected", "<p>Lost contact with the server" +
                        (ev && ev.code ? " (code " + ev.code + ")" : "") + ".</p>");
                } else {
                    showError("Couldn't reach the server", causes(url));
                }
            });
            ws.addEventListener("error", () => {
                // The error event carries no detail; the close handler shows why.
                elStatus.textContent = "error";
            });
        }

        function causes(url) {
            return url.indexOf("wss://") === 0 ? secureCauses(url) : commonCauses(url);
        }

        function commonCauses(url) {
            return "<p>Tried to reach:</p>" +
                "<p class=\"bh-addr\">" + url + "</p>" +
                "<p>Check that:</p>" +
                "<ul class=\"bh-list\">" +
                "<li>the server (<code>server.py</code>) is running</li>" +
                "<li>this device is on the <b>same Wi‑Fi</b> as the server</li>" +
                "<li>the address above is the server's current IP</li>" +
                "<li>the server PC's <b>firewall</b> allows port " + SERVER_PORT +
                " (Windows often blocks it the first time — click <i>Allow access</i> on the popup, or allow Python on Private networks)</li>" +
                "</ul>";
        }

        function secureCauses(url) {
            const https = "https://" + SERVER_HOST + ":" + SERVER_PORT;
            const http = "http://" + SERVER_HOST + ":" + SERVER_PORT;
            return "<p>This page is <b>https</b>, so the game must use a secure " +
                "connection:</p>" +
                "<p class=\"bh-addr\">" + url + "</p>" +
                "<p>To allow it on this device:</p>" +
                "<ol class=\"bh-list\">" +
                "<li>start the server with <code>python server.py --https</code></li>" +
                "<li>open " + inlineLink(https) + " in <b>this</b> browser</li>" +
                "<li>tap <b>Advanced</b> → <b>Proceed / Visit anyway</b> to trust the " +
                "certificate (it's your own server)</li>" +
                "<li>come back here and tap <b>Try again</b></li>" +
                "</ol>" +
                "<p><b>Easier:</b> skip certificates and open the game over http " +
                "(tap to open):</p>" +
                addrLink(http);
        }

        function send(obj) {
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
        }

        function onMessage(raw) {
            let msg;
            try { msg = JSON.parse(raw); } catch (e) { return; }
            if (msg.type === "welcome") {
                myId = msg.id;
                world = msg.world || world;
                clearCenter();
                setControls(true);
            } else if (msg.type === "state") {
                applyState(msg);
            }
        }

        function applyState(s) {
            state = s;
            world = s.world || world;
            captureTime = s.captureTime || captureTime;

            // Seed our local position once from the server's copy.
            if (!havePos) {
                const mine = (s.players || []).find((p) => p.id === myId);
                if (mine) { me.x = mine.x; me.y = mine.y; havePos = true; }
            }

            // Capture / win feedback.
            const you = s.you || {};
            const inv = you.inventory || [];
            if (inv.length > prevInvCount) {
                SGSound.play("eat");
                host.vibrate(20);
            }
            prevInvCount = inv.length;
            host.setScore((you.progress || 0) + "/" + (you.targets ? you.targets.length : 4));

            if (s.phase === "won" && lastWinner !== s.winnerName) {
                lastWinner = s.winnerName;
                const iWon = you.id && (s.players || []).some((p) => p.id === you.id && p.won);
                SGSound.play(iWon ? "highscore" : "gameover");
                host.vibrate(iWon ? [20, 40, 20, 40, 60] : 40);
            }
            if (s.phase === "playing") lastWinner = null;

            renderHud();
        }

        function myPlayer() {
            if (!state) return null;
            return (state.players || []).find((p) => p.id === myId) || null;
        }

        // ---- HUD rendering ----------------------------------------------- //
        function renderHud() {
            if (!state) return;
            const you = state.you || {};
            const targets = you.targets || [];
            const progress = you.progress || 0;

            let th = '<span class="lbl">Catch in order:</span>';
            targets.forEach((t, i) => {
                let cls = "bh-chip";
                if (i < progress) cls += " done";
                else if (i === progress) cls += " next";
                th += '<span class="' + cls + '"><span class="ord">' + (i + 1) + "</span>" +
                    (i < progress ? "✅" : t.emoji) + "</span>";
            });
            elTargets.innerHTML = th;

            const inv = you.inventory || [];
            if (inv.length === 0) {
                elInv.innerHTML = '<span class="lbl">Bag:</span><span class="bh-empty">empty — go catch some bugs!</span>';
            } else {
                let ih = '<span class="lbl">Bag:</span>';
                inv.forEach((it) => {
                    let cls = "";
                    if (it.isTarget) cls += " target";
                    if (it.bugId === heldBugId) cls += " held";
                    ih += '<button class="' + cls.trim() + '" data-bug="' + it.bugId + '">' + it.emoji + "</button>";
                });
                elInv.innerHTML = ih;
                elInv.querySelectorAll("button").forEach((b) => {
                    b.addEventListener("click", () => {
                        const id = b.dataset.bug;
                        heldBugId = (heldBugId === id) ? null : id;
                        SGSound.play("flip");
                        updateHint();
                        renderHud();
                    });
                });
            }
            updateHint();

            // Win banner + ready button.
            if (state.phase === "won") {
                elReady.style.display = "block";
                const meP = myPlayer();
                elReady.classList.toggle("on", !!(meP && meP.ready));
                elReady.textContent = meP && meP.ready ? "Ready! ✔" : "I'm ready";
                if (!elCenter.querySelector(".bh-win")) {
                    const iWon = (state.players || []).some((p) => p.id === myId && p.won);
                    elCenter.innerHTML =
                        '<div class="bh-card bh-win">' +
                        '  <h2>' + (iWon ? "\u{1F389} You win!" : "\u{1F3C6} " + state.winnerName + " wins!") + "</h2>" +
                        '  <p>New round in <span class="bh-count">' + Math.ceil(state.resetTimer) + "</span>s." +
                        " Tap <b>I'm ready</b> to start sooner.</p>" +
                        "</div>";
                }
                const c = elCenter.querySelector(".bh-count");
                if (c) c.textContent = Math.ceil(state.resetTimer);
            } else {
                elReady.style.display = "none";
                const win = elCenter.querySelector(".bh-win");
                if (win) clearCenter();
            }
        }

        function updateHint() {
            if (heldBugId) {
                const you = state ? state.you || {} : {};
                const it = (you.inventory || []).find((x) => x.bugId === heldBugId);
                elHint.textContent = "Holding " + (it ? it.emoji : "") + " — tap the field to let it go";
                elHint.classList.remove("bh-hidden");
            } else {
                elHint.classList.add("bh-hidden");
            }
        }

        // ---- input ------------------------------------------------------- //
        function onKeyDown(e) {
            const k = e.key.toLowerCase();
            if (k === "arrowup" || k === "w") keys.up = true;
            else if (k === "arrowdown" || k === "s") keys.down = true;
            else if (k === "arrowleft" || k === "a") keys.left = true;
            else if (k === "arrowright" || k === "d") keys.right = true;
            else return;
            e.preventDefault();
        }
        function onKeyUp(e) {
            const k = e.key.toLowerCase();
            if (k === "arrowup" || k === "w") keys.up = false;
            else if (k === "arrowdown" || k === "s") keys.down = false;
            else if (k === "arrowleft" || k === "a") keys.left = false;
            else if (k === "arrowright" || k === "d") keys.right = false;
        }

        function canvasToWorld(clientX, clientY) {
            const rect = canvas.getBoundingClientRect();
            const cx = clientX - rect.left;
            const cy = clientY - rect.top;
            return { x: (cx - W / 2) / scale + camX, y: (cy - H / 2) / scale + camY };
        }

        function onFieldTap(e) {
            if (!heldBugId) return;            // taps only matter when holding a bug
            const src = e.changedTouches ? e.changedTouches[0] : e;
            const p = canvasToWorld(src.clientX, src.clientY);
            p.x = Math.max(20, Math.min(world.w - 20, p.x));
            p.y = Math.max(20, Math.min(world.h - 20, p.y));
            send({ type: "release", bugId: heldBugId, x: p.x, y: p.y });
            SGSound.play("drop");
            host.vibrate(15);
            heldBugId = null;
            updateHint();
        }

        // ---- simulation + render loop ------------------------------------ //
        function resize() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth;
            H = canvas.clientHeight;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // Zoom so a comfortable window of the world fills the screen (no bars).
            scale = Math.max(W / VIEW_W, H / VIEW_H);
        }

        function updateCamera() {
            const halfW = (W / scale) / 2, halfH = (H / scale) / 2;
            const cx = havePos ? me.x : world.w / 2;
            const cy = havePos ? me.y : world.h / 2;
            camX = world.w <= halfW * 2 ? world.w / 2 : Math.max(halfW, Math.min(world.w - halfW, cx));
            camY = world.h <= halfH * 2 ? world.h / 2 : Math.max(halfH, Math.min(world.h - halfH, cy));
        }

        function step(dt) {
            if (state && state.phase === "playing" && connected && havePos) {
                let vx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
                let vy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
                if (vx || vy) {
                    const len = Math.hypot(vx, vy) || 1;
                    me.x += (vx / len) * PLAYER_SPEED * dt;
                    me.y += (vy / len) * PLAYER_SPEED * dt;
                    me.x = Math.max(16, Math.min(world.w - 16, me.x));
                    me.y = Math.max(16, Math.min(world.h - 16, me.y));
                    const now = performance.now();
                    if (now - lastMoveSent > MOVE_SEND_MS) {
                        send({ type: "move", x: me.x, y: me.y });
                        lastMoveSent = now;
                    }
                }
            }
        }

        function wx(x) { return (x - camX) * scale + W / 2; }
        function wy(y) { return (y - camY) * scale + H / 2; }

        function drawSpot(s, t) {
            const x = wx(s.x), y = wy(s.y);
            const wob = s.rustle > 0 ? Math.sin(t * 30) * 3 * s.rustle : 0;
            ctx.save();
            ctx.translate(x + wob, y);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const fs = Math.max(26, 34 * scale);
            ctx.font = fs + "px system-ui, sans-serif";
            let glyph = "\u{1FAB5}";                 // log
            if (s.type === "tree") glyph = "\u{1F333}";
            else if (s.type === "grass") glyph = "\u{1F33F}";
            ctx.globalAlpha = 0.95;
            ctx.fillText(glyph, 0, 0);
            ctx.restore();
        }

        function drawBug(b, t) {
            const x = wx(b.x), y = wy(b.y);
            const bob = Math.sin(t * 8 + b.x) * 2;
            ctx.save();
            ctx.translate(x, y + bob);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = Math.max(20, 26 * scale) + "px system-ui, sans-serif";
            ctx.fillText(b.emoji, 0, 0);
            if (b.cap && b.cap.p > 0.02) {
                const bw = 40, bh = 6, by = -24;
                ctx.fillStyle = "#0009";
                ctx.fillRect(-bw / 2, by, bw, bh);
                ctx.fillStyle = b.cap.by === myId ? "#39d98a" : "#ffd166";
                ctx.fillRect(-bw / 2, by, bw * b.cap.p, bh);
            }
            ctx.restore();
        }

        function drawPlayer(p) {
            const x = wx(p.x), y = wy(p.y);
            const mine = p.id === myId;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fillStyle = mine ? "#6c7bffcc" : "#ffffff33";
            ctx.fill();
            if (mine) { ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke(); }
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "22px system-ui, sans-serif";
            ctx.fillText(p.avatar, x, y + 1);
            ctx.font = "700 12px system-ui, sans-serif";
            ctx.fillStyle = "#fff";
            ctx.fillText(p.name + (mine ? " (you)" : ""), x, y - 28);
            ctx.restore();
        }

        function draw(t) {
            updateCamera();

            // Everything outside the field.
            ctx.fillStyle = "#0e1f14";
            ctx.fillRect(0, 0, W, H);

            // The grassy field (only the camera's window of it shows).
            const gx = wx(0), gy = wy(0), gw = world.w * scale, gh = world.h * scale;
            const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
            g.addColorStop(0, "#23502f");
            g.addColorStop(1, "#173a22");
            ctx.fillStyle = g;
            ctx.fillRect(gx, gy, gw, gh);

            // Faint grid so movement is readable as the camera pans.
            ctx.strokeStyle = "#ffffff0f";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= world.w; x += 100) { ctx.moveTo(wx(x), gy); ctx.lineTo(wx(x), gy + gh); }
            for (let y = 0; y <= world.h; y += 100) { ctx.moveTo(gx, wy(y)); ctx.lineTo(gx + gw, wy(y)); }
            ctx.stroke();

            // Field border.
            ctx.strokeStyle = "#ffffff24";
            ctx.lineWidth = 3;
            ctx.strokeRect(gx, gy, gw, gh);

            if (!state) return;
            for (const s of state.spots || []) drawSpot(s, t);
            for (const b of state.bugs || []) drawBug(b, t);
            for (const p of state.players || []) {
                // Draw my predicted position instead of the server's older copy.
                if (p.id === myId && havePos) drawPlayer({ ...p, x: me.x, y: me.y });
                else drawPlayer(p);
            }
        }

        function loop(ts) {
            rafId = requestAnimationFrame(loop);
            if (!lastTs) lastTs = ts;
            const dt = Math.min((ts - lastTs) / 1000, 0.05);
            lastTs = ts;
            step(dt);
            draw(ts / 1000);
        }

        return {
            start() {
                injectStyle();
                buildHud();
                resize();
                window.addEventListener("resize", resize);
                window.addEventListener("keydown", onKeyDown);
                window.addEventListener("keyup", onKeyUp);
                canvas.addEventListener("pointerdown", onFieldTap);
                showJoin();
                rafId = requestAnimationFrame(loop);
            },
            restart() {
                // Standard "play again" just reopens the join panel.
                heldBugId = null;
                havePos = false;
                if (ws) { try { ws.close(); } catch (e) { /* ignore */ } ws = null; }
                showJoin();
            },
            destroy() {
                cancelAnimationFrame(rafId);
                window.removeEventListener("resize", resize);
                window.removeEventListener("keydown", onKeyDown);
                window.removeEventListener("keyup", onKeyUp);
                canvas.removeEventListener("pointerdown", onFieldTap);
                if (ws) { try { ws.close(); } catch (e) { /* ignore */ } ws = null; }
                if (hud && hud.parentElement) hud.parentElement.removeChild(hud);
                const st = document.getElementById(STYLE_ID);
                if (st) st.remove();
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.bughunt = {
        id: "bughunt",
        name: "Bug Hunt",
        emoji: "\u{1F41B}",
        tag: "Same-Wi-Fi multiplayer. Catch your bugs in order!",
        scoreLabel: "bugs",
        create: create
    };
})();
