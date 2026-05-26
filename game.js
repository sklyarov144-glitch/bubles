const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let width = 480;
let height = 800;
let pixelRatio = window.devicePixelRatio || 1;

const COLORS_ALL = [
  "#72d929",
  "#2f61e8",
  "#8939e6",
  "#df2cc4",
  "#e43751",
  "#ef6a2c",
  "#2bc8d9"
];

const SAVE = {
  bestScore: "bubble_best_score_v2",
  maxLevel: "bubble_max_level_v2",
  sound: "bubble_sound_v2"
};

let bubbleRadius = 20;
let colWidth = 40;
let rowHeight = 34;

let bubbles = [];
let particles = [];
let flyingBubble = null;
let shooterBubble = null;
let nextBubble = null;

let gameState = "menu";
let gameMode = "none";

let score = 0;
let bestScore = Number(localStorage.getItem(SAVE.bestScore) || 0);
let maxOpenedLevel = Number(localStorage.getItem(SAVE.maxLevel) || 1);
let soundEnabled = localStorage.getItem(SAVE.sound) !== "off";

let currentLevel = 1;
let levelConfig = null;

let aimX = 0;
let aimY = 0;
let fieldOffsetY = 0;
let lastTime = 0;
let gameTime = 0;
let poppedThisLevel = 0;
let shotsCount = 0;
let pointerStartedOnButton = false;
let gridMetrics = null;
let gridRowShift = 0;

function resizeCanvas() {
  pixelRatio = window.devicePixelRatio || 1;

  const displayWidth = Math.min(window.innerWidth, 560);
  const displayHeight = window.innerHeight;

  canvas.width = Math.floor(displayWidth * pixelRatio);
  canvas.height = Math.floor(displayHeight * pixelRatio);
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  width = displayWidth;
  height = displayHeight;

  const nextBubbleRadius = Math.max(15, Math.min(22, width / 24));
  const nextColWidth = nextBubbleRadius * 2;
  const nextRowHeight = nextBubbleRadius * 1.72;

  if (!gridMetrics || gameState === "menu" || gameState === "howto") {
    bubbleRadius = nextBubbleRadius;
    colWidth = nextColWidth;
    rowHeight = nextRowHeight;
  }

  if (shooterBubble) {
    shooterBubble.x = width / 2;
    shooterBubble.y = height - bubbleRadius * 3.1;
  }

  if (!aimX || !aimY) {
    aimX = width / 2;
    aimY = height / 2;
  }
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function generateLevelConfig(level) {
  let colorCount = 4;
  let initialRows = 5;
  let descentSpeed = 2.2;
  let targetScore = 300;
  let targetPops = 20;

  if (level <= 10) {
    colorCount = 4;
    initialRows = 4 + Math.floor(level / 5);
    descentSpeed = 1.1 + level * 0.05;
    targetScore = 180 + level * 30;
    targetPops = 12 + level * 2;
  } else if (level <= 30) {
    colorCount = 4 + Math.floor((level - 10) / 12);
    initialRows = 5 + Math.floor((level - 10) / 8);
    descentSpeed = 1.8 + (level - 10) * 0.08;
    targetScore = 450 + level * 35;
    targetPops = 30 + level * 2;
  } else if (level <= 60) {
    colorCount = 5 + Math.floor((level - 30) / 18);
    initialRows = 7 + Math.floor((level - 30) / 12);
    descentSpeed = 3.5 + (level - 30) * 0.09;
    targetScore = 900 + level * 45;
    targetPops = 55 + level * 2;
  } else if (level <= 85) {
    colorCount = 6;
    initialRows = 9 + Math.floor((level - 60) / 13);
    descentSpeed = 6.3 + (level - 60) * 0.11;
    targetScore = 1800 + level * 55;
    targetPops = 100 + level * 2;
  } else {
    colorCount = 7;
    initialRows = 11;
    descentSpeed = 9 + (level - 85) * 0.16;
    targetScore = 3100 + level * 65;
    targetPops = 155 + level * 2;
  }

  const goalType = level % 2 === 0 ? "score" : "pops";

  return {
    level,
    colorCount,
    initialRows,
    descentSpeed,
    targetScore,
    targetPops,
    goalType
  };
}

function getActiveColors() {
  if (gameMode === "levels") {
    return COLORS_ALL.slice(0, levelConfig.colorCount);
  }

  const extraColor = Math.min(3, Math.floor(gameTime / 70));
  return COLORS_ALL.slice(0, 4 + extraColor);
}

function randomColor() {
  const colors = getActiveColors();
  return colors[Math.floor(Math.random() * colors.length)];
}

function getColumnCount() {
  if (gridMetrics && gameState !== "menu" && gameState !== "howto") {
    return gridMetrics.cols;
  }

  return Math.floor((width - bubbleRadius * 2) / colWidth);
}

function getBubblePosition(row, col) {
  const metrics = gridMetrics || {
    bubbleRadius,
    colWidth,
    rowHeight,
    cols: getColumnCount(),
    topY: bubbleRadius * 2.4,
    startX: (width - getColumnCount() * colWidth) / 2 + bubbleRadius
  };

  const stableRow = row - gridRowShift;
  const offset = isShiftedOddRow(stableRow) ? metrics.bubbleRadius : 0;

  return {
    x: metrics.startX + col * metrics.colWidth + offset,
    y: metrics.topY + row * metrics.rowHeight + fieldOffsetY
  };
}

function createInitialBubbles(rows) {
  bubbles = [];
  fieldOffsetY = 0;
  gridRowShift = 0;

  const cols = getColumnCount();

  gridMetrics = {
    bubbleRadius,
    colWidth,
    rowHeight,
    cols,
    topY: bubbleRadius * 2.4,
    startX: (width - cols * colWidth) / 2 + bubbleRadius
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const chance = row < 3 ? 1 : 0.88;

      if (Math.random() <= chance) {
        bubbles.push({
          row,
          col,
          color: randomColor(),
          falling: false,
          x: 0,
          y: 0,
          fallSpeed: 0
        });
      }
    }
  }
}

