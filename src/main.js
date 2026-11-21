import './style.css';\nimport * as THREE from 'three';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const slider = document.querySelector('#progressSlider');
const scene = document.querySelector('#scene');
const photo = document.querySelector('#scenePhoto');
const points = document.querySelector('#pointLayer');
const model = document.querySelector('#modelLayer');
const fill = document.querySelector('#rangeFill');
const statusText = document.querySelector('#statusText');
const stageCount = document.querySelector('#stageCount');
const stageIndex = document.querySelector('#stageIndex');
const stageDescription = document.querySelector('#stageDescription');
const coordText = document.querySelector('#coordText');
const ticks = [...document.querySelectorAll('.range-ticks span')];

const stages = [
  {name:'SOURCE FOOTAGE', count:'01 — 04', index:'01', coord:'FRAME 024 · RGB', description:'Original footage — the captured environment, just as it was recorded.'},
  {name:'FEATURE POINTS', count:'02 — 04', index:'02', coord:'FEATURES 1,284 · TRACKING', description:'Distinct visual features are detected and tracked across consecutive frames.'},
  {name:'SPATIAL WIREFRAME', count:'03 — 04', index:'03', coord:'POSES 024 · GEOMETRY', description:'Camera movement and matching features reveal the underlying spatial structure.'},
  {name:'3D RECONSTRUCTION', count:'04 — 04', index:'04', coord:'SCENE 001 · RECONSTRUCTED', description:'A reconstructed architectural scene emerges — ready for interactive exploration.'}
];

const featurePoints = [
  [285,440],[480,310],[820,310],[1010,430],[810,550],[470,550],[285,260],[480,135],[820,135],[1010,250],[625,45],[625,260],[350,300],[430,245],[865,285],[940,330],[530,390],[590,350],[690,350],[755,390],[245,205],[320,248],[510,105],[580,145],[610,250],[675,287],[390,180],[735,220],[550,500],[900,470],[200,390],[980,370],[420,90],[760,120],[560,310],[690,500],[340,470],[875,190],[600,80],[450,420]
];
points.innerHTML = featurePoints.map(([x,y],i)=>'<circle class="feature-point" cx="'+x+'" cy="'+y+'" r="'+(i%4===0?3.4:2.2)+'" style="--delay:'+((i%12)*22)+'ms" />').join('');

function render(value) {
  const progress = Number(value);
  const pointOpacity = Math.min(1, Math.max(0, (progress - 8) / 28));
  const wireOpacity = Math.min(1, Math.max(0, (progress - 34) / 30));
  const modelOpacity = Math.min(1, Math.max(0, (progress - 67) / 27));
  const photoOpacity = 1 - Math.min(1, Math.max(0, (progress - 48) / 45));
  const stage = progress < 20 ? 0 : progress < 48 ? 1 : progress < 76 ? 2 : 3;

  points.style.opacity = pointOpacity;
  points.style.transform = 'scale('+(1 + progress/1500)+')';
  scene.style.setProperty('--wire-opacity', wireOpacity);
  scene.style.setProperty('--photo-opacity', photoOpacity);
  model.style.opacity = modelOpacity;
  model.style.transform = 'translate(-50%, -50%) scale('+(0.88 + modelOpacity*0.12)+')';
  fill.style.width = progress + '%';
  slider.style.setProperty('--progress', progress + '%');
  statusText.textContent = stages[stage].name;
  stageCount.textContent = stages[stage].count;
  stageIndex.textContent = stages[stage].index;
  stageDescription.textContent = stages[stage].description;
  coordText.textContent = stages[stage].coord;
  ticks.forEach((tick,i)=>tick.classList.toggle('active', i===stage));
}

slider.addEventListener('input', event => render(event.target.value));
document.querySelector('#resetButton').addEventListener('click',()=>{slider.value=0;render(0);});
ticks.forEach((tick,i)=>tick.addEventListener('click',()=>{
  const values=[0,28,62,100]; slider.value=values[i]; render(values[i]);
}));

