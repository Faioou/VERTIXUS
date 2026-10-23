const IS_ADMIN = ['localhost','127.0.0.1'].includes(location.hostname);
let questions = [];
let currentImage = '';
let correct = 0;
let answered = 0;
let expressions = [];
let exprCorrect = 0;
let exprAnswered = 0;
let expressionPendingIds = [];
let currentExpressionId = null;
let previousExpressionId = null;
let trainingPendingIds = [];
let currentTrainingId = null;
let previousTrainingId = null;
let currentChoiceOrder = [];
let questionEditContext = null;
let practicePendingIds = [];
let currentPracticeId = null;
let previousPracticeId = null;
let practiceCorrect = 0;
let practiceAnswered = 0;
let currentPracticeChoiceOrder = [];


function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function norm(s){return String(s??'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}

function initMode(){
 const st=document.getElementById('modeStatus');
 if(IS_ADMIN){
   st.className='status local';
   st.innerHTML='🟢 <strong>Modo administrador local</strong> — criar, editar e apagar grava diretamente no repositório local.';
 }else{
   st.className='status public';
   st.innerHTML='🌐 <strong>Modo público</strong> — a aplicação está a ler as perguntas publicadas no repositório.';
   document.querySelectorAll('.admin-only').forEach(x=>x.classList.add('hidden'));
 }
}
document.querySelectorAll('.tab').forEach(btn=>{
 btn.addEventListener('click',()=>{
   document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
   document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
   btn.classList.add('active');
   document.getElementById(btn.dataset.panel).classList.add('active');
   if(btn.dataset.panel==='bank') renderBank();
   if(btn.dataset.panel==='practice') ensurePracticeTraining();
   if(btn.dataset.panel==='expressions') renderExpressionQuiz();
   if(btn.dataset.panel==='expressionBase') renderExpressionBank();
 });
});

async function fetchQuestions(){
 const url = IS_ADMIN ? '/api/questions' : `data/perguntas.json?v=${Date.now()}`;
 const r=await fetch(url,{cache:'no-store'});
 if(!r.ok)throw new Error('Não foi possível carregar as perguntas.');
 return await r.json();
}
async function persistQuestions(){
 if(!IS_ADMIN)throw new Error('A edição só está disponível em localhost.');
 const r=await fetch('/api/questions',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(questions)});
 if(!r.ok)throw new Error('Não foi possível gravar data/perguntas.json.');
}
async function loadQuestions(){
 try{
   questions=await fetchQuestions();

   // Compatibilidade: perguntas antigas sem "grupo" são consideradas teóricas.
   questions.forEach(q=>{ if(!q.grupo) q.grupo='teoria'; });

   const theory=theoryQuestions();
   const practice=practiceQuestions();

   correct=0;
   answered=0;
   trainingPendingIds=theory.map(q=>q.id);
   currentTrainingId=null;
   previousTrainingId=null;

   practiceCorrect=0;
   practiceAnswered=0;
   practicePendingIds=practice.map(q=>q.id);
   currentPracticeId=null;
   previousPracticeId=null;

   document.getElementById('total').textContent=theory.length;
   document.getElementById('correct').textContent=0;
   document.getElementById('answered').textContent=0;

   document.getElementById('practiceTotal').textContent=practice.length;
   document.getElementById('practiceCorrect').textContent=0;
   document.getElementById('practiceAnswered').textContent=0;

   renderBank();
   nextTrainingQuestion(true);
   renderPracticeIdle();
 }catch(e){
   document.getElementById('quiz').innerHTML=`<div class="card feedback bad" style="display:block">${esc(e.message)}</div>`;
   document.getElementById('practiceQuiz').innerHTML=`<div class="card feedback bad" style="display:block">${esc(e.message)}</div>`;
 }
}

function theoryQuestions(){
 return questions.filter(q=>(q.grupo||'teoria')!=='pratica');
}
function practiceQuestions(){
 return questions.filter(q=>(q.grupo||'teoria')==='pratica');
}

function formatQuestionText(raw, fillInputs=false, question=null){
 let text=String(raw??'');
 const slots=[];

 if(fillInputs){
   text=text.replace(/\[\[(\d+)\]\]/g,(m,n)=>{
     const pos=Number(n)-1;
     const token=`@@FILL_SLOT_${slots.length}@@`;
     const accepted=(question?.respostas?.[pos]||[]).map(x=>String(x||''));
     const longest=accepted.reduce((max,v)=>Math.max(max,v.length),0);
     const chars=Math.max(4,Math.min(34,longest||8));
     slots.push(`<span class="train-fill-slot">
       <input class="train-fill-input" data-pos="${pos}" placeholder="escreva a resposta" style="--answer-chars:${chars}">
     </span>`);
     return token;
   });
 }else{
   text=text.replace(/\[\[(\d+)\]\]/g,'____');
 }

 // No modo de preenchimento, um espaço deve ficar dentro da frase,
 // mesmo quando uma pergunta antiga foi guardada com uma quebra de linha
 // antes ou depois do [[n]].
 if(fillInputs){
   text=text
     .replace(/\s*\n\s*(?=@@FILL_SLOT_\d+@@)/g,' ')
     .replace(/(@@FILL_SLOT_\d+@@)\s*\n\s*/g,'$1 ');
 }

 let h=esc(text);
 h=h.replace(/\*\*\*\*(.+?)\*\*\*\*/g,'<strong>$1</strong>');
 h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
 h=h.split(/\r?\n/).map(line=>line.trim()==='---'?'<hr class="question-separator">':line).join('<br>');
 slots.forEach((slot,i)=>{h=h.replace(`@@FILL_SLOT_${i}@@`,slot);});
 return h;
}
function promptHTML(q){return formatQuestionText(q.pergunta,q.tipo==='fill',q);}

function randomPendingId(){
 if(!trainingPendingIds.length) return null;
 let candidates=trainingPendingIds;
 if(trainingPendingIds.length>1 && previousTrainingId){
   const filtered=trainingPendingIds.filter(id=>id!==previousTrainingId);
   if(filtered.length) candidates=filtered;
 }
 const chosen=candidates[Math.floor(Math.random()*candidates.length)];
 const pos=trainingPendingIds.indexOf(chosen);
 if(pos>=0) trainingPendingIds.splice(pos,1);
 return chosen;
}

function nextTrainingQuestion(initial=false){
 const pool=theoryQuestions();
 if(!pool.length){
   document.getElementById('quiz').innerHTML='<div class="card small">Ainda não existem perguntas na base de dados.</div>';
   return;
 }
 if(!trainingPendingIds.length){
   currentTrainingId=null;
   document.getElementById('quiz').innerHTML=`
     <div class="card">
       <span class="tag">Treino concluído</span>
       <div class="q" style="margin-top:12px"><strong>🎉 Acertou todas as ${pool.length} perguntas.</strong></div>
       <div class="small" style="margin-top:8px">Foram necessárias ${answered} tentativa${answered===1?'':'s'}.</div>
       <div class="actions" style="margin-top:14px"><button class="primary" onclick="restartTraining()">Começar novo treino</button></div>
     </div>`;
   return;
 }
 currentTrainingId=randomPendingId();
 renderQuiz();
}

function restartTraining(){
 correct=0;
 answered=0;
 trainingPendingIds=theoryQuestions().map(q=>q.id);
 currentTrainingId=null;
 previousTrainingId=null;
 document.getElementById('correct').textContent='0';
 document.getElementById('answered').textContent='0';
 nextTrainingQuestion(true);
}

function currentTrainingQuestion(){
 return theoryQuestions().find(q=>q.id===currentTrainingId) || null;
}

function shuffledChoiceOrder(q){
 const order=(q.opcoes||[]).map((_,i)=>i);
 for(let i=order.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [order[i],order[j]]=[order[j],order[i]];
 }
 return order;
}

function renderQuiz(){
 const q=currentTrainingQuestion();
 if(!q){ nextTrainingQuestion(); return; }
 const i=questions.findIndex(x=>x.id===q.id);
 let controls='';
 if(q.tipo==='fill') controls=`<div class="actions"><button class="primary" onclick="checkFill(${i})">Corrigir resposta</button></div>`;
 if(q.tipo==='choice'){
   currentChoiceOrder=shuffledChoiceOrder(q);
   controls=currentChoiceOrder.map((originalIndex,displayIndex)=>`<button class="choice" data-original-index="${originalIndex}" onclick="checkChoice(${i},${originalIndex},this)">${String.fromCharCode(65+displayIndex)}. ${esc(q.opcoes[originalIndex])}</button>`).join('');
 }else{
   currentChoiceOrder=[];
 }
 if(q.tipo==='correct'){
   controls=`<div id="yn${i}" class="actions"><button class="secondary" onclick="correctStep(${i},true,this)">Sim, está certa</button><button class="secondary" onclick="correctStep(${i},false,this)">Não, está errada</button></div>
   <div id="fix${i}" class="ans hidden">Altere <strong>${esc(q.palavra_errada||'')}</strong> para <input id="fixInput${i}" class="blank" value="${esc(q.palavra_errada||'')}"> <button class="primary" onclick="finishCorrection(${i})">Validar</button></div>`;
 }
 const mastered=correct;
 const remaining=theoryQuestions().length-mastered;
 document.getElementById('quiz').innerHTML=`
   <div class="card" id="q${i}" data-done="0">
     <div class="toolbar" style="margin-bottom:10px">
       <span class="tag">${esc(q.categoria)}</span>
       <span class="pill">Faltam dominar: ${remaining}</span>
     </div>
     ${q.imagem?`<div class="img"><img src="${esc(q.imagem)}" alt="Imagem da questão"></div>`:''}
     <div class="q">${promptHTML(q)}</div>
     ${controls}
     <div id="fb${i}" class="feedback"></div>
     <div id="next${i}" class="actions hidden" style="margin-top:12px"><button class="primary" onclick="nextTrainingQuestion()">Próxima pergunta →</button></div>
   </div>`;
}

function registerAttempt(i,ok){
 const c=document.getElementById('q'+i);
 if(!c || c.dataset.done==='1') return false;
 c.dataset.done='1';
 answered++;
 if(ok){
   correct++;
 }else{
   // A pergunta errada volta à fila para reaparecer mais tarde.
   if(currentTrainingId && !trainingPendingIds.includes(currentTrainingId)) trainingPendingIds.push(currentTrainingId);
 }
 previousTrainingId=currentTrainingId;
 document.getElementById('correct').textContent=correct;
 document.getElementById('answered').textContent=answered;
 const next=document.getElementById('next'+i);
 if(next) next.classList.remove('hidden');
 return true;
}

function correctAnswerHTML(q){
 if(q.tipo==='fill'){
   return (q.respostas||[]).map((a,i)=>`<div><strong>${i+1}.</strong> ${esc((a||[])[0]||'')}</div>`).join('');
 }
 if(q.tipo==='choice'){
   const idx=Number(q.resposta_correta||0);
   const displayIndex=currentChoiceOrder.indexOf(idx);
   const letter=displayIndex>=0?String.fromCharCode(65+displayIndex):'';
   return `<div>${letter?`<strong>${letter}.</strong> `:''}${esc(q.opcoes?.[idx]||'')}</div>`;
 }
 if(q.tipo==='correct'){
   if(q.frase_correta) return '<div><strong>A frase está correta.</strong></div>';
   return `<div>Substituir <strong>${esc(q.palavra_errada||'')}</strong> por <strong>${esc(q.palavra_correta||'')}</strong>.</div>`;
 }
 return '';
}

function feedback(i,ok,text){
 const f=document.getElementById('fb'+i);
 const q=questions[i];
 f.className='feedback '+(ok?'ok':'bad');
 if(ok){
   f.innerHTML='✅ Correto. '+esc(text||'');
 }else if(q.tipo==='fill'){
   f.innerHTML=`❌ Incorreto.${text?` ${esc(text)}`:''}
     <div style="margin-top:8px"><strong>Os campos a vermelho mostram a resposta correta.</strong></div>
     <div style="margin-top:8px"><strong>Esta pergunta voltará a aparecer mais tarde.</strong></div>`;
 }else{
   f.innerHTML=`❌ Incorreto.${text?` ${esc(text)}`:''}
     <div class="correct-answer-reveal">
       <div class="correct-answer-title">Resposta correta</div>
       <div class="correct-answer-value">${correctAnswerHTML(q)}</div>
     </div>
     <div style="margin-top:8px"><strong>Esta pergunta voltará a aparecer mais tarde.</strong></div>`;
 }
}

function checkFill(i){
 const q=questions[i],card=document.getElementById('q'+i);let ok=true;
 if(!card || card.dataset.done==='1') return;

 card.querySelectorAll('[data-pos]').forEach(inp=>{
   const pos=Number(inp.dataset.pos);
   const respostas=q.respostas?.[pos]||[];
   const arr=respostas.map(norm);
   const userValue=inp.value.trim();
   const hit=arr.includes(norm(userValue));

   inp.classList.remove('fill-result-correct','fill-result-wrong');

   if(hit){
     inp.classList.add('fill-result-correct');
     inp.title='Resposta correta';
   }else{
     ok=false;
     const correctValue=respostas[0]||'';
     inp.dataset.userAnswer=userValue;
     inp.value=correctValue;
     inp.classList.add('fill-result-wrong');
     inp.title=userValue
       ? `A sua resposta: ${userValue} | Correta: ${correctValue}`
       : `Resposta correta: ${correctValue}`;
   }

   inp.disabled=true;
 });

 if(registerAttempt(i,ok)) feedback(i,ok,q.explicacao);
}

function checkChoice(i,originalIndex,btn){
 const q=questions[i],ok=originalIndex===q.resposta_correta;
 if(!registerAttempt(i,ok)) return;
 document.querySelectorAll(`#q${i} .choice`).forEach(b=>{
   b.disabled=true;
   const optionIndex=Number(b.dataset.originalIndex);
   if(optionIndex===q.resposta_correta)b.style.background='#ecfdf3';
   if(optionIndex===originalIndex&&!ok)b.style.background='#fef3f2';
 });
 feedback(i,ok,q.explicacao);
}

function correctStep(i,yes,btn){
 const q=questions[i];
 const card=document.getElementById('q'+i);
 if(!card || card.dataset.done==='1') return;
 if(q.frase_correta){
   if(registerAttempt(i,yes)){
     document.querySelectorAll(`#yn${i} button`).forEach(b=>b.disabled=true);
     feedback(i,yes,q.explicacao);
   }
   return;
 }
 if(yes){
   if(registerAttempt(i,false)){
     document.querySelectorAll(`#yn${i} button`).forEach(b=>b.disabled=true);
     feedback(i,false,q.explicacao);
   }
 }else{
   document.getElementById('fix'+i).classList.remove('hidden');
   document.querySelectorAll(`#yn${i} button`).forEach(b=>b.disabled=true);
   btn.style.background='#ecfdf3';
 }
}

function finishCorrection(i){
 const q=questions[i],inp=document.getElementById('fixInput'+i);
 const card=document.getElementById('q'+i);
 if(!card || card.dataset.done==='1') return;
 const ok=norm(inp.value)===norm(q.palavra_correta);
 inp.style.background=ok?'#ecfdf3':'#fef3f2';
 inp.disabled=true;
 if(registerAttempt(i,ok)) feedback(i,ok,q.explicacao);
}

function answerSummary(q){
 if(q.tipo==='fill')return (q.respostas||[]).map(a=>a[0]).join(' • ');
 if(q.tipo==='choice')return q.opcoes?.[q.resposta_correta]||'';
 return q.frase_correta?'A frase está correta':`Não. Alterar “${q.palavra_errada}” para “${q.palavra_correta}”`;
}
function renderBank(){
 const s=norm(document.getElementById('search')?.value||'');
 const f=document.getElementById('filter')?.value||'';
 const area=document.getElementById('areaFilter')?.value||'';
 const A=questions.filter(q=>{
   const group=q.grupo||'teoria';
   return (!f||q.tipo===f) &&
          (!area||group===area) &&
          (!s||norm(q.categoria+' '+q.pergunta+' '+answerSummary(q)).includes(s));
 });
 document.getElementById('bankCount').textContent=questions.length;
 document.getElementById('bankList').innerHTML=A.map(q=>`
 <div class="item bank-question-item" id="bank-question-${esc(q.id)}" data-question-id="${esc(q.id)}">
   <div class="head">
     <div>
       <span class="tag">${esc(q.categoria)}</span>
       <span class="tag question-area-tag">${(q.grupo||'teoria')==='pratica'?'🚗 Prática':'📘 Teoria'}</span>
     </div>
     ${IS_ADMIN?`<div class="actions">
       <button class="secondary" onclick="moveQuestionArea('${q.id}','${(q.grupo||'teoria')==='pratica'?'teoria':'pratica'}')">${(q.grupo||'teoria')==='pratica'?'Mover para teoria':'Mover para prática'}</button>
       <button class="secondary" onclick="editQuestion('${q.id}')">Editar</button>
       <button class="danger" onclick="deleteQuestion('${q.id}')">Apagar</button>
     </div>`:''}
   </div>
   ${q.imagem?`<div class="img"><img src="${esc(q.imagem)}" alt="Imagem da pergunta"></div>`:''}
   <div class="q">${formatQuestionText(q.pergunta,false)}</div>
   <div class="ans"><strong>Resposta:</strong> ${esc(answerSummary(q))}</div>
   ${q.explicacao?`<div class="small" style="margin-top:8px"><strong>Explicação:</strong> ${esc(q.explicacao)}</div>`:''}
 </div>`).join('')||'<div class="card small">Sem resultados.</div>';
}



async function moveQuestionArea(id,target){
 if(!IS_ADMIN)return;
 const q=questions.find(x=>x.id===id);
 if(!q)return;

 q.grupo=target==='pratica'?'pratica':'teoria';
 await persistQuestions();
 await loadQuestions();

 // Regressa à Base e destaca a pergunta movida.
 activateQuestionPanel('bank');
 const areaFilter=document.getElementById('areaFilter');
 if(areaFilter)areaFilter.value='';
 renderBank();

 requestAnimationFrame(()=>{
   const card=document.querySelector(`[data-question-id="${String(id).replace(/"/g,'\\"')}"]`);
   if(card){
     card.scrollIntoView({behavior:'smooth',block:'center'});
     card.classList.add('question-edit-highlight');
     setTimeout(()=>card.classList.remove('question-edit-highlight'),2600);
   }
 });
}

function activateQuestionPanel(panelName){
 const tab=document.querySelector(`[data-panel="${panelName}"]`);
 const panel=document.getElementById(panelName);
 if(!tab||!panel)return;
 document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
 document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
 tab.classList.add('active');
 panel.classList.add('active');
}
function editorSecondaryButton(){
 const editor=document.getElementById('editor');
 if(!editor)return null;
 const buttons=[...editor.querySelectorAll('.actions button')];
 return buttons.find(b=>b.getAttribute('onclick')==='clearEditor()')||buttons.find(b=>/limpar|cancelar/i.test(b.textContent||''));
}
function updateEditorSecondaryButton(){const btn=editorSecondaryButton();if(btn)btn.textContent=questionEditContext?'Cancelar edição':'Limpar';}
function captureQuestionEditContext(questionId){questionEditContext={id:questionId,search:document.getElementById('search')?.value||'',filter:document.getElementById('filter')?.value||'',scrollY:window.scrollY};updateEditorSecondaryButton();}
function returnToEditedQuestion(questionId,highlight=true){
 const ctx=questionEditContext||{id:questionId};activateQuestionPanel('bank');
 const search=document.getElementById('search'),filter=document.getElementById('filter');
 if(search&&ctx.search!==undefined)search.value=ctx.search;if(filter&&ctx.filter!==undefined)filter.value=ctx.filter;
 renderBank();
 requestAnimationFrame(()=>{const card=document.querySelector(`[data-question-id="${String(questionId).replace(/"/g,'\\"')}"]`);if(card){card.scrollIntoView({behavior:'smooth',block:'center'});if(highlight){card.classList.add('question-edit-highlight');setTimeout(()=>card.classList.remove('question-edit-highlight'),3200);}}else if(Number.isFinite(ctx.scrollY)){window.scrollTo({top:ctx.scrollY,behavior:'smooth'});}});
 questionEditContext=null;updateEditorSecondaryButton();
}

function toggleFields(){
 setTimeout(installFillEditorDeletionUX,0);
 const t=document.getElementById('type').value,isFill=t==='fill';
 document.getElementById('normalPromptBlock').classList.toggle('hidden',isFill);
 document.getElementById('fillFields').classList.toggle('hidden',!isFill);
 document.getElementById('choiceFields').classList.toggle('hidden',t!=='choice');
 document.getElementById('correctFields').classList.toggle('hidden',t!=='correct');
 if(t==='choice')renderChoiceEditor(); updatePromptPreview();
}
function choiceLetter(i){return i<26?String.fromCharCode(65+i):String(i+1)}
function renderChoiceEditor(values=null,correctIndex=null){
 const countEl=document.getElementById('choiceCount'),host=document.getElementById('choiceOptions'),correct=document.getElementById('choiceAnswer'); if(!countEl||!host||!correct)return;
 let count=Number(countEl.value||4); if(values&&Array.isArray(values)){count=Math.max(2,Math.min(8,values.length));countEl.value=String(count)}
 const previous=[...host.querySelectorAll('.choice-option-input')].map(x=>x.value),data=values||previous;
 host.innerHTML=Array.from({length:count},(_,i)=>`<div><label>Opção ${choiceLetter(i)}</label><input class="choice-option-input" data-choice-index="${i}" value="${esc(data[i]||'')}" placeholder="Resposta ${choiceLetter(i)}"></div>`).join('');
 const old=correctIndex!==null&&correctIndex!==undefined?Number(correctIndex):Number(correct.value||0);
 correct.innerHTML=Array.from({length:count},(_,i)=>`<option value="${i}">${choiceLetter(i)}</option>`).join(''); correct.value=String(Math.min(Math.max(0,old),count-1));
}
function createFillSlot(answerText=''){
 const span=document.createElement('span');
 span.className='fill-slot';
 span.contentEditable='false';
 const badge=document.createElement('span');
 badge.className='fill-slot-label';
 badge.textContent='Resposta';
 const input=document.createElement('input');
 input.type='text';
 input.className='fill-answer-editor';
 input.setAttribute('data-fill-answer','1');
 input.placeholder='escreva a resposta';
 input.value=answerText||'';
 span.appendChild(badge);
 span.appendChild(input);
 return span;
}

function createBoldNode(text=''){
 const strong=document.createElement('strong');
 strong.className='editor-bold';
 strong.setAttribute('data-editor-bold','1');
 strong.textContent=text;
 return strong;
}

function createSeparatorNode(){
 const wrap=document.createElement('span');
 wrap.className='editor-separator-wrap';
 wrap.contentEditable='false';
 wrap.setAttribute('data-editor-separator','1');
 const hr=document.createElement('hr');
 hr.className='editor-separator';
 wrap.appendChild(hr);
 return wrap;
}

function appendVisualInline(container,text,respostas){
 if(!text)return;
 const tokenRe=/(\[\[(\d+)\]\]|\*\*\*\*(.+?)\*\*\*\*)/g;
 let last=0,m;
 while((m=tokenRe.exec(text))){
   if(m.index>last)container.appendChild(document.createTextNode(text.slice(last,m.index)));
   if(m[2]){
     const pos=Number(m[2])-1;
     container.appendChild(createFillSlot((respostas[pos]||[]).join('|')));
   }else{
     container.appendChild(createBoldNode(m[3]||''));
   }
   last=tokenRe.lastIndex;
 }
 if(last<text.length)container.appendChild(document.createTextNode(text.slice(last)));
}

function loadFillVisualEditor(pergunta='',respostas=[]){
 setTimeout(installFillEditorDeletionUX,0);
 const editor=document.getElementById('fillVisualEditor');
 editor.innerHTML='';
 const lines=String(pergunta||'').split(/\r?\n/);
 lines.forEach((line,idx)=>{
   if(line.trim()==='---'){
     editor.appendChild(createSeparatorNode());
   }else{
     appendVisualInline(editor,line,respostas);
   }
   if(idx<lines.length-1)editor.appendChild(document.createElement('br'));
 });
 updatePromptPreview();
 resetFillUndoHistory();
}

function setCaretAfter(node){
 const editor=document.getElementById('fillVisualEditor');
 if(!editor||!node)return;
 editor.focus();
 const range=document.createRange();
 range.setStartAfter(node);
 range.collapse(true);
 const sel=window.getSelection();
 sel.removeAllRanges();
 sel.addRange(range);
}

function processFillEditorTokens(){
 const editor=document.getElementById('fillVisualEditor');
 if(!editor)return;
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,{
   acceptNode(node){
     const p=node.parentElement;
     if(p&&(p.closest('.fill-slot')||p.closest('[data-editor-bold]')||p.closest('[data-editor-separator]'))){
       return NodeFilter.FILTER_REJECT;
     }
     const v=node.nodeValue||'';
     return (v.includes('[[]]')||/\*\*\*\*.+?\*\*\*\*/.test(v)||v.trim()==='---')
       ? NodeFilter.FILTER_ACCEPT
       : NodeFilter.FILTER_REJECT;
   }
 });
 const nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 let focusInput=null,lastInserted=null;

 nodes.forEach(node=>{
   const value=node.nodeValue||'';
   if(value.trim()==='---'){
     const sep=createSeparatorNode();
     node.replaceWith(sep);
     lastInserted=sep;
     return;
   }

   const tokenRe=/(\[\[\]\]|\*\*\*\*(.+?)\*\*\*\*)/g;
   let last=0,m,found=false;
   const frag=document.createDocumentFragment();

   while((m=tokenRe.exec(value))){
     found=true;
     if(m.index>last)frag.appendChild(document.createTextNode(value.slice(last,m.index)));
     if(m[1]==='[[]]'){
       const slot=createFillSlot('');
       frag.appendChild(slot);
       if(!focusInput)focusInput=slot.querySelector('input');
       lastInserted=slot;
     }else{
       const strong=createBoldNode(m[2]||'');
       frag.appendChild(strong);
       lastInserted=strong;
     }
     last=tokenRe.lastIndex;
   }

   if(!found)return;
   if(last<value.length)frag.appendChild(document.createTextNode(value.slice(last)));
   node.replaceWith(frag);
 });

 if(focusInput)setTimeout(()=>focusInput.focus(),0);
 else if(lastInserted)setTimeout(()=>setCaretAfter(lastInserted),0);
 updatePromptPreview();
}


