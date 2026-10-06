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
   correct=0;
   answered=0;
   trainingPendingIds=questions.map(q=>q.id);
   currentTrainingId=null;
   previousTrainingId=null;
   document.getElementById('total').textContent=questions.length;
   document.getElementById('correct').textContent=0;
   document.getElementById('answered').textContent=0;
   renderBank();
   nextTrainingQuestion(true);
 }catch(e){
   document.getElementById('quiz').innerHTML=`<div class="card feedback bad" style="display:block">${esc(e.message)}</div>`;
 }
}

function formatQuestionText(raw, fillInputs=false){
 let text=String(raw??'');
 const slots=[];
 if(fillInputs){
   text=text.replace(/\[\[(\d+)\]\]/g,(m,n)=>{const token=`@@FILL_SLOT_${slots.length}@@`;slots.push(`<input class="blank" data-pos="${Number(n)-1}" placeholder="${n}">`);return token;});
 }else{text=text.replace(/\[\[(\d+)\]\]/g,'____');}
 let h=esc(text);
 h=h.replace(/\*\*\*\*(.+?)\*\*\*\*/g,'<strong>$1</strong>');
 h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
 h=h.split(/\r?\n/).map(line=>line.trim()==='---'?'<hr class="question-separator">':line).join('<br>');
 slots.forEach((slot,i)=>{h=h.replace(`@@FILL_SLOT_${i}@@`,slot);});
 return h;
}
function promptHTML(q){return formatQuestionText(q.pergunta,q.tipo==='fill');}

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
 if(!questions.length){
   document.getElementById('quiz').innerHTML='<div class="card small">Ainda não existem perguntas na base de dados.</div>';
   return;
 }
 if(!trainingPendingIds.length){
   currentTrainingId=null;
   document.getElementById('quiz').innerHTML=`
     <div class="card">
       <span class="tag">Treino concluído</span>
       <div class="q" style="margin-top:12px"><strong>🎉 Acertou todas as ${questions.length} perguntas.</strong></div>
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
 trainingPendingIds=questions.map(q=>q.id);
 currentTrainingId=null;
 previousTrainingId=null;
 document.getElementById('correct').textContent='0';
 document.getElementById('answered').textContent='0';
 nextTrainingQuestion(true);
}

function currentTrainingQuestion(){
 return questions.find(q=>q.id===currentTrainingId) || null;
}

function renderQuiz(){
 const q=currentTrainingQuestion();
 if(!q){ nextTrainingQuestion(); return; }
 const i=questions.findIndex(x=>x.id===q.id);
 let controls='';
 if(q.tipo==='fill') controls=`<div class="actions"><button class="primary" onclick="checkFill(${i})">Corrigir resposta</button></div>`;
 if(q.tipo==='choice') controls=(q.opcoes||[]).map((c,j)=>`<button class="choice" onclick="checkChoice(${i},${j},this)">${String.fromCharCode(65+j)}. ${esc(c)}</button>`).join('');
 if(q.tipo==='correct'){
   controls=`<div id="yn${i}" class="actions"><button class="secondary" onclick="correctStep(${i},true,this)">Sim, está certa</button><button class="secondary" onclick="correctStep(${i},false,this)">Não, está errada</button></div>
   <div id="fix${i}" class="ans hidden">Altere <strong>${esc(q.palavra_errada||'')}</strong> para <input id="fixInput${i}" class="blank" value="${esc(q.palavra_errada||'')}"> <button class="primary" onclick="finishCorrection(${i})">Validar</button></div>`;
 }
 const mastered=correct;
 const remaining=questions.length-mastered;
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

function feedback(i,ok,text){
 const f=document.getElementById('fb'+i);
 f.className='feedback '+(ok?'ok':'bad');
 f.innerHTML=(ok?'✅ Correto. ':'❌ Incorreto. ')+esc(text||'')+(ok?'':' <strong>Esta pergunta voltará a aparecer mais tarde.</strong>');
}

function checkFill(i){
 const q=questions[i],card=document.getElementById('q'+i);let ok=true;
 if(!card || card.dataset.done==='1') return;
 card.querySelectorAll('[data-pos]').forEach(inp=>{
   const arr=(q.respostas?.[Number(inp.dataset.pos)]||[]).map(norm);
   const hit=arr.includes(norm(inp.value));
   inp.style.background=hit?'#ecfdf3':'#fef3f2';
   inp.disabled=true;
   if(!hit)ok=false;
 });
 if(registerAttempt(i,ok)) feedback(i,ok,q.explicacao);
}

function checkChoice(i,j,btn){
 const q=questions[i],ok=j===q.resposta_correta;
 if(!registerAttempt(i,ok)) return;
 document.querySelectorAll(`#q${i} .choice`).forEach((b,k)=>{
   b.disabled=true;
   if(k===q.resposta_correta)b.style.background='#ecfdf3';
   if(k===j&&!ok)b.style.background='#fef3f2';
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
 const s=norm(document.getElementById('search')?.value||''), f=document.getElementById('filter')?.value||'';
 const A=questions.filter(q=>(!f||q.tipo===f)&&(!s||norm(q.categoria+' '+q.pergunta+' '+answerSummary(q)).includes(s)));
 document.getElementById('bankCount').textContent=questions.length;
 document.getElementById('bankList').innerHTML=A.map(q=>`
 <div class="item">
   <div class="head">
     <div><span class="tag">${esc(q.categoria)}</span></div>
     ${IS_ADMIN?`<div class="actions"><button class="secondary" onclick="editQuestion('${q.id}')">Editar</button><button class="danger" onclick="deleteQuestion('${q.id}')">Apagar</button></div>`:''}
   </div>
   ${q.imagem?`<div class="img"><img src="${esc(q.imagem)}" alt="Imagem da pergunta"></div>`:''}
   <div class="q">${formatQuestionText(q.pergunta,false)}</div>
   <div class="ans"><strong>Resposta:</strong> ${esc(answerSummary(q))}</div>
   ${q.explicacao?`<div class="small" style="margin-top:8px"><strong>Explicação:</strong> ${esc(q.explicacao)}</div>`:''}
 </div>`).join('')||'<div class="card small">Sem resultados.</div>';
}