function createShooterBubbles() {
  shooterBubble = {
    x: width / 2,
    y: height - bubbleRadius * 3.1,
    color: nextBubble ? nextBubble.color : randomColor()
  };

  nextBubble = {
    color: randomColor()
  };
}

function startLevel(level) {
  currentLevel = Math.max(1, Math.min(100, level));
  levelConfig = generateLevelConfig(currentLevel);

  gameMode = "levels";
  gameState = "playing";
  score = 0;
  gameTime = 0;
  poppedThisLevel = 0;
  shotsCount = 0;
  particles = [];
  flyingBubble = null;
  gridMetrics = null;

  createInitialBubbles(levelConfig.initialRows);
  createShooterBubbles();
}

function startScoreMode() {
  gameMode = "score";
  gameState = "playing";
  score = 0;
  gameTime = 0;
  poppedThisLevel = 0;
  shotsCount = 0;
  particles = [];
  flyingBubble = null;
  levelConfig = null;
  gridMetrics = null;

  createInitialBubbles(6);
  createShooterBubbles();
}

function playSound(type) {
  if (!soundEnabled) return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    let frequency = 350;
    let duration = 0.08;

    if (type === "pop") {
      frequency = 720;
      duration = 0.12;
    }

    if (type === "win") {
      frequency = 880;
      duration = 0.22;
    }

    if (type === "lose") {
      frequency = 140;
      duration = 0.3;
    }

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.value = 0.045;
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch (error) {}
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#2b3f6b");
  gradient.addColorStop(0.45, "#101d3d");
  gradient.addColorStop(1, "#050914");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let i = 0; i < 45; i++) {
    const x = (i * 97 + Math.sin(gameTime + i) * 20) % width;
    const y = (i * 131 + gameTime * 7) % height;

    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBubbleAt(x, y, color, radius = bubbleRadius) {
  ctx.save();

  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = radius * 0.35;
  ctx.shadowOffsetY = radius * 0.18;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  const gradient = ctx.createRadialGradient(
    x - radius * 0.42,
    y - radius * 0.45,
    radius * 0.05,
    x,
    y,
    radius
  );

  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.16, "#ffffff");
  gradient.addColorStop(0.32, color);
  gradient.addColorStop(0.78, color);
  gradient.addColorStop(1, "#121827");

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x - radius * 0.34, y - radius * 0.38, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - radius * 0.16, y - radius * 0.12, radius * 0.72, Math.PI * 1.15, Math.PI * 1.65);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = radius * 0.08;
  ctx.stroke();

  ctx.restore();
}

