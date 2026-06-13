/* ============ Simple Games — app shell ============ */
(function () {
    "use strict";

    const AVATARS = [
        "\u{1F436}", "\u{1F431}", "\u{1F98A}", "\u{1F43C}", "\u{1F428}", "\u{1F435}",
        "\u{1F984}", "\u{1F438}", "\u{1F427}", "\u{1F989}", "\u{1F419}", "\u{1F99D}",
        "\u{1F480}", "\u{1F47D}", "\u{1F916}", "\u{1F9A9}", "\u{1F996}", "\u{1F409}"
    ];

    const GAME_ORDER = [
        "snake", "astro", "piestack", "flappy", "moles", "memory",
        "echo", "bricks", "hopper", "fruit", "tiles", "colorrush",
        "beatloop", "taptiles", "stopspin", "lanedash", "stormquest", "sentry"
    ];

    const $ = (sel) => document.querySelector(sel);

    const screens = {
        profiles: $("#screen-profiles"),
        profileEdit: $("#screen-profile-edit"),
        home: $("#screen-home"),
        game: $("#screen-game")
    };

    let editingProfileId = null;
    let selectedAvatar = AVATARS[0];
    let kidsModeSelected = false;
    let currentGameDef = null;
    let currentGame = null;
    let deleteArmed = false;

    /* ---------- Navigation ---------- */
    function show(name) {
        Object.values(screens).forEach(s => s.classList.add("hidden"));
        screens[name].classList.remove("hidden");
    }

    function vibrate(pattern) {
        if (navigator.vibrate) navigator.vibrate(pattern);
    }

    function toast(msg) {
        const el = $("#toast");
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.remove("show"), 2400);
    }

    /* ---------- Profiles screen ---------- */
    function renderProfiles() {
        const list = $("#profile-list");
        list.innerHTML = "";
        const profiles = SGStorage.getProfiles();

        if (profiles.length === 0) {
            const hint = document.createElement("p");
            hint.className = "empty-hint";
            hint.textContent = "No players yet.\nCreate a profile to start playing!";
            list.appendChild(hint);
            return;
        }

        for (const p of profiles) {
            const row = document.createElement("div");
            row.className = "profile-row";

            const btn = document.createElement("button");
            btn.className = "profile-btn";
            btn.innerHTML =
                '<span class="profile-avatar"></span>' +
                '<span class="profile-info">' +
                '<span class="profile-name"></span>' +
                '<span class="profile-meta"></span>' +
                "</span>";
            btn.querySelector(".profile-avatar").textContent = p.avatar;
            btn.querySelector(".profile-name").textContent = p.name;
            btn.querySelector(".profile-meta").textContent = totalScoreLabel(p);
            btn.addEventListener("click", () => {
                SGStorage.setActiveProfile(p.id);
                vibrate(10);
                renderHome();
                show("home");
            });

            const edit = document.createElement("button");
            edit.className = "btn btn-icon btn-ghost";
            edit.setAttribute("aria-label", "Edit " + p.name);
            edit.textContent = "\u270F\uFE0F";
            edit.addEventListener("click", (e) => {
                e.stopPropagation();
                openProfileEditor(p.id);
            });

            row.appendChild(btn);
            row.appendChild(edit);
            list.appendChild(row);
        }
    }

    function totalScoreLabel(profile) {
        const scores = SGStorage.getScores(profile.id);
        const parts = [];
        for (const id of GAME_ORDER) {
            if (scores[id]) {
                const def = SGGames[id];
                parts.push(def.emoji + " " + scores[id]);
            }
        }
        return parts.length ? "Best: " + parts.join("   ") : "New player";
    }

    /* ---------- Profile editor ---------- */
    function openProfileEditor(profileId) {
        editingProfileId = profileId;
        deleteArmed = false;
        const profile = profileId ? SGStorage.getProfile(profileId) : null;

        $("#profile-edit-title").textContent = profile ? "Edit Player" : "New Player";
        $("#profile-name").value = profile ? profile.name : "";
        selectedAvatar = profile ? profile.avatar : AVATARS[Math.floor(Math.random() * AVATARS.length)];
        kidsModeSelected = profile ? !!profile.kids : false;

        const del = $("#btn-delete-profile");
        del.classList.toggle("hidden", !profile);
        del.textContent = "Delete Player";
        del.classList.remove("confirm");

        renderAvatarGrid();
        renderKidsToggle();
        show("profileEdit");
        if (!profile) {
            setTimeout(() => $("#profile-name").focus(), 250);
        }
    }

    function renderAvatarGrid() {
        const grid = $("#avatar-grid");
        grid.innerHTML = "";
        for (const a of AVATARS) {
            const b = document.createElement("button");
            b.className = "avatar-option" + (a === selectedAvatar ? " selected" : "");
            b.textContent = a;
            b.setAttribute("aria-label", "Avatar " + a);
            b.addEventListener("click", () => {
                selectedAvatar = a;
                vibrate(8);
                renderAvatarGrid();
            });
            grid.appendChild(b);
        }
    }

    function renderKidsToggle() {
        $("#btn-kids-toggle").setAttribute("aria-pressed", kidsModeSelected ? "true" : "false");
    }

    function saveProfile() {
        const name = $("#profile-name").value.trim();
        if (!name) {
            toast("Give your player a name!");
            $("#profile-name").focus();
            return;
        }
        if (editingProfileId) {
            SGStorage.updateProfile(editingProfileId, name, selectedAvatar, kidsModeSelected);
        } else {
            const p = SGStorage.createProfile(name, selectedAvatar, kidsModeSelected);
            SGStorage.setActiveProfile(p.id);
            renderHome();
            show("home");
            toast("Welcome, " + name + "!");
            return;
        }
        renderProfiles();
        show("profiles");
    }

    /* ---------- Home screen ---------- */
    function renderHome() {
        const profile = SGStorage.getActiveProfile();
        if (!profile) {
            show("profiles");
            return;
        }
        $("#chip-avatar").textContent = profile.avatar;
        $("#chip-name").textContent = profile.name;

        const grid = $("#game-grid");
        grid.innerHTML = "";
        for (const id of GAME_ORDER) {
            const def = SGGames[id];
            if (!def) continue;
            const best = SGStorage.getBestScore(profile.id, id);
            const card = document.createElement("button");
            card.className = "game-card";
            card.innerHTML =
                '<span class="game-emoji"></span>' +
                '<span class="game-name"></span>' +
                '<span class="game-tag"></span>' +
                '<span class="game-best"></span>';
            card.querySelector(".game-emoji").textContent = def.emoji;
            card.querySelector(".game-name").textContent = def.name;
            card.querySelector(".game-tag").textContent = def.tag;
            card.querySelector(".game-best").textContent = best > 0 ? "\u2B50 Best: " + best : "Not played yet";
            card.addEventListener("click", () => startGame(id));
            grid.appendChild(card);
        }
    }

    /* ---------- Game hosting ---------- */
    const gameHost = {
        canvas: null,
        kids: false,
        setScore(score) {
            $("#game-score").textContent = score;
        },
        vibrate: vibrate,
        gameOver(score) {
            const profile = SGStorage.getActiveProfile();
            const isNewBest = profile ? SGStorage.submitScore(profile.id, currentGameDef.id, score) : false;
            const best = profile ? SGStorage.getBestScore(profile.id, currentGameDef.id) : score;

            SGSound.play(isNewBest ? "highscore" : "gameover");
            $("#overlay-emoji").textContent = isNewBest ? "\u{1F3C6}" : currentGameDef.emoji;
            $("#overlay-title").textContent = isNewBest ? "New Best!" : "Game Over";
            $("#overlay-text").textContent =
                "You scored " + score + " " + currentGameDef.scoreLabel + ".\nBest: " + best;
            $("#overlay-badge").classList.toggle("hidden", !isNewBest);
            $("#game-overlay").classList.remove("hidden");
        }
    };

    function startGame(gameId) {
        const def = SGGames[gameId];
        if (!def) return;
        currentGameDef = def;

        const profile = SGStorage.getActiveProfile();
        gameHost.kids = profile ? !!profile.kids : false;

        SGSound.unlock();
        SGSound.play("tap");
        $("#game-title").textContent = def.emoji + " " + def.name;
        $("#game-kids-badge").classList.toggle("hidden", !gameHost.kids);
        gameHost.setScore(0);
        updateGameBestLabel();
        $("#game-overlay").classList.add("hidden");
        show("game");
        vibrate(10);

        gameHost.canvas = $("#game-canvas");
        // Wait one frame so layout settles before the game measures the canvas.
        requestAnimationFrame(() => {
            currentGame = def.create(gameHost);
            currentGame.start();
        });
    }

    function updateGameBestLabel() {
        const profile = SGStorage.getActiveProfile();
        const best = profile ? SGStorage.getBestScore(profile.id, currentGameDef.id) : 0;
        $("#game-best").textContent = "Best " + best;
    }

    function stopGame() {
        if (currentGame) {
            currentGame.destroy();
            currentGame = null;
        }
        currentGameDef = null;
    }

    function exitToHome() {
        stopGame();
        $("#game-overlay").classList.add("hidden");
        renderHome();
        show("home");
    }

    /* ---------- Wire up events ---------- */
    $("#btn-add-profile").addEventListener("click", () => openProfileEditor(null));
    $("#btn-cancel-profile").addEventListener("click", () => {
        renderProfiles();
        show("profiles");
    });
    $("#btn-save-profile").addEventListener("click", saveProfile);
    $("#btn-kids-toggle").addEventListener("click", function () {
        kidsModeSelected = !kidsModeSelected;
        renderKidsToggle();
        vibrate(8);
        SGSound.play("tap");
    });
    $("#profile-name").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveProfile(); }
    });

    $("#btn-delete-profile").addEventListener("click", function () {
        if (!deleteArmed) {
            deleteArmed = true;
            this.textContent = "Tap again to confirm";
            this.classList.add("confirm");
            return;
        }
        SGStorage.deleteProfile(editingProfileId);
        renderProfiles();
        show("profiles");
        toast("Player deleted");
    });

    $("#btn-switch-profile").addEventListener("click", () => {
        SGStorage.clearActiveProfile();
        renderProfiles();
        show("profiles");
    });

    $("#btn-exit-game").addEventListener("click", exitToHome);
    $("#btn-overlay-home").addEventListener("click", exitToHome);
    $("#btn-overlay-retry").addEventListener("click", () => {
        $("#game-overlay").classList.add("hidden");
        updateGameBestLabel();
        gameHost.setScore(0);
        SGSound.play("tap");
        if (currentGame) currentGame.restart();
    });

    /* ---------- Sound toggle ---------- */
    function renderSoundButton() {
        $("#btn-sound").textContent = SGSound.isEnabled() ? "\u{1F50A}" : "\u{1F507}";
    }
    $("#btn-sound").addEventListener("click", () => {
        const on = SGSound.toggle();
        renderSoundButton();
        if (on) SGSound.play("tap");
        toast(on ? "Sound on" : "Sound off");
    });
    renderSoundButton();

    // Mobile browsers require a user gesture before audio can start.
    document.addEventListener("touchstart", () => SGSound.unlock(), { once: true, passive: true });
    document.addEventListener("mousedown", () => SGSound.unlock(), { once: true });

    // Prevent double-tap zoom on iOS.
    let lastTouchEnd = 0;
    document.addEventListener("touchend", (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 320) e.preventDefault();
        lastTouchEnd = now;
    }, { passive: false });

    /* ---------- Service worker & updates ---------- */
    function showUpdatePrompt(worker) {
        const banner = $("#update-banner");
        banner.classList.remove("hidden");
        $("#btn-update-now").onclick = () => {
            banner.classList.add("hidden");
            // Tell the waiting worker to activate; controllerchange then reloads.
            worker.postMessage({ type: "SKIP_WAITING" });
        };
        $("#btn-update-later").onclick = () => banner.classList.add("hidden");
    }

    if ("serviceWorker" in navigator) {
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            location.reload();
        });

        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").then((reg) => {
                // An update was already downloaded on a previous visit.
                if (reg.waiting) showUpdatePrompt(reg.waiting);

                // An update is found while the app is open.
                reg.addEventListener("updatefound", () => {
                    const worker = reg.installing;
                    if (!worker) return;
                    worker.addEventListener("statechange", () => {
                        if (worker.state === "installed" && navigator.serviceWorker.controller) {
                            showUpdatePrompt(worker);
                        }
                    });
                });

                // Re-check whenever the app comes back to the foreground.
                document.addEventListener("visibilitychange", () => {
                    if (document.visibilityState === "visible") {
                        reg.update().catch(() => { /* offline is fine */ });
                    }
                });
            }).catch(err => {
                console.warn("Service worker registration failed:", err);
            });
        });
    }

    /* ---------- Boot ---------- */
    const active = SGStorage.getActiveProfile();
    if (active) {
        renderHome();
        show("home");
    } else {
        renderProfiles();
        show("profiles");
    }
})();