// Subtle pointer parallax keeps the scene feeling like a physical surface.
scene.addEventListener('pointermove', event => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect=scene.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width-.5;
  const y=(event.clientY-rect.top)/rect.height-.5;
  model.querySelector('.architecture-model').style.transform='rotateX('+(y*-3)+'deg) rotateY('+(x*4)+'deg)';
});
scene.addEventListener('pointerleave',()=>{model.querySelector('.architecture-model').style.transform='';});

document.querySelector('.menu-button').addEventListener('click',()=>{
  document.querySelector('.nav-links').classList.toggle('menu-open');
});

render(0);

// VISOR reconstruction studio — real backend integration.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const videoInput = document.querySelector('#videoInput');
const dropZone = document.querySelector('#dropZone');
const jobPanel = document.querySelector('#jobPanel');
const uploadButton = document.querySelector('.upload-button');
let activeJob = null;
let pollTimer = null;
let viewerCleanup = null;

function showUploadError(message) {
  jobPanel.hidden = false;
  document.querySelector('#jobTitle').textContent = 'Check your video';
  document.querySelector('#jobState').textContent = 'NEEDS ATTENTION';
  document.querySelector('#jobStage').textContent = 'Upload validation';
  document.querySelector('#jobMessage').textContent = message;
  document.querySelector('#jobError').hidden = true;
  document.querySelector('#jobProgressFill').style.width = '0%';
}

function validateClientFile(file) {
  if (!file) return 'Choose a video first.';
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['mp4', 'mov'].includes(ext)) return 'Only MP4 and MOV videos are supported.';
  if (file.size > 250 * 1024 * 1024) return 'The maximum file size is 250 MB.';
  if (file.size === 0) return 'The selected file is empty.';
  return null;
}

async function uploadVideo(file) {
  const problem = validateClientFile(file);
  if (problem) { showUploadError(problem); return; }
  jobPanel.hidden = false;
  jobPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('#jobTitle').textContent = file.name;
  document.querySelector('#jobState').textContent = 'UPLOADING';
  document.querySelector('#jobStage').textContent = 'Uploading source footage';
  document.querySelector('#jobMessage').textContent = 'Sending your video to the VISOR reconstruction API…';
  document.querySelector('#jobProgressFill').style.width = '3%';
  document.querySelector('#jobPercent').textContent = '—';
  document.querySelector('#jobError').hidden = true;
  document.querySelector('#frameResults').innerHTML = '';
  document.querySelector('#modelResult').hidden = true;
  const body = new FormData();
  body.append('video', file);
  try {
    const response = await fetch(API_BASE + '/api/jobs', { method: 'POST', body });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Upload failed.');
    activeJob = payload.job_id;
    await pollJob();
    clearInterval(pollTimer);
    pollTimer = setInterval(pollJob, 3000);
  } catch (error) {
    showUploadError(error.message.includes('Failed to fetch')
      ? 'Cannot reach the VISOR API. Start the backend with Docker Compose, or configure VITE_API_BASE_URL to point to your deployed API.'
      : error.message);
  }
}

async function pollJob() {
  if (!activeJob) return;
  try {
    const response = await fetch(API_BASE + '/api/jobs/' + activeJob);
    const job = await response.json();
    if (!response.ok) throw new Error(job.detail || 'Could not read job status.');
    document.querySelector('#jobTitle').textContent = job.status === 'completed' ? 'Your space is ready' : 'Reconstructing your environment';
    document.querySelector('#jobState').textContent = job.status.toUpperCase();
    document.querySelector('#jobStage').textContent = job.stage || 'Processing';
    document.querySelector('#jobMessage').textContent = job.message || '';
    document.querySelector('#jobProgressFill').style.width = (job.progress || 0) + '%';
    document.querySelector('#jobPercent').textContent = (job.progress || 0) + '%';
    if (job.frames?.length) renderFrameGallery(job);
    if (job.status === 'completed') {
      clearInterval(pollTimer);
      await showModel(job);
    } else if (job.status === 'failed') {
      clearInterval(pollTimer);
      const error = document.querySelector('#jobError');
      error.hidden = false;
      error.textContent = job.error || 'Reconstruction failed. Try a video with clearer overlapping views.';
    }
  } catch (error) {
    document.querySelector('#jobMessage').textContent = 'Connection interrupted. VISOR will retry automatically.';
  }
}

