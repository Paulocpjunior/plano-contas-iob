(function(){
 'use strict';
 let active=false,busy=false,timer;
 const el=id=>document.getElementById(id);
 function text(tag,value,parent){const n=document.createElement(tag);n.textContent=value;parent.appendChild(n);return n;}
 function render(data){
  const root=el('monitor-cards');root.replaceChildren();
  for(const m of data.metrics){
   const card=text('section','',root);card.className='summary-card';
   text('h3',m.label,card);
   const last=m.points[m.points.length-1];
   const stale=last&&Date.now()-Date.parse(last.time)>300000;
   text('h2',last?last.value.toLocaleString('pt-BR',{maximumFractionDigits:2})+' '+m.unit:'—',card);
   text('p',last?(stale?'Amostra atrasada · ':'Amostra · ')+new Date(last.time).toLocaleTimeString('pt-BR'):m.message||'Sem amostras no período.',card);
   if(last){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 400 110');svg.setAttribute('role','img');svg.setAttribute('aria-label',m.label+' na última hora');svg.style.width='100%';
    const max=Math.max(...m.points.map(p=>p.value),1),start=Date.parse(data.start);
    let segment=[];
    function draw(){if(!segment.length)return;const line=document.createElementNS(ns,'polyline');line.setAttribute('points',segment.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#3b82f6');line.setAttribute('stroke-width','2');svg.appendChild(line);segment=[];}
    let previous;
    for(const p of m.points){const t=Date.parse(p.time);if(previous&&t-previous>90000)draw();const x=Math.max(0,Math.min(400,(t-start)/3600000*400)),y=100-p.value/max*90;segment.push(x+','+y);const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','2');dot.setAttribute('fill','#3b82f6');const title=document.createElementNS(ns,'title');title.textContent=new Date(t).toLocaleTimeString('pt-BR')+' · '+p.value.toFixed(2)+' '+m.unit;dot.appendChild(title);svg.appendChild(dot);previous=t;}draw();card.appendChild(svg);
    text('small','Escala: 0 a '+max.toLocaleString('pt-BR',{maximumFractionDigits:2})+' '+m.unit+' · pontos a cada minuto',card);
   }
  }
  el('monitor-status').textContent='Consulta: '+new Date(data.generatedAt).toLocaleString('pt-BR')+' · '+data.service+(data.metrics.some(m=>m.status==='unavailable')?' · Algumas métricas estão indisponíveis.':'');
 }
 async function refresh(){
  if(!active||document.hidden||busy)return;
  busy=true;el('monitor-refresh').disabled=true;el('monitor-status').textContent='Consultando métricas…';
  const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),25000);
  try{const r=await window.API.apiFetch('/api/admin/server-monitor',{signal:controller.signal});if(!r.ok)throw new Error(r.status===403?'Acesso exclusivo de administrador.':'Falha na consulta.');render(await r.json());}
  catch(e){el('monitor-status').textContent=(e.name==='AbortError'?'Consulta excedeu o prazo.':e.message)+' Os dados anteriores, se exibidos, não foram atualizados. Tente novamente.';}
  finally{clearTimeout(deadline);busy=false;el('monitor-refresh').disabled=false;}
 }
 window.CCIMonitor={activate(value){active=value;clearInterval(timer);if(active){refresh();timer=setInterval(refresh,60000);}}};
 el('monitor-refresh').addEventListener('click',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