function fillVisualEditorEl(){
 return document.getElementById('fillVisualEditor');
}

function isFillAtomicNode(node){
 if(!node || node.nodeType!==1) return false;
 return node.matches?.('hr, .fill-slot, .fill-answer-slot, [data-fill-slot], [contenteditable="false"]');
}

function normalizeFillEditorAfterDelete(){
 const editor=fillVisualEditorEl();
 if(!editor)return;

 // Remove contentores vazios deixados pelo browser.
 [...editor.querySelectorAll('div,p')].forEach(el=>{
   const hasMeaningfulChild=[...el.childNodes].some(n=>{
     if(n.nodeType===3)return n.textContent.replace(/\u200B/g,'').trim()!=='';
     if(n.nodeType===1)return !n.matches('br');
     return false;
   });
   if(!hasMeaningfulChild && el!==editor) el.remove();
 });

 // Mantém o editor editável quando fica totalmente vazio.
 if(!editor.textContent.replace(/\u200B/g,'').trim() && !editor.querySelector('input,hr,[data-fill-slot],.fill-slot,.fill-answer-slot')){
   editor.innerHTML='';
 }
}

function selectWholeFillEditor(){
 const editor=fillVisualEditorEl();
 if(!editor)return false;
 const sel=window.getSelection();
 if(!sel)return false;
 const range=document.createRange();
 range.selectNodeContents(editor);
 sel.removeAllRanges();
 sel.addRange(range);
 return true;
}

