import * as THREE from 'three';
import { getStagePieces } from './puzzle.js';
import { audio } from './audio.js';

// --- Global State ---
let scene, camera, renderer;
let bgTexture, pieceMaterial, goldMaterial;
let backgroundBoard;

let currentStage = 0; // 0 to 4
let currentStageData = null;
let currentPieces = []; // Array of piece objects { data, mesh, silhouette, wireframe, status: 'scattered'|'placed' }
let selectedPiece = null;
let placedCount = 0;

// Master list of all completed pieces from previous stages
let masterCompletedPieces = [];

// Particle Systems
let starfieldPoints;
let activeParticles = [];
let fireworkExplosions = [];

// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const welcomeScreen = document.getElementById('welcome-screen');
const hud = document.getElementById('hud');
const currentStageNumEl = document.getElementById('current-stage-num');
const stageTitleEl = document.getElementById('stage-title');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressTextEl = document.getElementById('progress-text');
const gameHintEl = document.getElementById('game-hint');
const stageClearOverlay = document.getElementById('stage-clear-overlay');
const stageClearMessageEl = document.getElementById('stage-clear-message');
const finalOverlay = document.getElementById('final-overlay');

const startBtn = document.getElementById('start-btn');
const nextStageBtn = document.getElementById('next-stage-btn');
const replayBtn = document.getElementById('replay-btn');
const muteBtn = document.getElementById('mute-btn');
const soundOnIcon = document.getElementById('sound-on-icon');
const soundOffIcon = document.getElementById('sound-off-icon');

// Raycasting & Mouse
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Programmatic canvas texture for soft particles
let particleTexture;

// --- Initialize Three.js Scene ---
function initEngine() {
  const container = document.getElementById('canvas-container');
  
  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090615, 0.08);

  // Camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 6);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xfff5e6, 1.2);
  dirLight1.position.set(5, 5, 4);
  dirLight1.castShadow = true;
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xa585ff, 0.6);
  dirLight2.position.set(-5, -3, 3);
  scene.add(dirLight2);

  // Point light for glowing highlights
  const selectionLight = new THREE.PointLight(0xffdf7a, 0, 4);
  selectionLight.position.set(0, 0, 1);
  scene.add(selectionLight);
  window.selectionLight = selectionLight;

  // Materials
  // Base path from Viteconfig (safe for raw browser imports)
  const basePath = (import.meta.env && import.meta.env.BASE_URL) || './';
  const textureLoader = new THREE.TextureLoader();
  bgTexture = textureLoader.load(`${basePath}fai.jpg`, () => {
    // Hide loader once image is loaded
    loadingOverlay.classList.remove('active');
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
    }, 800);
  });
  
  bgTexture.colorSpace = THREE.SRGBColorSpace;

  // Front/Back of pieces uses the photo
  pieceMaterial = new THREE.MeshStandardMaterial({
    map: bgTexture,
    roughness: 0.15,
    metalness: 0.1,
    side: THREE.FrontSide
  });

  // Sides/Bevels of pieces uses gold metallic
  goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.2,
    metalness: 0.85,
    emissive: 0x2b1c05
  });

  // Create Background Silhouette Board (reveals the photo dimly)
  const bgGeom = new THREE.PlaneGeometry(4, 3);
  const bgMat = new THREE.MeshBasicMaterial({
    map: bgTexture,
    color: 0x1f153a,
    transparent: true,
    opacity: 0.14,
    depthWrite: false
  });
  backgroundBoard = new THREE.Mesh(bgGeom, bgMat);
  backgroundBoard.position.set(0, 0, -0.05);
  scene.add(backgroundBoard);

  // Create Particle Starfield in background
  createStarfield();

  // Resize Listener
  window.addEventListener('resize', adjustCamera);
  adjustCamera();

  // Click & Touch Listener
  window.addEventListener('pointerdown', onPointerDown);

  // Render Loop
  animate();
}

