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

let masteredQuestionIds = new Set();
let persistedTrainingStats = {
  theoryAnswered: 0,
  practiceAnswered: 0
};

const TRAINING_PROGRESS_KEY = 'codigoEstrada.trainingProgress.v2';

const CATEGORY_GAME_PROGRESS_KEY = 'codigoEstrada.categoryGameProgress.v1';
const CATEGORY_GAME_SELECTION_KEY = 'codigoEstrada.categoryGameSelection.v1';

let categoryGameSelections = {
  theory: [],
  practice: []
};

let categoryGame = {
  active: false,
  mode: 'theory',
  selected: [],
  sessionKey: '',
  pendingIds: [],
  masteredIds: new Set(),
  answered: 0,
  correct: 0,
  currentId: null,
  previousId: null,
  choiceOrder: []
};

function loadCategoryGameSelections(){
  try{
    const raw=localStorage.getItem(CATEGORY_GAME_SELECTION_KEY);
    if(!raw)return;
    const data=JSON.parse(raw);
    categoryGameSelections.theory=Array.isArray(data.theory)?data.theory.filter(Boolean):[];
    categoryGameSelections.practice=Array.isArray(data.practice)?data.practice.filter(Boolean):[];
  }catch{}
}

function saveCategoryGameSelections(){
  try{
    localStorage.setItem(CATEGORY_GAME_SELECTION_KEY,JSON.stringify(categoryGameSelections));
  }catch{}
}

function loadAllCategoryGameSessions(){
  try{
    return JSON.parse(localStorage.getItem(CATEGORY_GAME_PROGRESS_KEY)||'{}')||{};
  }catch{
    return {};
  }
}

function saveAllCategoryGameSessions(data){
  try{
    localStorage.setItem(CATEGORY_GAME_PROGRESS_KEY,JSON.stringify(data||{}));
  }catch{}
}

function categoryGameSessionKey(mode,categories){
  const keys=(categories||[]).map(categoryKey).sort();
  return `${mode}::${keys.join('||')}`;
}

function categoryGameBasePool(mode=categoryGame.mode,selected=categoryGame.selected){
  const source=mode==='practice'?practiceQuestions():theoryQuestions();
  const wanted=new Set((selected||[]).map(categoryKey));
  if(!wanted.size)return [];
  return source.filter(q=>wanted.has(categoryKey(q.categoria||'Sem categoria')));
}

function loadCategoryGameSession(mode,selected){
  const key=categoryGameSessionKey(mode,selected);
  const sessions=loadAllCategoryGameSessions();
  const saved=sessions[key]||{};

  const pool=categoryGameBasePool(mode,selected);
  const validIds=new Set(pool.map(q=>String(q.id)));
  const mastered=new Set(
    (Array.isArray(saved.masteredIds)?saved.masteredIds:[])
      .map(String)
      .filter(id=>validIds.has(id))
  );

  categoryGame={
    active:true,
    mode,
    selected:[...selected],
    sessionKey:key,
    pendingIds:pool.filter(q=>!mastered.has(String(q.id))).map(q=>q.id),
    masteredIds:mastered,
    answered:Number(saved.answered)||0,
    correct:mastered.size,
    currentId:null,
    previousId:null,
    choiceOrder:[]
  };

  saveCategoryGameSession();
}

function saveCategoryGameSession(){
  if(!categoryGame.sessionKey)return;
  const sessions=loadAllCategoryGameSessions();
  sessions[categoryGame.sessionKey]={
    mode:categoryGame.mode,
    categories:[...categoryGame.selected],
    masteredIds:[...categoryGame.masteredIds],
    answered:categoryGame.answered,
    updatedAt:Date.now()
  };
  saveAllCategoryGameSessions(sessions);
}

function resetCurrentCategoryGameSession(){
  if(!categoryGame.sessionKey)return;
  const sessions=loadAllCategoryGameSessions();
  sessions[categoryGame.sessionKey]={
    mode:categoryGame.mode,
    categories:[...categoryGame.selected],
    masteredIds:[],
    answered:0,
    updatedAt:Date.now()
  };
  saveAllCategoryGameSessions(sessions);

  const pool=categoryGameBasePool();
  categoryGame.pendingIds=pool.map(q=>q.id);
  categoryGame.masteredIds=new Set();
  categoryGame.answered=0;
  categoryGame.correct=0;
  categoryGame.currentId=null;
  categoryGame.previousId=null;
  categoryGame.choiceOrder=[];
}

function categoryGameCategories(mode){
  return uniqueCategoriesForMode(mode);
}

function currentCategoryGameSelection(){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  return categoryGameSelections[mode]||[];
}

function syncCategoryGameSuggestions(){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  const list=document.getElementById('categoryGameSuggestions');
  if(!list)return;
  const selectedKeys=new Set(currentCategoryGameSelection().map(categoryKey));
  list.innerHTML=categoryGameCategories(mode)
    .filter(c=>!selectedKeys.has(categoryKey(c)))
    .map(c=>`<option value="${esc(c)}"></option>`)
    .join('');
}

function renderCategoryGameSelection(){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  const host=document.getElementById('categoryGameChips');
  if(!host)return;

  const selected=categoryGameSelections[mode]||[];
  host.innerHTML=selected.length
    ? selected.map(c=>`
        <span class="category-filter-chip">
          <span>${esc(c)}</span>
          <button type="button" onclick="removeCategoryGameSelection(decodeURIComponent('${encodeURIComponent(c)}'))">×</button>
        </span>`).join('')
    : '<span class="small category-filter-all">Escolha pelo menos uma categoria.</span>';

  syncCategoryGameSuggestions();
}

function categoryGameModeChanged(){
  const input=document.getElementById('categoryGameInput');
  if(input)input.value='';
  renderCategoryGameSelection();
}

function addCategoryGameSelection(){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  const input=document.getElementById('categoryGameInput');
  if(!input)return;

  const wanted=categoryKey(input.value);
  const categories=categoryGameCategories(mode);
  const exact=categories.find(c=>categoryKey(c)===wanted);
  const matches=categories.filter(c=>categoryKey(c).includes(wanted));
  const category=exact||(matches.length===1?matches[0]:null);

  if(!category){
    const msg=document.getElementById('categoryGameSetupMessage');
    if(msg){
      msg.className='feedback bad';
      msg.textContent='Escolha uma categoria existente.';
    }
    return;
  }

  const target=categoryGameSelections[mode];
  if(!target.some(c=>categoryKey(c)===categoryKey(category))){
    target.push(category);
    target.sort((a,b)=>a.localeCompare(b,'pt',{sensitivity:'base'}));
    saveCategoryGameSelections();
  }

  input.value='';
  const msg=document.getElementById('categoryGameSetupMessage');
  if(msg){msg.className='feedback';msg.textContent='';}
  renderCategoryGameSelection();
}

function removeCategoryGameSelection(category){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  const key=categoryKey(category);
  categoryGameSelections[mode]=(categoryGameSelections[mode]||[]).filter(c=>categoryKey(c)!==key);
  saveCategoryGameSelections();
  renderCategoryGameSelection();
}

function clearCategoryGameSelection(){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  categoryGameSelections[mode]=[];
  saveCategoryGameSelections();
  const input=document.getElementById('categoryGameInput');
  if(input)input.value='';
  renderCategoryGameSelection();
}

function installCategoryGameInputUX(){
  const input=document.getElementById('categoryGameInput');
  if(!input||input.dataset.bound==='1')return;
  input.dataset.bound='1';

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      addCategoryGameSelection();
    }
  });

  input.addEventListener('change',()=>{
    const mode=document.getElementById('categoryGameMode')?.value||'theory';
    const exact=categoryGameCategories(mode).some(c=>categoryKey(c)===categoryKey(input.value));
    if(exact)addCategoryGameSelection();
  });
}

function showCategoryTrainingSelection(){
  document.getElementById('categoryTrainingSetup')?.classList.remove('hidden');
  document.getElementById('categoryGameStats')?.classList.add('hidden');
  const quiz=document.getElementById('categoryGameQuiz');
  if(quiz)quiz.innerHTML='';
  categoryGame.active=false;
  renderCategoryGameSelection();
}

function startCategoryTraining(){
  const mode=document.getElementById('categoryGameMode')?.value||'theory';
  const selected=[...(categoryGameSelections[mode]||[])];
  const msg=document.getElementById('categoryGameSetupMessage');

  if(!selected.length){
    if(msg){
      msg.className='feedback bad';
      msg.textContent='Escolha pelo menos uma categoria.';
    }
    return;
  }

  const pool=categoryGameBasePool(mode,selected);
  if(!pool.length){
    if(msg){
      msg.className='feedback bad';
      msg.textContent='Não existem perguntas nessas categorias.';
    }
    return;
  }

  if(msg){msg.className='feedback';msg.textContent='';}
  loadCategoryGameSession(mode,selected);

  document.getElementById('categoryTrainingSetup')?.classList.add('hidden');
  document.getElementById('categoryGameStats')?.classList.remove('hidden');
  updateCategoryGameStats();
  nextCategoryGameQuestion(true);
}

function updateCategoryGameStats(){
  const pool=categoryGameBasePool();
  const total=document.getElementById('categoryGameTotal');
  const correctEl=document.getElementById('categoryGameCorrect');
  const answeredEl=document.getElementById('categoryGameAnswered');
  const modeLabel=document.getElementById('categoryGameModeLabel');

  if(total)total.textContent=pool.length;
  if(correctEl)correctEl.textContent=categoryGame.correct;
  if(answeredEl)answeredEl.textContent=categoryGame.answered;
  if(modeLabel)modeLabel.textContent=categoryGame.mode==='practice'?'🚗 Prática':'📘 Teoria';
}

function categoryRandomPendingId(){
  if(!categoryGame.pendingIds.length)return null;
  let candidates=categoryGame.pendingIds;

  if(categoryGame.pendingIds.length>1&&categoryGame.previousId){
    const filtered=categoryGame.pendingIds.filter(id=>id!==categoryGame.previousId);
    if(filtered.length)candidates=filtered;
  }

  const chosen=candidates[Math.floor(Math.random()*candidates.length)];
  const pos=categoryGame.pendingIds.indexOf(chosen);
  if(pos>=0)categoryGame.pendingIds.splice(pos,1);
  return chosen;
}

function currentCategoryGameQuestion(){
  return categoryGameBasePool().find(q=>String(q.id)===String(categoryGame.currentId))||null;
}

function nextCategoryGameQuestion(initial=false){
  const pool=categoryGameBasePool();

  if(!pool.length){
    document.getElementById('categoryGameQuiz').innerHTML=
      '<div class="card small">Não existem perguntas para esta seleção.</div>';
    return;
  }

  if(!categoryGame.pendingIds.length){
    categoryGame.currentId=null;
    saveCategoryGameSession();
    renderCategoryGameCompleted();
    return;
  }

  categoryGame.currentId=categoryRandomPendingId();
  renderCategoryGameQuiz();
}

function renderCategoryGameCompleted(){
  const pool=categoryGameBasePool();
  document.getElementById('categoryGameQuiz').innerHTML=`
    <div class="card">
      <span class="tag">Treino por categorias concluído</span>
      <div class="q" style="margin-top:12px"><strong>🎉 Acertou todas as ${pool.length} perguntas deste conjunto.</strong></div>
      <div class="small" style="margin-top:8px">Foram necessárias ${categoryGame.answered} tentativa${categoryGame.answered===1?'':'s'}.</div>
      <div class="q" style="margin-top:16px"><strong>Quer repetir este mesmo conjunto?</strong></div>
      <div class="actions" style="margin-top:12px">
        <button class="primary" onclick="repeatCategoryTraining()">Sim, repetir</button>
        <button class="secondary" onclick="finishCategoryTraining()">Não, terminar</button>
      </div>
    </div>`;
}

function repeatCategoryTraining(){
  resetCurrentCategoryGameSession();
  updateCategoryGameStats();
  nextCategoryGameQuestion(true);
}

function finishCategoryTraining(){
  showCategoryTrainingSelection();
}

function categoryGameRegisterAttempt(i,ok){
  const card=document.getElementById('cq'+i);
  if(!card||card.dataset.done==='1')return false;

  card.dataset.done='1';
  categoryGame.answered++;

  const id=String(categoryGame.currentId);
  if(ok){
    if(!categoryGame.masteredIds.has(id)){
      categoryGame.masteredIds.add(id);
      categoryGame.correct++;
    }
  }else{
    categoryGame.masteredIds.delete(id);
    if(categoryGame.currentId&&!categoryGame.pendingIds.includes(categoryGame.currentId)){
      categoryGame.pendingIds.push(categoryGame.currentId);
    }
  }

  categoryGame.previousId=categoryGame.currentId;
  saveCategoryGameSession();
  updateCategoryGameStats();

  const next=document.getElementById('cnext'+i);
  if(next){
    next.classList.remove('hidden');
    const btn=next.querySelector('button');
    if(btn)btn.disabled=false;
  }
  return true;
}

function categoryCorrectAnswerHTML(q){
  if(q.tipo==='fill'){
    return correctAnswerHTML(q);
  }

  if(q.tipo==='choice'){
    const idx=Number(q.resposta_correta||0);
    const displayIndex=categoryGame.choiceOrder.indexOf(idx);
    const letter=displayIndex>=0?String.fromCharCode(65+displayIndex):'';
    return `<div>${letter?`<strong>${letter}.</strong> `:''}${esc(q.opcoes?.[idx]||'')}</div>`;
  }

  if(q.tipo==='correct'){
    if(q.frase_correta)return '<div><strong>A frase está correta.</strong></div>';
    return `<div>Substituir <strong>${esc(q.palavra_errada||'')}</strong> por <strong>${esc(q.palavra_correta||'')}</strong>.</div>`;
  }

  return '';
}

function categoryGameFeedback(i,ok,text){
  const f=document.getElementById('cfb'+i);
  const q=questions[i];
  if(!f||!q)return;

  f.className='feedback '+(ok?'ok':'bad');

  if(ok){
    f.innerHTML='✅ Correto. '+esc(text||'');
  }else if(q.tipo==='fill'){
    f.innerHTML=`❌ Incorreto.${text?` ${esc(text)}`:''}
      <div style="margin-top:8px"><strong>Os campos a vermelho mostram a resposta correta ou as respostas em falta.</strong></div>
      <div style="margin-top:8px"><strong>Esta pergunta voltará a aparecer mais tarde neste treino por categorias.</strong></div>`;
  }else{
    f.innerHTML=`❌ Incorreto.${text?` ${esc(text)}`:''}
      <div class="correct-answer-reveal">
        <div class="correct-answer-title">Resposta correta</div>
        <div class="correct-answer-value">${categoryCorrectAnswerHTML(q)}</div>
      </div>
      <div style="margin-top:8px"><strong>Esta pergunta voltará a aparecer mais tarde neste treino por categorias.</strong></div>`;
  }
}


const TRAINING_CATEGORY_FILTER_KEY = 'codigoEstrada.trainingCategories.v1';

let trainingCategoryFilters = {
  theory: [],
  practice: []
};

function normalizeCategoryName(value){
 return String(value??'').trim();
}

function loadTrainingCategoryFilters(){
 try{
   const raw=localStorage.getItem(TRAINING_CATEGORY_FILTER_KEY);
   if(!raw)return;
   const data=JSON.parse(raw);
   trainingCategoryFilters.theory=Array.isArray(data.theory)?data.theory.map(normalizeCategoryName).filter(Boolean):[];
   trainingCategoryFilters.practice=Array.isArray(data.practice)?data.practice.map(normalizeCategoryName).filter(Boolean):[];
 }catch{
   trainingCategoryFilters={theory:[],practice:[]};
 }
}

function saveTrainingCategoryFilters(){
 try{
   localStorage.setItem(TRAINING_CATEGORY_FILTER_KEY,JSON.stringify(trainingCategoryFilters));
 }catch{}
}

function categoryKey(value){
 return norm(value);
}

function uniqueCategoriesForMode(mode){
 const pool=mode==='practice'
   ? questions.filter(q=>(q.grupo||'teoria')==='pratica')
   : questions.filter(q=>(q.grupo||'teoria')!=='pratica');

 const map=new Map();
 pool.forEach(q=>{
   const category=normalizeCategoryName(q.categoria||'Sem categoria')||'Sem categoria';
   const key=categoryKey(category);
   if(!map.has(key))map.set(key,category);
 });

 return [...map.values()].sort((a,b)=>a.localeCompare(b,'pt',{sensitivity:'base'}));
}