function removeSelectedFillAtomicNodes(){
 const editor=fillVisualEditorEl();
 const sel=window.getSelection();
 if(!editor||!sel||sel.rangeCount===0)return false;

 const range=sel.getRangeAt(0);
 if(range.collapsed)return false;

 const nodes=[...editor.querySelectorAll('hr, .fill-slot, .fill-answer-slot, [data-fill-slot], [contenteditable="false"]')];
 let removed=false;

 for(const el of nodes){
   try{
     if(range.intersectsNode(el)){
       el.remove();
       removed=true;
     }
   }catch{}
 }

 return removed;
}

function adjacentAtomicForCaret(range,key){
 let container=range.startContainer;
 let offset=range.startOffset;

 if(container.nodeType===3){
   const text=container.textContent||'';
   if(key==='Backspace' && offset===0){
     let n=container.previousSibling;
     while(n && n.nodeType===3 && !n.textContent.trim()) n=n.previousSibling;
     return isFillAtomicNode(n)?n:null;
   }
   if(key==='Delete' && offset===text.length){
     let n=container.nextSibling;
     while(n && n.nodeType===3 && !n.textContent.trim()) n=n.nextSibling;
     return isFillAtomicNode(n)?n:null;
   }
   return null;
 }

 if(container.nodeType===1){
   if(key==='Backspace' && offset>0){
     let n=container.childNodes[offset-1];
     while(n && n.nodeType===3 && !n.textContent.trim()) n=n.previousSibling;
     return isFillAtomicNode(n)?n:null;
   }
   if(key==='Delete' && offset<container.childNodes.length){
     let n=container.childNodes[offset];
     while(n && n.nodeType===3 && !n.textContent.trim()) n=n.nextSibling;
     return isFillAtomicNode(n)?n:null;
   }
 }

 return null;
}