// Create circular glowing texture in memory
function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.2, 'rgba(255, 220, 255, 0.8)');
  grad.addColorStop(0.5, 'rgba(236, 72, 153, 0.3)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

// Background Starfield
function createStarfield() {
  particleTexture = createGlowTexture();
  const starsGeom = new THREE.BufferGeometry();
  const starsCount = 400;
  const positions = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 12;      // X
    positions[i + 1] = (Math.random() - 0.5) * 9;   // Y
    positions[i + 2] = -2 - Math.random() * 5;     // Z (behind board)
  }

  starsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const starsMat = new THREE.PointsMaterial({
    size: 0.15,
    map: particleTexture,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  starfieldPoints = new THREE.Points(starsGeom, starsMat);
  scene.add(starfieldPoints);
}

// Fit Board correctly in camera
function adjustCamera() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const fitHeight = 4.2;
  const fitWidth = 5.4;
  
  let dist = fitHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  if (camera.aspect < fitWidth / fitHeight) {
    dist = (fitWidth / camera.aspect) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
  
  // Save target camera Z position
  camera.targetZ = Math.max(dist, 4.8);
  if (!camera.currentZ) {
    camera.position.z = camera.targetZ;
    camera.currentZ = camera.targetZ;
  }
}

// --- Game Logic Flow ---

function startStage(stageIdx) {
  currentStage = stageIdx;
  currentStageNumEl.textContent = stageIdx + 1;
  
  // Clear any existing active stage pieces from scene
  currentPieces.forEach(p => {
    scene.remove(p.mesh);
    scene.remove(p.silhouette);
    scene.remove(p.wireframe);
  });
  currentPieces = [];
  selectedPiece = null;
  placedCount = 0;

  // Retrieve puzzle pieces coordinate details
  currentStageData = getStagePieces(stageIdx);
  stageTitleEl.textContent = currentStageData.title;
  
  updateProgressBar();

  // Create pieces meshes
  currentStageData.pieces.forEach(pData => {
    // 3D Mesh (Cap uses piece photo material, sides use gold metallic)
    const materials = [pieceMaterial, goldMaterial];
    const mesh = new THREE.Mesh(pData.geometry, materials);
    
    // Set to scattered starting positions
    mesh.position.copy(pData.scatterPos);
    mesh.rotation.copy(pData.scatterRot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { pieceId: pData.id, type: 'piece', data: pData };
    scene.add(mesh);

    // Target Silhouette Placeholder
    const silMat = new THREE.MeshStandardMaterial({
      color: 0x180b2d,
      transparent: true,
      opacity: 0.42,
      roughness: 0.8,
      metalness: 0.1,
      depthWrite: false
    });
    const silhouette = new THREE.Mesh(pData.geometry, silMat);
    silhouette.position.copy(pData.targetPos);
    silhouette.userData = { pieceId: pData.id, type: 'silhouette' };
    scene.add(silhouette);

    // Fine Gold Wireframe around Silhouette
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xd4af37,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });
    const wireframe = new THREE.Mesh(pData.geometry, wireMat);
    wireframe.position.copy(pData.targetPos);
    scene.add(wireframe);

    currentPieces.push({
      data: pData,
      mesh,
      silhouette,
      wireframe,
      status: 'scattered',
      wobbleTime: 0
    });
  });

  // Camera entrance animation (slightly zoom in/shake)
  camera.position.z = camera.targetZ + 1.2;
}

// Particle Burst on Successful Placement
function spawnPlacementBurst(position) {
  const count = 45;
  for (let i = 0; i < count; i++) {
    const life = 1.0;
    const decay = 0.015 + Math.random() * 0.02;
    
    // Random velocity vector
    const speed = 0.04 + Math.random() * 0.07;
    const angle = Math.random() * Math.PI * 2;
    const zSpeed = (Math.random() - 0.3) * 0.04;
    
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      zSpeed
    );

    // Particle color mix of Gold/Pink
    const color = new THREE.Color();
    if (Math.random() > 0.5) {
      color.setHex(0xd4af37); // Gold
    } else {
      color.setHex(0xec4899); // Pink
    }

    activeParticles.push({
      position: position.clone(),
      velocity,
      color,
      size: 0.15 + Math.random() * 0.15,
      life,
      decay
    });
  }

  // Trigger dynamic rendering of active particles
  rebuildParticleSystem();
}