function renderFrameGallery(job) {
  const container = document.querySelector('#frameResults');
  if (container.dataset.job === job.job_id) return;
  container.dataset.job = job.job_id;
  const title = document.createElement('div');
  title.className = 'frames-title';
  title.textContent = 'EXTRACTED KEYFRAMES · ' + job.frames.length + ' USABLE FRAMES';
  container.append(title);
  job.frames.slice(0, 8).forEach((name, index) => {
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.alt = 'Extracted video frame ' + (index + 1);
    image.src = API_BASE + '/api/jobs/' + job.job_id + '/frames/' + encodeURIComponent(name);
    container.append(image);
  });
}

async function showModel(job) {
  const panel = document.querySelector('#modelResult');
  panel.hidden = false;
  const modelUrl = API_BASE + '/api/jobs/' + job.job_id + '/model';
  document.querySelector('#downloadModel').href = modelUrl;
  const stats = job.artifacts?.stats || {};
  document.querySelector('#modelStats').textContent =
    (stats.vertices ?? '—') + ' VERTICES  /  ' + (stats.triangles ?? '—') + ' TRIANGLES  /  ' + (stats.points ?? '—') + ' POINTS';
  await mountModelViewer(modelUrl);
}

async function mountModelViewer(url) {
  const host = document.querySelector('#modelViewer');
  if (viewerCleanup) viewerCleanup();
  host.innerHTML = '';
  const scene3D = new THREE.Scene();
  scene3D.background = new THREE.Color(0x080a10);
  const camera = new THREE.PerspectiveCamera(45, host.clientWidth / 420, 0.01, 10000);
  camera.position.set(3, 2.4, 4);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, 420);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  scene3D.add(new THREE.HemisphereLight(0xc9d8ff, 0x252b3b, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  scene3D.add(key);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  const loader = new GLTFLoader();
  loader.load(url, gltf => {
    const object = gltf.scene;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    object.position.sub(center);
    scene3D.add(object);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(maxDim * 1.7, maxDim * 1.25, maxDim * 1.7);
    camera.near = maxDim / 1000;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
  }, undefined, error => {
    host.innerHTML = '<div class="viewer-placeholder">MODEL COULD NOT BE LOADED. DOWNLOAD THE GLB TO INSPECT IT.</div>';
    console.error(error);
  });
  let frame;
  const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene3D, camera); };
  animate();
  const resize = () => {
    const width = host.clientWidth;
    camera.aspect = width / 420;
    camera.updateProjectionMatrix();
    renderer.setSize(width, 420);
  };
  window.addEventListener('resize', resize);
  viewerCleanup = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

uploadButton.addEventListener('click', event => {
  if (!videoInput.files?.length) return;
});
videoInput.addEventListener('change', () => { if (videoInput.files?.[0]) uploadVideo(videoInput.files[0]); });
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  const file = event.dataTransfer.files?.[0];
  if (file) uploadVideo(file);
});
document.querySelector('#newJobButton').addEventListener('click', () => {
  clearInterval(pollTimer);
  activeJob = null;
  videoInput.value = '';
  document.querySelector('#frameResults').innerHTML = '';
  document.querySelector('#frameResults').dataset.job = '';
  document.querySelector('#modelResult').hidden = true;
  jobPanel.hidden = true;
  document.querySelector('#upload').scrollIntoView({ behavior: 'smooth' });
  if (viewerCleanup) viewerCleanup();
});
