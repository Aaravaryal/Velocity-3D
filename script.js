import * as THREE from 'three';

// --- GAME STATE & CONFIG ---
let gameStarted = false;
let audioRefs = null;
const particles = [];
const traffic = [];
const sceneObjects = []; // For collision optimization

const CONFIG = {
    acceleration: 0.025,
    maxSpeed: 2.2,
    nitroSpeed: 3.5,
    friction: 0.98,
    driftFriction: 0.95,
    steering: 0.06,
    trafficCount: 40,
    roadWidth: 40
};

// --- AUDIO ENGINE (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function initAudio() {
    // Engine Sound (Sawtooth for grit)
    const engineOsc = audioCtx.createOscillator();
    const engineGain = audioCtx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    
    // Lowpass filter to muffle the raw sound
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineGain.gain.value = 0.15;
    engineOsc.start();

    // Screech Sound (High pitched triangle)
    const screechOsc = audioCtx.createOscillator();
    const screechGain = audioCtx.createGain();
    screechOsc.type = 'triangle';
    screechOsc.frequency.value = 600;
    screechOsc.connect(screechGain);
    screechGain.connect(audioCtx.destination);
    screechGain.gain.value = 0;
    screechOsc.start();

    return { engineOsc, screechGain, engineGain };
}

// --- VISUALS & SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e); // Deep Night Blue
scene.fog = new THREE.FogExp2(0x1a1a2e, 0.0035);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(100, 200, 100);
sun.castShadow = true;
sun.shadow.mapSize.width = 4096;
sun.shadow.mapSize.height = 4096;
sun.shadow.camera.far = 1000;
sun.shadow.camera.left = -500; sun.shadow.camera.right = 500;
sun.shadow.camera.top = 500; sun.shadow.camera.bottom = -500;
scene.add(sun);

const ambient = new THREE.AmbientLight(0x404080, 0.8); // Blueish ambient for night feel
scene.add(ambient);

// --- WORLD GENERATION ---
function buildCity() {
    // Infinite Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // City Grid
    const gridSize = 15;
    const spacing = 180;

    for (let x = -gridSize; x <= gridSize; x++) {
        for (let z = -gridSize; z <= gridSize; z++) {
            // Main Roads (Cross shape at 0,0)
            if (x === 0 || z === 0) {
                createRoadSegment(x * spacing, z * spacing, x === 0);
            } else {
                // Random Buildings in the empty spaces
                if (Math.random() > 0.3) spawnBuilding(x * spacing, z * spacing);
            }
        }
    }
}

function createRoadSegment(x, z, isVertical) {
    const w = isVertical ? CONFIG.roadWidth : 180;
    const d = isVertical ? 180 : CONFIG.roadWidth;
    
    const road = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.2, d),
        new THREE.MeshStandardMaterial({ color: 0x222 })
    );
    road.position.set(x, 0.1, z);
    road.receiveShadow = true;
    scene.add(road);
    sceneObjects.push(road); // Add to collision list (optional for future)
}

function spawnBuilding(x, z) {
    const height = 40 + Math.random() * 120;
    const width = 30 + Math.random() * 20;
    
    // Building Mesh
    const geometry = new THREE.BoxGeometry(width, height, width);
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random() * 0.1 + 0.6, 0.5, 0.1), // Blue/Purple hues
        roughness: 0.2,
        metalness: 0.6
    });
    
    const building = new THREE.Mesh(geometry, material);
    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);

    // Emissive Windows (Night City Feel)
    if(Math.random() > 0.5) {
        const winGeo = new THREE.BoxGeometry(width + 0.5, height * 0.8, width + 0.5);
        const winMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.1 });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(x, height / 2, z);
        scene.add(win);
    }
}
buildCity();

// --- TRAFFIC SYSTEM ---
function initTraffic() {
    const carGeo = new THREE.BoxGeometry(3.5, 2, 6);
    const carMat = new THREE.MeshStandardMaterial({ color: 0xff3333 }); // Red Traffic

    for(let i=0; i<CONFIG.trafficCount; i++) {
        const tCar = new THREE.Mesh(carGeo, carMat);
        // Randomly place on the main Z-axis road
        tCar.position.set(
            (Math.random() > 0.5 ? 10 : -10), // Lane 1 or 2
            1.5,
            (Math.random() - 0.5) * 2000
        );
        tCar.castShadow = true;
        scene.add(tCar);
        traffic.push({ mesh: tCar, speed: 0.5 + Math.random() * 0.5 });
    }
}
initTraffic();