// Particle Fireworks for Final Celebration
function spawnFirework() {
  const x = (Math.random() - 0.5) * 4.5;
  const y = -0.5 + Math.random() * 1.5;
  const z = 0.2 + Math.random() * 0.6;
  const center = new THREE.Vector3(x, y, z);
  
  // Pick random bright color
  const colors = [0xff4b91, 0xffcd3c, 0xff7b54, 0x9b5de5, 0x00f5ff, 0xffffff];
  const color = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);

  const count = 80;
  for (let i = 0; i < count; i++) {
    const life = 1.0;
    const decay = 0.008 + Math.random() * 0.012;
    
    // Spherical distribution velocity
    const speed = 0.03 + Math.random() * 0.08;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    
    const velocity = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed,
      Math.cos(phi) * speed
    );

    activeParticles.push({
      position: center.clone(),
      velocity,
      color,
      size: 0.18 + Math.random() * 0.18,
      life,
      decay
    });
  }
}

// Rebuild dynamic buffer geometry for active particles
let particlePointsMesh = null;
function rebuildParticleSystem() {
  if (particlePointsMesh) {
    scene.remove(particlePointsMesh);
  }

  if (activeParticles.length === 0) return;

  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(activeParticles.length * 3);
  const colors = new Float32Array(activeParticles.length * 3);
  const sizes = new Float32Array(activeParticles.length);

  activeParticles.forEach((p, idx) => {
    positions[idx * 3] = p.position.x;
    positions[idx * 3 + 1] = p.position.y;
    positions[idx * 3 + 2] = p.position.z;

    colors[idx * 3] = p.color.r * p.life;
    colors[idx * 3 + 1] = p.color.g * p.life;
    colors[idx * 3 + 2] = p.color.b * p.life;

    sizes[idx] = p.size * p.life;
  });

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.18,
    map: particleTexture,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particlePointsMesh = new THREE.Points(geom, mat);
  scene.add(particlePointsMesh);
}

// Raycasting to select and place pieces
function onPointerDown(event) {
  // Ignore clicks on HTML buttons/overlays
  if (event.target.tagName === 'BUTTON' || event.target.closest('.glass-card') || event.target.closest('.hud-header')) {
    return;
  }

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Get active meshes we can click
  const clickableMeshes = [];
  currentPieces.forEach(p => {
    if (p.status === 'scattered') {
      clickableMeshes.push(p.mesh);
    }
  });

  // Also can click silhouettes
  const silhouetteMeshes = [];
  currentPieces.forEach(p => {
    if (p.status === 'scattered') {
      silhouetteMeshes.push(p.silhouette);
    }
  });

  // Check clicks on scattered pieces first
  const pieceIntersects = raycaster.intersectObjects(clickableMeshes);
  if (pieceIntersects.length > 0) {
    const clickedMesh = pieceIntersects[0].object;
    const clickedPieceId = clickedMesh.userData.pieceId;
    const pieceObj = currentPieces.find(p => p.data.id === clickedPieceId);

    // If already selected, do nothing or deselect
    if (selectedPiece === pieceObj) {
      selectedPiece = null;
      audio.playClick();
    } else {
      selectedPiece = pieceObj;
      audio.playClick();
    }
    return;
  }

  // If a piece is selected, check clicks on the silhouettes
  if (selectedPiece) {
    const silIntersects = raycaster.intersectObjects(silhouetteMeshes);
    if (silIntersects.length > 0) {
      const clickedSil = silIntersects[0].object;
      const clickedSilId = clickedSil.userData.pieceId;

      // Check match!
      if (selectedPiece.data.id === clickedSilId) {
        // MATCH: Snap piece to target
        const p = selectedPiece;
        p.status = 'placed';
        placedCount++;

        // Add selection glow point light position
        window.selectionLight.position.copy(p.data.targetPos);
        window.selectionLight.intensity = 8.0;
        setTimeout(() => {
          window.selectionLight.intensity = 0;
        }, 300);

        // Success sound & particles
        audio.playSuccess();
        spawnPlacementBurst(p.data.targetPos);

        // Deselect
        selectedPiece = null;

        updateProgressBar();

        // Check if stage is clear
        if (placedCount === currentPieces.length) {
          setTimeout(completeStage, 1000);
        }
      } else {
        // ERROR: clicked wrong silhouette
        selectedPiece.wobbleTime = 0.01; // Triggers shake logic in update loop
        audio.playError();
      }
    } else {
      // Clicked empty space: deselect piece
      selectedPiece = null;
      audio.playClick();
    }
  }
}

