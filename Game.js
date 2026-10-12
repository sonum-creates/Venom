
const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const menu = document.getElementById("menu");
const startBtn = document.getElementById("start");
const nameInput = document.getElementById("playerName");
const board = document.getElementById("leaderboard");

let W, H, dpr;
let player, enemies = [], foods = [], powers = [];
let score = 0;
let running = false;
let boosting = false;
let lastTime = 0;
let animationId = 0;
let particles = [];
let power = { speed: 0, magnet: 0 };
let playerName = "Player";
let pointer = { x: 300, y: 200 };
let colors = ["#45f4d1", "#ff5fb7", "#a77bff",
              "#ffc76a", "#55a7ff", "#b7f36b"];

bestEl.textContent = localStorage.getItem("wormBest") || 0;

function resize() {
  const rect = canvas.getBoundingClientRect();
  W = rect.width;
  H = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeWorm(name, x, y, color, isPlayer = false) {
  return {
    name, x, y, color, isPlayer,
    angle: rand(0, Math.PI * 2),
    targetAngle: 0,
    speed: isPlayer ? 125 : 85,
    radius: isPlayer ? 10 : 8,
    length: isPlayer ? 22 : 17,
    segments: Array.from({ length: isPlayer ? 22 : 17 },
      (_, i) => ({ x: x - i * 5, y })),
    aiTimer: 0,
    target: { x: rand(0, W), y: rand(0, H) }
  };
}

function spawnFood() {
  foods.push({
    x: rand(12, W - 12),
    y: rand(12, H - 12),
    r: rand(3, 5),
    color: colors[Math.floor(rand(0, colors.length))]
  });
}

function spawnPower() {
  const types = ["speed", "magnet", "bonus"];
  powers.push({
    x: rand(30, W - 30),
    y: rand(30, H - 30),
    type: types[Math.floor(Math.random() * types.length)]
  });
}

function resetGame() {
  score = 0;
  scoreEl.textContent = 0;
  power = { speed: 0, magnet: 0 };
  particles = [];
  foods = [];
  powers = [];
  enemies = [];

  player = makeWorm(playerName, W / 2, H / 2,
                    "#45f4d1", true);

  for (let i = 0; i < 100; i++) spawnFood();
  for (let i = 0; i < 6; i++) spawnPower();

  for (let i = 0; i < 6; i++) {
    enemies.push(makeWorm(
      ["Nova", "Pixel", "Comet", "Zippy", "Orbit", "Jelly"][i],
      rand(30, W - 30), rand(30, H - 30),
      colors[i + 1]
    ));
  }
}

function updateWorm(w, dt) {
  if (w.isPlayer) {
    const dx = pointer.x - w.x;
    const dy = pointer.y - w.y;

    if (Math.hypot(dx, dy) > 8) {
      w.targetAngle = Math.atan2(dy, dx);
    }

    let diff = Math.atan2(
      Math.sin(w.targetAngle - w.angle),
      Math.cos(w.targetAngle - w.angle)
    );

    w.angle += clamp(diff, -3 * dt, 3 * dt);
    w.speed = (boosting || power.speed > 0) ? 195 : 125;
  } else {
    w.aiTimer -= dt;

    if (w.aiTimer <= 0) {
      w.aiTimer = rand(0.5, 1.5);

      let nearest = null;
      let nearestD = Infinity;

      for (const f of foods) {
        const d = dist(w, f);
        if (d < nearestD) {
          nearest = f;
          nearestD = d;
        }
      }

      if (nearest && Math.random() < 0.8) {
        w.target = { x: nearest.x, y: nearest.y };
      } else {
        w.target = { x: rand(20, W - 20), y: rand(20, H - 20) };
      }

      // AI tries to move away from the player nearby.
      if (dist(w, player) < 90) {
        w.target.x = clamp(w.x + (w.x - player.x) * 2, 10, W - 10);
        w.target.y = clamp(w.y + (w.y - player.y) * 2, 10, H - 10);
      }
    }

    w.targetAngle = Math.atan2(
      w.target.y - w.y, w.target.x - w.x
    );

    let diff = Math.atan2(
      Math.sin(w.targetAngle - w.angle),
      Math.cos(w.targetAngle - w.angle)
    );

    w.angle += clamp(diff, -2 * dt, 2 * dt);
    w.speed = 82;
  }

  const old = { x: w.x, y: w.y };

  w.x += Math.cos(w.angle) * w.speed * dt;
  w.y += Math.sin(w.angle) * w.speed * dt;

  // Keep worms inside the arena.
  const margin = 12;

  if (w.x < margin || w.x > W - margin ||
      w.y < margin || w.y > H - margin) {
    w.targetAngle = Math.atan2(H / 2 - w.y, W / 2 - w.x);
  }

  w.x = clamp(w.x, margin, W - margin);
  w.y = clamp(w.y, margin, H - margin);

  w.segments.unshift(old);

  // Keep segments evenly spaced.
  for (let i = 1; i < w.segments.length; i++) {
    const a = w.segments[i - 1];
    const b = w.segments[i];
    const d = dist(a, b);
    const spacing = 5;

    if (d > spacing) {
      b.x += (a.x - b.x) / d * (d - spacing);
      b.y += (a.y - b.y) / d * (d - spacing);
    }
  }

  while (w.segments.length < w.length) {
    w.segments.push({ ...w.segments[w.segments.length - 1] });
  }

  w.segments.length = w.length;
}

function addScore(points) {
  score += points;
  scoreEl.textContent = score;

  const best = Number(localStorage.getItem("wormBest") || 0);

  if (score > best) {
    localStorage.setItem("wormBest", score);
    bestEl.textContent = score;
  }
}

function burst(x, y, color) {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y,
      vx: rand(-70, 70),
      vy: rand(-70, 70),
      life: 0.5,
      color
    });
  }
}