// --- PARTICLE SYSTEM ---
function spawnParticle(pos, color, scale, velocity) {
    const geo = new THREE.SphereGeometry(scale, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    
    particles.push({
        mesh: mesh,
        life: 1.0,
        velocity: velocity
    });
}

// --- PLAYER CAR ---
class Player {
    constructor() {
        this.container = new THREE.Group();
        
        // Car Body
        const bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 5.0);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ccff, metalness: 0.8, roughness: 0.2 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.8;
        body.castShadow = true;
        this.container.add(body);

        // Cockpit
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 2.5), new THREE.MeshStandardMaterial({ color: 0x111 }));
        cabin.position.set(0, 1.4, -0.2);
        this.container.add(cabin);

        // Spoiler
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.8), bodyMat);
        wing.position.set(0, 1.5, -2.2);
        this.container.add(wing);

        // Exhausts
        this.exhausts = [
            new THREE.Vector3(0.8, 0.6, -2.5),
            new THREE.Vector3(-0.8, 0.6, -2.5)
        ];

        // Wheels
        this.wheels = [];
        const wGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 16);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x111 });
        
        const positions = [
            [-1.3, 0.5, 1.5], [1.3, 0.5, 1.5],  // Front
            [-1.3, 0.5, -1.5], [1.3, 0.5, -1.5] // Rear
        ];

        positions.forEach(pos => {
            const w = new THREE.Mesh(wGeo, wMat);
            w.rotation.z = Math.PI / 2;
            w.position.set(...pos);
            w.castShadow = true;
            this.container.add(w);
            this.wheels.push(w);
        });

        scene.add(this.container);

        // Physics State
        this.speed = 0;
        this.steering = 0;
        this.rotation = 0;
        this.keys = {};

        window.addEventListener('keydown', e => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);
    }

    update() {
        const dt = 1.0; 
        const isNitro = this.keys['shift'];
        const isDrifting = this.keys[' '];

        // 1. Acceleration
        let targetSpeed = 0;
        if (this.keys['w']) targetSpeed = isNitro ? CONFIG.nitroSpeed : CONFIG.maxSpeed;
        if (this.keys['s']) targetSpeed = -CONFIG.maxSpeed / 2;

        if (this.keys['w'] || this.keys['s']) {
            this.speed += (targetSpeed - this.speed) * (CONFIG.acceleration * (isNitro ? 2 : 1));
        } else {
            this.speed *= CONFIG.friction; // Coasting
        }

        // 2. Drift Physics
        if (isDrifting) {
            this.speed *= CONFIG.driftFriction;
        }

        // 3. Steering
        if (Math.abs(this.speed) > 0.1) {
            const turnAmt = this.keys['a'] ? 1 : (this.keys['d'] ? -1 : 0);
            this.steering = THREE.MathUtils.lerp(this.steering, turnAmt * CONFIG.steering, 0.1);
            this.rotation += this.steering * (this.speed * 0.6);
        } else {
            this.steering = 0;
        }

        // 4. Position Update
        this.container.position.x += Math.sin(this.rotation) * this.speed;
        this.container.position.z += Math.cos(this.rotation) * this.speed;
        this.container.rotation.y = this.rotation;

        // 5. Visuals (Wobble & Tilt)
        const wobble = Math.sin(Date.now() * 0.05) * (this.speed * 0.1);
        this.container.rotation.z = (this.steering * -0.5) + (wobble * 0.1);
        this.container.rotation.x = -(this.speed * 0.05);

        this.wheels.forEach((w, i) => {
            w.rotation.x += this.speed; // Rolling
            if (i < 2) w.rotation.y = this.steering * 3; // Steering
        });

        // 6. Particles (Nitro & Drift)
        if (isNitro && Math.abs(this.speed) > 0.5) {
            this.exhausts.forEach(offset => {
                const worldPos = offset.clone().applyMatrix4(this.container.matrixWorld);
                spawnParticle(worldPos, 0x00ffff, 0.4, new THREE.Vector3(0,0,0)); // Blue Flame
            });
        }
        if (isDrifting && Math.abs(this.speed) > 1.0) {
             // Smoke from rear wheels
             const rearOffset = new THREE.Vector3(0, 0, -1.5).applyMatrix4(this.container.matrixWorld);
             spawnParticle(rearOffset, 0xffffff, 0.3, new THREE.Vector3(0, 0.1, 0)); 
        }

        // 7. Collision with Traffic
        const playerBox = new THREE.Box3().setFromObject(this.container);
        traffic.forEach(car => {
            const carBox = new THREE.Box3().setFromObject(car.mesh);
            if (playerBox.intersectsBox(carBox)) {
                this.speed *= -0.5; // Crash bounce
                car.speed = 0;
                // Shake camera effect could go here
            }
        });

        // 8. Audio Mapping
        if(audioRefs) {
            // Engine pitch based on speed
            const freq = 50 + (Math.abs(this.speed) * 200);
            audioRefs.engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
            
            // Screech volume based on drift
            const screechVol = (isDrifting && Math.abs(this.speed) > 1.0) ? 0.1 : 0;
            audioRefs.screechGain.gain.setTargetAtTime(screechVol, audioCtx.currentTime, 0.1);
        }

        // 9. HUD Updates
        document.getElementById('speed-val').innerText = Math.floor(Math.abs(this.speed) * 120);
    }
}

const player = new Player();

// --- INPUT HANDLING ---
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('overlay').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('overlay').style.display = 'none';
        document.getElementById('ui-container').style.display = 'block';
    }, 500);
    
    audioRefs = initAudio();
    gameStarted = true;
});

// --- MAIN LOOP ---
function animate() {
    requestAnimationFrame(animate);

    if (gameStarted) {
        player.update();

        // Update Traffic
        traffic.forEach(t => {
            t.mesh.position.z += t.speed;
            if (t.mesh.position.z > 2000) t.mesh.position.z = -2000;
        });

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= 0.05;
            p.mesh.material.opacity = p.life;
            p.mesh.position.add(p.velocity);
            p.mesh.scale.multiplyScalar(0.95); // Shrink

            if (p.life <= 0) {
                scene.remove(p.mesh);
                particles.splice(i, 1);
            }
        }

        // Camera Follow (Smooth Lerp)
        const relativeOffset = new THREE.Vector3(0, 6, -15);
        const cameraOffset = relativeOffset.applyMatrix4(player.container.matrixWorld);
        camera.position.lerp(cameraOffset, 0.1);
        camera.lookAt(player.container.position.x, player.container.position.y + 2, player.container.position.z);
    } else {
        // Menu Rotate Camera
        camera.position.x = Math.sin(Date.now() * 0.0005) * 50;
        camera.position.z = Math.cos(Date.now() * 0.0005) * 50;
        camera.position.y = 20;
        camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();