function drawBubbles() {
  for (const bubble of bubbles) {
    if (bubble.falling) {
      drawBubbleAt(bubble.x, bubble.y, bubble.color);
    } else {
      const pos = getBubblePosition(bubble.row, bubble.col);
      drawBubbleAt(pos.x, pos.y, bubble.color);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAimLine() {
  if (!shooterBubble || flyingBubble || gameState !== "playing") return;

  const angle = getAimAngle();

  if (!isValidAngle(angle)) return;

  let x = shooterBubble.x;
  let y = shooterBubble.y;
  let vx = Math.cos(angle);
  let vy = Math.sin(angle);

  ctx.save();
  ctx.setLineDash([5, 9]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.moveTo(x, y);

  for (let i = 0; i < 260; i += 8) {
    x += vx * 8;
    y += vy * 8;

    if (x - bubbleRadius <= 0 || x + bubbleRadius >= width) {
      vx *= -1;
    }

    ctx.lineTo(x, y);

    if (y < bubbleRadius * 2) break;
  }

  ctx.stroke();
  ctx.restore();
}

function drawShooter() {
  if (gameState !== "playing" && gameState !== "paused") return;

  const baseX = width / 2;
  const baseY = height - bubbleRadius * 1.5;

  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.17)";
  ctx.beginPath();
  ctx.arc(baseX, baseY, bubbleRadius * 1.55, Math.PI, Math.PI * 2);
  ctx.fill();

  drawAimLine();

  if (shooterBubble && !flyingBubble) {
    drawBubbleAt(shooterBubble.x, shooterBubble.y, shooterBubble.color);
  }

  if (nextBubble) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `${Math.floor(bubbleRadius * 0.75)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("след.", width - bubbleRadius * 2.2, height - bubbleRadius * 3.7);
    drawBubbleAt(width - bubbleRadius * 2.2, height - bubbleRadius * 2.35, nextBubble.color, bubbleRadius * 0.65);
  }

  ctx.restore();
}

function drawFlyingBubble() {
  if (flyingBubble) {
    drawBubbleAt(flyingBubble.x, flyingBubble.y, flyingBubble.color);
  }
}

function drawWarningLine() {
  const y = getDangerLineY();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 80, 80, 0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 100, 100, 0.12)";
  ctx.fillRect(0, y, width, height - y);

  ctx.restore();
}

function drawTopUI() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, width, 62);

  ctx.fillStyle = "white";
  ctx.textBaseline = "middle";

  ctx.font = "17px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Счёт: ${score}`, 14, 22);

  if (gameMode === "levels" && levelConfig) {
    ctx.fillText(`Уровень: ${currentLevel}/100`, 14, 45);
  } else if (gameMode === "score") {
    ctx.fillText(`Рекорд: ${bestScore}`, 14, 45);
  }

  ctx.textAlign = "center";

  if (gameMode === "levels" && levelConfig) {
    const goalText = levelConfig.goalType === "score"
      ? `Цель: ${score}/${levelConfig.targetScore}`
      : `Лопнуть: ${poppedThisLevel}/${levelConfig.targetPops}`;

    ctx.fillText(goalText, width / 2, 34);
  } else if (gameMode === "score") {
    ctx.fillText("Режим на счёт", width / 2, 34);
  }

  drawSmallButton(width - 96, 14, 36, 34, gameState === "paused" ? "▶" : "Ⅱ");
  drawSmallButton(width - 52, 14, 38, 34, soundEnabled ? "🔊" : "🔇");

  ctx.restore();
}

function drawSmallButton(x, y, w, h, text) {
  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(x, y, w, h, 10);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "17px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);

  ctx.restore();
}

function drawBigButton(x, y, w, h, text) {
  ctx.save();

  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, "#fefefe");
  gradient.addColorStop(0.5, "#dbe7ff");
  gradient.addColorStop(1, "#b8c9ee");

  ctx.shadowColor = "rgba(5, 10, 30, 0.45)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;

  ctx.fillStyle = gradient;
  roundRect(x, y, w, h, 18);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.65);
  gloss.addColorStop(0, "rgba(255,255,255,0.55)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  roundRect(x + 2, y + 2, w - 4, h * 0.52, 14);
  ctx.fill();

  ctx.fillStyle = "#1a2f5e";
  ctx.font = "bold 21px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2);

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMenu() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";

  ctx.fillStyle = "white";
  ctx.font = "bold 40px Arial";
  const titleGradient = ctx.createLinearGradient(width / 2 - 120, 0, width / 2 + 120, 0);
  titleGradient.addColorStop(0, "#ffffff");
  titleGradient.addColorStop(0.5, "#dce8ff");
  titleGradient.addColorStop(1, "#ffffff");
  ctx.fillStyle = titleGradient;
  ctx.fillText("Шариковый", width / 2, height * 0.21);
  ctx.fillText("Выстрел", width / 2, height * 0.21 + 45);

  ctx.font = "17px Arial";
  ctx.fillStyle = "rgba(240,245,255,0.92)";
  ctx.fillText("Целься, стреляй и собирай", width / 2, height * 0.21 + 88);
  ctx.fillText("3+ шарика одного цвета", width / 2, height * 0.21 + 112);

  const bx = width / 2 - 120;
  const by = height * 0.46;

  drawBigButton(bx, by, 240, 56, `Уровни: ${maxOpenedLevel}/100`);
  drawBigButton(bx, by + 70, 240, 56, "Режим на счёт");
  drawBigButton(bx, by + 140, 240, 52, "Как играть");
  drawBigButton(bx, by + 204, 240, 52, soundEnabled ? "Звук: ВКЛ" : "Звук: ВЫКЛ");

  ctx.font = "15px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Лучший счёт: ${bestScore}`, width / 2, height - 34);

  ctx.restore();
}

function drawHowToPlay() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.font = "bold 30px Arial";
  ctx.fillText("Как играть", width / 2, height * 0.18);

  ctx.font = "18px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.9)";

  const lines = [
    "Целься мышкой или пальцем.",
    "Отпусти, чтобы выстрелить.",
    "Собирай 3 и больше шарика",
    "одного цвета.",
    "Не дай шарикам дойти",
    "до красной линии."
  ];

  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, height * 0.29 + index * 31);
  });

  drawBigButton(width / 2 - 100, height * 0.72, 200, 54, "Назад");

  ctx.restore();
}