const fillUndoState={
 undo:[],
 redo:[],
 restoring:false,
 max:100
};

function captureFillEditorState(){
 const editor=fillVisualEditorEl();
 if(!editor)return '';
 const clone=editor.cloneNode(true);
 const liveInputs=[...editor.querySelectorAll('input,textarea')];
 const cloneInputs=[...clone.querySelectorAll('input,textarea')];
 cloneInputs.forEach((el,i)=>{
   el.setAttribute('value',liveInputs[i]?.value||'');
 });
 return clone.innerHTML;
}

function resetFillUndoHistory(){
 fillUndoState.undo=[];
 fillUndoState.redo=[];
}

function pushFillUndoState(){
 if(fillUndoState.restoring)return;
 const snap=captureFillEditorState();
 const last=fillUndoState.undo[fillUndoState.undo.length-1];
 if(last===snap)return;
 fillUndoState.undo.push(snap);
 if(fillUndoState.undo.length>fillUndoState.max)fillUndoState.undo.shift();
 fillUndoState.redo=[];
}

function restoreFillEditorState(html){
 const editor=fillVisualEditorEl();
 if(!editor)return;
 fillUndoState.restoring=true;
 editor.innerHTML=html;
 fillUndoState.restoring=false;
 normalizeFillEditorAfterDelete();
 updatePromptPreview?.();
 requestAnimationFrame(()=>{
   try{
     editor.focus();
     const sel=window.getSelection();
     const r=document.createRange();
     r.selectNodeContents(editor);
     r.collapse(false);
     sel.removeAllRanges();
     sel.addRange(r);
   }catch{}
 });
}

function undoFillEditor(){
 if(!fillUndoState.undo.length)return;
 const current=captureFillEditorState();
 const prev=fillUndoState.undo.pop();
 fillUndoState.redo.push(current);
 restoreFillEditorState(prev);
}

function redoFillEditor(){
 if(!fillUndoState.redo.length)return;
 const current=captureFillEditorState();
 const next=fillUndoState.redo.pop();
 fillUndoState.undo.push(current);
 restoreFillEditorState(next);
}

function installFillEditorDeletionUX(){
 const editor=fillVisualEditorEl();
 if(!editor || editor.dataset.deleteUxInstalled==='1')return;
 editor.dataset.deleteUxInstalled='1';

 editor.addEventListener('beforeinput',e=>{
   if(fillUndoState.restoring)return;
   if(e.inputType==='historyUndo'||e.inputType==='historyRedo')return;
   pushFillUndoState();
 });

 editor.addEventListener('keydown',e=>{
   const key=e.key.toLowerCase();

   if((e.ctrlKey||e.metaKey) && !e.shiftKey && key==='z'){
     e.preventDefault();
     undoFillEditor();
     return;
   }

   if(((e.ctrlKey||e.metaKey) && key==='y') || ((e.ctrlKey||e.metaKey) && e.shiftKey && key==='z')){
     e.preventDefault();
     redoFillEditor();
     return;
   }

   // Ctrl+A seleciona todo o editor, mesmo que o foco esteja num campo interno.
   if((e.ctrlKey||e.metaKey) && key==='a'){
     e.preventDefault();
     selectWholeFillEditor();
     return;
   }

   if(e.key!=='Backspace' && e.key!=='Delete')return;

   const sel=window.getSelection();

   // Se há uma seleção, Delete/Backspace deve mesmo apagar tudo o que foi selecionado,
   // incluindo inputs e linhas horizontais.
   if(sel && sel.rangeCount && !sel.getRangeAt(0).collapsed){
     e.preventDefault();
     pushFillUndoState();

     const range=sel.getRangeAt(0);
     removeSelectedFillAtomicNodes();

     try{
       range.deleteContents();
     }catch{}

     sel.removeAllRanges();
     const end=document.createRange();
     end.selectNodeContents(editor);
     end.collapse(false);
     sel.addRange(end);

     normalizeFillEditorAfterDelete();
     updatePromptPreview?.();
     return;
   }

   // Permite apagar HR / campos especiais diretamente com Backspace/Delete.
   if(sel && sel.rangeCount){
     const range=sel.getRangeAt(0);
     const atomic=adjacentAtomicForCaret(range,e.key);
     if(atomic){
       e.preventDefault();
       pushFillUndoState();
       const parent=atomic.parentNode;
       const next=atomic.nextSibling;
       atomic.remove();

       const caret=document.createRange();
       if(next && next.parentNode){
         caret.setStartBefore(next);
       }else if(parent){
         caret.selectNodeContents(parent);
         caret.collapse(false);
       }else{
         caret.selectNodeContents(editor);
         caret.collapse(false);
       }

       sel.removeAllRanges();
       sel.addRange(caret);

       normalizeFillEditorAfterDelete();
       updatePromptPreview?.();
     }
   }
 });

 // Clicar numa linha torna-a selecionável visualmente.
 editor.addEventListener('click',e=>{
   if(e.target && e.target.matches('hr')){
     editor.querySelectorAll('hr.fill-separator-selected').forEach(x=>x.classList.remove('fill-separator-selected'));
     e.target.classList.add('fill-separator-selected');

     const sel=window.getSelection();
     if(sel){
       const range=document.createRange();
       range.selectNode(e.target);
       sel.removeAllRanges();
       sel.addRange(range);
     }
   }else{
     editor.querySelectorAll('hr.fill-separator-selected').forEach(x=>x.classList.remove('fill-separator-selected'));
   }
 });

 // Delete contextual da linha via duplo clique, sem depender da seleção do browser.
 editor.addEventListener('dblclick',e=>{
   if(e.target && e.target.matches('hr')){
     e.preventDefault();
     pushFillUndoState();
     e.target.remove();
     normalizeFillEditorAfterDelete();
     updatePromptPreview?.();
   }
 });
}