function updateProgressBar() {
  const total = currentPieces.length;
  const pct = total > 0 ? (placedCount / total) * 100 : 0;
  progressBarFill.style.width = `${pct}%`;
  progressTextEl.textContent = `${placedCount} / ${total} ชิ้น`;
}

// Stage completed cutscene trigger
function completeStage() {
  audio.playStageClear();

  // Store completed pieces in the master list
  currentPieces.forEach(p => {
    p.mesh.position.copy(p.data.targetPos);
    p.mesh.rotation.set(0, 0, 0);
    p.mesh.castShadow = false; // Disable dynamic shadows to optimize completed layers
    masterCompletedPieces.push(p.mesh);
    scene.remove(p.silhouette);
    scene.remove(p.wireframe);
  });
  
  currentPieces = [];

  // Show overlay
  stageClearMessageEl.textContent = currentStageData.message;
  hud.classList.add('hidden');
  stageClearOverlay.classList.remove('hidden');
  setTimeout(() => {
    stageClearOverlay.classList.add('active');
  }, 50);

  // Zoom camera out slightly and focus center of sector
  camera.targetZ = 5.2;
}

// Final Game Clear Celebrations
function triggerFinalCelebration() {
  audio.stopBGM();
  
  hud.classList.add('hidden');
  finalOverlay.classList.remove('hidden');
  setTimeout(() => {
    finalOverlay.classList.add('active');
  }, 50);

  // Start continuous fireworks spawns
  const intervalId = setInterval(() => {
    if (!finalOverlay.classList.contains('active')) {
      clearInterval(intervalId);
      return;
    }
    spawnFirework();
    // Play synthesizer Happy Birthday note triggers automatically in audio scheduler
  }, 900);

  // Start BGM theme again (swells with victory)
  audio.startBGM();
}

// --- Main Loop and Animations ---