function drawPaused() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, width, height);

  const panelW = Math.min(340, width - 44);
  const panelH = 286;
  const panelX = width / 2 - panelW / 2;
  const panelY = height / 2 - panelH / 2;

  ctx.fillStyle = "rgba(8, 22, 45, 0.92)";
  roundRect(panelX, panelY, panelW, panelH, 18);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Пауза", width / 2, panelY + 58);

  ctx.font = "17px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.84)";
  ctx.fillText("Игра остановлена", width / 2, panelY + 89);

  const bx = width / 2 - 120;
  const by = panelY + 116;

  drawBigButton(bx, by, 240, 54, "Продолжить");
  drawBigButton(bx, by + 68, 240, 54, "Заново");
  drawBigButton(bx, by + 136, 240, 54, "В меню");

  ctx.restore();
}

function drawLevelComplete() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Уровень пройден!", width / 2, height * 0.34);

  ctx.font = "21px Arial";
  ctx.fillText(`Уровень ${currentLevel}`, width / 2, height * 0.34 + 45);
  ctx.fillText(`Счёт: ${score}`, width / 2, height * 0.34 + 78);

  const bx = width / 2 - 120;
  const by = height * 0.56;

  if (currentLevel < 100) {
    drawBigButton(bx, by, 240, 56, "Следующий уровень");
  } else {
    drawBigButton(bx, by, 240, 56, "Победа!");
  }

  drawBigButton(bx, by + 72, 240, 52, "В меню");

  ctx.restore();
}