function serializeFillEditor(){
 const editor=document.getElementById('fillVisualEditor');
 const respostas=[];
 let counter=0;

 function walk(node){
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue;
   if(node.nodeType!==Node.ELEMENT_NODE)return '';
   const el=node;

   if(el.classList&&el.classList.contains('fill-slot')){
     counter++;
     const value=el.querySelector('[data-fill-answer]')?.value.trim()||'';
     respostas.push(value.split('|').map(x=>x.trim()).filter(Boolean));
     return `[[${counter}]]`;
   }
   if(el.hasAttribute('data-editor-bold')){
     return `****${el.textContent||''}****`;
   }
   if(el.hasAttribute('data-editor-separator')){
     return '\n---\n';
   }
   if(el.tagName==='BR')return '\n';

   let out='';
   el.childNodes.forEach(c=>out+=walk(c));
   if((el.tagName==='DIV'||el.tagName==='P')&&!out.endsWith('\n'))out+='\n';
   return out;
 }

 let pergunta='';
 editor.childNodes.forEach(n=>pergunta+=walk(n));
 return {
   pergunta:pergunta.replace(/\n{3,}/g,'\n\n').replace(/^\n+|\n+$/g,'').trim(),
   respostas
 };
}

function moveCaretAfterSlot(input){
 const slot=input.closest('.fill-slot');
 if(slot)setCaretAfter(slot);
}

function currentRawPrompt(){
 return document.getElementById('type').value==='fill'
   ? serializeFillEditor().pergunta
   : document.getElementById('prompt').value;
}

function updatePromptPreview(){
 const p=document.getElementById('promptPreview');
 if(!p)return;
 const raw=currentRawPrompt();
 p.innerHTML=raw?formatQuestionText(raw,false):'<span class="small">O enunciado aparecerá aqui.</span>';
}

function visualFragmentToClipboardText(root){
 function walk(node){
   if(node.nodeType===Node.TEXT_NODE) return node.nodeValue;
   if(node.nodeType!==Node.ELEMENT_NODE && node.nodeType!==Node.DOCUMENT_FRAGMENT_NODE) return '';

   if(node.nodeType===Node.ELEMENT_NODE){
     const el=node;
     if(el.classList?.contains('fill-slot')){
       const value=el.querySelector('[data-fill-answer]')?.value ?? '';
       return `[[${value}]]`;
     }
     if(el.hasAttribute?.('data-editor-bold')){
       return `****${el.textContent||''}****`;
     }
     if(el.hasAttribute?.('data-editor-separator')){
       return '\n---\n';
     }
     if(el.tagName==='BR') return '\n';
   }

   let out='';
   node.childNodes?.forEach(child=>out+=walk(child));
   if(node.nodeType===Node.ELEMENT_NODE && (node.tagName==='DIV'||node.tagName==='P') && !out.endsWith('\n')) out+='\n';
   return out;
 }
 return walk(root).replace(/\n{3,}/g,'\n\n').replace(/^\n+|\n+$/g,'');
}

function clipboardTextToVisualFragment(text){
 const frag=document.createDocumentFragment();
 const lines=String(text||'').split(/\r?\n/);

 function appendInline(line){
   const tokenRe=/(\[\[([\s\S]*?)\]\]|\*\*\*\*([\s\S]+?)\*\*\*\*)/g;
   let last=0,m;
   while((m=tokenRe.exec(line))){
     if(m.index>last) frag.appendChild(document.createTextNode(line.slice(last,m.index)));
     if(m[2]!==undefined){
       frag.appendChild(createFillSlot(m[2]));
     }else{
       frag.appendChild(createBoldNode(m[3]||''));
     }
     last=tokenRe.lastIndex;
   }
   if(last<line.length) frag.appendChild(document.createTextNode(line.slice(last)));
 }

 lines.forEach((line,i)=>{
   if(line.trim()==='---') frag.appendChild(createSeparatorNode());
   else appendInline(line);
   if(i<lines.length-1) frag.appendChild(document.createElement('br'));
 });
 return frag;
}

function insertVisualFragmentAtSelection(fragment){
 const sel=window.getSelection();
 if(!sel || !sel.rangeCount) return;
 const range=sel.getRangeAt(0);
 range.deleteContents();
 const last=fragment.lastChild;
 range.insertNode(fragment);
 if(last){
   range.setStartAfter(last);
   range.collapse(true);
   sel.removeAllRanges();
   sel.addRange(range);
 }
}