function selectedCategoriesForMode(mode){
 return trainingCategoryFilters[mode==='practice'?'practice':'theory']||[];
}

function questionMatchesTrainingCategories(q,mode){
 const selected=selectedCategoriesForMode(mode);
 if(!selected.length)return true;
 const key=categoryKey(q.categoria||'Sem categoria');
 return selected.some(c=>categoryKey(c)===key);
}

function filteredTheoryQuestions(){
 // Mantida apenas por compatibilidade com versões anteriores.
 // O treino geral teórico usa sempre todas as perguntas teóricas.
 return theoryQuestions();
}

function filteredPracticeQuestions(){
 // Mantida apenas por compatibilidade com versões anteriores.
 // O treino geral prático usa sempre todas as perguntas práticas.
 return practiceQuestions();
}

function syncCategorySuggestions(mode){
 const inputId=mode==='practice'?'practiceCategorySuggestions':'theoryCategorySuggestions';
 const list=document.getElementById(inputId);
 if(!list)return;

 const selectedKeys=new Set(selectedCategoriesForMode(mode).map(categoryKey));
 const categories=uniqueCategoriesForMode(mode).filter(c=>!selectedKeys.has(categoryKey(c)));

 list.innerHTML=categories.map(c=>`<option value="${esc(c)}"></option>`).join('');
}

function renderTrainingCategoryFilter(mode){
 const chipHost=document.getElementById(mode==='practice'?'practiceCategoryChips':'theoryCategoryChips');
 if(!chipHost)return;

 const selected=selectedCategoriesForMode(mode);

 chipHost.innerHTML=selected.length
   ? selected.map(c=>`
       <span class="category-filter-chip">
         <span>${esc(c)}</span>
         <button type="button" aria-label="Remover ${esc(c)}" onclick="removeTrainingCategory('${mode}',decodeURIComponent('${encodeURIComponent(c)}'))">×</button>
       </span>`).join('')
   : '<span class="small category-filter-all">Todas as categorias estão incluídas.</span>';

 syncCategorySuggestions(mode);
}

function findExistingCategory(mode,value){
 const wanted=categoryKey(value);
 if(!wanted)return null;
 const categories=uniqueCategoriesForMode(mode);

 // correspondência exata primeiro
 const exact=categories.find(c=>categoryKey(c)===wanted);
 if(exact)return exact;

 // Se escreveu parte do nome e só existir uma correspondência, aceita-a.
 const matches=categories.filter(c=>categoryKey(c).includes(wanted));
 return matches.length===1?matches[0]:null;
}

function addTrainingCategory(mode){
 const input=document.getElementById(mode==='practice'?'practiceCategoryInput':'theoryCategoryInput');
 if(!input)return;

 const category=findExistingCategory(mode,input.value);
 if(!category){
   input.classList.add('category-input-error');
   input.placeholder='Escolha uma categoria existente';
   setTimeout(()=>input.classList.remove('category-input-error'),850);
   return;
 }

 const target=selectedCategoriesForMode(mode);
 if(!target.some(c=>categoryKey(c)===categoryKey(category))){
   target.push(category);
   target.sort((a,b)=>a.localeCompare(b,'pt',{sensitivity:'base'}));
   saveTrainingCategoryFilters();
 }

 input.value='';
 renderTrainingCategoryFilter(mode);
 rebuildTrainingForCategoryFilter(mode);
}

function removeTrainingCategory(mode,category){
 const key=categoryKey(category);
 trainingCategoryFilters[mode]=selectedCategoriesForMode(mode).filter(c=>categoryKey(c)!==key);
 saveTrainingCategoryFilters();
 renderTrainingCategoryFilter(mode);
 rebuildTrainingForCategoryFilter(mode);
}

function clearTrainingCategories(mode){
 trainingCategoryFilters[mode]=[];
 saveTrainingCategoryFilters();

 const input=document.getElementById(mode==='practice'?'practiceCategoryInput':'theoryCategoryInput');
 if(input)input.value='';

 renderTrainingCategoryFilter(mode);
 rebuildTrainingForCategoryFilter(mode);
}

function rebuildTrainingForCategoryFilter(mode){
 if(mode==='practice'){
   const pool=filteredPracticeQuestions();
   practicePendingIds=pool.filter(q=>!isQuestionMastered(q.id)).map(q=>q.id);
   practiceCorrect=pool.filter(q=>isQuestionMastered(q.id)).length;
   currentPracticeId=null;
   previousPracticeId=null;

   document.getElementById('practiceTotal').textContent=pool.length;
   document.getElementById('practiceCorrect').textContent=practiceCorrect;

   if(document.getElementById('practice')?.classList.contains('active')){
     if(pool.length)nextPracticeQuestion(true);
     else renderPracticeIdle();
   }else{
     renderPracticeIdle();
   }
 }else{
   const pool=filteredTheoryQuestions();
   trainingPendingIds=pool.filter(q=>!isQuestionMastered(q.id)).map(q=>q.id);
   correct=pool.filter(q=>isQuestionMastered(q.id)).length;
   currentTrainingId=null;
   previousTrainingId=null;

   document.getElementById('total').textContent=pool.length;
   document.getElementById('correct').textContent=correct;

   nextTrainingQuestion(true);
 }
}

function installCategoryFilterInputUX(){
 [['theory','theoryCategoryInput'],['practice','practiceCategoryInput']].forEach(([mode,id])=>{
   const input=document.getElementById(id);
   if(!input||input.dataset.categoryUxInstalled==='1')return;
   input.dataset.categoryUxInstalled='1';

   input.addEventListener('keydown',e=>{
     if(e.key==='Enter'){
       e.preventDefault();
       addTrainingCategory(mode);
     }
   });

   input.addEventListener('change',()=>{
     if(findExistingCategory(mode,input.value))addTrainingCategory(mode);
   });
 });
}


function loadTrainingProgress(){
  try{
    const raw=localStorage.getItem(TRAINING_PROGRESS_KEY);
    if(!raw){
      masteredQuestionIds=new Set();
      persistedTrainingStats={theoryAnswered:0,practiceAnswered:0};
      return;
    }

    const data=JSON.parse(raw);
    masteredQuestionIds=new Set(
      Array.isArray(data.masteredIds)
        ? data.masteredIds.map(String)
        : []
    );

    persistedTrainingStats={
      theoryAnswered:Number(data.theoryAnswered)||0,
      practiceAnswered:Number(data.practiceAnswered)||0
    };
  }catch{
    masteredQuestionIds=new Set();
    persistedTrainingStats={theoryAnswered:0,practiceAnswered:0};
  }
}

function saveTrainingProgress(){
  try{
    localStorage.setItem(TRAINING_PROGRESS_KEY,JSON.stringify({
      masteredIds:[...masteredQuestionIds],
      theoryAnswered:Number(persistedTrainingStats.theoryAnswered)||0,
      practiceAnswered:Number(persistedTrainingStats.practiceAnswered)||0
    }));
  }catch{}
}

function pruneTrainingProgress(){
  const validIds=new Set(questions.map(q=>String(q.id)));
  masteredQuestionIds=new Set(
    [...masteredQuestionIds].filter(id=>validIds.has(String(id)))
  );
  saveTrainingProgress();
}

function isQuestionMastered(id){
  return masteredQuestionIds.has(String(id));
}

function setQuestionMastered(id,mastered=true){
  const key=String(id);
  if(mastered)masteredQuestionIds.add(key);
  else masteredQuestionIds.delete(key);
  saveTrainingProgress();
}

function resetProgressForQuestionIds(ids){
  const set=new Set((ids||[]).map(String));
  masteredQuestionIds=new Set(
    [...masteredQuestionIds].filter(id=>!set.has(String(id)))
  );
  saveTrainingProgress();
}



function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function norm(s){return String(s??'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}

// Comparação de respostas: ignora maiúsculas/minúsculas, acentos,
// espaços, pontuação e restantes símbolos.
function normAnswer(s){
 return String(s??'')
   .toLowerCase()
   .normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]/g,'');
}

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
   if(btn.dataset.panel==='categoryTraining'){
     renderCategoryGameSelection();
     installCategoryGameInputUX();
   }
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

   loadTrainingProgress();
   loadTrainingCategoryFilters();
   loadCategoryGameSelections();
   pruneTrainingProgress();

   const theory=filteredTheoryQuestions();
   const practice=filteredPracticeQuestions();

   // O progresso é reconstruído por ID. Editar texto, resposta, imagem,
   // categoria ou explicação não altera o estado da pergunta.
   trainingPendingIds=theory
     .filter(q=>!isQuestionMastered(q.id))
     .map(q=>q.id);

   correct=theory.filter(q=>isQuestionMastered(q.id)).length;
   answered=persistedTrainingStats.theoryAnswered;

   practicePendingIds=practice
     .filter(q=>!isQuestionMastered(q.id))
     .map(q=>q.id);

   practiceCorrect=practice.filter(q=>isQuestionMastered(q.id)).length;
   practiceAnswered=persistedTrainingStats.practiceAnswered;

   // Se a pergunta que estava no ecrã deixou de existir ou mudou de área,
   // deixa de ser "atual", mas o restante progresso mantém-se.
   if(!theory.some(q=>q.id===currentTrainingId)) currentTrainingId=null;
   if(!practice.some(q=>q.id===currentPracticeId)) currentPracticeId=null;

   document.getElementById('total').textContent=theory.length;
   document.getElementById('correct').textContent=correct;
   document.getElementById('answered').textContent=answered;

   document.getElementById('practiceTotal').textContent=practice.length;
   document.getElementById('practiceCorrect').textContent=practiceCorrect;
   document.getElementById('practiceAnswered').textContent=practiceAnswered;

   renderBank();
   renderCategoryGameSelection();
   installCategoryGameInputUX();

   // No treino teórico, continua apenas com o que ainda falta dominar.
   if(trainingPendingIds.length){
     nextTrainingQuestion(true);
   }else{
     currentTrainingId=null;
     nextTrainingQuestion(true);
   }

   // A prática não é reiniciada. Ao abrir a aba, retoma só as pendentes.
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


function encodeTableData(data){
 try{
   return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
 }catch{
   return '';
 }
}

function decodeTableData(encoded){
 try{
   return JSON.parse(decodeURIComponent(escape(atob(encoded))));
 }catch{
   return null;
 }
}

function trainingFieldMarkup(pos,question){
 const field=question?.campos_resposta?.[pos];

 if(field?.modo==='set'){
   const values=field.respostas||[];
   return `<span class="multi-train-slot" data-set-pos="${pos}" data-used="">
     <span class="multi-train-counter" data-set-counter="${pos}">0/${values.length}</span>
     <input class="multi-train-input" data-set-input="${pos}" placeholder="escreva uma resposta">
     <button class="multi-train-submit" data-set-submit="${pos}" type="button">OK</button>
     <span class="multi-train-accepted" data-set-accepted="${pos}"></span>
   </span>`;
 }

 const accepted=(field?.respostas||question?.respostas?.[pos]||[]).map(x=>String(x||''));
 const longest=accepted.reduce((max,v)=>Math.max(max,v.length),0);
 const chars=Math.max(4,Math.min(34,longest||8));

 return `<span class="train-fill-slot">
   <input class="train-fill-input" data-pos="${pos}" placeholder="escreva a resposta" style="--answer-chars:${chars}">
   <button type="button"
           class="secondary train-fill-verify"
           data-verify-pos="${pos}"
           title="Verificar esta resposta"
           style="width:auto;min-width:34px;padding:6px 9px;margin-left:4px;border-radius:8px;">✓</button>
 </span>`;
}

function formatTableCellContent(raw,fillInputs,question){
 let text=String(raw??'');
 const slots=[];

 if(fillInputs){
   text=text.replace(/\[\[(\d+)\]\]/g,(m,n)=>{
     const pos=Number(n)-1;
     const token=`@@TABLE_FILL_${slots.length}@@`;
     slots.push(trainingFieldMarkup(pos,question));
     return token;
   });
 }else{
   text=text.replace(/\[\[(\d+)\]\]/g,'____');
 }

 let h=esc(text);
 h=h.replace(/\*\*\*\*(.+?)\*\*\*\*/g,'<strong>$1</strong>');
 h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
 h=h.replace(/\r?\n/g,'<br>');

 slots.forEach((slot,i)=>{
   h=h.replace(`@@TABLE_FILL_${i}@@`,slot);
 });

 return h;
}

function renderQuestionTable(data,fillInputs,question){
 if(!data||!Array.isArray(data.headers)||!Array.isArray(data.rows))return '';

 const headers=data.headers||[];
 const rowLabels=!!data.rowLabels;

 const headCells=headers.map(h=>`<th>${esc(h||'')}</th>`).join('');
 const topLeft=rowLabels?'<th class="question-table-rowname"></th>':'';

 const body=data.rows.map(row=>{
   const name=rowLabels?`<th class="question-table-rowname">${esc(row.name||'')}</th>`:'';
   const cells=(row.cells||[]).map(cell=>
     `<td>${formatTableCellContent(cell,fillInputs,question)}</td>`
   ).join('');
   return `<tr>${name}${cells}</tr>`;
 }).join('');

 return `<div class="question-table-scroll">
   <table class="question-table">
     <thead><tr>${topLeft}${headCells}</tr></thead>
     <tbody>${body}</tbody>
   </table>
 </div>`;
}


function clearSelectedEditorTable(){
 if(selectedEditorTable){
   selectedEditorTable.classList.remove('editor-table-selected');
 }
 selectedEditorTable=null;
}

function selectEditorTable(wrap){
 clearSelectedEditorTable();
 if(!wrap)return;
 selectedEditorTable=wrap;
 wrap.classList.add('editor-table-selected');
}

function cloneSelectedEditorTableData(){
 if(!selectedEditorTable)return null;
 const data=collectEditorTableData(selectedEditorTable,node=>{
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
   if(node.nodeType!==Node.ELEMENT_NODE)return '';
   const el=node;

   if(el.classList?.contains('fill-slot')){
     const mode=el.getAttribute('data-slot-mode')==='set'?'set':'single';
     // Para cópia estrutural, mantém apenas o marcador; os metadados são serializados via pergunta.
     return '[[]]';
   }

   if(el.hasAttribute?.('data-editor-bold')){
     return `****${el.textContent||''}****`;
   }

   if(el.tagName==='BR')return '\n';

   let out='';
   el.childNodes.forEach(child=>out+=arguments.callee(child));
   return out;
 });
 return JSON.parse(JSON.stringify(data));
}

function copySelectedEditorTableToClipboard(){
 if(!selectedEditorTable)return false;

 const data=collectEditorTableData(selectedEditorTable,node=>{
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
   if(node.nodeType!==Node.ELEMENT_NODE)return '';
   const el=node;

   if(el.classList?.contains('fill-slot')){
     return '[[]]';
   }

   if(el.hasAttribute?.('data-editor-bold')){
     return `****${el.textContent||''}****`;
   }

   if(el.tagName==='BR')return '\n';

   let out='';
   el.childNodes.forEach(child=>{
     if(child.nodeType===Node.TEXT_NODE)out+=child.nodeValue||'';
     else if(child.nodeType===Node.ELEMENT_NODE){
       const childEl=child;
       if(childEl.classList?.contains('fill-slot'))out+='[[]]';
       else if(childEl.hasAttribute?.('data-editor-bold'))out+=`****${childEl.textContent||''}****`;
       else out+=childEl.textContent||'';
     }
   });
   return out;
 });

 copiedEditorTableData=JSON.parse(JSON.stringify(data));

 try{
   const encoded=encodeTableData(data);
   navigator.clipboard?.writeText(`{{tbl64:${encoded}}}`);
 }catch{}

 return true;
}

function pasteCopiedEditorTable(){
 if(!copiedEditorTableData)return false;
 pushFillUndoState?.();
 insertTableAtCaret(JSON.parse(JSON.stringify(copiedEditorTableData)));
 return true;
}