function drawGameOver() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.66)";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Игра окончена", width / 2, height * 0.34);

  ctx.font = "21px Arial";
  ctx.fillText(`Счёт: ${score}`, width / 2, height * 0.34 + 50);

  if (gameMode === "score") {
    ctx.fillText(`Рекорд: ${bestScore}`, width / 2, height * 0.34 + 82);
  }

  const bx = width / 2 - 120;
  const by = height * 0.57;

  drawBigButton(bx, by, 240, 56, gameMode === "levels" ? "Заново уровень" : "Играть снова");
  drawBigButton(bx, by + 72, 240, 52, "В меню");

  ctx.restore();
}

function getDangerLineY() {
  return height - bubbleRadius * 5.2;
}

function getAimAngle() {
  if (!shooterBubble) return -Math.PI / 2;
  return Math.atan2(aimY - shooterBubble.y, aimX - shooterBubble.x);
}

function isValidAngle(angle) {
  return angle < -0.15 && angle > -2.99;
}

function shoot() {
  if (gameState !== "playing") return;
  if (flyingBubble || !shooterBubble) return;

  const angle = getAimAngle();

  if (!isValidAngle(angle)) return;

  const speed = Math.max(9, Math.min(13, height / 80));

  flyingBubble = {
    x: shooterBubble.x,
    y: shooterBubble.y,
    color: shooterBubble.color,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed
  };

  shooterBubble = null;
  shotsCount++;
  playSound("shoot");
}

function update(deltaMs) {
  if (gameState !== "playing") return;

  const deltaSec = deltaMs / 1000;
  gameTime += deltaSec;

  updateSmoothDescent(deltaSec);
  updateFlyingBubble();
  updateFallingBubbles(deltaMs);
  updateParticles(deltaMs);
  checkGoals();
  checkGameOver();
}

function getCurrentDescentSpeed() {
  if (gameMode === "levels" && levelConfig) {
    return levelConfig.descentSpeed;
  }

  return 2.1 + Math.min(9, gameTime * 0.035);
}

function updateSmoothDescent(deltaSec) {
  const metrics = gridMetrics || { rowHeight };

  fieldOffsetY += getCurrentDescentSpeed() * deltaSec;

  while (fieldOffsetY >= metrics.rowHeight) {
    fieldOffsetY -= metrics.rowHeight;
    gridRowShift++;

    for (const bubble of bubbles) {
      if (!bubble.falling) {
        bubble.row += 1;
      }
    }

    if (gameMode === "score") {
      addNewTopRow(0.82);
    } else {
      addNewTopRow(currentLevel <= 30 ? 0.45 : 0.62);
    }
  }
}

function updateFlyingBubble() {
  if (!flyingBubble) return;

  flyingBubble.x += flyingBubble.vx;
  flyingBubble.y += flyingBubble.vy;

  if (flyingBubble.x - bubbleRadius <= 0) {
    flyingBubble.x = bubbleRadius;
    flyingBubble.vx *= -1;
  }

  if (flyingBubble.x + bubbleRadius >= width) {
    flyingBubble.x = width - bubbleRadius;
    flyingBubble.vx *= -1;
  }

  if (flyingBubble.y - bubbleRadius <= bubbleRadius * 1.3) {
    attachFlyingBubble();
    return;
  }

  for (const bubble of bubbles) {
    if (bubble.falling) continue;

    const pos = getBubblePosition(bubble.row, bubble.col);
    const dx = flyingBubble.x - pos.x;
    const dy = flyingBubble.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= bubbleRadius * 1.88) {
      attachFlyingBubble();
      return;
    }
  }
}

function attachFlyingBubble() {
  const cell = findNearestFreeCell(flyingBubble.x, flyingBubble.y);

  const newBubble = {
    row: cell.row,
    col: cell.col,
    color: flyingBubble.color,
    falling: false,
    x: 0,
    y: 0,
    fallSpeed: 0
  };

  bubbles.push(newBubble);
  flyingBubble = null;

  const removed = removeMatches(newBubble);

  if (removed > 0) {
    poppedThisLevel += removed;
    score += removed * 10;

    const floating = removeFloatingBubbles();
    if (floating > 0) {
      score += floating * 15;
    }

    if (gameMode === "score" && score > bestScore) {
      bestScore = score;
      localStorage.setItem(SAVE.bestScore, String(bestScore));
    }

    playSound("pop");
  }

  createShooterBubbles();
}

