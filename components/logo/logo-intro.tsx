/**
 * Starts the landing's intro on a full page load: the moon and the letters
 * (data-drop 0 to 8) come down together, like a sign lowered on ropes, a fast
 * ripple left to right rather than a sequence. Each overshoots a touch and
 * settles (dropIn in app/globals.css), with its own small sag and swing. It runs
 * inline, before they paint, and writes its own short stylesheet, so React's
 * markup never differs between server and client, a visit without JavaScript
 * just shows the logo, and coming back to the landing inside the site doesn't
 * replay it (React doesn't run an inserted script).
 */
const SCRIPT = `(function(){
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var i,css="";
for(i=0;i<9;i++){
css+='[data-drop="'+i+'"]{transform-origin:50% 0;animation:dropIn 1150ms linear '+Math.round(40+i*22+Math.random()*12)+'ms both;--drop-sag:'+Math.round(11+Math.random()*6)+'px;--drop-swing:'+((Math.random()<.5?-1:1)*(1.2+Math.random()*1.6)).toFixed(1)+'deg}'}
var s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
setTimeout(function(){s.remove()},1800)
})()`;

export function LogoIntro() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
