import './style.css';

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