/**
 * Pantalla de inicio animada de la app instalada. Arranca idéntica a la que dibuja el celular (fondo negro, cuadrado
 * verde con la S) y la «despierta»: el cuadrado respira y se redondea, la S se recoge, aparece el anillo de origen,
 * un punto de luz recorre la ruta dibujando la S, el punto de destino llega con ondas de GPS, un brillo cruza el
 * vidrio y todo se abre hacia el sistema. Va en el HTML del servidor (se ve desde el primer instante, sin esperar
 * a React); solo en la app instalada y una vez por apertura. Respeta «reducir movimiento».
 */
const ROUTE = "M93.36 186 A40 40 0 1 0 128 126 A40 40 0 1 1 162.64 66";
const BODY = "M176.5 58 A56 56 0 1 0 128 142 A24 24 0 1 1 107.22 178 L79.5 194 A56 56 0 1 0 128 110 A24 24 0 1 1 148.78 74 Z";

// Decide antes de pintar si se muestra; lo quita cuando la app ya cargó (mínimo lo que dura la animación)
const script = `(function(){try{var d=document.documentElement,sa=matchMedia("(display-mode: standalone)").matches||navigator.standalone||/[?&]splash/.test(location.search);
if(!sa||sessionStorage.getItem("sb-splash"))return;sessionStorage.setItem("sb-splash","1");d.dataset.splash="1";
var t0=Date.now(),rm=matchMedia("(prefers-reduced-motion: reduce)").matches,min=rm?500:2250,done=false;
function end(){if(done)return;done=true;d.dataset.splash="out";setTimeout(function(){delete d.dataset.splash},rm?200:560)}
function ready(){setTimeout(end,Math.max(0,min-(Date.now()-t0)))}
if(document.readyState==="complete")ready();else addEventListener("load",ready);setTimeout(end,6000)}catch(e){}})();`;

export const splashScript = script;

export function Splash() {
  return (
    <div id="sb-splash" aria-hidden="true">
      <div className="spl-stage">
        <span className="spl-wave" /><span className="spl-wave spl-wave2" />
        <div className="spl-tile">
          <span className="spl-shine" />
          <svg viewBox="0 0 256 256" className="spl-mark">
            <defs>
              <mask id="spl-draw" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
                <path className="spl-ink" d={ROUTE} pathLength={1} fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round" />
              </mask>
            </defs>
            <g transform="translate(3.59 0)" fill="#fff">
              <path d={BODY} mask="url(#spl-draw)" />
              <g className="spl-origin"><path fillRule="evenodd" d="M114.19 175.68 A25 25 0 1 1 64.19 175.68 A25 25 0 1 1 114.19 175.68 Z M98.19 175.68 A9 9 0 1 1 80.19 175.68 A9 9 0 1 1 98.19 175.68 Z" /></g>
              <g className="spl-dest"><circle cx="162.64" cy="66" r="22" /></g>
              <circle className="spl-ping" cx="162.64" cy="66" r="22" fill="none" stroke="#fff" strokeWidth="3" />
              <circle className="spl-car" r="9" fill="#d9ffd0">
                <animateMotion dur="0.75s" begin="0.62s" fill="freeze" path={ROUTE} calcMode="spline" keyTimes="0;1" keySplines="0.55 0 0.25 1" />
              </circle>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