function animate(timestamp) {
  requestAnimationFrame(animate);

  const time = timestamp * 0.001 || 0;

  // 1. Slow Camera Parallax with mouse movement
  const targetCamX = mouse.x * 0.5;
  const targetCamY = mouse.y * 0.3;
  camera.position.x += (targetCamX - camera.position.x) * 0.05;
  camera.position.y += (targetCamY - camera.position.y) * 0.05;

  // Smoothly interpolate Camera Zoom
  if (camera.targetZ) {
    camera.currentZ += (camera.targetZ - camera.currentZ) * 0.05;
    camera.position.z = camera.currentZ;
  }

  // 2. Slow rotate background stars
  if (starfieldPoints) {
    starfieldPoints.rotation.y = time * 0.015;
    starfieldPoints.rotation.x = time * 0.01;
  }

  // 3. Update active pieces animations (Float / Highlight / Wobble)
  currentPieces.forEach(p => {
    const mesh = p.mesh;
    const data = p.data;

    if (p.status === 'scattered') {
      if (selectedPiece === p) {
        // Selection animation: floats slightly forward and rotates flat facing screen
        const hoverZ = 0.45;
        mesh.position.lerp(new THREE.Vector3(data.scatterPos.x, data.scatterPos.y, hoverZ), 0.15);
        
        // Face flat
        mesh.rotation.x += (0 - mesh.rotation.x) * 0.15;
        mesh.rotation.y += (0 - mesh.rotation.y) * 0.15;
        mesh.rotation.z += (data.scatterRot.z - mesh.rotation.z) * 0.15;

        // Glowing emissive feedback
        mesh.material.forEach(m => {
          if (m === goldMaterial) {
            m.emissive.setHex(0x5a3e0f); // Bright gold sides
          }
        });
      } else {
        // Idle scattered animation: float gently in place
        const idleOffsetZ = Math.sin(time * 2 + data.scatterPos.x * 3) * 0.05;
        const targetPos = data.scatterPos.clone();
        targetPos.z += idleOffsetZ;
        mesh.position.lerp(targetPos, 0.1);
        
        // Return to scattered rot
        mesh.rotation.x += (data.scatterRot.x - mesh.rotation.x) * 0.1;
        mesh.rotation.y += (data.scatterRot.y - mesh.rotation.y) * 0.1;
        mesh.rotation.z += (data.scatterRot.z - mesh.rotation.z) * 0.1;

        // Reset emissive
        mesh.material.forEach(m => {
          if (m === goldMaterial) {
            m.emissive.setHex(0x2b1c05);
          }
        });
      }

      // Wobble / Shake error animation
      if (p.wobbleTime > 0) {
        p.wobbleTime += 0.05;
        if (p.wobbleTime > 0.4) {
          p.wobbleTime = 0; // stop wobble
        } else {
          // Rapid side-to-side X shift offset
          const shakeVal = Math.sin(p.wobbleTime * 45) * 0.1;
          mesh.position.x += shakeVal;
        }
      }
    } else if (p.status === 'placed') {
      // Locking transition: fly into the board target coordinates
      mesh.position.lerp(data.targetPos, 0.18);
      mesh.rotation.x += (0 - mesh.rotation.x) * 0.18;
      mesh.rotation.y += (0 - mesh.rotation.y) * 0.18;
      mesh.rotation.z += (0 - mesh.rotation.z) * 0.18;

      // Lock texture perfectly at z=0 when close enough
      if (mesh.position.distanceTo(data.targetPos) < 0.005) {
        mesh.position.copy(data.targetPos);
        mesh.rotation.set(0, 0, 0);
        // Clear shadow calculation since it is flat on board
        mesh.castShadow = false;
      }
    }
  });

  // 4. Update Particle Explosions
  if (activeParticles.length > 0) {
    let rebuildNeeded = false;
    for (let i = activeParticles.length - 1; i >= 0; i--) {
      const p = activeParticles[i];
      p.position.add(p.velocity);
      p.life -= p.decay;

      // Slowly float downwards like gravity
      p.velocity.y -= 0.0006;
      p.velocity.x *= 0.98; // Friction

      if (p.life <= 0) {
        activeParticles.splice(i, 1);
        rebuildNeeded = true;
      }
    }
    rebuildParticleSystem();
  }

  renderer.render(scene, camera);
}

// --- Setup User Interface Events ---

function registerEvents() {
  // Start Game Button
  startBtn.addEventListener('click', () => {
    welcomeScreen.classList.remove('active');
    setTimeout(() => {
      welcomeScreen.classList.add('hidden');
      hud.classList.remove('hidden');
      
      // Initialize and start audio synthesis loop
      audio.startBGM();
      startStage(0);
    }, 800);
  });

  // Next Stage Button
  nextStageBtn.addEventListener('click', () => {
    stageClearOverlay.classList.remove('active');
    setTimeout(() => {
      stageClearOverlay.classList.add('hidden');
      hud.classList.remove('hidden');
      
      const nextStage = currentStage + 1;
      if (nextStage < 5) {
        startStage(nextStage);
      } else {
        triggerFinalCelebration();
      }
    }, 600);
  });

  // Replay Game Button
  replayBtn.addEventListener('click', () => {
    // Clear all completed pieces from previous stages
    masterCompletedPieces.forEach(mesh => scene.remove(mesh));
    masterCompletedPieces = [];

    finalOverlay.classList.remove('active');
    setTimeout(() => {
      finalOverlay.classList.add('hidden');
      hud.classList.remove('hidden');
      
      // Restart at stage 0
      audio.startBGM();
      startStage(0);
    }, 800);
  });

  // Mute Audio Toggle
  muteBtn.addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    if (isMuted) {
      soundOnIcon.classList.add('hidden');
      soundOffIcon.classList.remove('hidden');
    } else {
      soundOnIcon.classList.remove('hidden');
      soundOffIcon.classList.add('hidden');
    }
  });
}

// --- Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
  // Load Three.js Scene and load image
  initEngine();
  // Register click buttons
  registerEvents();
});