function toggleFields(){
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
 const span=document.createElement('span');span.className='fill-slot';span.contentEditable='false';
 const input=document.createElement('input');input.type='text';input.className='fill-answer-editor';input.setAttribute('data-fill-answer','1');input.placeholder='resposta correta';input.value=answerText||'';span.appendChild(input);return span;
}
function loadFillVisualEditor(pergunta='',respostas=[]){
 const editor=document.getElementById('fillVisualEditor');editor.innerHTML='';const raw=String(pergunta||''),re=/\[\[(\d+)\]\]/g;let last=0,m;
 while((m=re.exec(raw))){editor.appendChild(document.createTextNode(raw.slice(last,m.index)));const pos=Number(m[1])-1;editor.appendChild(createFillSlot((respostas[pos]||[]).join('|')));last=re.lastIndex} editor.appendChild(document.createTextNode(raw.slice(last)));updatePromptPreview();
}
function processFillEditorTokens(){
 const editor=document.getElementById('fillVisualEditor'),walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,{acceptNode(node){if(node.parentElement&&node.parentElement.closest('.fill-slot'))return NodeFilter.FILTER_REJECT;return node.nodeValue.includes('[[]]')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}}),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);let focusInput=null;
 nodes.forEach(node=>{const parts=node.nodeValue.split('[[]]');if(parts.length<2)return;const frag=document.createDocumentFragment();parts.forEach((part,i)=>{if(part)frag.appendChild(document.createTextNode(part));if(i<parts.length-1){const slot=createFillSlot('');frag.appendChild(slot);if(!focusInput)focusInput=slot.querySelector('input')}});node.replaceWith(frag)});if(focusInput)setTimeout(()=>focusInput.focus(),0);updatePromptPreview();
}
function serializeFillEditor(){
 const editor=document.getElementById('fillVisualEditor'),respostas=[];let counter=0;
 function walk(node){if(node.nodeType===Node.TEXT_NODE)return node.nodeValue;if(node.nodeType!==Node.ELEMENT_NODE)return '';const el=node;if(el.classList&&el.classList.contains('fill-slot')){counter++;const value=el.querySelector('[data-fill-answer]')?.value.trim()||'';respostas.push(value.split('|').map(x=>x.trim()).filter(Boolean));return `[[${counter}]]`}if(el.tagName==='BR')return '\n';let out='';el.childNodes.forEach(c=>out+=walk(c));if((el.tagName==='DIV'||el.tagName==='P')&&!out.endsWith('\n'))out+='\n';return out}
 let pergunta='';editor.childNodes.forEach(n=>pergunta+=walk(n));return {pergunta:pergunta.replace(/\n{3,}/g,'\n\n').trim(),respostas};
}
function moveCaretAfterSlot(input){const slot=input.closest('.fill-slot'),editor=document.getElementById('fillVisualEditor');if(!slot||!editor)return;editor.focus();const range=document.createRange();range.setStartAfter(slot);range.collapse(true);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range)}
function currentRawPrompt(){return document.getElementById('type').value==='fill'?serializeFillEditor().pergunta:document.getElementById('prompt').value}
function updatePromptPreview(){const p=document.getElementById('promptPreview');if(!p)return;const raw=currentRawPrompt();p.innerHTML=raw?formatQuestionText(raw,false):'<span class="small">O enunciado aparecerá aqui.</span>'}
const fillEditor=document.getElementById('fillVisualEditor');
if(fillEditor){fillEditor.addEventListener('input',e=>{if(e.target.matches&&e.target.matches('[data-fill-answer]')){updatePromptPreview();return}processFillEditorTokens()});fillEditor.addEventListener('keydown',e=>{if(e.target.matches&&e.target.matches('[data-fill-answer]')&&e.key==='Enter'){e.preventDefault();moveCaretAfterSlot(e.target)}})}
document.getElementById('imageFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{currentImage=r.result;document.getElementById('preview').innerHTML=`<img src="${currentImage}">`};r.readAsDataURL(f)});
function saveMsg(msg,ok){const e=document.getElementById('saveMessage');e.className='feedback '+(ok?'ok':'bad');e.textContent=msg}
async function uploadImageIfNeeded(){if(!currentImage||!currentImage.startsWith('data:'))return currentImage;const file=document.getElementById('imageFile').files[0],filename=file?.name||'imagem.png';const r=await fetch('/api/upload-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,dataUrl:currentImage})});if(!r.ok)throw new Error('Não foi possível guardar a imagem.');return (await r.json()).path}
async function saveQuestion(){
 try{if(!IS_ADMIN)return;const tipo=document.getElementById('type').value;let pergunta='',fillData=null;if(tipo==='fill'){fillData=serializeFillEditor();pergunta=fillData.pergunta.trim()}else pergunta=document.getElementById('prompt').value.trim();if(!pergunta){saveMsg('Escreva o enunciado.',false);return}
 const id=document.getElementById('editId').value||('q-'+Date.now()),q={id,categoria:document.getElementById('category').value.trim()||'Sem categoria',tipo,pergunta,explicacao:document.getElementById('explanation').value.trim(),imagem:await uploadImageIfNeeded()};
 if(tipo==='fill'){q.respostas=fillData.respostas;if(!q.respostas.length){saveMsg('Crie pelo menos um espaço escrevendo [[]] no enunciado.',false);return}const missing=q.respostas.findIndex(a=>!a.length);if(missing>=0){saveMsg(`Falta indicar a resposta correta do espaço ${missing+1}.`,false);return}}
 else if(tipo==='choice'){q.opcoes=[...document.querySelectorAll('.choice-option-input')].map(x=>x.value.trim());if(q.opcoes.length<2){saveMsg('Crie pelo menos duas respostas.',false);return}if(q.opcoes.some(x=>!x)){saveMsg('Preencha todas as respostas que escolheu.',false);return}q.resposta_correta=Number(document.getElementById('choiceAnswer').value)}
 else{q.frase_correta=document.getElementById('statementCorrect').value==='true';q.palavra_errada=document.getElementById('wrongWord').value.trim();q.palavra_correta=document.getElementById('correctWord').value.trim();if(!q.frase_correta&&(!q.palavra_errada||!q.palavra_correta)){saveMsg('Indique a palavra errada e a correta.',false);return}}
 const idx=questions.findIndex(x=>x.id===id);if(idx>=0)questions[idx]=q;else questions.push(q);await persistQuestions();saveMsg('Pergunta gravada em data/perguntas.json.',true);clearEditor();await loadQuestions()}catch(e){saveMsg(e.message,false)}
}
function clearEditor(){document.getElementById('editorTitle').textContent='Criar nova pergunta';['editId','category','prompt','explanation','wrongWord','correctWord'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.getElementById('type').value='fill';document.getElementById('choiceCount').value='4';document.getElementById('statementCorrect').value='false';document.getElementById('imageFile').value='';document.getElementById('preview').innerHTML='';document.getElementById('fillVisualEditor').innerHTML='';currentImage='';renderChoiceEditor([],0);toggleFields();document.getElementById('saveMessage').className='feedback';updatePromptPreview()}
function editQuestion(id){
 const q=questions.find(x=>x.id===id);if(!q)return;document.querySelector('[data-panel="editor"]').click();document.getElementById('editorTitle').textContent='Editar pergunta';document.getElementById('editId').value=q.id;document.getElementById('category').value=q.categoria||'';document.getElementById('type').value=q.tipo;document.getElementById('explanation').value=q.explicacao||'';
 if(q.tipo==='fill'){document.getElementById('prompt').value='';loadFillVisualEditor(q.pergunta||'',q.respostas||[])}else{document.getElementById('prompt').value=q.pergunta||'';document.getElementById('fillVisualEditor').innerHTML=''}
 if(q.tipo==='choice'){const count=Math.max(2,Math.min(8,(q.opcoes||[]).length||4));document.getElementById('choiceCount').value=String(count);renderChoiceEditor(q.opcoes||[],q.resposta_correta||0)}
 if(q.tipo==='correct'){document.getElementById('statementCorrect').value=String(!!q.frase_correta);document.getElementById('wrongWord').value=q.palavra_errada||'';document.getElementById('correctWord').value=q.palavra_correta||''}
 currentImage=q.imagem||'';document.getElementById('preview').innerHTML=q.imagem?`<img src="${q.imagem}">`:'';toggleFields();updatePromptPreview();window.scrollTo({top:0,behavior:'smooth'})
}
async function deleteQuestion(id){if(!confirm('Apagar esta pergunta?'))return;questions=questions.filter(q=>q.id!==id);await persistQuestions();await loadQuestions()}


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
