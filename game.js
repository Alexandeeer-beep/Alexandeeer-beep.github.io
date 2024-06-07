const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('gameContainer');
const startButton = document.getElementById('startButton');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreBoard = document.getElementById('scoreBoard');
const highScoreBoard = document.getElementById('highScoreBoard');
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeButton = document.getElementById('resumeButton');
const volumeSlider = document.getElementById('volumeSlider');
const bulletBoard = document.getElementById('bulletBoard');
const noAmmoMessage = document.createElement('div');

canvas.width = gameContainer.clientWidth;
canvas.height = gameContainer.clientHeight;

const goodTargetImage = new Image();
const badTargetImage = new Image();
const mimicTargetImage = new Image();
goodTargetImage.src = 'Good-Diana.png';
badTargetImage.src = 'Bad-Diana.png';
mimicTargetImage.src = 'Good-Diana.png'; // Usa la misma imagen que la buena

function createAudio(src) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.onerror = function(e) {
        console.error(`Error al cargar el audio ${src}:`, e);
    };
    return audio;
}

const shotSound = createAudio('Sonido Disparo.mp3');
const hitGoodSound = createAudio('Good hit.mp3');
const hitBadSound = createAudio('Bad hit.mp3');
const reloadSound = createAudio('Recarga.mp3');
const noAmmoSound = createAudio('Sin municion.mp3');

let bgMusicList = ['BackGround.mp3', 'Background2.mp3', 'Background3.mp3'];
let bgMusicIndex = 0;
let bgMusic = new Audio(bgMusicList[bgMusicIndex]);
bgMusic.loop = false;
bgMusic.onerror = function(e) {
    console.error(`Error al cargar la música de fondo ${bgMusicList[bgMusicIndex]}:`, e);
};

let targets = [];
let score = 0;
let bullets = 8;
let gameInterval;
let targetInterval;
let gameOver = false;
let highScore = 0;
let targetSpawnRate = 1500;
let isPaused = false;
let volumeLevel = 1.0;
let lastTime = 0;
let difficultyIncreaseInterval;
let canInteract = true;

// Clase Target
class Target {
    constructor(x, y, type, isMoving) {
        this.x = x;
        this.y = y;
        this.size = 200;
        this.hitboxSize = 200; // Tamaño de la hitbox reducido
        this.type = type;
        this.image = type === 'good' ? goodTargetImage : (type === 'bad' ? badTargetImage : mimicTargetImage); // Asignación de imagen adecuada
        this.isMoving = isMoving;
        this.speed = type === 'goodFake' || type === 'fleeing' || type === 'bad' ? Math.random() * 0.3 + 0.2 : Math.random() * 0.03 + 0.02; // Aumenta la velocidad de las dianas que huyen
        this.alpha = 0;
        this.wobbleAngle = 0;
        this.wobble = type === 'bad' || type === 'goodFake' ? Math.random() * 1.2 + 0.5 : 0;
        this.targetX = Math.random() * (canvas.width - this.size);
        this.targetY = Math.random() * (canvas.height - this.size);
        this.timeToLive = this.type === 'good' ? 3000 : (this.type === 'goodFake' ? 3500 : 2000);
        this.exploding = false;
        this.direction = 1; // Dirección inicial del movimiento lateral
    }