function updateFoods() {
  // Magnet power pulls nearby food towards the player.
  if (power.magnet > 0) {
    for (const f of foods) {
      const d = dist(player, f);
      if (d < 130 && d > 0) {
        f.x += (player.x - f.x) / d * 2;
        f.y += (player.y - f.y) / d * 2;
      }
    }
  }

  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];

    if (dist(player, f) < player.radius + f.r) {
      addScore(1);
      player.length++;
      burst(f.x, f.y, f.color);
      foods.splice(i, 1);
      spawnFood();
      continue;
    }

    for (const enemy of enemies) {
      if (dist(enemy, f) < enemy.radius + f.r) {
        enemy.length++;
        foods.splice(i, 1);
        spawnFood();
        break;
      }
    }
  }
}

function updatePowers() {
  for (let i = powers.length - 1; i >= 0; i--) {
    const p = powers[i];

    if (dist(player, p) < 23) {
      if (p.type === "speed") power.speed = 5;
      if (p.type === "magnet") power.magnet = 7;

      if (p.type === "bonus") {
        addScore(10);
        player.length += 5;
      }

      burst(p.x, p.y, "#ffffff");
      powers.splice(i, 1);
      spawnPower();
    }
  }
}

function gameOver() {
  if (!running) return;
  running = false;

  const data = JSON.parse(
    localStorage.getItem("wormBoard") || "[]"
  );

  data.push({
    name: playerName,
    score: score
  });

  data.sort((a, b) => b.score - a.score);

  localStorage.setItem(
    "wormBoard", JSON.stringify(data.slice(0, 8))
  );

  renderBoard();

  document.getElementById("menuTitle").textContent = "Game Over!";
  document.getElementById("menuText").textContent =
    "Your score: " + score;
  startBtn.textContent = "Play Again";
  menu.classList.remove("hidden");
}

function checkCollisions() {
  for (const enemy of enemies) {
    // Skip very close spawns to avoid instant game over.
    if (dist(player, enemy) < 35) continue;

    for (let i = 4; i < enemy.segments.length; i += 2) {
      if (dist(player, enemy.segments[i]) < 13) {
        gameOver();
        return;
      }
    }
  }

  // Self-collision only after the worm has grown.
  if (player.segments.length > 40) {
    for (let i = 20; i < player.segments.length; i += 2) {
      if (dist(player, player.segments[i]) < 12) {
        gameOver();
        return;
      }
    }
  }
}

function renderBoard() {
  const data = JSON.parse(
    localStorage.getItem("wormBoard") || "[]"
  );

  board.replaceChildren();

  if (!data.length) {
    const li = document.createElement("li");
    li.textContent = "Play to add your score!";
    board.appendChild(li);
    return;
  }

  data.slice(0, 8).forEach((entry, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${entry.name} — ${entry.score}`;
    board.appendChild(li);
  });
}

function drawWorm(w) {
  for (let i = w.segments.length - 1; i >= 0; i--) {
    const s = w.segments[i];
    const r = w.radius * (1 - i / w.segments.length * 0.25);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";

  for (const offset of [-0.4, 0.4]) {
    ctx.beginPath();
    ctx.arc(
      w.x + Math.cos(w.angle + offset) * 5,
      w.y + Math.sin(w.angle + offset) * 5,
      2, 0, Math.PI * 2
    );
    ctx.fill();
  }

  if (!w.isPlayer) {
    ctx.fillStyle = "#d6e4ff";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(w.name, w.x, w.y - 17);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#080d19";
  ctx.fillRect(0, 0, W, H);

  // Neon arena grid.
  ctx.strokeStyle = "#17233a";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 35) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  for (const f of foods) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const powerColors = {
    speed: "#45f4d1",
    magnet: "#a77bff",
    bonus: "#ffc76a"
  };

  const powerSymbols = {
    speed: "➤",
    magnet: "✦",
    bonus: "+"
  };

  for (const p of powers) {
    ctx.fillStyle = powerColors[p.type];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#080d19";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(powerSymbols[p.type], p.x, p.y + 5);
  }

  enemies.forEach(drawWorm);
  if (player) drawWorm(player);

  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  if (boosting || power.speed > 0) {
    ctx.fillStyle = "#45f4d1";
    ctx.font = "bold 12px Arial";
    ctx.fillText("⚡ BOOST ACTIVE", 12, 20);
  }
}

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
  lastTime = time;

  if (running) {
    power.speed = Math.max(0, power.speed - dt);
    power.magnet = Math.max(0, power.magnet - dt);

    updateWorm(player, dt);
    enemies.forEach(e => updateWorm(e, dt));
    updateFoods();
    updatePowers();
    checkCollisions();

    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);
  }

  draw();
  if (running) animationId = requestAnimationFrame(loop);
}

function startGame() {
  playerName = nameInput.value.trim().slice(0, 16) || "Player";
  resize();
  resetGame();
  menu.classList.add("hidden");
  running = true;
  lastTime = performance.now();

  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function setPointer(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
}

canvas.addEventListener("pointermove", setPointer);

canvas.addEventListener("pointerdown", e => {
  setPointer(e);
  if (e.pointerType === "touch") boosting = true;
});

window.addEventListener("pointerup", () => boosting = false);

window.addEventListener("keydown", e => {
  if (e.code === "Space") {
    e.preventDefault();
    boosting = true;
  }
});

window.addEventListener("keyup", e => {
  if (e.code === "Space") boosting = false;
});

startBtn.addEventListener("click", startGame);

resize();
renderBoard();
draw();
