/**
 * Starts the landing's intro on a full page load: the moon and the letters
 * (data-drop 0 to 8) fall in one by one, in a new random order and with random
 * gaps each time. It runs inline, before they paint, and writes its own short
 * stylesheet, so React's markup never differs between server and client, a
 * visit without JavaScript just shows the logo, and coming back to the landing
 * inside the site doesn't replay it (React doesn't run an inserted script).
 */
const SCRIPT = `(function(){
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var o=[0,1,2,3,4,5,6,7,8],i,j,t,at=60,css="";
for(i=8;i>0;i--){j=Math.floor(Math.random()*(i+1));t=o[i];o[i]=o[j];o[j]=t}
for(i=0;i<9;i++){
css+='[data-drop="'+o[i]+'"]{animation:dropIn 780ms cubic-bezier(.3,.75,.35,1) '+Math.round(at)+'ms both;--drop-tilt:'+Math.round(Math.random()*44-22)+'deg}';
at+=70+Math.random()*150}
var s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
setTimeout(function(){s.remove()},at+1000)
})()`;

export function LogoIntro() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