    update(deltaTime) {
        if (this.isMoving) {
            if (this.type === 'goodFake' || this.type === 'mimic') {
                // Movimiento lateral para dianas que quitan puntos
                this.x += this.direction * this.speed * deltaTime * 0.1;
                if (this.x <= 0 || this.x + this.size >= canvas.width) {
                    this.direction *= -1;
                }
            } else {
                this.x += (this.targetX - this.x) * this.speed;
                this.y += (this.targetY - this.y) * this.speed;
            }
        }
        this.alpha += deltaTime * 0.001;
        this.timeToLive -= deltaTime;
        if (this.timeToLive <= 0) {
            this.explode();
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = Math.min(this.alpha, 1);
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(Math.sin(this.wobbleAngle) * this.wobble);
        ctx.drawImage(this.image, -this.size / 2, -this.size / 2, this.size * 1.5, this.size * 1.5); // Incrementa el tamaño de la diana
        ctx.restore();
    }

    isHit(x, y) {
        return this.type !== 'fleeing' && 
               x >= this.x + (this.size - this.hitboxSize) / 2 &&
               x <= this.x + this.size - (this.size - this.hitboxSize) / 2 &&
               y >= this.y + (this.size - this.hitboxSize) / 2 &&
               y <= this.y + this.size - (this.size - this.hitboxSize) / 2;
    }

    explode() {
        this.exploding = true;
        this.alpha = 0;
    }

    flee(mouseX, mouseY) {
        if (this.type !== 'fleeing') return; // Solo las dianas 'fleeing' pueden huir
        const dx = this.x - mouseX;
        const dy = this.y - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const fleeSpeed = 5; // Ajusta la velocidad de huida según sea necesario

        if (distance < 300) { // Distancia a la que la diana empieza a huir
            this.x += (dx / distance) * fleeSpeed;
            this.y += (dy / distance) * fleeSpeed;
        }
    }

    switchToBad() {
        this.type = 'bad';
        this.image = badTargetImage;
    }
}

function spawnTarget() {
    let x, y, type;
    let maxAttempts = 10;
    let attempts = 0;
    let isOverlapping;
    do {
        x = Math.random() * (canvas.width - 200);
        y = Math.random() * (canvas.height - 200);
        type = determineTargetType();
        isOverlapping = targets.some(target => isOverlappingWith(target, x, y, type));
        attempts++;
    } while (isOverlapping && attempts < maxAttempts);

    if (attempts < maxAttempts) {
        const isMoving = Math.random() < 0.3;
        const target = new Target(x, y, type, isMoving);
        targets.push(target);
    }
}

function determineTargetType() {
    const typeChance = Math.random();
    if (typeChance < 0.1) {
        return 'bad';
    } else if (typeChance < 0.2) {
        return 'goodFake';
    } else if (typeChance < 0.3) {
        return 'mimic';
    } else if (typeChance < 0.4) {
        return 'fleeing';
    } else {
        return 'good';
    }
}

function isOverlappingWith(target, x, y, type) {
    const distance = Math.sqrt((target.x - x) ** 2 + (target.y - y) ** 2);
    const minDistance = 200;
    if (distance < minDistance) {
        return true;
    }
    if ((target.type === 'bad' && type !== 'bad') || (target.type !== 'bad' && type === 'bad')) {
        return distance < minDistance * 2;
    }
    return false;
}

function startGame() {
    gameOver = false;
    score = 0;
    bullets = 8;
    targets = [];
    scoreBoard.textContent = 'Puntos: ' + score;
    bulletBoard.textContent = 'Balas: ' + bullets;
    startButton.style.display = 'none';
    gameOverScreen.style.display = 'none';
    isPaused = false;
    gameContainer.classList.remove('paused');
    lastTime = performance.now();
    gameInterval = requestAnimationFrame(gameLoop);
    targetInterval = setInterval(spawnTarget, targetSpawnRate);
    difficultyIncreaseInterval = setInterval(increaseDifficulty, 10000);
    playBackgroundMusic();
    canInteract = true;

    noAmmoMessage.style.display = 'none'; // Ocultar mensaje de sin balas al inicio del juego
    noAmmoMessage.style.position = 'absolute';
    noAmmoMessage.style.color = 'red';
    noAmmoMessage.style.fontWeight = 'bold';
    noAmmoMessage.style.display = 'none';
    gameContainer.appendChild(noAmmoMessage);
}

function gameOverScreenFunc() {
    gameOver = true;
    clearInterval(targetInterval);
    clearInterval(difficultyIncreaseInterval);
    cancelAnimationFrame(gameInterval);
    gameOverScreen.style.display = 'block';
    startButton.style.display = 'block';
    highScoreBoard.textContent = 'Puntuación más alta: ' + highScore;
    gameContainer.classList.remove('paused');
    stopBackgroundMusic();
}

function updateGameState(deltaTime) {
    if (isPaused) return;

    targets.forEach(target => target.update(deltaTime));
    targets = targets.filter(target => !target.exploding);
}

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    targets.forEach(target => target.draw());
}

function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    updateGameState(deltaTime);
    drawGame();

    if (!gameOver) {
        gameInterval = requestAnimationFrame(gameLoop);
    }
}

function increaseDifficulty() {
    if (targetSpawnRate > 500) {
        targetSpawnRate -= 100;
        clearInterval(targetInterval);
        targetInterval = setInterval(spawnTarget, targetSpawnRate);
    }
}

