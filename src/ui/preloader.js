const overlay=document.querySelector('#preloader');
const bar=document.querySelector('#loading-progress');
const value=document.querySelector('#loading-value');
let progress=0,finished=false,failed=false;

function advance(next){
  if(finished||failed)return;
  progress=Math.max(progress,Math.min(100,Math.round(next)));
  bar.style.transform=`scaleX(${progress/100})`;
  value.textContent=`${String(progress).padStart(3,'0')}%`;
  overlay.setAttribute('aria-valuenow',String(progress));
}
async function complete(){
  if(failed)return;
  advance(100);
  // The caller has rendered the scene; give the compositor a paint before revealing it.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  finished=true;document.body.classList.add('ready');overlay.setAttribute('aria-hidden','true');
  const hide=()=>{overlay.hidden=true;document.documentElement.classList.remove('initializing');};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)hide();else setTimeout(hide,950);
}
function fail(error){
  failed=true;
  document.querySelector('#loading-label').textContent='INITIALIZATION INTERRUPTED';
  document.querySelector('#loading-detail').textContent='暂时无法建立航线，请重新载入。';
  document.querySelector('#loading-retry').hidden=false;
  console.error(error);
}
document.querySelector('#loading-retry').addEventListener('click',()=>location.reload());
export const preloader={advance,complete,fail,diagnostics:()=>({progress,finished,failed})};