function findNearestFreeCell(x, y) {
  const cols = getColumnCount();
  let bestCell = null;
  let bestDistance = Infinity;

  const approxRow = Math.max(0, Math.round((y - bubbleRadius * 2.4 - fieldOffsetY) / rowHeight));

  for (let row = Math.max(0, approxRow - 3); row <= approxRow + 3; row++) {
    for (let col = 0; col < cols; col++) {
      if (isCellOccupied(row, col)) continue;

      const pos = getBubblePosition(row, col);
      const dx = x - pos.x;
      const dy = y - pos.y;
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestCell = { row, col };
      }
    }
  }

  if (bestCell) return bestCell;

  for (let row = 0; row < 22; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isCellOccupied(row, col)) {
        return { row, col };
      }
    }
  }

  return { row: 0, col: Math.floor(cols / 2) };
}

function isCellOccupied(row, col) {
  return bubbles.some(b => !b.falling && b.row === row && b.col === col);
}

function isShiftedOddRow(row) {
  return Math.abs(row) % 2 === 1;
}

function getNeighbors(target) {
  const even = [
    [0, -1], [0, 1],
    [-1, -1], [-1, 0],
    [1, -1], [1, 0]
  ];

  const odd = [
    [0, -1], [0, 1],
    [-1, 0], [-1, 1],
    [1, 0], [1, 1]
  ];

  const stableRow = target.row - gridRowShift;
  const directions = isShiftedOddRow(stableRow) ? odd : even;
  const result = [];

  for (const [dr, dc] of directions) {
    const row = target.row + dr;
    const col = target.col + dc;
    const found = bubbles.find(b => !b.falling && b.row === row && b.col === col);

    if (found) result.push(found);
  }

  return result;
}