canvas.addEventListener('click', (event) => {
    if (!canInteract) return;
    if (isPaused) return;

    if (bullets > 0) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        shotSound.currentTime = 0;
        shotSound.play();
        bullets--;
        bulletBoard.textContent = 'Balas: ' + bullets;

        let hit = false;
        targets.forEach(target => {
            if (target.isHit(mouseX, mouseY)) {
                if (target.type === 'good') {
                    score++;
                    hitGoodSound.currentTime = 0;
                    hitGoodSound.play();
                } else if (target.type === 'goodFake') {
                    score -= 2; // Penalización por buena falsa
                    hitBadSound.currentTime = 0;
                    hitBadSound.play();
                } else if (target.type === 'bad') {
                    score -= 5;
                    hitBadSound.currentTime = 0;
                    hitBadSound.play();
                } else if (target.type === 'mimic') {
                    score += 2; // Recompensa por acertar a la mímica
                    hitGoodSound.currentTime = 0;
                    hitGoodSound.play();
                }
                target.explode();
                hit = true;
            } else if (target.type === 'fleeing') {
                target.flee(mouseX, mouseY); // Hacer que la diana huya
            }
        });

        if (!hit && bullets === 0) {
            noAmmoSound.currentTime = 0;
            noAmmoSound.play();
            noAmmoMessage.textContent = '¡Sin balas! Recarga para continuar.';
            noAmmoMessage.style.display = 'block'; // Mostrar el mensaje sin balas
            setTimeout(() => {
                noAmmoMessage.style.display = 'none'; // Ocultar el mensaje después de unos segundos
            }, 2000);
        }
    } else {
        noAmmoSound.currentTime = 0;
        noAmmoSound.play();
        noAmmoMessage.textContent = '¡Sin balas! Recarga para continuar.';
        noAmmoMessage.style.display = 'block'; // Mostrar el mensaje sin balas
        setTimeout(() => {
            noAmmoMessage.style.display = 'none'; // Ocultar el mensaje después de unos segundos
        }, 2000);
    }

    scoreBoard.textContent = 'Puntos: ' + score;
    if (score > highScore) {
        highScore = score;
    }
});

document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR') {
        reloadSound.currentTime = 0;
        reloadSound.play();
        bullets = 8;
        bulletBoard.textContent = 'Balas: ' + bullets;
    } else if (event.code === 'KeyP') {
        togglePause();
    }
});

function togglePause() {
    if (gameOver) return;
    isPaused = !isPaused;
    if (isPaused) {
        pauseOverlay.style.display = 'block';
        stopBackgroundMusic();
    } else {
        pauseOverlay.style.display = 'none';
        lastTime = performance.now();
        gameInterval = requestAnimationFrame(gameLoop);
        playBackgroundMusic();
    }
    gameContainer.classList.toggle('paused');
}

resumeButton.addEventListener('click', () => {
    togglePause();
});

volumeSlider.addEventListener('input', (event) => {
    volumeLevel = event.target.value;
    adjustVolume(volumeLevel);
});

function adjustVolume(level) {
    shotSound.volume = level;
    hitGoodSound.volume = level;
    hitBadSound.volume = level;
    reloadSound.volume = level;
    noAmmoSound.volume = level;
    bgMusic.volume = level;
}

function playBackgroundMusic() {
    if (!bgMusic) return;
    bgMusic.play().catch((error) => {
        console.error('Error al reproducir la música de fondo:', error);
    });
    bgMusic.onended = function() {
        bgMusicIndex = (bgMusicIndex + 1) % bgMusicList.length;
        bgMusic = new Audio(bgMusicList[bgMusicIndex]);
        bgMusic.loop = false;
        bgMusic.volume = volumeLevel;
        playBackgroundMusic();
    };
}

function stopBackgroundMusic() {
    if (!bgMusic) return;
    bgMusic.pause();
    bgMusic.currentTime = 0;
}

function isMobileDevice() {
    return /Mobi/i.test(navigator.userAgent);
}

if (isMobileDevice()) {
    document.getElementById('reloadMessage').textContent = 'Toque con dos dedos para recargar';
    document.addEventListener('touchstart', handleTouchStart, false);
    document.addEventListener('touchend', handleTouchEnd, false);
}

let touchStartTime = 0;

function handleTouchStart(event) {
    if (event.touches.length === 2) {
        touchStartTime = Date.now();
    }
}

function handleTouchEnd(event) {
    if (event.touches.length < 2 && touchStartTime && (Date.now() - touchStartTime < 500)) {
        reloadSound.currentTime = 0;
        reloadSound.play();
        bullets = 8;
        bulletBoard.textContent = 'Balas: ' + bullets;
        touchStartTime = 0;
    }
}

startButton.addEventListener('click', startGame);