function createEditorTableNode(data={}){
 const headers=Array.isArray(data.headers)&&data.headers.length
   ? data.headers
   : ['Coluna 1','Coluna 2'];

 const rows=Array.isArray(data.rows)&&data.rows.length
   ? data.rows
   : [{name:'',cells:headers.map(()=> '')}];

 const rowLabels=!!data.rowLabels;

 const wrap=document.createElement('div');
 wrap.className='editor-table-wrap';
 wrap.contentEditable='false';
 wrap.setAttribute('data-editor-table','1');

 const controls=document.createElement('div');
 controls.className='editor-table-controls';

 const title=document.createElement('span');
 title.className='editor-table-badge';
 title.textContent='TABELA';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='editor-table-remove';
 remove.setAttribute('data-remove-editor-table','1');
 remove.title='Remover tabela';
 remove.textContent='×';

 controls.appendChild(title);
 controls.appendChild(remove);

 const scroll=document.createElement('div');
 scroll.className='editor-table-scroll';

 const table=document.createElement('table');
 table.className='editor-question-table';
 table.setAttribute('data-row-labels',rowLabels?'1':'0');

 const thead=document.createElement('thead');
 const hr=document.createElement('tr');

 if(rowLabels){
   const corner=document.createElement('th');
   corner.className='editor-table-corner';
   corner.textContent='';
   hr.appendChild(corner);
 }

 headers.forEach((value,i)=>{
   const th=document.createElement('th');
   const cell=document.createElement('div');
   cell.className='editor-table-cell editor-table-header-cell';
   cell.contentEditable='true';
   cell.setAttribute('data-table-header',String(i));
   cell.textContent=value||`Coluna ${i+1}`;
   th.appendChild(cell);
   hr.appendChild(th);
 });

 thead.appendChild(hr);
 table.appendChild(thead);

 const tbody=document.createElement('tbody');

 rows.forEach((row,rIndex)=>{
   const tr=document.createElement('tr');

   if(rowLabels){
     const th=document.createElement('th');
     const name=document.createElement('div');
     name.className='editor-table-cell editor-table-rowname-cell';
     name.contentEditable='true';
     name.setAttribute('data-table-row-name',String(rIndex));
     name.textContent=row.name||`Linha ${rIndex+1}`;
     th.appendChild(name);
     tr.appendChild(th);
   }

   headers.forEach((_,cIndex)=>{
     const td=document.createElement('td');
     const cell=document.createElement('div');
     cell.className='editor-table-cell editor-table-body-cell';
     cell.contentEditable='true';
     cell.setAttribute('data-table-cell',`${rIndex}:${cIndex}`);

     const raw=row.cells?.[cIndex]||'';
     appendVisualInline(cell,raw,window.__loadingTableAnswers||[]);

     td.appendChild(cell);
     tr.appendChild(td);
   });

   tbody.appendChild(tr);
 });

 table.appendChild(tbody);
 scroll.appendChild(table);

 wrap.appendChild(controls);
 wrap.appendChild(scroll);
 return wrap;
}

function collectEditorTableData(wrap,walkFn){
 const headers=[...wrap.querySelectorAll('[data-table-header]')]
   .map(el=>el.textContent.trim());

 const rowLabels=wrap.querySelector('table')?.getAttribute('data-row-labels')==='1';
 const rows=[];

 wrap.querySelectorAll('tbody tr').forEach((tr,rIndex)=>{
   const rowName=rowLabels
     ? tr.querySelector('[data-table-row-name]')?.textContent.trim()||''
     : '';

   const cells=[...tr.querySelectorAll('[data-table-cell]')].map(cell=>{
     let raw='';
     cell.childNodes.forEach(child=>raw+=walkFn(child));
     return raw.replace(/\n+$/g,'').trim();
   });

   rows.push({name:rowName,cells});
 });

 return {headers,rowLabels,rows};
}

function insertTableAtCaret(data){
 const tableNode=createEditorTableNode(data);
 insertEditorNodeAtCaret(tableNode);
 requestAnimationFrame(()=>{
   tableNode.querySelector('[data-table-header]')?.focus();
 });
}

function formatQuestionText(raw, fillInputs=false, question=null){
 let text=String(raw??'');
 const slots=[];
 const multiSlots=[];
 const images=[];
 const tables=[];

 text=text.replace(/\{\{tbl64:([A-Za-z0-9+/=]+)\}\}/g,(m,encoded)=>{
   const token=`@@INLINE_TABLE_${tables.length}@@`;
   const data=decodeTableData(encoded);
   tables.push(renderQuestionTable(data,fillInputs,question));
   return token;
 });

 // Imagens incorporadas no enunciado.
 text=text.replace(/\[\[\[(\d+)\]\]\]/g,(m,n)=>{
   const pos=Number(n)-1;
   const token=`@@MULTI_SLOT_${multiSlots.length}@@`;
   const values=question?.respostas_multiplas?.[pos]||[];
   const total=values.length;
   multiSlots.push(`<span class="multi-train-slot" data-multi-pos="${pos}">
     <span class="multi-train-counter" data-multi-counter="${pos}">0/${total}</span>
     <input class="multi-train-input" data-multi-input="${pos}" placeholder="escreva uma resposta">
     <button class="multi-train-submit" data-multi-submit="${pos}" type="button">OK</button>
     <span class="multi-train-accepted" data-multi-accepted="${pos}"></span>
   </span>`);
   return token;
 });

 text=text.replace(/\{\{img:([^}]+)\}\}/gi,(m,src)=>{
   const token=`@@INLINE_IMAGE_${images.length}@@`;
   images.push(`<span class="question-inline-image"><img src="${esc(String(src||'').trim())}" alt="Imagem do enunciado"></span>`);
   return token;
 });

 if(fillInputs){
   text=text.replace(/\[\[(\d+)\]\]/g,(m,n)=>{
     const pos=Number(n)-1;
     const token=`@@FILL_SLOT_${slots.length}@@`;
     const field=question?.campos_resposta?.[pos];

     slots.push(trainingFieldMarkup(pos,question));
     return token;
   });
 }else{
   text=text.replace(/\[\[(\d+)\]\]/g,'____');
 }

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
 multiSlots.forEach((slot,i)=>{h=h.replace(`@@MULTI_SLOT_${i}@@`,slot);});
 images.forEach((img,i)=>{h=h.replace(`@@INLINE_IMAGE_${i}@@`,img);});
 tables.forEach((tbl,i)=>{h=h.replace(`@@INLINE_TABLE_${i}@@`,tbl);});
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
 const pool=filteredTheoryQuestions();
 if(!pool.length){
   const hasFilter=selectedCategoriesForMode('theory').length>0;
   document.getElementById('quiz').innerHTML=hasFilter
     ? '<div class="card small">Não existem perguntas teóricas nas categorias selecionadas. Remova um filtro ou escolha outra categoria.</div>'
     : '<div class="card small">Ainda não existem perguntas na base de dados.</div>';
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
 const theoryIds=filteredTheoryQuestions().map(q=>q.id);
 resetProgressForQuestionIds(theoryIds);

 persistedTrainingStats.theoryAnswered=0;
 saveTrainingProgress();

 correct=0;
 answered=0;
 trainingPendingIds=[...theoryIds];
 currentTrainingId=null;
 previousTrainingId=null;

 document.getElementById('correct').textContent='0';
 document.getElementById('answered').textContent='0';
 nextTrainingQuestion(true);
}

function currentTrainingQuestion(){
 return filteredTheoryQuestions().find(q=>q.id===currentTrainingId) || null;
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
 const remaining=filteredTheoryQuestions().length-mastered;
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
 setTimeout(()=>{
   const c=document.getElementById('q'+i);
   initMultiRuntime(c);
   bindSetFieldRuntime(c,false);
   bindImmediateFillValidation(c,i,false);
 },0);
}

function registerAttempt(i,ok){
 const c=document.getElementById('q'+i);
 if(!c || c.dataset.done==='1') return false;

 c.dataset.done='1';
 answered++;
 persistedTrainingStats.theoryAnswered=answered;

 if(ok){
   if(!isQuestionMastered(currentTrainingId)){
     setQuestionMastered(currentTrainingId,true);
     correct++;
   }
 }else{
   // Uma pergunta falhada permanece não dominada e volta à fila.
   setQuestionMastered(currentTrainingId,false);
   if(currentTrainingId && !trainingPendingIds.includes(currentTrainingId)){
     trainingPendingIds.push(currentTrainingId);
   }
 }

 saveTrainingProgress();

 previousTrainingId=currentTrainingId;
 document.getElementById('correct').textContent=correct;
 document.getElementById('answered').textContent=answered;

 const next=document.getElementById('next'+i);
 if(next){
   next.classList.remove('hidden');
   const btn=next.querySelector('button');
   if(btn)btn.disabled=false;
 }
 return true;
}

