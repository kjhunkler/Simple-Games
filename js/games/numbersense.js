/* ============ Number Sense — count, match, and grow to thirty ============ */
(function () {
    "use strict";

    const RANGES = [
        { label: "1–5", targets: [3, 5] },
        { label: "1–10", targets: [6, 8, 10] },
        { label: "11–20", targets: [11, 15, 20] },
        { label: "21–30", targets: [21, 25, 30] }
    ];
    const COLORS = ["#39d0ff", "#ff7bd5", "#ffd166"];

    function create(host) {
        const canvas = host.canvas;
        const ctx = canvas.getContext("2d");
        let W, H, buttons = [], phase = "menu", range = 0, round = 0;
        let target = 3, count = 0, page = 0, marks = [], choices = [];
        let score = 0, solved = false, hint = false, finale = false;
        let destroyed = false, ended = false, announcement = "";

        function cancelSpeech() {
            try {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
            } catch (e) { /* Speech is optional on this device. */ }
        }

        function say(text) {
            announcement = text;
            cancelSpeech();
            try {
                if (destroyed || !SGSound.isEnabled() || !window.speechSynthesis) return;
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = "en-US";
                utterance.rate = 0.8;
                window.speechSynthesis.speak(utterance);
            } catch (e) { /* Visual prompts work without a speech engine. */ }
        }

        function credit() {
            score++;
            host.setScore(score);
            SGSound.play("match");
            host.vibrate(12);
        }

        function makeChoices() {
            const start = Math.max(1, Math.min(28, target - 1));
            choices = [start, start + 1, start + 2];
            for (let i = choices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [choices[i], choices[j]] = [choices[j], choices[i]];
            }
        }

        function beginCounting() {
            phase = "count";
            count = 0;
            page = 0;
            marks = Array(target).fill(0);
            solved = false;
            hint = false;
            say(finale ? "Let's count all the way to thirty! Tap each dot once."
                : "Let's count together. Tap each dot once.");
            draw();
        }

        function chooseRange(index) {
            range = index;
            round = 0;
            finale = index === RANGES.length;
            target = finale ? 30 : RANGES[range].targets[round];
            beginCounting();
        }

        function menu() {
            phase = "menu";
            say("Let's count! Start with one to five, or choose another number group.");
            draw();
        }

        function nextActivity() {
            if (phase === "count") {
                if (count < target) {
                    page++;
                    say(count + " so far. Let's keep counting.");
                } else if (finale) {
                    phase = "celebrate";
                    SGSound.play("perfect");
                    say("You counted to thirty! Wonderful counting!");
                } else {
                    phase = "total";
                    solved = false;
                    hint = false;
                    makeChoices();
                    say("How many dots altogether? Tap the number.");
                }
            } else if (phase === "total") {
                phase = "next";
                solved = false;
                hint = false;
                makeChoices();
                say((target - 2) + ", " + (target - 1) + ". What comes next?");
            } else if (phase === "next") {
                round++;
                if (round >= RANGES[range].targets.length) {
                    range++;
                    round = 0;
                }
                finale = range === RANGES.length;
                target = finale ? 30 : RANGES[range].targets[round];
                beginCounting();
                return;
            }
            draw();
        }

        function countDot(index) {
            if (marks[index]) return;
            count++;
            marks[index] = count;
            if (count === target) credit();
            else SGSound.play("tap");
            say(String(count));
            draw();
        }

        function answer(value) {
            if (solved) return;
            if (value === target) {
                solved = true;
                credit();
                say(phase === "total" ? "Yes! " + target + " dots altogether."
                    : "Yes! " + (target - 1) + ", " + target + "!");
            } else {
                hint = true;
                say(phase === "total" ? "Let's try again. We counted " + target + " dots."
                    : "Let's count together. " + (target - 2) + ", " + (target - 1) + ", " + target + ".");
            }
            draw();
        }

        function text(label, x, y, size, color, maxWidth) {
            ctx.fillStyle = color || "#f2f3ff";
            ctx.font = "700 " + size + "px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, x, y, maxWidth || W - 24);
        }

        function panel(x, y, w, h, color) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 14);
            ctx.fill();
        }

        function button(label, x, y, w, h, action, highlighted) {
            panel(x, y, w, h, highlighted ? "#ffd166" : "#2c2c52");
            text(label, x + w / 2, y + h / 2, 23, highlighted ? "#12121f" : "#f2f3ff", w - 12);
            buttons.push({ x, y, w, h, action });
        }

        function drawMenu() {
            text("Let's count!", W / 2, 86, 30);
            text("Start with 1–5 • grow to 30", W / 2, 120, 17, "#9aa0c3");
            const gap = 12, width = (W - 36) / 2;
            const height = Math.max(48, Math.min(76, (H - 220) / 3));
            RANGES.forEach((item, i) => {
                button((i === 0 ? "▶ " : "") + item.label,
                    12 + (i % 2) * (width + gap), 150 + Math.floor(i / 2) * (height + gap),
                    width, height, () => chooseRange(i), i === 0);
            });
            button("★ 1–30", 12, 150 + 2 * (height + gap), W - 24, height,
                () => chooseRange(RANGES.length), false);
        }

        function drawGroups(y) {
            const groups = Math.ceil(target / 10);
            const width = Math.min(100, (W - 32) / groups);
            for (let g = 0; g < groups; g++) {
                const size = Math.min(10, target - g * 10);
                const done = marks.slice(g * 10, g * 10 + size).filter(Boolean).length;
                const x = (W - groups * width) / 2 + g * width;
                panel(x + 3, y, width - 6, 34, g === page ? "#2c2c52" : "#1b1b30");
                text(done + "/" + size, x + width / 2, y + 17, 18, COLORS[g]);
            }
        }

        function drawCount() {
            text(finale ? "★ Count to 30" : "Count together · " + RANGES[range].label, W / 2, 82, 21);
            text(String(count), W / 2, 133, 54, "#ffd166");
            drawGroups(170);
            const cell = Math.min(64, (W - 24) / 5, (H - 292) / 2);
            const left = (W - cell * 5) / 2;
            const top = 216 + Math.max(0, (H - 302 - cell * 2) / 2);
            const end = Math.min(target, page * 10 + 10);
            const first = marks.findIndex(mark => !mark);
            for (let i = page * 10; i < end; i++) {
                const local = i % 10;
                const x = left + (local % 5) * cell, y = top + Math.floor(local / 5) * cell;
                ctx.beginPath();
                ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = marks[i] ? COLORS[page] : "#2c2c52";
                ctx.fill();
                if (marks[i]) text(String(marks[i]), x + cell / 2, y + cell / 2, 22, "#12121f", cell - 8);
                else if (i === first) text(host.kids ? "👇" : "·", x + cell / 2, y + cell / 2, 25);
                if (!marks[i]) buttons.push({ x, y, w: cell, h: cell, action: () => countDot(i) });
            }
            if (count === end) {
                text(count === target ? "You counted them all!" : count + " counted. Keep going!", W / 2, H - 78, 17, "#ffd166");
                button("✓  →", W / 2 - 66, H - 60, 132, 48, nextActivity, true);
            } else {
                text("☝ Tap each dot once", W / 2, H - 42, 19, "#9aa0c3");
            }
        }

        function drawQuestion() {
            text(phase === "total" ? "How many altogether?" : "What comes next?", W / 2, 82, 23);
            if (phase === "total") {
                const cell = Math.min(23, (W - 40) / 15);
                for (let i = 0; i < target; i++) {
                    const group = Math.floor(i / 10), local = i % 10;
                    const groups = Math.ceil(target / 10);
                    const x = (W - groups * cell * 5) / 2 + group * cell * 5 + (local % 5 + 0.5) * cell;
                    const y = 124 + Math.floor(local / 5) * cell;
                    ctx.beginPath();
                    ctx.arc(x, y, cell * 0.32, 0, Math.PI * 2);
                    ctx.fillStyle = COLORS[group];
                    ctx.fill();
                }
                text(host.kids || hint || solved ? String(target) : "?", W / 2, 208, 48, "#ffd166");
            } else {
                text((target - 2) + " → " + (target - 1) + " → " + (solved ? target : "?"), W / 2, 160, 38, "#ffd166");
                if (host.kids || hint) text((target - 1) + " + 1 = " + target, W / 2, 216, 25, "#39d0ff");
            }
            const width = (W - 48) / 3;
            choices.forEach((value, i) => {
                button(String(value), 12 + i * (width + 12), H - 142, width, 60,
                    () => answer(value), (solved || hint || host.kids) && value === target);
            });
            if (solved) {
                button("★  →", W / 2 - 66, H - 66, 132, 48, nextActivity, true);
            } else {
                text(hint ? "Try again — you've got this!" : "☝ Pick a number", W / 2, H - 44, 17, "#9aa0c3");
            }
        }

        function drawCelebration() {
            text("★  ★  ★", W / 2, H * 0.3, 46, "#ffd166");
            text("30", W / 2, H * 0.46, 80, "#39d0ff");
            text("You counted to 30!", W / 2, H * 0.63, 26);
            button("✓", W / 2 - 66, H - 76, 132, 52, () => {
                ended = true;
                cancelSpeech();
                host.gameOver(score);
            }, true);
        }

        function draw() {
            if (destroyed) return;
            buttons = [];
            ctx.fillStyle = "#12121f";
            ctx.fillRect(0, 0, W, H);
            button("☰", 12, 10, 48, 48, menu, false);
            text("Number Sense", W / 2, 34, 20, "#f2f3ff", W - 144);
            button("🔊", W - 60, 10, 48, 48, () => say(announcement), false);
            if (phase === "menu") drawMenu();
            else if (phase === "count") drawCount();
            else if (phase === "celebrate") drawCelebration();
            else drawQuestion();
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = Math.max(280, canvas.clientWidth);
            H = Math.max(420, canvas.clientHeight);
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            draw();
        }

        function onPointer(e) {
            if (destroyed || ended || !e.isPrimary || e.button !== 0) return;
            e.preventDefault();
            SGSound.unlock();
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * W / rect.width;
            const y = (e.clientY - rect.top) * H / rect.height;
            const hit = buttons.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
            if (hit) hit.action();
        }

        function reset() {
            score = 0;
            ended = false;
            host.setScore(0);
            menu();
        }

        return {
            start() {
                resize();
                reset();
                window.addEventListener("resize", resize);
                canvas.addEventListener("pointerdown", onPointer);
            },
            restart: reset,
            destroy() {
                destroyed = true;
                cancelSpeech();
                buttons = [];
                window.removeEventListener("resize", resize);
                canvas.removeEventListener("pointerdown", onPointer);
            }
        };
    }

    window.SGGames = window.SGGames || {};
    window.SGGames.numbersense = {
        id: "numbersense",
        name: "Number Sense",
        emoji: "🔢",
        tag: "Count together, find the total, and grow to 30!",
        scoreLabel: "activities",
        create: create
    };
})();