const fillEditor=document.getElementById('fillVisualEditor');
if(fillEditor){
 fillEditor.addEventListener('copy',e=>{
   const sel=window.getSelection();
   if(!sel || !sel.rangeCount || sel.isCollapsed) return;
   const range=sel.getRangeAt(0);
   if(!fillEditor.contains(range.commonAncestorContainer)) return;

   const fragment=range.cloneContents();
   const text=visualFragmentToClipboardText(fragment);
   if(!text) return;

   e.preventDefault();
   e.clipboardData.setData('text/plain',text);
 });

 fillEditor.addEventListener('paste',e=>{
   const text=e.clipboardData?.getData('text/plain');
   if(text===undefined || text===null) return;
   e.preventDefault();
   const fragment=clipboardTextToVisualFragment(text);
   insertVisualFragmentAtSelection(fragment);
   updatePromptPreview();
 });

 fillEditor.addEventListener('input',e=>{
   if(e.target.matches&&e.target.matches('[data-fill-answer]')){
     updatePromptPreview();
     return;
   }
   processFillEditorTokens();
 });
 fillEditor.addEventListener('keydown',e=>{
   if(e.target.matches&&e.target.matches('[data-fill-answer]')&&e.key==='Enter'){
     e.preventDefault();
     moveCaretAfterSlot(e.target);
     return;
   }
   if(e.key==='Enter')setTimeout(processFillEditorTokens,0);
 });
 fillEditor.addEventListener('keyup',e=>{
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey)processFillEditorTokens();
 });
}
document.getElementById('imageFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{currentImage=r.result;document.getElementById('preview').innerHTML=`<img src="${currentImage}">`};r.readAsDataURL(f)});
function saveMsg(msg,ok){const e=document.getElementById('saveMessage');e.className='feedback '+(ok?'ok':'bad');e.textContent=msg}
async function uploadImageIfNeeded(){if(!currentImage||!currentImage.startsWith('data:'))return currentImage;const file=document.getElementById('imageFile').files[0],filename=file?.name||'imagem.png';const r=await fetch('/api/upload-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,dataUrl:currentImage})});if(!r.ok)throw new Error('Não foi possível guardar a imagem.');return (await r.json()).path}
async function saveQuestion(){
 try{
  if(!IS_ADMIN)return;const tipo=document.getElementById('type').value;let pergunta='',fillData=null;
  if(tipo==='fill'){fillData=serializeFillEditor();pergunta=fillData.pergunta.trim()}else pergunta=document.getElementById('prompt').value.trim();
  if(!pergunta){saveMsg('Escreva o enunciado.',false);return}
  const id=document.getElementById('editId').value||('q-'+Date.now());
  const q={id,categoria:document.getElementById('category').value.trim()||'Sem categoria',tipo,pergunta,grupo:document.getElementById('questionArea')?.value||'teoria',explicacao:document.getElementById('explanation').value.trim(),imagem:await uploadImageIfNeeded()};
  if(tipo==='fill'){q.respostas=fillData.respostas;if(!q.respostas.length){saveMsg('Crie pelo menos um espaço escrevendo [[]] no enunciado.',false);return}const missing=q.respostas.findIndex(a=>!a.length);if(missing>=0){saveMsg(`Falta indicar a resposta correta do espaço ${missing+1}.`,false);return}}
  else if(tipo==='choice'){q.opcoes=[...document.querySelectorAll('.choice-option-input')].map(x=>x.value.trim());if(q.opcoes.length<2){saveMsg('Crie pelo menos duas respostas.',false);return}if(q.opcoes.some(x=>!x)){saveMsg('Preencha todas as respostas que escolheu.',false);return}q.resposta_correta=Number(document.getElementById('choiceAnswer').value)}
  else{q.frase_correta=document.getElementById('statementCorrect').value==='true';q.palavra_errada=document.getElementById('wrongWord').value.trim();q.palavra_correta=document.getElementById('correctWord').value.trim();if(!q.frase_correta&&(!q.palavra_errada||!q.palavra_correta)){saveMsg('Indique a palavra errada e a correta.',false);return}}
  const idx=questions.findIndex(x=>x.id===id);const wasEditing=idx>=0&&!!questionEditContext;if(idx>=0)questions[idx]=q;else questions.push(q);
  await persistQuestions();clearEditor(false);await loadQuestions();if(wasEditing)returnToEditedQuestion(id,true);else saveMsg('Pergunta gravada em data/perguntas.json.',true);
 }catch(e){saveMsg(e.message,false)}
}
function clearEditor(returnAfterCancel=true){
 const cancelTarget=returnAfterCancel&&questionEditContext?questionEditContext.id:null;
 document.getElementById('editorTitle').textContent='Criar nova pergunta';
 ['editId','category','prompt','explanation','wrongWord','correctWord'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
 document.getElementById('type').value='fill';
 document.getElementById('questionArea').value='teoria';document.getElementById('choiceCount').value='4';document.getElementById('statementCorrect').value='false';document.getElementById('imageFile').value='';document.getElementById('preview').innerHTML='';document.getElementById('fillVisualEditor').innerHTML='';resetFillUndoHistory();currentImage='';renderChoiceEditor([],0);toggleFields();const msg=document.getElementById('saveMessage');if(msg)msg.className='feedback';updatePromptPreview();
 if(cancelTarget)returnToEditedQuestion(cancelTarget,false);else if(returnAfterCancel){questionEditContext=null;updateEditorSecondaryButton()}
}
function editQuestion(id){
 const q=questions.find(x=>x.id===id);if(!q)return;captureQuestionEditContext(id);document.querySelector('[data-panel="editor"]').click();document.getElementById('editorTitle').textContent='Editar pergunta';document.getElementById('editId').value=q.id;document.getElementById('category').value=q.categoria||'';document.getElementById('type').value=q.tipo;
 document.getElementById('questionArea').value=q.grupo||'teoria';document.getElementById('explanation').value=q.explicacao||'';
 if(q.tipo==='fill'){document.getElementById('prompt').value='';loadFillVisualEditor(q.pergunta||'',q.respostas||[])}else{document.getElementById('prompt').value=q.pergunta||'';document.getElementById('fillVisualEditor').innerHTML=''}
 if(q.tipo==='choice'){const count=Math.max(2,Math.min(8,(q.opcoes||[]).length||4));document.getElementById('choiceCount').value=String(count);renderChoiceEditor(q.opcoes||[],q.resposta_correta||0)}
 if(q.tipo==='correct'){document.getElementById('statementCorrect').value=String(!!q.frase_correta);document.getElementById('wrongWord').value=q.palavra_errada||'';document.getElementById('correctWord').value=q.palavra_correta||''}
 currentImage=q.imagem||'';document.getElementById('preview').innerHTML=q.imagem?`<img src="${q.imagem}">`:'';toggleFields();updatePromptPreview();updateEditorSecondaryButton();window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteQuestion(id){if(!confirm('Apagar esta pergunta?'))return;questions=questions.filter(q=>q.id!==id);await persistQuestions();await loadQuestions()}



function renderPracticeIdle(){
 const host=document.getElementById('practiceQuiz');
 if(!host)return;
 const pool=practiceQuestions();
 if(!pool.length){
   host.innerHTML='<div class="card small">Ainda não existem perguntas marcadas como <strong>Prática de condução</strong>. Na Base de perguntas, use o botão <strong>Mover para prática</strong>.</div>';
   return;
 }
 host.innerHTML='<div class="card small">Abra esta aba para iniciar o treino prático, ou carregue em <strong>Novo treino prático</strong>.</div>';
}

function ensurePracticeTraining(){
 const pool=practiceQuestions();
 document.getElementById('practiceTotal').textContent=pool.length;
 if(!pool.length){ renderPracticeIdle(); return; }
 if(!currentPracticeId && practicePendingIds.length===pool.length && practiceAnswered===0){
   nextPracticeQuestion(true);
 }else if(currentPracticeId){
   renderPracticeQuiz();
 }else if(!practicePendingIds.length && practiceCorrect===pool.length){
   renderPracticeCompleted();
 }else{
   nextPracticeQuestion();
 }
}

function randomPracticePendingId(){
 if(!practicePendingIds.length)return null;
 let candidates=practicePendingIds;
 if(practicePendingIds.length>1&&previousPracticeId){
   const filtered=practicePendingIds.filter(id=>id!==previousPracticeId);
   if(filtered.length)candidates=filtered;
 }
 const chosen=candidates[Math.floor(Math.random()*candidates.length)];
 const pos=practicePendingIds.indexOf(chosen);
 if(pos>=0)practicePendingIds.splice(pos,1);
 return chosen;
}

function nextPracticeQuestion(initial=false){
 const pool=practiceQuestions();
 if(!pool.length){renderPracticeIdle();return}
 if(!practicePendingIds.length){
   currentPracticeId=null;
   renderPracticeCompleted();
   return;
 }
 currentPracticeId=randomPracticePendingId();
 renderPracticeQuiz();
}

function renderPracticeCompleted(){
 const pool=practiceQuestions();
 document.getElementById('practiceQuiz').innerHTML=`
   <div class="card">
     <span class="tag">Treino prático concluído</span>
     <div class="q" style="margin-top:12px"><strong>🎉 Acertou todas as ${pool.length} perguntas de prática.</strong></div>
     <div class="small" style="margin-top:8px">Foram necessárias ${practiceAnswered} tentativa${practiceAnswered===1?'':'s'}.</div>
     <div class="actions" style="margin-top:14px"><button class="primary" onclick="restartPracticeTraining()">Começar novo treino prático</button></div>
   </div>`;
}

function restartPracticeTraining(){
 const pool=practiceQuestions();
 practiceCorrect=0;
 practiceAnswered=0;
 practicePendingIds=pool.map(q=>q.id);
 currentPracticeId=null;
 previousPracticeId=null;
 currentPracticeChoiceOrder=[];
 document.getElementById('practiceTotal').textContent=pool.length;
 document.getElementById('practiceCorrect').textContent='0';
 document.getElementById('practiceAnswered').textContent='0';
 nextPracticeQuestion(true);
}

function currentPracticeQuestion(){
 return practiceQuestions().find(q=>q.id===currentPracticeId)||null;
}

function renderPracticeQuiz(){
 const q=currentPracticeQuestion();
 if(!q){nextPracticeQuestion();return}
 const i=questions.findIndex(x=>x.id===q.id);
 let controls='';

 if(q.tipo==='fill'){
   controls=`<div class="actions"><button class="primary" onclick="practiceCheckFill(${i})">Corrigir resposta</button></div>`;
 }
 if(q.tipo==='choice'){
   currentPracticeChoiceOrder=shuffledChoiceOrder(q);
   controls=currentPracticeChoiceOrder.map((originalIndex,displayIndex)=>`<button class="choice" data-original-index="${originalIndex}" onclick="practiceCheckChoice(${i},${originalIndex},this)">${String.fromCharCode(65+displayIndex)}. ${esc(q.opcoes[originalIndex])}</button>`).join('');
 }else{
   currentPracticeChoiceOrder=[];
 }
 if(q.tipo==='correct'){
   controls=`<div id="pyn${i}" class="actions"><button class="secondary" onclick="practiceCorrectStep(${i},true,this)">Sim, está certa</button><button class="secondary" onclick="practiceCorrectStep(${i},false,this)">Não, está errada</button></div>
   <div id="pfix${i}" class="ans hidden">Altere <strong>${esc(q.palavra_errada||'')}</strong> para <input id="pfixInput${i}" class="blank" value="${esc(q.palavra_errada||'')}"> <button class="primary" onclick="practiceFinishCorrection(${i})">Validar</button></div>`;
 }

 const remaining=practiceQuestions().length-practiceCorrect;
 document.getElementById('practiceQuiz').innerHTML=`
   <div class="card" id="pq${i}" data-done="0">
     <div class="toolbar" style="margin-bottom:10px">
       <span class="tag">${esc(q.categoria)}</span>
       <span class="pill">Faltam dominar: ${remaining}</span>
     </div>
     ${q.imagem?`<div class="img"><img src="${esc(q.imagem)}" alt="Imagem da questão"></div>`:''}
     <div class="q">${promptHTML(q)}</div>
     ${controls}
     <div id="pfb${i}" class="feedback"></div>
     <div id="pnext${i}" class="actions hidden" style="margin-top:12px"><button class="primary" onclick="nextPracticeQuestion()">Próxima pergunta →</button></div>
   </div>`;
}

function registerPracticeAttempt(i,ok){
 const c=document.getElementById('pq'+i);
 if(!c||c.dataset.done==='1')return false;

 c.dataset.done='1';
 practiceAnswered++;

 if(ok){
   // Acertou: fica definitivamente fora da fila deste treino.
   practiceCorrect++;
 }else{
   // Errou: volta para a fila e terá obrigatoriamente de aparecer de novo.
   if(currentPracticeId&&!practicePendingIds.includes(currentPracticeId)){
     practicePendingIds.push(currentPracticeId);
   }
 }

 previousPracticeId=currentPracticeId;

 document.getElementById('practiceCorrect').textContent=practiceCorrect;
 document.getElementById('practiceAnswered').textContent=practiceAnswered;

 const next=document.getElementById('pnext'+i);
 if(next)next.classList.remove('hidden');
 return true;
}

function practiceCorrectAnswerHTML(q){
 if(q.tipo==='fill'){
   return (q.respostas||[]).map((a,i)=>`<div><strong>${i+1}.</strong> ${esc((a||[])[0]||'')}</div>`).join('');
 }
 if(q.tipo==='choice'){
   const idx=Number(q.resposta_correta||0);
   const displayIndex=currentPracticeChoiceOrder.indexOf(idx);
   const letter=displayIndex>=0?String.fromCharCode(65+displayIndex):'';
   return `<div>${letter?`<strong>${letter}.</strong> `:''}${esc(q.opcoes?.[idx]||'')}</div>`;
 }
 if(q.tipo==='correct'){
   if(q.frase_correta)return '<div><strong>A frase está correta.</strong></div>';
   return `<div>Substituir <strong>${esc(q.palavra_errada||'')}</strong> por <strong>${esc(q.palavra_correta||'')}</strong>.</div>`;
 }
 return '';
}

function practiceFeedback(i,ok,text){
 const f=document.getElementById('pfb'+i);
 const q=questions[i];
 f.className='feedback '+(ok?'ok':'bad');
 if(ok){
   f.innerHTML='✅ Correto. '+esc(text||'');
 }else if(q.tipo==='fill'){
   f.innerHTML=`❌ Incorreto.${text?` ${esc(text)}`:''}
     <div style="margin-top:8px"><strong>Os campos a vermelho mostram a resposta correta.</strong></div>
     <div style="margin-top:8px"><strong>Esta pergunta voltará a aparecer mais tarde.</strong></div>`;
 }else{
   f.innerHTML=`❌ Incorreto.${text?` ${esc(text)}`:''}
     <div class="correct-answer-reveal">
       <div class="correct-answer-title">Resposta correta</div>
       <div class="correct-answer-value">${practiceCorrectAnswerHTML(q)}</div>
     </div>
     <div style="margin-top:8px"><strong>Esta pergunta voltará a aparecer mais tarde.</strong></div>`;
 }
}

function practiceCheckFill(i){
 const q=questions[i],card=document.getElementById('pq'+i);
 if(!card||card.dataset.done==='1')return;

 let ok=true;

 card.querySelectorAll('[data-pos]').forEach(inp=>{
   const pos=Number(inp.dataset.pos);
   const respostas=q.respostas?.[pos]||[];
   const arr=respostas.map(norm);
   const userValue=inp.value.trim();
   const hit=arr.includes(norm(userValue));

   inp.classList.remove('fill-result-correct','fill-result-wrong');

   if(hit){
     inp.classList.add('fill-result-correct');
     inp.title='Resposta correta';
   }else{
     ok=false;
     const correctValue=respostas[0]||'';
     inp.dataset.userAnswer=userValue;
     inp.value=correctValue;
     inp.classList.add('fill-result-wrong');
     inp.title=userValue
       ? `A sua resposta: ${userValue} | Correta: ${correctValue}`
       : `Resposta correta: ${correctValue}`;
   }

   inp.disabled=true;
 });

 if(registerPracticeAttempt(i,ok))practiceFeedback(i,ok,q.explicacao);
}

function practiceCheckChoice(i,originalIndex,btn){
 const q=questions[i],ok=originalIndex===q.resposta_correta;
 if(!registerPracticeAttempt(i,ok))return;
 document.querySelectorAll(`#pq${i} .choice`).forEach(b=>{
   b.disabled=true;
   const optionIndex=Number(b.dataset.originalIndex);
   if(optionIndex===q.resposta_correta)b.style.background='#ecfdf3';
   if(optionIndex===originalIndex&&!ok)b.style.background='#fef3f2';
 });
 practiceFeedback(i,ok,q.explicacao);
}

function practiceCorrectStep(i,yes,btn){
 const q=questions[i],card=document.getElementById('pq'+i);
 if(!card||card.dataset.done==='1')return;
 if(q.frase_correta){
   if(registerPracticeAttempt(i,yes)){
     document.querySelectorAll(`#pyn${i} button`).forEach(b=>b.disabled=true);
     practiceFeedback(i,yes,q.explicacao);
   }
   return;
 }
 if(yes){
   if(registerPracticeAttempt(i,false)){
     document.querySelectorAll(`#pyn${i} button`).forEach(b=>b.disabled=true);
     practiceFeedback(i,false,q.explicacao);
   }
 }else{
   document.getElementById('pfix'+i).classList.remove('hidden');
   document.querySelectorAll(`#pyn${i} button`).forEach(b=>b.disabled=true);
   btn.style.background='#ecfdf3';
 }
}

function practiceFinishCorrection(i){
 const q=questions[i],inp=document.getElementById('pfixInput'+i);
 const card=document.getElementById('pq'+i);
 if(!card||card.dataset.done==='1')return;
 const ok=norm(inp.value)===norm(q.palavra_correta);
 inp.style.background=ok?'#ecfdf3':'#fef3f2';
 inp.disabled=true;
 if(registerPracticeAttempt(i,ok))practiceFeedback(i,ok,q.explicacao);
}

async function fetchExpressions(){
 const url = IS_ADMIN ? '/api/expressions' : `data/expressoes.json?v=${Date.now()}`;
 const r = await fetch(url,{cache:'no-store'});
 if(!r.ok) throw new Error('Não foi possível carregar as expressões.');
 return await r.json();
}

async function persistExpressions(){
 if(!IS_ADMIN) throw new Error('A edição das expressões só está disponível em localhost.');
 const r = await fetch('/api/expressions',{
   method:'PUT',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify(expressions)
 });
 if(!r.ok) throw new Error('Não foi possível gravar data/expressoes.json.');
}

async function loadExpressions(){
 try{
   expressions = await fetchExpressions();
   exprCorrect = 0;
   exprAnswered = 0;
   expressionPendingIds = expressions.map(e=>e.id);
   currentExpressionId = null;
   previousExpressionId = null;
   document.getElementById('exprTotal').textContent = expressions.length;
   document.getElementById('exprCorrect').textContent = '0';
   document.getElementById('exprAnswered').textContent = '0';
   renderExpressionBank();
   nextExpressionQuestion(true);
 }catch(e){
   document.getElementById('expressionQuiz').innerHTML =
     `<div class="card feedback bad" style="display:block">${esc(e.message)}</div>`;
 }
}

function acceptedExpressionAnswers(e){
 const arr = [e.expressao, ...(e.alternativas || [])].filter(Boolean);
 return [...new Set(arr.map(x=>String(x).trim()).filter(Boolean))];
}

function randomExpressionPendingId(){
 if(!expressionPendingIds.length) return null;
 let candidates = expressionPendingIds;
 if(expressionPendingIds.length > 1 && previousExpressionId){
   const filtered = expressionPendingIds.filter(id=>id!==previousExpressionId);
   if(filtered.length) candidates = filtered;
 }
 const chosen = candidates[Math.floor(Math.random()*candidates.length)];
 const pos = expressionPendingIds.indexOf(chosen);
 if(pos >= 0) expressionPendingIds.splice(pos,1);
 return chosen;
}

function nextExpressionQuestion(initial=false){
 const host = document.getElementById('expressionQuiz');
 if(!host) return;

 if(!expressions.length){
   host.innerHTML = '<div class="card small">Ainda não existem expressões guardadas.</div>';
   return;
 }

 if(!expressionPendingIds.length){
   currentExpressionId = null;
   host.innerHTML = `
     <div class="card">
       <span class="tag">Treino concluído</span>
       <div class="q" style="margin-top:12px"><strong>🎉 Acertou todas as ${expressions.length} expressões.</strong></div>
       <div class="small" style="margin-top:8px">Foram necessárias ${exprAnswered} tentativa${exprAnswered===1?'':'s'}.</div>
       <div class="actions" style="margin-top:14px">
         <button class="primary" onclick="restartExpressionTraining()">Começar novo treino</button>
       </div>
     </div>`;
   return;
 }

 currentExpressionId = randomExpressionPendingId();
 renderExpressionQuiz();
}

function restartExpressionTraining(){
 exprCorrect = 0;
 exprAnswered = 0;
 expressionPendingIds = expressions.map(e=>e.id);
 currentExpressionId = null;
 previousExpressionId = null;
 document.getElementById('exprCorrect').textContent = '0';
 document.getElementById('exprAnswered').textContent = '0';
 nextExpressionQuestion(true);
}

function currentExpression(){
 return expressions.find(e=>e.id===currentExpressionId) || null;
}

function renderExpressionQuiz(){
 const host = document.getElementById('expressionQuiz');
 if(!host) return;

 const e = currentExpression();
 if(!e){
   if(expressions.length && expressionPendingIds.length) nextExpressionQuestion();
   return;
 }

 const i = expressions.findIndex(x=>x.id===e.id);
 const remaining = expressions.length - exprCorrect;

 host.innerHTML = `
   <div class="card" id="exprQ${i}" data-done="0">
     <div class="toolbar" style="margin-bottom:10px">
       <span class="tag">Expressões informais</span>
       <span class="pill">Faltam dominar: ${remaining}</span>
     </div>

     <div class="q">
       Qual é a expressão informal correspondente a:
       <div class="ans" style="font-size:19px;margin-top:10px"><strong>${esc(e.definicao)}</strong></div>
     </div>

     <div style="margin-top:14px">
       <input id="exprInput${i}" class="blank" style="min-width:280px" placeholder="Escreva a expressão">
     </div>

     <div class="actions">
       <button class="primary" onclick="checkExpression(${i})">Corrigir resposta</button>
     </div>

     <div id="exprFb${i}" class="feedback"></div>
     <div id="exprNext${i}" class="actions hidden" style="margin-top:12px">
       <button class="primary" onclick="nextExpressionQuestion()">Próxima expressão →</button>
     </div>
   </div>`;
}

function checkExpression(i){
 const card = document.getElementById('exprQ'+i);
 if(!card || card.dataset.done==='1') return;

 const e = expressions[i];
 const inp = document.getElementById('exprInput'+i);
 const answers = acceptedExpressionAnswers(e).map(norm);
 const ok = answers.includes(norm(inp.value));

 card.dataset.done = '1';
 exprAnswered++;

 if(ok){
   exprCorrect++;
 }else{
   if(currentExpressionId && !expressionPendingIds.includes(currentExpressionId)){
     expressionPendingIds.push(currentExpressionId);
   }
 }

 previousExpressionId = currentExpressionId;
 document.getElementById('exprCorrect').textContent = exprCorrect;
 document.getElementById('exprAnswered').textContent = exprAnswered;

 inp.disabled = true;
 inp.style.background = ok ? '#ecfdf3' : '#fef3f2';

 const fb = document.getElementById('exprFb'+i);
 fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
 fb.innerHTML = ok
   ? `✅ Correto. A expressão é <strong>${esc(e.expressao)}</strong>.${e.nota ? ' '+esc(e.nota) : ''}`
   : `❌ A resposta correta é <strong>${esc(e.expressao)}</strong>.${e.nota ? ' '+esc(e.nota) : ''} <strong>Esta expressão voltará a aparecer mais tarde.</strong>`;

 const next = document.getElementById('exprNext'+i);
 if(next) next.classList.remove('hidden');
}

function renderExpressionBank(){
 const host = document.getElementById('expressionBank');
 if(!host) return;
 const s = norm(document.getElementById('exprSearch')?.value || '');
 const list = expressions.filter(e =>
   !s || norm((e.definicao||'')+' '+(e.expressao||'')+' '+(e.nota||'')).includes(s)
 );
 document.getElementById('exprBankCount').textContent = expressions.length;
 host.innerHTML = list.map(e=>`
   <div class="item">
     <div class="head">
       <div>
         <span class="tag">Expressão informal</span>
         <div class="q" style="margin-top:10px">${esc(e.definicao)}</div>
       </div>
       ${IS_ADMIN ? `<div class="actions">
         <button class="secondary" onclick="editExpression('${e.id}')">Editar</button>
         <button class="danger" onclick="deleteExpression('${e.id}')">Apagar</button>
       </div>` : ''}
     </div>
     <div class="ans"><strong>Expressão:</strong> ${esc(e.expressao)}</div>
     ${e.nota ? `<div class="small" style="margin-top:8px"><strong>Nota:</strong> ${esc(e.nota)}</div>` : ''}
   </div>
 `).join('') || '<div class="card small">Sem resultados.</div>';
}

function expressionSaveMessage(msg,ok){
 const el = document.getElementById('exprSaveMessage');
 el.className = 'feedback ' + (ok ? 'ok' : 'bad');
 el.textContent = msg;
}

async function saveExpression(){
 try{
   if(!IS_ADMIN) return;
   const definicao = document.getElementById('exprDefinition').value.trim();
   const expressao = document.getElementById('exprText').value.trim();
   if(!definicao || !expressao){
     expressionSaveMessage('Preencha a definição e a expressão correta.',false);
     return;
   }

   const alternativasRaw = document.getElementById('exprAlternatives').value.trim();
   const alternativas = alternativasRaw
     ? alternativasRaw.split('|').map(x=>x.trim()).filter(Boolean)
     : [];

   const id = document.getElementById('exprEditId').value || ('expr-'+Date.now());
   const obj = {
     id,
     definicao,
     expressao,
     alternativas,
     nota: document.getElementById('exprNote').value.trim()
   };

   const idx = expressions.findIndex(x=>x.id===id);
   if(idx>=0) expressions[idx]=obj;
   else expressions.push(obj);

   await persistExpressions();
   expressionSaveMessage('Expressão gravada em data/expressoes.json.',true);
   clearExpressionEditor();
   await loadExpressions();
 }catch(e){
   expressionSaveMessage(e.message,false);
 }
}

function clearExpressionEditor(){
 document.getElementById('exprEditorTitle').textContent = 'Adicionar expressão';
 ['exprEditId','exprDefinition','exprText','exprAlternatives','exprNote'].forEach(id=>{
   document.getElementById(id).value='';
 });
 const msg=document.getElementById('exprSaveMessage');
 if(msg) msg.className='feedback';
}

function editExpression(id){
 if(!IS_ADMIN) return;
 const e = expressions.find(x=>x.id===id);
 if(!e) return;
 document.querySelector('[data-panel="expressions"]').click();
 document.getElementById('exprEditorTitle').textContent='Editar expressão';
 document.getElementById('exprEditId').value=e.id;
 document.getElementById('exprDefinition').value=e.definicao||'';
 document.getElementById('exprText').value=e.expressao||'';
 document.getElementById('exprAlternatives').value=(e.alternativas||[]).join('|');
 document.getElementById('exprNote').value=e.nota||'';
 window.scrollTo({top:document.getElementById('exprEditorTitle').offsetTop-30,behavior:'smooth'});
}

async function deleteExpression(id){
 if(!IS_ADMIN) return;
 if(!confirm('Apagar esta expressão?')) return;
 expressions = expressions.filter(e=>e.id!==id);
 await persistExpressions();
 await loadExpressions();
}

initMode();renderChoiceEditor([],0);toggleFields();updatePromptPreview();loadQuestions();loadExpressions();

setTimeout(installFillEditorDeletionUX,0);