function correctAnswerHTML(q){
 if(q.tipo==='fill'){
   const fields=(q.campos_resposta||[]).length
     ? q.campos_resposta.map((c,i)=>{
         if(c.modo==='set'){
           return `<div style="margin-top:6px"><strong>Campo ${i+1} — conjunto:</strong>${multiSlotCorrectHTML(c.respostas||[])}</div>`;
         }
         return `<div><strong>Campo ${i+1}:</strong> ${esc((c.respostas||[])[0]||'')}</div>`;
       }).join('')
     : (q.respostas||[]).map((a,i)=>`<div><strong>Campo ${i+1}:</strong> ${esc((a||[])[0]||'')}</div>`).join('');
   return fields;
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


function submitUnorderedAnswer(i){
 const q=questions[i];
 const card=document.getElementById('q'+i);
 const box=document.getElementById('unorderedBox'+i);
 const input=document.getElementById('unorderedInput'+i);
 if(!q||!card||!box||!input||card.dataset.done==='1')return;

 const value=input.value.trim();
 if(!value)return;

 const used=(box.dataset.used||'')
   .split(',')
   .filter(Boolean)
   .map(Number);

 // Se a resposta já foi dada antes, não falha nem soma novamente.
 const duplicateIndex=(q.respostas_lista||[]).findIndex((accepted,idx)=>
   used.includes(idx) && (accepted||[]).map(normAnswer).includes(normAnswer(value))
 );
 if(duplicateIndex>=0){
   input.value='';
   input.placeholder='Essa resposta já foi indicada';
   input.classList.add('unordered-duplicate');
   setTimeout(()=>input.classList.remove('unordered-duplicate'),700);
   return;
 }

 const matched=unorderedMatchedIndex(q,value,used);

 // Qualquer resposta incorreta termina imediatamente esta tentativa.
 if(matched<0){
   input.classList.add('unordered-wrong');
   input.disabled=true;
   box.querySelectorAll('button').forEach(b=>b.disabled=true);
   if(registerAttempt(i,false))feedback(i,false,q.explicacao);
   return;
 }

 used.push(matched);
 box.dataset.used=used.join(',');

 const acceptedHost=document.getElementById('unorderedAccepted'+i);
 if(acceptedHost){
   const chip=document.createElement('span');
   chip.className='unordered-accepted-chip';
   chip.textContent=(q.respostas_lista[matched]||[])[0]||value;
   acceptedHost.appendChild(chip);
 }

 const total=(q.respostas_lista||[]).length;
 document.getElementById('unorderedCount'+i).textContent=`${used.length}/${total}`;
 input.value='';
 input.placeholder='Escreva outra resposta';

 if(used.length>=total){
   input.disabled=true;
   box.querySelectorAll('button').forEach(b=>b.disabled=true);
   if(registerAttempt(i,true))feedback(i,true,q.explicacao);
 }
}



function getSetFieldValues(q,pos){
 const field=q.campos_resposta?.[pos];
 if(field?.modo==='set')return field.respostas||[];
 return [];
}


function revealMissingSetAnswers(slot,values,usedIndexes){
 if(!slot)return;

 const used=new Set((usedIndexes||[]).map(Number));
 const host=slot.querySelector('[data-set-accepted]');
 if(!host)return;

 values.forEach((value,idx)=>{
   if(used.has(idx))return;

   const chip=document.createElement('span');
   chip.className='multi-train-chip multi-train-missing';
   chip.textContent=value;
   host.appendChild(chip);
 });
}

function submitSetFieldAnswer(i,pos,isPractice=false){
 const card=document.getElementById((isPractice?'pq':'q')+i);
 const q=questions[i];
 if(!card||!q||card.dataset.done==='1')return;

 const slot=card.querySelector(`[data-set-pos="${pos}"]`);
 const input=slot?.querySelector('[data-set-input]');
 if(!slot||!input||input.disabled)return;

 const value=input.value.trim();
 if(!value)return;

 const values=getSetFieldValues(q,pos);
 const used=(slot.dataset.used||'').split(',').filter(Boolean).map(Number);

 const duplicate=values.findIndex((v,idx)=>used.includes(idx)&&normAnswer(v)===normAnswer(value));
 if(duplicate>=0){
   input.value='';
   input.placeholder='Resposta já indicada';
   return;
 }

 const matched=values.findIndex((v,idx)=>!used.includes(idx)&&normAnswer(v)===normAnswer(value));

 if(matched<0){
   input.classList.add('multi-train-wrong');

   // Revela também todos os restantes campos da pergunta.
   revealAllRemainingFillAnswers(card,q);

   lockFillQuestion(card);

   if(isPractice){
     if(registerPracticeAttempt(i,false))practiceFeedback(i,false,q.explicacao);
   }else{
     if(registerAttempt(i,false))feedback(i,false,q.explicacao);
   }
   return;
 }

 used.push(matched);
 slot.dataset.used=used.join(',');

 const accepted=slot.querySelector('[data-set-accepted]');
 if(accepted){
   const chip=document.createElement('span');
   chip.className='multi-train-chip';
   chip.textContent=values[matched];
   accepted.appendChild(chip);
 }

 const counter=slot.querySelector('[data-set-counter]');
 if(counter)counter.textContent=`${used.length}/${values.length}`;
 input.value='';

 if(used.length===values.length){
   input.disabled=true;
   slot.querySelector('[data-set-submit]')?.setAttribute('disabled','disabled');
 }

 const hasNormal=card.querySelector('[data-pos]');
 const allSets=[...card.querySelectorAll('[data-set-pos]')].every(s=>{
   const p=Number(s.dataset.setPos);
   return (s.dataset.used||'').split(',').filter(Boolean).length===getSetFieldValues(q,p).length;
 });

 if(allSets){
   maybeFinishFillQuestion(i,isPractice);
 }
}

function bindSetFieldRuntime(card,isPractice=false){
 if(!card)return;
 card.querySelectorAll('[data-set-pos]').forEach(slot=>{
   const pos=Number(slot.dataset.setPos);
   const input=slot.querySelector('[data-set-input]');
   const btn=slot.querySelector('[data-set-submit]');

   if(input&&!input.dataset.bound){
     input.dataset.bound='1';
     input.addEventListener('keydown',e=>{
       if(e.key==='Enter'){
         e.preventDefault();
         const qi=Number(card.id.replace(isPractice?/^pq/:/^q/,''));
         submitSetFieldAnswer(qi,pos,isPractice);
       }
     });
   }
   if(btn&&!btn.dataset.bound){
     btn.dataset.bound='1';
     btn.addEventListener('click',()=>{
       const qi=Number(card.id.replace(isPractice?/^pq/:/^q/,''));
       submitSetFieldAnswer(qi,pos,isPractice);
     });
   }
 });
}

function getMultiSlotValues(q,pos){
 return q.respostas_multiplas?.[pos]||[];
}

function initMultiRuntime(card){
 if(!card)return;
 card.querySelectorAll('[data-multi-pos]').forEach(slot=>{
   if(!slot.dataset.used)slot.dataset.used='';
   const input=slot.querySelector('[data-multi-input]');
   const btn=slot.querySelector('[data-multi-submit]');
   const pos=Number(slot.dataset.multiPos);
   if(input&&!input.dataset.bound){
     input.dataset.bound='1';
     input.addEventListener('keydown',e=>{
       if(e.key==='Enter'){
         e.preventDefault();
         const qi=Number(card.id.replace(/^q/,''));
         submitMultiSlotAnswer(qi,pos,false);
       }
     });
   }
   if(btn&&!btn.dataset.bound){
     btn.dataset.bound='1';
     btn.addEventListener('click',()=>{
       const qi=Number(card.id.replace(/^q/,''));
       submitMultiSlotAnswer(qi,pos,false);
     });
   }
 });
}

function allFillAndMultiAnsweredCorrect(card,q){
 const normalInputs=[...card.querySelectorAll('[data-pos]')];
 const normalOk=normalInputs.every(inp=>{
   const pos=Number(inp.dataset.pos);
   const accepted=(q.respostas?.[pos]||[]).map(normAnswer);
   return accepted.includes(normAnswer(inp.value));
 });
 const multiOk=[...card.querySelectorAll('[data-multi-pos]')].every(slot=>{
   const pos=Number(slot.dataset.multiPos);
   const total=getMultiSlotValues(q,pos).length;
   const used=(slot.dataset.used||'').split(',').filter(Boolean).length;
   return used===total;
 });
 return normalOk&&multiOk;
}

function lockFillQuestion(card){
 if(!card)return;

 // Bloqueia apenas elementos de resposta.
 // O botão "Próxima pergunta" tem de continuar utilizável.
 card.querySelectorAll('input').forEach(el=>{
   el.disabled=true;
 });

 card.querySelectorAll('button').forEach(btn=>{
   const isNavigation=
     btn.closest('[id^="next"]') ||
     btn.closest('[id^="pnext"]') ||
     /próxima pergunta/i.test(btn.textContent||'');

   if(!isNavigation){
     btn.disabled=true;
   }
 });
}

function submitMultiSlotAnswer(i,pos,isPractice=false){
 const prefix=isPractice?'pq':'q';
 const card=document.getElementById(prefix+i);
 const q=questions[i];
 if(!card||!q||card.dataset.done==='1')return;

 const slot=card.querySelector(`[data-multi-pos="${pos}"]`);
 const input=slot?.querySelector('[data-multi-input]');
 if(!slot||!input||input.disabled)return;

 const value=input.value.trim();
 if(!value)return;

 const values=getMultiSlotValues(q,pos);
 const used=(slot.dataset.used||'').split(',').filter(Boolean).map(Number);

 const duplicate=values.findIndex((v,idx)=>used.includes(idx)&&normAnswer(v)===normAnswer(value));
 if(duplicate>=0){
   input.value='';
   input.placeholder='Resposta já indicada';
   return;
 }

 const matched=values.findIndex((v,idx)=>!used.includes(idx)&&normAnswer(v)===normAnswer(value));

 if(matched<0){
   input.classList.add('multi-train-wrong');
   revealAllRemainingFillAnswers(card,q);
   lockFillQuestion(card);
   if(isPractice){
     if(registerPracticeAttempt(i,false))practiceFeedback(i,false,q.explicacao);
   }else{
     if(registerAttempt(i,false))feedback(i,false,q.explicacao);
   }
   return;
 }

 used.push(matched);
 slot.dataset.used=used.join(',');

 const accepted=slot.querySelector('[data-multi-accepted]');
 if(accepted){
   const chip=document.createElement('span');
   chip.className='multi-train-chip';
   chip.textContent=values[matched];
   accepted.appendChild(chip);
 }

 const counter=slot.querySelector('[data-multi-counter]');
 if(counter)counter.textContent=`${used.length}/${values.length}`;
 input.value='';

 if(used.length===values.length){
   input.disabled=true;
   slot.querySelector('[data-multi-submit]')?.setAttribute('disabled','disabled');
 }

 // If this question has only multi fields, completion can be automatic.
 const hasNormal=card.querySelector('[data-pos]');
 if(!hasNormal && allFillAndMultiAnsweredCorrect(card,q)){
   lockFillQuestion(card);
   if(isPractice){
     if(registerPracticeAttempt(i,true))practiceFeedback(i,true,q.explicacao);
   }else{
     if(registerAttempt(i,true))feedback(i,true,q.explicacao);
   }
 }
}

function initPracticeMultiRuntime(card){
 if(!card)return;
 card.querySelectorAll('[data-multi-pos]').forEach(slot=>{
   if(!slot.dataset.used)slot.dataset.used='';
   const input=slot.querySelector('[data-multi-input]');
   const btn=slot.querySelector('[data-multi-submit]');
   const pos=Number(slot.dataset.multiPos);
   if(input&&!input.dataset.bound){
     input.dataset.bound='1';
     input.addEventListener('keydown',e=>{
       if(e.key==='Enter'){
         e.preventDefault();
         const qi=Number(card.id.replace(/^pq/,''));
         submitMultiSlotAnswer(qi,pos,true);
       }
     });
   }
   if(btn&&!btn.dataset.bound){
     btn.dataset.bound='1';
     btn.addEventListener('click',()=>{
       const qi=Number(card.id.replace(/^pq/,''));
       submitMultiSlotAnswer(qi,pos,true);
     });
   }
 });
}


function normalFillFieldsComplete(card,q){
 const inputs=[...card.querySelectorAll('[data-pos]')];
 if(!inputs.length)return true;

 return inputs.every(inp=>{
   if(inp.dataset.validated!=='1')return false;
   const pos=Number(inp.dataset.pos);
   const field=q.campos_resposta?.[pos];
   const accepted=(field?.modo==='single' ? field.respostas : q.respostas?.[pos]) || [];
   return accepted.map(normAnswer).includes(normAnswer(inp.dataset.originalValue ?? inp.value));
 });
}

function setFieldsComplete(card,q){
 const slots=[...card.querySelectorAll('[data-set-pos]')];
 if(!slots.length)return true;

 return slots.every(slot=>{
   const pos=Number(slot.dataset.setPos);
   const total=getSetFieldValues(q,pos).length;
   const used=(slot.dataset.used||'').split(',').filter(Boolean).length;
   return total>0 && used===total;
 });
}

function maybeFinishFillQuestion(i,isPractice=false){
 const card=document.getElementById((isPractice?'pq':'q')+i);
 const q=questions[i];
 if(!card||!q||card.dataset.done==='1')return;

 if(normalFillFieldsComplete(card,q) && setFieldsComplete(card,q)){
   lockFillQuestion(card);

   if(isPractice){
     if(registerPracticeAttempt(i,true))practiceFeedback(i,true,q.explicacao);
   }else{
     if(registerAttempt(i,true))feedback(i,true,q.explicacao);
   }
 }
}


function revealMissingLegacyMultiAnswers(slot,values,usedIndexes){
 if(!slot || slot.dataset.missingRevealed==='1')return;

 const used=new Set((usedIndexes||[]).map(Number));
 const host=slot.querySelector('[data-multi-accepted]');
 if(!host)return;

 values.forEach((value,idx)=>{
   if(used.has(idx))return;
   const chip=document.createElement('span');
   chip.className='multi-train-chip multi-train-missing';
   chip.textContent=value;
   host.appendChild(chip);
 });

 slot.dataset.missingRevealed='1';
}

function revealAllRemainingFillAnswers(card,q){
 if(!card||!q)return;

 // Campos normais ainda não confirmados: mostram a primeira resposta correta a vermelho.
 card.querySelectorAll('input[data-pos]').forEach(inp=>{
   if(inp.dataset.validated==='1')return;

   const pos=Number(inp.dataset.pos);
   const field=q.campos_resposta?.[pos];
   const accepted=(field?.modo==='single' ? field.respostas : q.respostas?.[pos]) || [];
   const correctValue=accepted[0]||'';

   inp.dataset.revealedAfterFail='1';
   inp.value=correctValue;
   inp.disabled=true;
   inp.classList.remove('fill-result-correct');
   inp.classList.add('fill-result-wrong');
   inp.title=`Resposta correta: ${correctValue}`;

   const verify=card.querySelector(`[data-verify-pos="${pos}"]`);
   if(verify)verify.disabled=true;
 });

 // Conjuntos sem ordem: acrescenta a vermelho todas as respostas ainda em falta.
 card.querySelectorAll('[data-set-pos]').forEach(slot=>{
   const pos=Number(slot.dataset.setPos);
   const values=getSetFieldValues(q,pos);
   const used=(slot.dataset.used||'').split(',').filter(Boolean).map(Number);
   revealMissingSetAnswers(slot,values,used);
 });

 // Compatibilidade com campos múltiplos antigos.
 card.querySelectorAll('[data-multi-pos]').forEach(slot=>{
   const pos=Number(slot.dataset.multiPos);
   const values=getMultiSlotValues(q,pos);
   const used=(slot.dataset.used||'').split(',').filter(Boolean).map(Number);
   revealMissingLegacyMultiAnswers(slot,values,used);
 });
}

function validateSingleFillField(i,input,isPractice=false){
 const card=document.getElementById((isPractice?'pq':'q')+i);
 const q=questions[i];
 if(!card||!q||!input||card.dataset.done==='1'||input.dataset.validated==='1')return;

 const value=input.value.trim();
 if(!value)return;

 const pos=Number(input.dataset.pos);
 const field=q.campos_resposta?.[pos];
 const respostas=
   field?.modo==='single'
     ? (field.respostas||[])
     : (q.respostas?.[pos]||[]);

 const hit=respostas.map(normAnswer).includes(normAnswer(value));

 input.dataset.validated='1';
 input.dataset.originalValue=value;
 input.disabled=true;

 const verifyButton=card.querySelector(`[data-verify-pos="${pos}"]`);
 if(verifyButton)verifyButton.disabled=true;

 input.classList.remove('fill-result-correct','fill-result-wrong');

 if(hit){
   input.classList.add('fill-result-correct');
   input.title='Resposta correta';
   maybeFinishFillQuestion(i,isPractice);

   return;
 }

 const correctValue=respostas[0]||'';
 input.classList.add('fill-result-wrong');
 input.value=correctValue;
 input.title=value
   ? `A sua resposta: ${value} | Correta: ${correctValue}`
   : `Resposta correta: ${correctValue}`;

 revealAllRemainingFillAnswers(card,q);
 lockFillQuestion(card);

 if(isPractice){
   if(registerPracticeAttempt(i,false))practiceFeedback(i,false,q.explicacao);
 }else{
   if(registerAttempt(i,false))feedback(i,false,q.explicacao);
 }
}

function bindImmediateFillValidation(card,i,isPractice=false){
 if(!card)return;

 // A validação dos campos normais é exclusivamente manual.
 // Mudar de campo, clicar fora ou carregar Enter não corrige a resposta.
 card.querySelectorAll('[data-verify-pos]').forEach(button=>{
   if(button.dataset.manualValidationBound==='1')return;
   button.dataset.manualValidationBound='1';

   button.addEventListener('click',()=>{
     const pos=Number(button.dataset.verifyPos);
     const input=card.querySelector(`input[data-pos="${pos}"]`);
     if(!input || input.disabled)return;

     validateSingleFillField(i,input,isPractice);

     if(input.dataset.validated==='1'){
       button.disabled=true;
     }
   });
 });
}
function checkFill(i){
 const q=questions[i];
 const card=document.getElementById('q'+i);
 if(!card||card.dataset.done==='1')return;

 const pending=[...card.querySelectorAll('input[data-pos]')]
   .filter(inp=>inp.dataset.validated!=='1');

 for(const input of pending){
   if(!input.value.trim())continue;
   validateSingleFillField(i,input,false);
   if(card.dataset.done==='1')return;
 }

 maybeFinishFillQuestion(i,false);
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
 const ok=normAnswer(inp.value)===normAnswer(q.palavra_correta);
 inp.style.background=ok?'#ecfdf3':'#fef3f2';
 inp.disabled=true;
 if(registerAttempt(i,ok)) feedback(i,ok,q.explicacao);
}

function answerSummary(q){
 if(q.tipo==='fill'){
   const fields=Array.isArray(q.campos_resposta)?q.campos_resposta:[];

   if(fields.length){
     return fields.map((field,i)=>{
       const values=Array.isArray(field?.respostas)
         ? field.respostas.filter(Boolean)
         : [];

       if(field?.modo==='set'){
         return `Campo ${i+1} — conjunto sem ordem: ${values.join(' • ')}`;
       }

       return `Campo ${i+1} — resposta única: ${values.join(' / ')}`;
     }).filter(Boolean).join('   |   ');
   }

   // Compatibilidade com perguntas antigas.
   return (q.respostas||[])
     .map((a,i)=>`Campo ${i+1} — resposta única: ${Array.isArray(a)?a.filter(Boolean).join(' / '):''}`)
     .filter(x=>!x.endsWith(': '))
     .join('   |   ');
 }

 if(q.tipo==='choice')return q.opcoes?.[q.resposta_correta]||'';

 return q.frase_correta
   ? 'A frase está correta'
   : `Não. Alterar “${q.palavra_errada}” para “${q.palavra_correta}”`;
}

function bankCategorySuggestions(){
 const seen=new Map();
 questions.forEach(q=>{
   const value=String(q.categoria||'Sem categoria').trim()||'Sem categoria';
   const key=norm(value);
   if(!seen.has(key))seen.set(key,value);
 });
 return [...seen.values()].sort((a,b)=>a.localeCompare(b,'pt',{sensitivity:'base'}));
}

function bankCategoryDatalistHTML(){
 return bankCategorySuggestions()
   .map(c=>`<option value="${esc(c)}"></option>`)
   .join('');
}

function startInlineCategoryEdit(id){
 if(!IS_ADMIN)return;
 const card=document.querySelector(`[data-question-id="${CSS.escape(String(id))}"]`);
 if(!card)return;

 const input=card.querySelector('[data-inline-category-input]');
 const editBtn=card.querySelector('[data-inline-category-edit]');
 const actions=card.querySelector('[data-inline-category-actions]');
 if(!input)return;

 input.dataset.originalValue=input.value;
 input.readOnly=false;
 input.classList.add('is-editing');
 editBtn?.classList.add('hidden');
 actions?.classList.remove('hidden');

 requestAnimationFrame(()=>{
   input.focus();
   input.select();
 });
}

function cancelInlineCategoryEdit(id){
 const card=document.querySelector(`[data-question-id="${CSS.escape(String(id))}"]`);
 if(!card)return;

 const input=card.querySelector('[data-inline-category-input]');
 const editBtn=card.querySelector('[data-inline-category-edit]');
 const actions=card.querySelector('[data-inline-category-actions]');

 if(input){
   input.value=input.dataset.originalValue||input.value;
   input.readOnly=true;
   input.classList.remove('is-editing');
 }
 editBtn?.classList.remove('hidden');
 actions?.classList.add('hidden');
}

async function saveInlineCategoryEdit(id){
 if(!IS_ADMIN)return;

 const card=document.querySelector(`[data-question-id="${CSS.escape(String(id))}"]`);
 const input=card?.querySelector('[data-inline-category-input]');
 if(!input)return;

 const q=questions.find(x=>String(x.id)===String(id));
 if(!q)return;

 const newCategory=input.value.trim()||'Sem categoria';
 const oldCategory=q.categoria||'Sem categoria';

 if(newCategory===oldCategory){
   cancelInlineCategoryEdit(id);
   return;
 }

 const viewportOffset=card.getBoundingClientRect().top;
 q.categoria=newCategory;

 try{
   await persistQuestions();
   renderBank();

   requestAnimationFrame(()=>{
     const updated=document.querySelector(`[data-question-id="${CSS.escape(String(id))}"]`);
     if(updated){
       const newTop=updated.getBoundingClientRect().top;
       window.scrollTo({top:window.scrollY+(newTop-viewportOffset),behavior:'auto'});
       updated.classList.add('question-edit-highlight');
       setTimeout(()=>updated.classList.remove('question-edit-highlight'),1800);
     }
   });
 }catch(e){
   q.categoria=oldCategory;
   input.value=oldCategory;
   saveMsg?.(e.message||'Não foi possível guardar a categoria.',false);
 }
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

 let bankDatalist=document.getElementById('bankCategorySuggestions');
 if(!bankDatalist){
   bankDatalist=document.createElement('datalist');
   bankDatalist.id='bankCategorySuggestions';
   document.body.appendChild(bankDatalist);
 }
 bankDatalist.innerHTML=bankCategoryDatalistHTML();
 document.getElementById('bankList').innerHTML=A.map(q=>`
 <div class="item bank-question-item" id="bank-question-${esc(q.id)}" data-question-id="${esc(q.id)}">
   <div class="head">
     <div class="bank-category-block">
       <div class="bank-category-inline">
         <input
           class="bank-category-input"
           data-inline-category-input
           list="bankCategorySuggestions"
           value="${esc(q.categoria||'Sem categoria')}"
           readonly
           aria-label="Categoria da pergunta">
         ${IS_ADMIN?`
           <button type="button"
                   class="secondary bank-category-edit"
                   data-inline-category-edit
                   onclick="startInlineCategoryEdit('${q.id}')">✎ Editar categoria</button>
           <span class="bank-category-actions hidden" data-inline-category-actions>
             <button type="button"
                     class="primary"
                     onclick="saveInlineCategoryEdit('${q.id}')">Guardar</button>
             <button type="button"
                     class="secondary"
                     onclick="cancelInlineCategoryEdit('${q.id}')">Cancelar</button>
           </span>`:''}
       </div>
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

 document.getElementById('normalPromptBlock').classList.add('hidden');
 document.getElementById('fillFields').classList.remove('hidden');

 const help=document.getElementById('fillEditorHelp');
 if(help){
   help.innerHTML=isFill
     ? 'Escreva normalmente. <strong>[[]]</strong> cria um campo de resposta. Use <strong>****texto****</strong> para negrito e <strong>---</strong> para uma linha horizontal.'
     : 'Escreva normalmente. Pode misturar texto e imagens livremente. Use <strong>****texto****</strong> para negrito e <strong>---</strong> para uma linha horizontal.';
 }

 document.getElementById('choiceFields').classList.toggle('hidden',t!=='choice');
 document.getElementById('correctFields').classList.toggle('hidden',t!=='correct');
 if(t==='choice')renderChoiceEditor();
 updatePromptPreview();
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

function createUnorderedAnswerRow(answerData=[]){
 const answers=normalizeAnswerList(answerData);
 const row=document.createElement('div');
 row.className='unordered-answer-row';

 const number=document.createElement('span');
 number.className='unordered-answer-number';

 const body=document.createElement('div');
 body.className='unordered-answer-body';

 const mainLine=document.createElement('div');
 mainLine.className='unordered-answer-mainline';

 const input=document.createElement('input');
 input.type='text';
 input.className='unordered-main-input';
 input.placeholder='Resposta correta';
 input.value=answers[0]||'';

 const addAlt=document.createElement('button');
 addAlt.type='button';
 addAlt.className='secondary unordered-add-alt';
 addAlt.textContent='+ alternativa';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='danger unordered-remove-answer';
 remove.textContent='Remover';

 mainLine.appendChild(input);
 mainLine.appendChild(addAlt);
 mainLine.appendChild(remove);

 const altList=document.createElement('div');
 altList.className='unordered-alt-list';
 answers.slice(1).forEach(v=>{
   altList.appendChild(createUnorderedAltInput(v));
 });

 body.appendChild(mainLine);
 body.appendChild(altList);

 row.appendChild(number);
 row.appendChild(body);

 refreshUnorderedNumbers();
 return row;
}

function createUnorderedAltInput(value=''){
 const chip=document.createElement('span');
 chip.className='unordered-alt-chip';

 const input=document.createElement('input');
 input.type='text';
 input.className='unordered-alt-input';
 input.placeholder='alternativa aceite';
 input.value=value||'';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='unordered-remove-alt';
 remove.textContent='×';
 remove.title='Remover alternativa';

 chip.appendChild(input);
 chip.appendChild(remove);
 return chip;
}

function refreshUnorderedNumbers(){
 requestAnimationFrame(()=>{
   document.querySelectorAll('#unorderedAnswerList .unordered-answer-row').forEach((row,i)=>{
     const n=row.querySelector('.unordered-answer-number');
     if(n)n.textContent=String(i+1)+'.';
   });
 });
}

function addUnorderedAnswer(answerData=[]){
 const host=document.getElementById('unorderedAnswerList');
 if(!host)return;
 host.appendChild(createUnorderedAnswerRow(answerData));
 refreshUnorderedNumbers();
 const rows=host.querySelectorAll('.unordered-main-input');
 rows[rows.length-1]?.focus();
}

function renderUnorderedAnswerEditor(values=[]){
 const host=document.getElementById('unorderedAnswerList');
 if(!host)return;
 host.innerHTML='';
 const data=Array.isArray(values)&&values.length?values:[[]];
 data.forEach(v=>host.appendChild(createUnorderedAnswerRow(v)));
 refreshUnorderedNumbers();
}

function collectUnorderedAnswers(){
 return [...document.querySelectorAll('#unorderedAnswerList .unordered-answer-row')].map(row=>{
   const primary=row.querySelector('.unordered-main-input')?.value.trim()||'';
   const alternatives=[...row.querySelectorAll('.unordered-alt-input')]
     .map(x=>x.value.trim())
     .filter(Boolean);
   return [primary,...alternatives].filter(Boolean);
 }).filter(arr=>arr.length);
}

function unorderedAnswerSummary(q){
 return (q.respostas_lista||[]).map(a=>(a||[])[0]||'').filter(Boolean).join(' • ');
}

function unorderedCorrectListHTML(q){
 return (q.respostas_lista||[])
   .map((a,i)=>`<div><strong>${i+1}.</strong> ${esc((a||[])[0]||'')}</div>`)
   .join('');
}

function unorderedMatchedIndex(q,value,usedIndexes=[]){
 const needle=normAnswer(value);
 if(!needle)return -1;
 const used=new Set(usedIndexes.map(Number));
 for(let i=0;i<(q.respostas_lista||[]).length;i++){
   if(used.has(i))continue;
   const accepted=(q.respostas_lista[i]||[]).map(normAnswer);
   if(accepted.includes(needle))return i;
 }
 return -1;
}



function createMultiAnswerEditorSlot(values=[]){
 const answers=Array.isArray(values)?values:[];
 const wrap=document.createElement('span');
 wrap.className='multi-answer-slot';
 wrap.contentEditable='false';
 wrap.setAttribute('data-multi-slot','1');

 const head=document.createElement('span');
 head.className='multi-answer-head';

 const badge=document.createElement('span');
 badge.className='multi-answer-label';
 badge.textContent='RESPOSTAS';

 const count=document.createElement('span');
 count.className='multi-answer-count-editor';
 count.textContent=`${answers.length}`;

 const add=document.createElement('button');
 add.type='button';
 add.className='multi-answer-add';
 add.setAttribute('data-add-multi-answer','1');
 add.textContent='+';
 add.title='Adicionar resposta obrigatória';

 head.appendChild(badge);
 head.appendChild(count);
 head.appendChild(add);

 const list=document.createElement('span');
 list.className='multi-answer-editor-list';
 list.setAttribute('data-multi-list','1');

 answers.forEach(v=>list.appendChild(createMultiAnswerEditorItem(v)));

 wrap.appendChild(head);
 wrap.appendChild(list);
 refreshMultiAnswerEditorCount(wrap);
 return wrap;
}

function createMultiAnswerEditorItem(value=''){
 const row=document.createElement('span');
 row.className='multi-answer-editor-item';

 const input=document.createElement('input');
 input.type='text';
 input.className='multi-answer-editor-input';
 input.setAttribute('data-multi-answer','1');
 input.placeholder='resposta obrigatória';
 input.value=value||'';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='multi-answer-remove';
 remove.setAttribute('data-remove-multi-answer','1');
 remove.textContent='×';
 remove.title='Remover resposta';

 row.appendChild(input);
 row.appendChild(remove);
 return row;
}

function refreshMultiAnswerEditorCount(slot){
 if(!slot)return;
 const count=slot.querySelector('.multi-answer-count-editor');
 if(count)count.textContent=String(slot.querySelectorAll('[data-multi-answer]').length);
}

function addMultiAnswerEditorItem(slot,value=''){
 if(!slot)return;
 pushFillUndoState?.();
 const list=slot.querySelector('[data-multi-list]');
 if(!list)return;
 const item=createMultiAnswerEditorItem(value);
 list.appendChild(item);
 refreshMultiAnswerEditorCount(slot);
 requestAnimationFrame(()=>item.querySelector('input')?.focus());
 updatePromptPreview?.();
}

function collectMultiAnswerSlot(slot){
 return [...slot.querySelectorAll('[data-multi-answer]')]
   .map(x=>x.value.trim())
   .filter(Boolean);
}

function multiSlotCorrectHTML(values){
 return (values||[]).map((v,i)=>`<div><strong>${i+1}.</strong> ${esc(v||'')}</div>`).join('');
}

function normalizeAnswerList(answerData){
 if(Array.isArray(answerData)){
   return answerData.map(x=>String(x??'').trim()).filter(Boolean);
 }
 return String(answerData??'')
   .split('|')
   .map(x=>x.trim())
   .filter(Boolean);
}

function createAlternativeAnswerInput(value=''){
 const chip=document.createElement('span');
 chip.className='fill-alt-chip';

 const input=document.createElement('input');
 input.type='text';
 input.className='fill-alt-input';
 input.setAttribute('data-alt-answer','1');
 input.placeholder='alternativa';
 input.value=value||'';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='fill-alt-remove';
 remove.setAttribute('data-remove-alt','1');
 remove.title='Remover resposta alternativa';
 remove.textContent='×';

 chip.appendChild(input);
 chip.appendChild(remove);
 return chip;
}

function createFillModeSelect(mode='single'){
 const select=document.createElement('select');
 select.className='fill-mode-select';
 select.setAttribute('data-fill-mode','1');
 select.title='Tipo de campo';
 select.innerHTML=`
   <option value="single">Resposta única</option>
   <option value="set">Conjunto sem ordem</option>`;
 select.value=mode==='set'?'set':'single';
 return select;
}

function createSetAnswerInput(value=''){
 const row=document.createElement('span');
 row.className='fill-set-item';

 const input=document.createElement('input');
 input.type='text';
 input.className='fill-set-input';
 input.setAttribute('data-set-answer','1');
 input.placeholder='resposta obrigatória';
 input.value=value||'';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='fill-set-remove';
 remove.setAttribute('data-remove-set-answer','1');
 remove.title='Remover resposta';
 remove.textContent='×';

 row.appendChild(input);
 row.appendChild(remove);
 return row;
}

function createFillSlot(answerData='', mode='single', setValues=[]){
 const answers=normalizeAnswerList(answerData);
 const primary=answers[0]||'';
 const alternatives=answers.slice(1);

 const span=document.createElement('span');
 span.className='fill-slot';
 span.contentEditable='false';
 span.setAttribute('data-slot-mode',mode==='set'?'set':'single');

 const main=document.createElement('span');
 main.className='fill-slot-main';

 const badge=document.createElement('span');
 badge.className='fill-slot-label';
 badge.textContent='RESPOSTA';

 const input=document.createElement('input');
 input.type='text';
 input.className='fill-answer-editor';
 input.setAttribute('data-fill-answer','1');
 input.placeholder='escreva a resposta';
 input.value=primary;

 const add=document.createElement('button');
 add.type='button';
 add.className='fill-alt-add';
 add.setAttribute('data-add-alt','1');
 add.title='Adicionar resposta alternativa';
 add.textContent='+';

 const modeSelect=createFillModeSelect(mode);

 main.appendChild(badge);
 main.appendChild(input);
 main.appendChild(add);
 main.appendChild(modeSelect);

 const alts=document.createElement('span');
 alts.className='fill-alt-list';
 alts.setAttribute('data-alt-list','1');
 alternatives.forEach(v=>alts.appendChild(createAlternativeAnswerInput(v)));

 const setBox=document.createElement('span');
 setBox.className='fill-set-box';
 setBox.setAttribute('data-set-box','1');

 const setHead=document.createElement('span');
 setHead.className='fill-set-head';

 const setLabel=document.createElement('span');
 setLabel.className='fill-set-label';
 setLabel.textContent='Respostas obrigatórias';

 const setAdd=document.createElement('button');
 setAdd.type='button';
 setAdd.className='fill-set-add';
 setAdd.setAttribute('data-add-set-answer','1');
 setAdd.textContent='+';
 setAdd.title='Adicionar resposta obrigatória';

 setHead.appendChild(setLabel);
 setHead.appendChild(setAdd);

 const setList=document.createElement('span');
 setList.className='fill-set-list';
 setList.setAttribute('data-set-list','1');

 (Array.isArray(setValues)?setValues:[]).forEach(v=>setList.appendChild(createSetAnswerInput(v)));

 setBox.appendChild(setHead);
 setBox.appendChild(setList);

 span.appendChild(main);
 span.appendChild(alts);
 span.appendChild(setBox);

 applyFillSlotMode(span,mode==='set'?'set':'single');

 return span;
}

function applyFillSlotMode(slot,mode){
 if(!slot)return;
 mode=mode==='set'?'set':'single';
 slot.setAttribute('data-slot-mode',mode);

 const mainInput=slot.querySelector('[data-fill-answer]');
 const altAdd=slot.querySelector('[data-add-alt]');
 const altList=slot.querySelector('[data-alt-list]');
 const setBox=slot.querySelector('[data-set-box]');
 const select=slot.querySelector('[data-fill-mode]');

 if(select)select.value=mode;

 if(mode==='set'){
   if(mainInput)mainInput.classList.add('hidden');
   if(altAdd)altAdd.classList.add('hidden');
   if(altList)altList.classList.add('hidden');
   if(setBox)setBox.classList.remove('hidden');

   const setList=slot.querySelector('[data-set-list]');
   if(setList && !setList.querySelector('[data-set-answer]')){
     // Ao converter uma resposta já preenchida, aproveita o valor como primeira resposta.
     const seed=(mainInput?.value||'').trim();
     if(seed)setList.appendChild(createSetAnswerInput(seed));
     else setList.appendChild(createSetAnswerInput(''));
   }
 }else{
   if(mainInput)mainInput.classList.remove('hidden');
   if(altAdd)altAdd.classList.remove('hidden');
   if(altList)altList.classList.remove('hidden');
   if(setBox)setBox.classList.add('hidden');
 }
 updatePromptPreview?.();
}

function addSetAnswer(slot,value=''){
 if(!slot)return;
 pushFillUndoState?.();
 const list=slot.querySelector('[data-set-list]');
 if(!list)return;
 const row=createSetAnswerInput(value);
 list.appendChild(row);
 requestAnimationFrame(()=>row.querySelector('input')?.focus());
 updatePromptPreview?.();
}

function collectSetAnswers(slot){
 return [...slot.querySelectorAll('[data-set-answer]')]
   .map(x=>x.value.trim())
   .filter(Boolean);
}

function addFillAlternative(slot,value=''){
 if(!slot)return null;
 pushFillUndoState?.();
 let list=slot.querySelector('[data-alt-list]');
 if(!list){
   list=document.createElement('span');
   list.className='fill-alt-list';
   list.setAttribute('data-alt-list','1');
   slot.appendChild(list);
 }
 const chip=createAlternativeAnswerInput(value);
 list.appendChild(chip);
 const input=chip.querySelector('[data-alt-answer]');
 requestAnimationFrame(()=>input?.focus());
 updatePromptPreview?.();
 return input;
}

function removeFillAlternative(button){
 const chip=button?.closest('.fill-alt-chip');
 if(!chip)return;
 pushFillUndoState?.();
 chip.remove();
 updatePromptPreview?.();
}

function createEditorImageNode(src=''){
 const wrap=document.createElement('span');
 wrap.className='editor-inline-image';
 wrap.contentEditable='false';
 wrap.setAttribute('data-editor-image','1');
 wrap.setAttribute('data-src',src);

 const img=document.createElement('img');
 img.src=src;
 img.alt='Imagem do enunciado';

 const remove=document.createElement('button');
 remove.type='button';
 remove.className='editor-image-remove';
 remove.setAttribute('data-remove-editor-image','1');
 remove.title='Remover imagem';
 remove.textContent='×';

 wrap.appendChild(img);
 wrap.appendChild(remove);
 return wrap;
}

function fileToDataUrl(file){
 return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));
   reader.readAsDataURL(file);
 });
}

async function uploadInlineImageFile(file){
 if(!IS_ADMIN)throw new Error('As imagens só podem ser inseridas no modo administrador local.');
 if(!file || !String(file.type||'').startsWith('image/'))throw new Error('Selecione um ficheiro de imagem.');

 const dataUrl=await fileToDataUrl(file);
 const filename=file.name||`imagem-${Date.now()}.png`;
 const r=await fetch('/api/upload-image',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({filename,dataUrl})
 });
 if(!r.ok)throw new Error('Não foi possível guardar a imagem.');
 const data=await r.json();
 return data.path;
}

let lastFillEditorRange=null;
let selectedEditorTable=null;
let copiedEditorTableData=null;

function rememberFillEditorRange(){
 const editor=fillVisualEditorEl();
 const sel=window.getSelection();
 if(!editor||!sel||!sel.rangeCount)return;
 const range=sel.getRangeAt(0);
 if(editor.contains(range.commonAncestorContainer)){
   lastFillEditorRange=range.cloneRange();
 }
}

function restoreFillEditorRange(){
 const editor=fillVisualEditorEl();
 if(!editor)return;
 editor.focus();
 const sel=window.getSelection();
 sel.removeAllRanges();
 if(lastFillEditorRange){
   try{
     sel.addRange(lastFillEditorRange);
     return;
   }catch{}
 }
 const range=document.createRange();
 range.selectNodeContents(editor);
 range.collapse(false);
 sel.addRange(range);
}

function insertEditorNodeAtCaret(node){
 const editor=fillVisualEditorEl();
 if(!editor||!node)return;

 restoreFillEditorRange();
 const sel=window.getSelection();
 if(!sel||!sel.rangeCount){
   editor.appendChild(node);
   setCaretAfter(node);
   return;
 }

 const range=sel.getRangeAt(0);
 range.deleteContents();
 range.insertNode(node);

 // Espaço editável a seguir à imagem para facilitar continuar a escrever.
 const spacer=document.createTextNode(' ');
 node.parentNode.insertBefore(spacer,node.nextSibling);

 range.setStartAfter(spacer);
 range.collapse(true);
 sel.removeAllRanges();
 sel.addRange(range);
 rememberFillEditorRange();
 updatePromptPreview();
}

async function insertInlineImageFiles(files){
 const list=[...(files||[])].filter(f=>String(f.type||'').startsWith('image/'));
 if(!list.length)return;

 for(const file of list){
   try{
     pushFillUndoState?.();
     const path=await uploadInlineImageFile(file);
     insertEditorNodeAtCaret(createEditorImageNode(path));
   }catch(e){
     saveMsg(e.message,false);
   }
 }
}

function removeEditorImage(button){
 const node=button?.closest('[data-editor-image]');
 if(!node)return;
 pushFillUndoState?.();
 node.remove();
 normalizeFillEditorAfterDelete?.();
 updatePromptPreview?.();
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

 const tokenRe=/(\{\{tbl64:([A-Za-z0-9+/=]+)\}\}|\{\{img:([^}]+)\}\}|\[\[\[(\d+)\]\]\]|\[\[(\d+)\]\]|\*\*\*\*(.+?)\*\*\*\*)/g;

 let last=0,m;
 while((m=tokenRe.exec(text))){
   if(m.index>last){
     container.appendChild(document.createTextNode(text.slice(last,m.index)));
   }

   if(m[2]!==undefined){
     const data=decodeTableData(m[2]);
     if(data)container.appendChild(createEditorTableNode(data));
   }else if(m[3]!==undefined){
     container.appendChild(createEditorImageNode(String(m[3]||'').trim()));
   }else if(m[4]!==undefined){
     const pos=Number(m[4])-1;
     const legacy=(window.__loadingMultiAnswers||[])[pos]||[];
     container.appendChild(createFillSlot([], 'set', legacy));
   }else if(m[5]!==undefined){
     const pos=Number(m[5])-1;
     const fields=window.__loadingAnswerFields||[];
     const field=fields[pos];

     if(field?.modo==='set'){
       container.appendChild(
         createFillSlot([], 'set', Array.isArray(field.respostas)?field.respostas:[])
       );
     }else{
       const accepted=
         (field?.modo==='single' && Array.isArray(field.respostas))
           ? field.respostas
           : (Array.isArray(respostas?.[pos]) ? respostas[pos] : []);

       container.appendChild(createFillSlot(accepted, 'single', []));
     }
   }else{
     container.appendChild(createBoldNode(m[6]||''));
   }

   last=tokenRe.lastIndex;
 }

 if(last<text.length){
   container.appendChild(document.createTextNode(text.slice(last)));
 }
}
function loadFillVisualEditor(pergunta='',respostas=[],respostasMultiplas=[],camposResposta=[]){
 window.__loadingMultiAnswers=Array.isArray(respostasMultiplas)?respostasMultiplas:[];
 window.__loadingAnswerFields=Array.isArray(camposResposta)?camposResposta:[];
 window.__loadingTableAnswers=Array.isArray(respostas)?respostas:[];

 setTimeout(installFillEditorDeletionUX,0);

 const editor=document.getElementById('fillVisualEditor');
 editor.innerHTML='';

 const lines=String(pergunta||'').split(/\r?\n/);

 lines.forEach((line,idx)=>{
   if(line.trim()==='---'){
     editor.appendChild(createSeparatorNode());
   }else{
     appendVisualInline(editor,line,Array.isArray(respostas)?respostas:[]);
   }

   if(idx<lines.length-1){
     editor.appendChild(document.createElement('br'));
   }
 });

 updatePromptPreview();
 resetFillUndoHistory();

 window.__loadingMultiAnswers=[];
 window.__loadingAnswerFields=[];
 window.__loadingTableAnswers=[];
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
     if(p&&(p.closest('.fill-slot')||p.closest('[data-editor-bold]')||p.closest('[data-editor-separator]')||p.closest('.editor-table-controls'))){
       return NodeFilter.FILTER_REJECT;
     }
     const v=node.nodeValue||'';
     return ((document.getElementById('type')?.value==='fill'&&v.includes('[[]]'))||/\*\*\*\*.+?\*\*\*\*/.test(v)||v.trim()==='---')
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
     if(m[1]==='[[]]' && document.getElementById('type')?.value==='fill'){
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
 return node.matches?.('hr, .fill-slot, .fill-answer-slot, [data-fill-slot], [data-editor-image], [contenteditable="false"]');
}

function normalizeFillEditorAfterDelete(){
 const editor=fillVisualEditorEl();
 if(!editor)return;

 // Remove contentores vazios deixados pelo browser.
 [...editor.querySelectorAll('div,p')].forEach(el=>{
   if(el.closest('[data-editor-table]'))return;
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

 const nodes=[...editor.querySelectorAll('hr, .fill-slot, .fill-answer-slot, [data-fill-slot], [data-editor-image], [contenteditable="false"]')];
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


function adjacentTableForCaret(range,key){
 let container=range.startContainer;
 let offset=range.startOffset;

 function previousMeaningful(node){
   let n=node;
   while(n && n.nodeType===3 && !n.textContent.trim()) n=n.previousSibling;
   return n;
 }

 function nextMeaningful(node){
   let n=node;
   while(n && n.nodeType===3 && !n.textContent.trim()) n=n.nextSibling;
   return n;
 }

 if(container.nodeType===3){
   const text=container.textContent||'';

   if(key==='Backspace' && offset===0){
     const n=previousMeaningful(container.previousSibling);
     return n?.nodeType===1 && n.matches?.('[data-editor-table]') ? n : null;
   }

   if(key==='Delete' && offset===text.length){
     const n=nextMeaningful(container.nextSibling);
     return n?.nodeType===1 && n.matches?.('[data-editor-table]') ? n : null;
   }

   return null;
 }

 if(container.nodeType===1){
   if(key==='Backspace' && offset>0){
     const n=previousMeaningful(container.childNodes[offset-1]);
     return n?.nodeType===1 && n.matches?.('[data-editor-table]') ? n : null;
   }

   if(key==='Delete' && offset<container.childNodes.length){
     const n=nextMeaningful(container.childNodes[offset]);
     return n?.nodeType===1 && n.matches?.('[data-editor-table]') ? n : null;
   }
 }

 return null;
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

   if((e.ctrlKey||e.metaKey) && key==='c' && selectedEditorTable){
     e.preventDefault();
     copySelectedEditorTableToClipboard();
     return;
   }

   if((e.ctrlKey||e.metaKey) && key==='v' && copiedEditorTableData && !e.target.matches?.('[data-fill-answer],[data-alt-answer],[data-set-answer],[data-multi-answer]')){
     // O evento paste tratará o clipboard real; este atalho serve como fallback.
     rememberFillEditorRange();
   }
   const inAnswerField=e.target.matches&&e.target.matches('[data-fill-answer],[data-alt-answer],[data-set-answer],[data-multi-answer]');

   if(inAnswerField){
     return;
   }

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
     const range=sel.getRangeAt(0);

     const protectedTables=[...editor.querySelectorAll('[data-editor-table]')]
       .filter(tbl=>{
         try{return range.intersectsNode(tbl)}catch{return false}
       });

     if(protectedTables.length){
       e.preventDefault();
       protectedTables.forEach(tbl=>{
         tbl.classList.add('editor-table-protected-flash');
         setTimeout(()=>tbl.classList.remove('editor-table-protected-flash'),450);
       });
       return;
     }

     e.preventDefault();
     pushFillUndoState();

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

     // A tabela é estruturalmente protegida:
     // Backspace/Delete junto dela não a pode remover.
     const protectedTable=adjacentTableForCaret(range,e.key);
     if(protectedTable){
       e.preventDefault();
       protectedTable.classList.add('editor-table-protected-flash');
       setTimeout(()=>protectedTable.classList.remove('editor-table-protected-flash'),450);
       return;
     }

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
 const campos_resposta=[];
 const respostas_multiplas=[];

 let counter=0;
 let legacyMultiCounter=0;

 function walk(node){
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue;
   if(node.nodeType!==Node.ELEMENT_NODE)return '';

   const el=node;

   // Compatibilidade: converte campos triplos antigos para o modelo atual.
   if(el.hasAttribute?.('data-multi-slot')){
     legacyMultiCounter++;
     const values=collectMultiAnswerSlot(el);
     respostas_multiplas.push(values);
     return `[[[${legacyMultiCounter}]]]`;
   }

   if(el.classList?.contains('fill-slot')){
     counter++;

     const mode=el.getAttribute('data-slot-mode')==='set'?'set':'single';

     if(mode==='set'){
       const values=collectSetAnswers(el);
       respostas.push([]);
       campos_resposta.push({
         modo:'set',
         respostas:values
       });
     }else{
       const primary=el.querySelector('[data-fill-answer]')?.value.trim()||'';
       const alternatives=[...el.querySelectorAll('[data-alt-answer]')]
         .map(x=>x.value.trim())
         .filter(Boolean);

       const accepted=[primary,...alternatives].filter(Boolean);

       respostas.push(accepted);
       campos_resposta.push({
         modo:'single',
         respostas:accepted
       });
     }

     return `[[${counter}]]`;
   }

   if(el.hasAttribute?.('data-editor-table')){
     const data=collectEditorTableData(el,walk);
     const encoded=encodeTableData(data);
     return encoded?`{{tbl64:${encoded}}}`:'';
   }

   if(el.hasAttribute?.('data-editor-image')){
     const src=
       el.getAttribute('data-src')||
       el.querySelector('img')?.getAttribute('src')||
       '';

     return src?`{{img:${src}}}`:'';
   }

   if(el.hasAttribute?.('data-editor-bold')){
     return `****${el.textContent||''}****`;
   }

   if(el.hasAttribute?.('data-editor-separator')){
     return '\n---\n';
   }

   if(el.tagName==='BR')return '\n';

   let out='';
   el.childNodes.forEach(child=>{
     out+=walk(child);
   });

   if((el.tagName==='DIV'||el.tagName==='P')&&!out.endsWith('\n')){
     out+='\n';
   }

   return out;
 }

 let pergunta='';
 editor.childNodes.forEach(node=>{
   pergunta+=walk(node);
 });

 return {
   pergunta:pergunta
     .replace(/\n{3,}/g,'\n\n')
     .replace(/^\n+|\n+$/g,'')
     .trim(),
   respostas,
   campos_resposta,
   respostas_multiplas
 };
}
function moveCaretAfterSlot(input){
 const slot=input.closest('.fill-slot');
 if(slot)setCaretAfter(slot);
}

function currentRawPrompt(){
 return serializeFillEditor().pergunta;
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
     if(el.hasAttribute?.('data-multi-slot')){
       return '[[[]]]';
     }
     if(el.classList?.contains('fill-slot')){
       const primary=el.querySelector('[data-fill-answer]')?.value?.trim() ?? '';
       const alternatives=[...el.querySelectorAll('[data-alt-answer]')]
         .map(x=>x.value.trim())
         .filter(Boolean);
       return `[[${[primary,...alternatives].filter(Boolean).join('|')}]]`;
     }
     if(el.hasAttribute?.('data-editor-table')){
       const data=collectEditorTableData(el,walk);
       const encoded=encodeTableData(data);
       return encoded?`{{tbl64:${encoded}}}`:'';
     }
     if(el.hasAttribute?.('data-editor-image')){
       const src=el.getAttribute('data-src')||el.querySelector('img')?.getAttribute('src')||'';
       return src?`{{img:${src}}}`:'';
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
   const tokenRe=/(\{\{tbl64:([A-Za-z0-9+/=]+)\}\}|\{\{img:([^}]+)\}\}|\[\[([\s\S]*?)\]\]|\*\*\*\*([\s\S]+?)\*\*\*\*)/g;
   let last=0,m;
   while((m=tokenRe.exec(line))){
     if(m.index>last) frag.appendChild(document.createTextNode(line.slice(last,m.index)));

     if(m[2]!==undefined){
       const data=decodeTableData(m[2]);
       if(data)frag.appendChild(createEditorTableNode(data));
     }else if(m[3]!==undefined){
       frag.appendChild(createEditorImageNode(String(m[3]||'').trim()));
     }else if(m[4]!==undefined){
       if(document.getElementById('type')?.value==='fill') frag.appendChild(createFillSlot(m[4]));
       else frag.appendChild(document.createTextNode(`[[${m[4]}]]`));
     }else{
       frag.appendChild(createBoldNode(m[5]||''));
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
 fillEditor.addEventListener('click',e=>{
   const tableWrap=e.target.closest?.('[data-editor-table]');
   const removeTableBtn=e.target.closest?.('[data-remove-editor-table]');
   if(tableWrap && !removeTableBtn){
     selectEditorTable(tableWrap);
   }else if(!tableWrap){
     clearSelectedEditorTable();
   }

   const add=e.target.closest?.('[data-add-alt]');
   if(add){
     e.preventDefault();
     addFillAlternative(add.closest('.fill-slot'),'');
     return;
   }

   const addSet=e.target.closest?.('[data-add-set-answer]');
   if(addSet){
     e.preventDefault();
     addSetAnswer(addSet.closest('.fill-slot'),'');
     return;
   }

   const removeSet=e.target.closest?.('[data-remove-set-answer]');
   if(removeSet){
     e.preventDefault();
     pushFillUndoState?.();
     removeSet.closest('.fill-set-item')?.remove();
     updatePromptPreview?.();
     return;
   }
   const remove=e.target.closest?.('[data-remove-alt]');
   if(remove){
     e.preventDefault();
     removeFillAlternative(remove);
     return;
   }

   const addMulti=e.target.closest?.('[data-add-multi-answer]');
   if(addMulti){
     e.preventDefault();
     addMultiAnswerEditorItem(addMulti.closest('[data-multi-slot]'),'');
     return;
   }

   const removeMulti=e.target.closest?.('[data-remove-multi-answer]');
   if(removeMulti){
     e.preventDefault();
     pushFillUndoState?.();
     const slot=removeMulti.closest('[data-multi-slot]');
     removeMulti.closest('.multi-answer-editor-item')?.remove();
     refreshMultiAnswerEditorCount(slot);
     updatePromptPreview?.();
     return;
   }

   const removeTable=e.target.closest?.('[data-remove-editor-table]');
   if(removeTable){
     e.preventDefault();
     pushFillUndoState?.();
     const table=removeTable.closest('[data-editor-table]');
     if(table===selectedEditorTable)clearSelectedEditorTable();
     table?.remove();
     updatePromptPreview?.();
     return;
   }

   const removeImage=e.target.closest?.('[data-remove-editor-image]');
   if(removeImage){
     e.preventDefault();
     removeEditorImage(removeImage);
   }
 });

 fillEditor.addEventListener('change',e=>{
   if(e.target.matches?.('[data-fill-mode]')){
     pushFillUndoState?.();
     applyFillSlotMode(e.target.closest('.fill-slot'),e.target.value);
   }
 });

 fillEditor.addEventListener('copy',e=>{
   if(selectedEditorTable){
     e.preventDefault();
     copySelectedEditorTableToClipboard();
     return;
   }

   if(e.target.matches&&e.target.matches('[data-fill-answer],[data-alt-answer],[data-set-answer],[data-multi-answer]')) return;

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

 fillEditor.addEventListener('paste',async e=>{
   if(e.target.matches&&e.target.matches('[data-fill-answer],[data-alt-answer],[data-set-answer],[data-multi-answer]')){
     setTimeout(updatePromptPreview,0);
     return;
   }

   const imageFiles=[...(e.clipboardData?.files||[])].filter(f=>String(f.type||'').startsWith('image/'));
   if(imageFiles.length){
     e.preventDefault();
     rememberFillEditorRange();
     await insertInlineImageFiles(imageFiles);
     return;
   }

   const text=e.clipboardData?.getData('text/plain');

   // Se a tabela foi copiada dentro deste editor, Ctrl+V duplica a tabela
   // no ponto atual, mesmo que o browser não preserve HTML estruturado.
   if(copiedEditorTableData && (!text || !text.trim())){
     e.preventDefault();
     pasteCopiedEditorTable();
     return;
   }

   if(text===undefined || text===null) return;
   e.preventDefault();
   const fragment=clipboardTextToVisualFragment(text);
   insertVisualFragmentAtSelection(fragment);
   updatePromptPreview();
 });

 fillEditor.addEventListener('input',e=>{
   if(e.target.matches&&e.target.matches('[data-fill-answer],[data-alt-answer],[data-set-answer],[data-multi-answer]')){
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
   if(e.target.matches&&e.target.matches('[data-alt-answer]')&&e.key==='Enter'){
     e.preventDefault();
     addFillAlternative(e.target.closest('.fill-slot'),'');
     return;
   }
   if(e.key==='Enter')setTimeout(processFillEditorTokens,0);
 });
 fillEditor.addEventListener('keyup',e=>{
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey)processFillEditorTokens();
 });
}


const openTableBuilderBtn=document.getElementById('openTableBuilderBtn');
const tableBuilder=document.getElementById('tableBuilder');
const confirmInsertTableBtn=document.getElementById('confirmInsertTableBtn');
const cancelInsertTableBtn=document.getElementById('cancelInsertTableBtn');

function closeTableBuilder(){
 tableBuilder?.classList.add('hidden');
}

openTableBuilderBtn?.addEventListener('mousedown',()=>{
 rememberFillEditorRange();
});

openTableBuilderBtn?.addEventListener('click',()=>{
 rememberFillEditorRange();
 tableBuilder?.classList.remove('hidden');
 document.getElementById('tableColumnCount')?.focus();
});

cancelInsertTableBtn?.addEventListener('click',closeTableBuilder);

confirmInsertTableBtn?.addEventListener('click',()=>{
 const cols=Math.max(1,Math.min(10,Number(document.getElementById('tableColumnCount')?.value)||1));
 const rows=Math.max(1,Math.min(20,Number(document.getElementById('tableRowCount')?.value)||1));
 const rowLabels=!!document.getElementById('tableHasRowLabels')?.checked;

 const data={
   headers:Array.from({length:cols},(_,i)=>`Coluna ${i+1}`),
   rowLabels,
   rows:Array.from({length:rows},(_,r)=>({
     name:rowLabels?`Linha ${r+1}`:'',
     cells:Array.from({length:cols},()=> '')
   }))
 };

 pushFillUndoState?.();
 insertTableAtCaret(data);
 closeTableBuilder();
 updatePromptPreview();
});

const inlineImageBtn=document.getElementById('insertInlineImageBtn');
const inlineImageFile=document.getElementById('inlineImageFile');

if(fillEditor){
 ['mouseup','keyup','input','focus'].forEach(evt=>{
   fillEditor.addEventListener(evt,rememberFillEditorRange);
 });
}

if(inlineImageBtn&&inlineImageFile){
 inlineImageBtn.addEventListener('mousedown',()=>{
   rememberFillEditorRange();
 });
 inlineImageBtn.addEventListener('click',()=>{
   inlineImageFile.value='';
   inlineImageFile.click();
 });
 inlineImageFile.addEventListener('change',async e=>{
   await insertInlineImageFiles(e.target.files);
   e.target.value='';
 });
}

document.getElementById('imageFile').addEventListener('change',e=>{
 const f=e.target.files[0];
 if(!f)return;
 const r=new FileReader();
 r.onload=()=>{
   currentImage=r.result;
   document.getElementById('preview').innerHTML=`<img src="${currentImage}">`;
   updateGeneralImageRemoveButton();
 };
 r.readAsDataURL(f);
});

function updateGeneralImageRemoveButton(){
 const btn=document.getElementById('removeGeneralImageBtn');
 if(!btn)return;
 btn.classList.toggle('hidden',!currentImage);
}

function removeGeneralImage(){
 currentImage='';
 const input=document.getElementById('imageFile');
 const preview=document.getElementById('preview');
 if(input)input.value='';
 if(preview)preview.innerHTML='';
 updateGeneralImageRemoveButton();
}

document.getElementById('removeGeneralImageBtn')?.addEventListener('click',removeGeneralImage);


function saveMsg(msg,ok){const e=document.getElementById('saveMessage');e.className='feedback '+(ok?'ok':'bad');e.textContent=msg}
async function uploadImageIfNeeded(){if(!currentImage||!currentImage.startsWith('data:'))return currentImage;const file=document.getElementById('imageFile').files[0],filename=file?.name||'imagem.png';const r=await fetch('/api/upload-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,dataUrl:currentImage})});if(!r.ok)throw new Error('Não foi possível guardar a imagem.');return (await r.json()).path}
async function saveQuestion(){
 try{
  if(!IS_ADMIN)return;const tipo=document.getElementById('type').value;let pergunta='',fillData=null;
  fillData=serializeFillEditor();
  pergunta=fillData.pergunta.trim();
  if(!pergunta){saveMsg('Escreva o enunciado.',false);return}
  const id=document.getElementById('editId').value||('q-'+Date.now());
  const q={id,categoria:document.getElementById('category').value.trim()||'Sem categoria',tipo,pergunta,grupo:document.getElementById('questionArea')?.value||'teoria',explicacao:document.getElementById('explanation').value.trim(),imagem:await uploadImageIfNeeded()};
  if(tipo==='fill'){
    q.respostas=fillData.respostas;
    q.respostas_multiplas=fillData.respostas_multiplas||[];
    q.campos_resposta=fillData.campos_resposta||[];

    if(!q.campos_resposta.length){
      saveMsg('Crie pelo menos um campo [[]] no enunciado.',false);
      return;
    }

    const invalid=q.campos_resposta.findIndex(c=>{
      if(c.modo==='set')return !Array.isArray(c.respostas)||c.respostas.length<2;
      return !Array.isArray(c.respostas)||!c.respostas.length;
    });

    if(invalid>=0){
      const c=q.campos_resposta[invalid];
      saveMsg(
        c?.modo==='set'
          ? `O campo ${invalid+1} em modo Conjunto sem ordem precisa de pelo menos duas respostas obrigatórias.`
          : `Falta indicar a resposta correta do campo ${invalid+1}.`,
        false
      );
      return;
    }
  }
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
 document.getElementById('questionArea').value='teoria';document.getElementById('choiceCount').value='4';document.getElementById('statementCorrect').value='false';document.getElementById('imageFile').value='';document.getElementById('preview').innerHTML='';document.getElementById('fillVisualEditor').innerHTML='';resetFillUndoHistory();lastFillEditorRange=null;clearSelectedEditorTable();copiedEditorTableData=null;currentImage='';updateGeneralImageRemoveButton();renderChoiceEditor([],0);toggleFields();const msg=document.getElementById('saveMessage');if(msg)msg.className='feedback';updatePromptPreview();
 if(cancelTarget)returnToEditedQuestion(cancelTarget,false);else if(returnAfterCancel){questionEditContext=null;updateEditorSecondaryButton()}
}

function repairAnswerFieldMetadata(q){
 if(!q || q.tipo!=='fill')return q;

 const markerMatches=[...String(q.pergunta||'').matchAll(/\[\[(\d+)\]\]/g)];
 const highest=markerMatches.reduce((m,x)=>Math.max(m,Number(x[1])||0),0);

 if(!Array.isArray(q.campos_resposta))q.campos_resposta=[];

 for(let pos=0;pos<highest;pos++){
   if(!q.campos_resposta[pos]){
     q.campos_resposta[pos]={
       modo:'single',
       respostas:Array.isArray(q.respostas?.[pos])?q.respostas[pos]:[]
     };
   }
 }

 return q;
}

function editQuestion(id){
 const q=repairAnswerFieldMetadata(questions.find(x=>x.id===id));if(!q)return;captureQuestionEditContext(id);document.querySelector('[data-panel="editor"]').click();document.getElementById('editorTitle').textContent='Editar pergunta';document.getElementById('editId').value=q.id;document.getElementById('category').value=q.categoria||'';document.getElementById('type').value=q.tipo;
 document.getElementById('questionArea').value=q.grupo||'teoria';document.getElementById('explanation').value=q.explicacao||'';
 document.getElementById('prompt').value='';
 loadFillVisualEditor(q.pergunta||'',q.respostas||[],q.respostas_multiplas||[],q.campos_resposta||[]);
 if(q.tipo==='choice'){const count=Math.max(2,Math.min(8,(q.opcoes||[]).length||4));document.getElementById('choiceCount').value=String(count);renderChoiceEditor(q.opcoes||[],q.resposta_correta||0)}
 if(q.tipo==='correct'){document.getElementById('statementCorrect').value=String(!!q.frase_correta);document.getElementById('wrongWord').value=q.palavra_errada||'';document.getElementById('correctWord').value=q.palavra_correta||''}
 currentImage=q.imagem||'';document.getElementById('preview').innerHTML=q.imagem?`<img src="${q.imagem}">`:'';updateGeneralImageRemoveButton();toggleFields();updatePromptPreview();updateEditorSecondaryButton();window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteQuestion(id){
 if(!confirm('Apagar esta pergunta?'))return;
 questions=questions.filter(q=>q.id!==id);
 masteredQuestionIds.delete(String(id));
 saveTrainingProgress();
 await persistQuestions();
 await loadQuestions();
}




function renderCategoryGameQuiz(){
  const q=currentCategoryGameQuestion();
  if(!q){nextCategoryGameQuestion();return;}

  const i=questions.findIndex(x=>String(x.id)===String(q.id));
  let controls='';

  if(q.tipo==='fill'){
    controls=`<div class="actions"><button class="primary" onclick="categoryCheckFill(${i})">Corrigir resposta</button></div>`;
  }

  if(q.tipo==='choice'){
    categoryGame.choiceOrder=shuffledChoiceOrder(q);
    controls=categoryGame.choiceOrder.map((originalIndex,displayIndex)=>
      `<button class="choice" data-original-index="${originalIndex}" onclick="categoryCheckChoice(${i},${originalIndex},this)">${String.fromCharCode(65+displayIndex)}. ${esc(q.opcoes[originalIndex])}</button>`
    ).join('');
  }else{
    categoryGame.choiceOrder=[];
  }

  if(q.tipo==='correct'){
    controls=`<div id="cyn${i}" class="actions">
      <button class="secondary" onclick="categoryCorrectStep(${i},true,this)">Sim, está certa</button>
      <button class="secondary" onclick="categoryCorrectStep(${i},false,this)">Não, está errada</button>
    </div>
    <div id="cfix${i}" class="ans hidden">
      Altere <strong>${esc(q.palavra_errada||'')}</strong> para
      <input id="cfixInput${i}" class="blank" value="${esc(q.palavra_errada||'')}">
      <button class="primary" onclick="categoryFinishCorrection(${i})">Validar</button>
    </div>`;
  }

  const remaining=categoryGameBasePool().length-categoryGame.correct;

  document.getElementById('categoryGameQuiz').innerHTML=`
    <div class="card" id="cq${i}" data-done="0">
      <div class="toolbar" style="margin-bottom:10px">
        <span class="tag">${esc(q.categoria)}</span>
        <span class="pill">Faltam dominar: ${remaining}</span>
      </div>
      ${q.imagem?`<div class="img"><img src="${esc(q.imagem)}" alt="Imagem da questão"></div>`:''}
      <div class="q">${promptHTML(q)}</div>
      ${controls}
      <div id="cfb${i}" class="feedback"></div>
      <div id="cnext${i}" class="actions hidden" style="margin-top:12px">
        <button class="primary" onclick="nextCategoryGameQuestion()">Próxima pergunta →</button>
      </div>
    </div>`;

  setTimeout(()=>{
    const card=document.getElementById('cq'+i);
    categoryBindSetFields(card,i);
    categoryBindLegacyMulti(card,i);
    categoryBindNormalFill(card,i);
  },0);
}

function categoryFillComplete(card,q){
  const normal=[...card.querySelectorAll('input[data-pos]')].every(inp=>{
    if(inp.dataset.validated!=='1')return false;
    const pos=Number(inp.dataset.pos);
    const field=q.campos_resposta?.[pos];
    const accepted=(field?.modo==='single'?field.respostas:q.respostas?.[pos])||[];
    return accepted.map(normAnswer).includes(normAnswer(inp.dataset.originalValue??inp.value));
  });

  const sets=[...card.querySelectorAll('[data-set-pos]')].every(slot=>{
    const pos=Number(slot.dataset.setPos);
    const total=getSetFieldValues(q,pos).length;
    const used=(slot.dataset.used||'').split(',').filter(Boolean).length;
    return total>0&&used===total;
  });

  const legacy=[...card.querySelectorAll('[data-multi-pos]')].every(slot=>{
    const pos=Number(slot.dataset.multiPos);
    const total=getMultiSlotValues(q,pos).length;
    const used=(slot.dataset.used||'').split(',').filter(Boolean).length;
    return total>0&&used===total;
  });

  return normal&&sets&&legacy;
}

function categoryMaybeFinishFill(i){
  const card=document.getElementById('cq'+i);
  const q=questions[i];
  if(!card||!q||card.dataset.done==='1')return;
  if(categoryFillComplete(card,q)){
    lockFillQuestion(card);
    if(categoryGameRegisterAttempt(i,true))categoryGameFeedback(i,true,q.explicacao);
  }
}

function categoryValidateSingleFill(i,input){
  const card=document.getElementById('cq'+i);
  const q=questions[i];
  if(!card||!q||!input||card.dataset.done==='1'||input.dataset.validated==='1')return;

  const value=input.value.trim();
  if(!value)return;

  const pos=Number(input.dataset.pos);
  const field=q.campos_resposta?.[pos];
  const respostas=field?.modo==='single'?(field.respostas||[]):(q.respostas?.[pos]||[]);
  const hit=respostas.map(normAnswer).includes(normAnswer(value));

  input.dataset.validated='1';
  input.dataset.originalValue=value;
  input.disabled=true;

  const verify=card.querySelector(`[data-verify-pos="${pos}"]`);
  if(verify)verify.disabled=true;

  input.classList.remove('fill-result-correct','fill-result-wrong');

  if(hit){
    input.classList.add('fill-result-correct');
    input.title='Resposta correta';
    categoryMaybeFinishFill(i);
    return;
  }

  const correctValue=respostas[0]||'';
  input.classList.add('fill-result-wrong');
  input.value=correctValue;
  input.title=value?`A sua resposta: ${value} | Correta: ${correctValue}`:`Resposta correta: ${correctValue}`;

  revealAllRemainingFillAnswers(card,q);
  lockFillQuestion(card);
  if(categoryGameRegisterAttempt(i,false))categoryGameFeedback(i,false,q.explicacao);
}

function categoryBindNormalFill(card,i){
  if(!card)return;
  card.querySelectorAll('[data-verify-pos]').forEach(button=>{
    if(button.dataset.categoryBound==='1')return;
    button.dataset.categoryBound='1';
    button.addEventListener('click',()=>{
      const pos=Number(button.dataset.verifyPos);
      const input=card.querySelector(`input[data-pos="${pos}"]`);
      categoryValidateSingleFill(i,input);
    });
  });
}

function categoryCheckFill(i){
  const card=document.getElementById('cq'+i);
  if(!card||card.dataset.done==='1')return;

  const pending=[...card.querySelectorAll('input[data-pos]')].filter(inp=>inp.dataset.validated!=='1');
  for(const input of pending){
    if(!input.value.trim())continue;
    categoryValidateSingleFill(i,input);
    if(card.dataset.done==='1')return;
  }
  categoryMaybeFinishFill(i);
}

function categorySubmitSetAnswer(i,pos){
  const card=document.getElementById('cq'+i);
  const q=questions[i];
  if(!card||!q||card.dataset.done==='1')return;

  const slot=card.querySelector(`[data-set-pos="${pos}"]`);
  const input=slot?.querySelector('[data-set-input]');
  if(!slot||!input||input.disabled)return;

  const value=input.value.trim();
  if(!value)return;

  const values=getSetFieldValues(q,pos);
  const used=(slot.dataset.used||'').split(',').filter(Boolean).map(Number);

  const duplicate=values.findIndex((v,idx)=>used.includes(idx)&&normAnswer(v)===normAnswer(value));
  if(duplicate>=0){
    input.value='';
    input.placeholder='Resposta já indicada';
    return;
  }

  const matched=values.findIndex((v,idx)=>!used.includes(idx)&&normAnswer(v)===normAnswer(value));

  if(matched<0){
    input.classList.add('multi-train-wrong');
    revealAllRemainingFillAnswers(card,q);
    lockFillQuestion(card);
    if(categoryGameRegisterAttempt(i,false))categoryGameFeedback(i,false,q.explicacao);
    return;
  }

  used.push(matched);
  slot.dataset.used=used.join(',');

  const accepted=slot.querySelector('[data-set-accepted]');
  if(accepted){
    const chip=document.createElement('span');
    chip.className='multi-train-chip';
    chip.textContent=values[matched];
    accepted.appendChild(chip);
  }

  const counter=slot.querySelector('[data-set-counter]');
  if(counter)counter.textContent=`${used.length}/${values.length}`;
  input.value='';

  if(used.length===values.length){
    input.disabled=true;
    slot.querySelector('[data-set-submit]')?.setAttribute('disabled','disabled');
  }

  categoryMaybeFinishFill(i);
}

function categoryBindSetFields(card,i){
  if(!card)return;
  card.querySelectorAll('[data-set-pos]').forEach(slot=>{
    const pos=Number(slot.dataset.setPos);
    const input=slot.querySelector('[data-set-input]');
    const btn=slot.querySelector('[data-set-submit]');

    if(input&&!input.dataset.categoryBound){
      input.dataset.categoryBound='1';
      input.addEventListener('keydown',e=>{
        if(e.key==='Enter'){
          e.preventDefault();
          categorySubmitSetAnswer(i,pos);
        }
      });
    }

    if(btn&&!btn.dataset.categoryBound){
      btn.dataset.categoryBound='1';
      btn.addEventListener('click',()=>categorySubmitSetAnswer(i,pos));
    }
  });
}

function categorySubmitLegacyMulti(i,pos){
  const card=document.getElementById('cq'+i);
  const q=questions[i];
  if(!card||!q||card.dataset.done==='1')return;

  const slot=card.querySelector(`[data-multi-pos="${pos}"]`);
  const input=slot?.querySelector('[data-multi-input]');
  if(!slot||!input||input.disabled)return;

  const value=input.value.trim();
  if(!value)return;

  const values=getMultiSlotValues(q,pos);
  const used=(slot.dataset.used||'').split(',').filter(Boolean).map(Number);
  const duplicate=values.findIndex((v,idx)=>used.includes(idx)&&normAnswer(v)===normAnswer(value));

  if(duplicate>=0){
    input.value='';
    input.placeholder='Resposta já indicada';
    return;
  }

  const matched=values.findIndex((v,idx)=>!used.includes(idx)&&normAnswer(v)===normAnswer(value));
  if(matched<0){
    input.classList.add('multi-train-wrong');
    revealAllRemainingFillAnswers(card,q);
    lockFillQuestion(card);
    if(categoryGameRegisterAttempt(i,false))categoryGameFeedback(i,false,q.explicacao);
    return;
  }

  used.push(matched);
  slot.dataset.used=used.join(',');

  const accepted=slot.querySelector('[data-multi-accepted]');
  if(accepted){
    const chip=document.createElement('span');
    chip.className='multi-train-chip';
    chip.textContent=values[matched];
    accepted.appendChild(chip);
  }

  const counter=slot.querySelector('[data-multi-counter]');
  if(counter)counter.textContent=`${used.length}/${values.length}`;
  input.value='';

  if(used.length===values.length){
    input.disabled=true;
    slot.querySelector('[data-multi-submit]')?.setAttribute('disabled','disabled');
  }

  categoryMaybeFinishFill(i);
}

function categoryBindLegacyMulti(card,i){
  if(!card)return;
  card.querySelectorAll('[data-multi-pos]').forEach(slot=>{
    const pos=Number(slot.dataset.multiPos);
    const input=slot.querySelector('[data-multi-input]');
    const btn=slot.querySelector('[data-multi-submit]');

    if(input&&!input.dataset.categoryBound){
      input.dataset.categoryBound='1';
      input.addEventListener('keydown',e=>{
        if(e.key==='Enter'){
          e.preventDefault();
          categorySubmitLegacyMulti(i,pos);
        }
      });
    }

    if(btn&&!btn.dataset.categoryBound){
      btn.dataset.categoryBound='1';
      btn.addEventListener('click',()=>categorySubmitLegacyMulti(i,pos));
    }
  });
}

function categoryCheckChoice(i,originalIndex,btn){
  const q=questions[i];
  const ok=originalIndex===q.resposta_correta;
  if(!categoryGameRegisterAttempt(i,ok))return;

  document.querySelectorAll(`#cq${i} .choice`).forEach(b=>{
    b.disabled=true;
    const optionIndex=Number(b.dataset.originalIndex);
    if(optionIndex===q.resposta_correta)b.style.background='#ecfdf3';
    if(optionIndex===originalIndex&&!ok)b.style.background='#fef3f2';
  });

  categoryGameFeedback(i,ok,q.explicacao);
}

function categoryCorrectStep(i,yes,btn){
  const q=questions[i];
  const card=document.getElementById('cq'+i);
  if(!card||card.dataset.done==='1')return;

  if(q.frase_correta){
    if(categoryGameRegisterAttempt(i,yes)){
      document.querySelectorAll(`#cyn${i} button`).forEach(b=>b.disabled=true);
      categoryGameFeedback(i,yes,q.explicacao);
    }
    return;
  }

  if(yes){
    if(categoryGameRegisterAttempt(i,false)){
      document.querySelectorAll(`#cyn${i} button`).forEach(b=>b.disabled=true);
      categoryGameFeedback(i,false,q.explicacao);
    }
  }else{
    document.getElementById('cfix'+i)?.classList.remove('hidden');
    document.querySelectorAll(`#cyn${i} button`).forEach(b=>b.disabled=true);
    btn.style.background='#ecfdf3';
  }
}

function categoryFinishCorrection(i){
  const q=questions[i];
  const inp=document.getElementById('cfixInput'+i);
  const card=document.getElementById('cq'+i);
  if(!card||!inp||card.dataset.done==='1')return;

  const ok=normAnswer(inp.value)===normAnswer(q.palavra_correta);
  inp.style.background=ok?'#ecfdf3':'#fef3f2';
  inp.disabled=true;

  if(categoryGameRegisterAttempt(i,ok)){
    categoryGameFeedback(i,ok,q.explicacao);
  }
}


function renderPracticeIdle(){
 const host=document.getElementById('practiceQuiz');
 if(!host)return;
 const pool=filteredPracticeQuestions();
 if(!pool.length){
   const hasFilter=selectedCategoriesForMode('practice').length>0;
   host.innerHTML=hasFilter
     ? '<div class="card small">Não existem perguntas de prática nas categorias selecionadas. Remova um filtro ou escolha outra categoria.</div>'
     : '<div class="card small">Ainda não existem perguntas marcadas como <strong>Prática de condução</strong>. Na Base de perguntas, use o botão <strong>Mover para prática</strong>.</div>';
   return;
 }
 host.innerHTML='<div class="card small">Abra esta aba para iniciar o treino prático, ou carregue em <strong>Novo treino prático</strong>.</div>';
}

function ensurePracticeTraining(){
 const pool=filteredPracticeQuestions();
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
 const pool=filteredPracticeQuestions();
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
 const pool=filteredPracticeQuestions();
 document.getElementById('practiceQuiz').innerHTML=`
   <div class="card">
     <span class="tag">Treino prático concluído</span>
     <div class="q" style="margin-top:12px"><strong>🎉 Acertou todas as ${pool.length} perguntas de prática.</strong></div>
     <div class="small" style="margin-top:8px">Foram necessárias ${practiceAnswered} tentativa${practiceAnswered===1?'':'s'}.</div>
     <div class="actions" style="margin-top:14px"><button class="primary" onclick="restartPracticeTraining()">Começar novo treino prático</button></div>
   </div>`;
}

function restartPracticeTraining(){
 const pool=filteredPracticeQuestions();
 const practiceIds=pool.map(q=>q.id);

 resetProgressForQuestionIds(practiceIds);
 persistedTrainingStats.practiceAnswered=0;
 saveTrainingProgress();

 practiceCorrect=0;
 practiceAnswered=0;
 practicePendingIds=[...practiceIds];
 currentPracticeId=null;
 previousPracticeId=null;
 currentPracticeChoiceOrder=[];

 document.getElementById('practiceTotal').textContent=pool.length;
 document.getElementById('practiceCorrect').textContent='0';
 document.getElementById('practiceAnswered').textContent='0';
 nextPracticeQuestion(true);
}

function currentPracticeQuestion(){
 return filteredPracticeQuestions().find(q=>q.id===currentPracticeId)||null;
}

function renderPracticeQuiz(){
 const q=currentPracticeQuestion();
 if(!q){nextPracticeQuestion();return}
 const i=questions.findIndex(x=>x.id===q.id);
 let controls='';

 if(q.tipo==='fill'){
   controls=`<div class="actions"><button class="primary" onclick="practiceCheckFill(${i})">Corrigir resposta</button></div>`;
 }
 if(q.tipo==='unordered'){
   const total=(q.respostas_lista||[]).length;
   controls=`<div class="unordered-train-box" id="punorderedBox${i}" data-used="">
     <div class="unordered-counter"><strong id="punorderedCount${i}">0/${total}</strong><span> respostas encontradas</span></div>
     <div class="unordered-train-entry">
       <input id="punorderedInput${i}" class="unordered-train-input" placeholder="Escreva uma resposta e prima Enter" autocomplete="off">
       <button class="primary" onclick="practiceSubmitUnorderedAnswer(${i})">Confirmar</button>
     </div>
     <div id="punorderedAccepted${i}" class="unordered-accepted-list"></div>
   </div>`;
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

 const remaining=filteredPracticeQuestions().length-practiceCorrect;
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
 setTimeout(()=>{
   const c=document.getElementById('pq'+i);
   initPracticeMultiRuntime(c);
   bindSetFieldRuntime(c,true);
   bindImmediateFillValidation(c,i,true);
 },0);
}

function registerPracticeAttempt(i,ok){
 const c=document.getElementById('pq'+i);
 if(!c||c.dataset.done==='1')return false;

 c.dataset.done='1';
 practiceAnswered++;
 persistedTrainingStats.practiceAnswered=practiceAnswered;

 if(ok){
   if(!isQuestionMastered(currentPracticeId)){
     setQuestionMastered(currentPracticeId,true);
     practiceCorrect++;
   }
 }else{
   // Falhou: continua por dominar e regressa à fila.
   setQuestionMastered(currentPracticeId,false);
   if(currentPracticeId&&!practicePendingIds.includes(currentPracticeId)){
     practicePendingIds.push(currentPracticeId);
   }
 }

 saveTrainingProgress();

 previousPracticeId=currentPracticeId;

 document.getElementById('practiceCorrect').textContent=practiceCorrect;
 document.getElementById('practiceAnswered').textContent=practiceAnswered;

 const next=document.getElementById('pnext'+i);
 if(next){
   next.classList.remove('hidden');
   const btn=next.querySelector('button');
   if(btn)btn.disabled=false;
 }
 return true;
}

function practiceCorrectAnswerHTML(q){
 if(q.tipo==='fill'){
   const fields=(q.campos_resposta||[]).length
     ? q.campos_resposta.map((c,i)=>{
         if(c.modo==='set'){
           return `<div style="margin-top:6px"><strong>Campo ${i+1} — conjunto:</strong>${multiSlotCorrectHTML(c.respostas||[])}</div>`;
         }
         return `<div><strong>Campo ${i+1}:</strong> ${esc((c.respostas||[])[0]||'')}</div>`;
       }).join('')
     : (q.respostas||[]).map((a,i)=>`<div><strong>Campo ${i+1}:</strong> ${esc((a||[])[0]||'')}</div>`).join('');
   return fields;
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


function practiceSubmitUnorderedAnswer(i){
 const q=questions[i];
 const card=document.getElementById('pq'+i);
 const box=document.getElementById('punorderedBox'+i);
 const input=document.getElementById('punorderedInput'+i);
 if(!q||!card||!box||!input||card.dataset.done==='1')return;

 const value=input.value.trim();
 if(!value)return;

 const used=(box.dataset.used||'')
   .split(',')
   .filter(Boolean)
   .map(Number);

 const duplicateIndex=(q.respostas_lista||[]).findIndex((accepted,idx)=>
   used.includes(idx) && (accepted||[]).map(normAnswer).includes(normAnswer(value))
 );
 if(duplicateIndex>=0){
   input.value='';
   input.placeholder='Essa resposta já foi indicada';
   input.classList.add('unordered-duplicate');
   setTimeout(()=>input.classList.remove('unordered-duplicate'),700);
   return;
 }

 const matched=unorderedMatchedIndex(q,value,used);

 if(matched<0){
   input.classList.add('unordered-wrong');
   input.disabled=true;
   box.querySelectorAll('button').forEach(b=>b.disabled=true);
   if(registerPracticeAttempt(i,false))practiceFeedback(i,false,q.explicacao);
   return;
 }

 used.push(matched);
 box.dataset.used=used.join(',');

 const acceptedHost=document.getElementById('punorderedAccepted'+i);
 if(acceptedHost){
   const chip=document.createElement('span');
   chip.className='unordered-accepted-chip';
   chip.textContent=(q.respostas_lista[matched]||[])[0]||value;
   acceptedHost.appendChild(chip);
 }

 const total=(q.respostas_lista||[]).length;
 document.getElementById('punorderedCount'+i).textContent=`${used.length}/${total}`;
 input.value='';
 input.placeholder='Escreva outra resposta';

 if(used.length>=total){
   input.disabled=true;
   box.querySelectorAll('button').forEach(b=>b.disabled=true);
   if(registerPracticeAttempt(i,true))practiceFeedback(i,true,q.explicacao);
 }
}

function practiceCheckFill(i){
 const q=questions[i];
 const card=document.getElementById('pq'+i);
 if(!card||card.dataset.done==='1')return;

 const pending=[...card.querySelectorAll('input[data-pos]')]
   .filter(inp=>inp.dataset.validated!=='1');

 for(const input of pending){
   if(!input.value.trim())continue;
   validateSingleFillField(i,input,true);
   if(card.dataset.done==='1')return;
 }

 maybeFinishFillQuestion(i,true);
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
 const ok=normAnswer(inp.value)===normAnswer(q.palavra_correta);
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

setTimeout(updateGeneralImageRemoveButton,0);

document.addEventListener('keydown',e=>{
 const input=e.target.closest?.('[data-inline-category-input]');
 if(!input || input.readOnly)return;

 const card=input.closest('[data-question-id]');
 const id=card?.getAttribute('data-question-id');
 if(!id)return;

 if(e.key==='Enter'){
   e.preventDefault();
   saveInlineCategoryEdit(id);
 }else if(e.key==='Escape'){
   e.preventDefault();
   cancelInlineCategoryEdit(id);
 }
});