function removeMatches(startBubble) {
  const visited = new Set();
  const group = [];
  const stack = [startBubble];

  while (stack.length > 0) {
    const current = stack.pop();
    const key = `${current.row},${current.col}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (current.color !== startBubble.color) continue;

    group.push(current);

    for (const neighbor of getNeighbors(current)) {
      const neighborKey = `${neighbor.row},${neighbor.col}`;

      if (!visited.has(neighborKey) && neighbor.color === startBubble.color) {
        stack.push(neighbor);
      }
    }
  }

  if (group.length >= 3) {
    for (const bubble of group) {
      const pos = getBubblePosition(bubble.row, bubble.col);
      createPopParticles(pos.x, pos.y, bubble.color);
    }

    bubbles = bubbles.filter(b => !group.includes(b));
    return group.length;
  }

  return 0;
}

function removeFloatingBubbles() {
  const connected = new Set();
  const stack = bubbles.filter(b => !b.falling && b.row === 0);

  while (stack.length > 0) {
    const current = stack.pop();
    const key = `${current.row},${current.col}`;

    if (connected.has(key)) continue;
    connected.add(key);

    for (const neighbor of getNeighbors(current)) {
      const neighborKey = `${neighbor.row},${neighbor.col}`;
      if (!connected.has(neighborKey)) {
        stack.push(neighbor);
      }
    }
  }

  let count = 0;

  for (const bubble of bubbles) {
    const key = `${bubble.row},${bubble.col}`;

    if (!bubble.falling && !connected.has(key)) {
      const pos = getBubblePosition(bubble.row, bubble.col);
      bubble.x = pos.x;
      bubble.y = pos.y;
      bubble.falling = true;
      bubble.fallSpeed = 3.5 + Math.random() * 4;
      count++;
    }
  }

  return count;
}

function updateFallingBubbles(deltaMs) {
  for (const bubble of bubbles) {
    if (!bubble.falling) continue;

    bubble.y += bubble.fallSpeed * deltaMs * 0.09;
    bubble.fallSpeed += 0.2;
  }

  bubbles = bubbles.filter(b => !b.falling || b.y < height + bubbleRadius * 5);
}

function createPopParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 4.2;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      color,
      life: 32 + Math.random() * 18,
      maxLife: 50
    });
  }
}

function updateParticles(deltaMs) {
  for (const p of particles) {
    p.x += p.vx * deltaMs * 0.07;
    p.y += p.vy * deltaMs * 0.07;
    p.vy += 0.04;
    p.life -= deltaMs * 0.08;
  }

  particles = particles.filter(p => p.life > 0);
}

function addNewTopRow(chance = 0.8) {
  const cols = getColumnCount();

  for (let col = 0; col < cols; col++) {
    if (Math.random() <= chance && !isCellOccupied(0, col)) {
      bubbles.push({
        row: 0,
        col,
        color: randomColor(),
        falling: false,
        x: 0,
        y: 0,
        fallSpeed: 0
      });
    }
  }
}

function checkGoals() {
  if (gameMode !== "levels" || !levelConfig || gameState !== "playing") return;

  let completed = false;

  if (levelConfig.goalType === "score" && score >= levelConfig.targetScore) {
    completed = true;
  }

  if (levelConfig.goalType === "pops" && poppedThisLevel >= levelConfig.targetPops) {
    completed = true;
  }

  if (completed) {
    gameState = "levelcomplete";

    if (currentLevel >= maxOpenedLevel && currentLevel < 100) {
      maxOpenedLevel = currentLevel + 1;
      localStorage.setItem(SAVE.maxLevel, String(maxOpenedLevel));
    }

    playSound("win");
  }
}

function checkGameOver() {
  if (gameState !== "playing") return;

  const limit = getDangerLineY();

  for (const bubble of bubbles) {
    if (bubble.falling) continue;

    const pos = getBubblePosition(bubble.row, bubble.col);

    if (pos.y + bubbleRadius >= limit) {
      gameState = "gameover";
      playSound("lose");
      return;
    }
  }
}

function togglePause() {
  if (gameState === "playing") {
    gameState = "paused";
  } else if (gameState === "paused") {
    gameState = "playing";
  }
}

function restartCurrentMode() {
  if (gameMode === "levels") {
    startLevel(currentLevel);
  } else if (gameMode === "score") {
    startScoreMode();
  }
}

function handlePointerDown(x, y) {
  pointerStartedOnButton = false;

  aimX = x;
  aimY = y;

  if (isInside(x, y, width - 96, 14, 36, 34) && gameState !== "menu" && gameState !== "howto") {
    pointerStartedOnButton = true;
    togglePause();
    return;
  }

  if (isInside(x, y, width - 52, 14, 38, 34) && gameState !== "howto") {
    pointerStartedOnButton = true;
    soundEnabled = !soundEnabled;
    localStorage.setItem(SAVE.sound, soundEnabled ? "on" : "off");
    return;
  }

  if (gameState === "menu") {
    const bx = width / 2 - 120;
    const by = height * 0.46;

    if (isInside(x, y, bx, by, 240, 56)) {
      pointerStartedOnButton = true;
      startLevel(maxOpenedLevel);
      return;
    }

    if (isInside(x, y, bx, by + 70, 240, 56)) {
      pointerStartedOnButton = true;
      startScoreMode();
      return;
    }

    if (isInside(x, y, bx, by + 140, 240, 52)) {
      pointerStartedOnButton = true;
      gameState = "howto";
      return;
    }

    if (isInside(x, y, bx, by + 204, 240, 52)) {
      pointerStartedOnButton = true;
      soundEnabled = !soundEnabled;
      localStorage.setItem(SAVE.sound, soundEnabled ? "on" : "off");
      return;
    }
  }

  if (gameState === "howto") {
    if (isInside(x, y, width / 2 - 100, height * 0.72, 200, 54)) {
      pointerStartedOnButton = true;
      gameState = "menu";
      return;
    }
  }

  if (gameState === "levelcomplete") {
    const bx = width / 2 - 120;
    const by = height * 0.56;

    if (isInside(x, y, bx, by, 240, 56)) {
      pointerStartedOnButton = true;

      if (currentLevel < 100) {
        startLevel(currentLevel + 1);
      } else {
        gameState = "menu";
      }

      return;
    }

    if (isInside(x, y, bx, by + 72, 240, 52)) {
      pointerStartedOnButton = true;
      gameState = "menu";
      return;
    }
  }

  if (gameState === "paused") {
    const panelW = Math.min(340, width - 44);
    const panelH = 286;
    const panelY = height / 2 - panelH / 2;
    const bx = width / 2 - 120;
    const by = panelY + 116;

    if (isInside(x, y, bx, by, 240, 54)) {
      pointerStartedOnButton = true;
      gameState = "playing";
      return;
    }

    if (isInside(x, y, bx, by + 68, 240, 54)) {
      pointerStartedOnButton = true;
      restartCurrentMode();
      return;
    }

    if (isInside(x, y, bx, by + 136, 240, 54)) {
      pointerStartedOnButton = true;
      gameState = "menu";
      flyingBubble = null;
      return;
    }
  }

  if (gameState === "gameover") {
    const bx = width / 2 - 120;
    const by = height * 0.57;

    if (isInside(x, y, bx, by, 240, 56)) {
      pointerStartedOnButton = true;

      if (gameMode === "levels") {
        startLevel(currentLevel);
      } else {
        startScoreMode();
      }

      return;
    }

    if (isInside(x, y, bx, by + 72, 240, 52)) {
      pointerStartedOnButton = true;
      gameState = "menu";
      return;
    }
  }
}

function handlePointerMove(x, y) {
  aimX = x;
  aimY = y;
}

function handlePointerUp(x, y) {
  aimX = x;
  aimY = y;

  if (pointerStartedOnButton) {
    pointerStartedOnButton = false;
    return;
  }

  if (gameState === "playing") {
    shoot();
  }
}

function isInside(x, y, bx, by, bw, bh) {
  return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
}

function getCanvasPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();

  let clientX;
  let clientY;

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

canvas.addEventListener("mousedown", event => {
  const pos = getCanvasPointerPosition(event);
  handlePointerDown(pos.x, pos.y);
});

canvas.addEventListener("mousemove", event => {
  const pos = getCanvasPointerPosition(event);
  handlePointerMove(pos.x, pos.y);
});

canvas.addEventListener("mouseup", event => {
  const pos = getCanvasPointerPosition(event);
  handlePointerUp(pos.x, pos.y);
});

canvas.addEventListener("touchstart", event => {
  event.preventDefault();
  const pos = getCanvasPointerPosition(event);
  handlePointerDown(pos.x, pos.y);
}, { passive: false });

canvas.addEventListener("touchmove", event => {
  event.preventDefault();
  const pos = getCanvasPointerPosition(event);
  handlePointerMove(pos.x, pos.y);
}, { passive: false });

canvas.addEventListener("touchend", event => {
  event.preventDefault();
  const pos = getCanvasPointerPosition(event);
  handlePointerUp(pos.x, pos.y);
}, { passive: false });

window.addEventListener("contextmenu", event => {
  event.preventDefault();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === "playing") {
    gameState = "paused";
  }
});

document.addEventListener("keydown", event => {
  if (event.code === "Escape" || event.code === "KeyP") {
    if (gameState === "playing" || gameState === "paused") {
      event.preventDefault();
      togglePause();
    }
  }
});

function render() {
  drawBackground();

  if (gameState !== "menu" && gameState !== "howto") {
    drawWarningLine();
    drawBubbles();
    drawFlyingBubble();
    drawParticles();
    drawShooter();
    drawTopUI();
  } else {
    drawBubbles();
    drawParticles();
  }

  if (gameState === "menu") {
    drawMenu();
  }

  if (gameState === "howto") {
    drawHowToPlay();
  }

  if (gameState === "paused") {
    drawPaused();
  }

  if (gameState === "levelcomplete") {
    drawLevelComplete();
  }

  if (gameState === "gameover") {
    drawGameOver();
  }
}

function gameLoop(timestamp) {
  const deltaMs = Math.min(timestamp - lastTime, 32);
  lastTime = timestamp;

  update(deltaMs);
  render();

  requestAnimationFrame(gameLoop);
}

aimX = width / 2;
aimY = height / 2;

createInitialBubbles(6);
requestAnimationFrame(gameLoop);
