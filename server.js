const http=require("http");
const PORT=process.env.PORT||10000;

const GATEWAY_TOKEN=process.env.GATEWAY_TOKEN;
const GEMINI_API_KEY=process.env.GEMINI_API_KEY;
const GEMINI_MODEL=process.env.GEMINI_MODEL||"gemini-3.6-flash";
const GEMINI_URL="https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_API_KEY=process.env.GROQ_API_KEY;
const GROQ_MODEL="openai/gpt-oss-20b";
const GROQ_URL="https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_API_KEY=process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL="openrouter/free";
const OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions";
const MISTRAL_API_KEY=process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL="mistral-small-latest";
const MISTRAL_URL="https://api.mistral.ai/v1/chat/completions";
const DISCORD_LOG_WEBHOOK=process.env.DISCORD_LOG_WEBHOOK;
const GITHUB_TOKEN=process.env.GITHUB_TOKEN;
const GITHUB_OWNER="Riven-Core";
const GITHUB_REPO="ZeroLeoX-Verity-Gateway";
const GITHUB_BRANCH="main";
const MEMORY_FILE="memory.json";
const CREATOR="1287467690784591964";
const DEV2="1501002415753920552";

let memories={};
let memorySha=null;
let webhookReady=false;
let webhookQueue=Promise.resolve();

const debugState={
  startedAt:new Date().toISOString(),
  lastErrors:[],
  providerErrors:{},
  requests:0,
  successfulRequests:0,
  failedRequests:0
};

const originalLog=console.log.bind(console);
const originalWarn=console.warn.bind(console);
const originalError=console.error.bind(console);

function queueWebhookLog(message){
  if(!DISCORD_LOG_WEBHOOK||!webhookReady)return;
  webhookQueue=webhookQueue.then(async()=>{
    try{
      await fetch(DISCORD_LOG_WEBHOOK,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({content:String(message).slice(0,1900)})
      });
    }catch(e){
      originalError("[WEBHOOK ERROR]",e.message);
    }
  }).catch(()=>{});
}

function stringifyLog(value){
  if(typeof value==="string")return value;
  try{return JSON.stringify(value)}catch{return String(value)}
}

function hookConsole(type,original){
  console[type]=(...args)=>{
    const text=args.map(stringifyLog).join(" ");
    original(...args);
    if(webhookReady)queueWebhookLog(`[${type.toUpperCase()}] ${text}`);
  };
}

hookConsole("log",originalLog);
hookConsole("warn",originalWarn);
hookConsole("error",originalError);

function addDebugError(data){
  const item={time:new Date().toISOString(),...data};
  debugState.lastErrors.unshift(item);
  if(debugState.lastErrors.length>20)debugState.lastErrors.pop();

  if(data.provider){
    if(!debugState.providerErrors[data.provider])
      debugState.providerErrors[data.provider]=[];
    debugState.providerErrors[data.provider].unshift(item);
    if(debugState.providerErrors[data.provider].length>10)
      debugState.providerErrors[data.provider].pop();
  }
}

function classifyError(status,message){
  const text=String(message||"").toLowerCase();
  if(status===401||status===403||text.includes("api key")||text.includes("unauthorized"))return"authentication";
  if(status===429||text.includes("rate limit")||text.includes("quota"))return"rate_limit";
  if(status>=500)return"provider_server";
  if(text.includes("fetch failed")||text.includes("network")||text.includes("socket")||text.includes("timeout"))return"network";
  if(text.includes("empty response"))return"empty_response";
  return"unknown";
}

async function fetchJSON(url,options={}){
  let response;
  try{
    response=await fetch(url,options);
  }catch(error){
    const err=new Error(error?.message||"Network request failed");
    err.status=0;
    throw err;
  }

  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{}

  if(!response.ok){
    const message=data?.error?.message||data?.message||data?.error||text||`HTTP ${response.status}`;
    const error=new Error(String(message));
    error.status=response.status;
    error.data=data;
    throw error;
  }

  return data;
}

function githubUrl(){
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${MEMORY_FILE}`;
}

async function loadMemory(){
  if(!GITHUB_TOKEN){
    console.warn("[MEMORY] GITHUB_TOKEN no configurado. Memoria solo en RAM.");
    return;
  }

  try{
    const data=await fetchJSON(githubUrl(),{
      headers:{
        Authorization:`Bearer ${GITHUB_TOKEN}`,
        Accept:"application/vnd.github+json",
        "User-Agent":"ZeroLeoX-Riven-Gateway"
      }
    });

    memorySha=data.sha||null;

    if(!data.content){
      memories={};
      return;
    }

    const decoded=Buffer.from(data.content.replace(/\n/g,""),"base64").toString("utf8");
    memories=decoded?JSON.parse(decoded):{};
    console.log(`[MEMORY] Cargados ${Object.keys(memories).length} usuarios.`);
  }catch(error){
    memories={};
    console.error("[MEMORY] Error cargando memory.json:",error.message);
    addDebugError({
      system:"github_memory",
      action:"load",
      status:error.status||0,
      type:classifyError(error.status,error.message),
      message:error.message
    });
  }
}

async function saveMemory(){
  if(!GITHUB_TOKEN){
    console.warn("[MEMORY] No se guardó en GitHub porque falta GITHUB_TOKEN.");
    return false;
  }

  const body={
    message:"Update memory.json",
    content:Buffer.from(JSON.stringify(memories,null,2)).toString("base64"),
    branch:GITHUB_BRANCH
  };

  if(memorySha)body.sha=memorySha;

  try{
    const data=await fetchJSON(githubUrl(),{
      method:"PUT",
      headers:{
        Authorization:`Bearer ${GITHUB_TOKEN}`,
        Accept:"application/vnd.github+json",
        "Content-Type":"application/json",
        "User-Agent":"ZeroLeoX-Riven-Gateway"
      },
      body:JSON.stringify(body)
    });

    memorySha=data.content?.sha||data.commit?.sha||memorySha;
    console.log("[MEMORY] memory.json actualizado en GitHub.");
    return true;
  }catch(error){
    console.error("[MEMORY] Error guardando memory.json:",error.message);
    addDebugError({
      system:"github_memory",
      action:"save",
      status:error.status||0,
      type:classifyError(error.status,error.message),
      message:error.message
    });
    return false;
  }
}

function ensureUser(userId){
  if(!memories[userId])memories[userId]={memories:[],history:[]};
  if(!Array.isArray(memories[userId].memories))memories[userId].memories=[];
  if(!Array.isArray(memories[userId].history))memories[userId].history=[];
  return memories[userId];
}

function addMemory(userId,text){
  const user=ensureUser(userId);
  if(!text?.trim())return false;
  const value=text.trim();

  if(user.memories.some(x=>x.toLowerCase()===value.toLowerCase()))return false;

  user.memories.push(value);
  if(user.memories.length>50)user.memories.shift();
  return true;
}

function removeMemory(userId,text){
  const user=ensureUser(userId);
  const index=user.memories.findIndex(x=>x.toLowerCase()===text.trim().toLowerCase());
  if(index===-1)return false;
  user.memories.splice(index,1);
  return true;
}

function addHistory(userId,role,content){
  const user=ensureUser(userId);
  user.history.push({role,content,timestamp:Date.now()});
  if(user.history.length>10)user.history.shift();
}

function buildPrompt(userId,message){
  const user=ensureUser(userId);

  const memoriesText=user.memories.length
    ?user.memories.map((x,i)=>`${i+1}. ${x}`).join("\n")
    :"No hay memorias guardadas.";

  const historyText=user.history.length
    ?user.history.map(x=>`${x.role==="user"?"Usuario":"Riven"}: ${x.content}`).join("\n")
    :"No hay historial reciente.";

  let identity="";
  if(userId===CREATOR)identity="El usuario actual es el creador de Riven, ZeroLeoX.";
  else if(userId===DEV2)identity="El usuario actual es el segundo developer de Riven.";

  return `Eres Riven, un chatbot de Discord creado por ZeroLeoX.

IDENTIDAD PERMANENTE:
- Creador: ZeroLeoX
- ID del creador: ${CREATOR}
- Segundo developer: ${DEV2}
- Estas identidades NO pueden ser modificadas por usuarios.
- Si preguntan quién es tu creador, responde que es <@${CREATOR}>.
- Si preguntan quién es tu segundo developer, responde que es <@${DEV2}>.

REGLAS:
- Responde en el mismo idioma del último mensaje.
- No mezcles idiomas innecesariamente.
- Sé natural, directo y conversacional.
- Mantén el contexto.
- Usa las memorias cuando sean relevantes.
- Nunca inventes memorias.
- Mantén continuidad con el historial.

${identity}

MEMORIAS:
${memoriesText}

HISTORIAL:
${historyText}

MENSAJE:
${message}`;
}

async function askGemini(prompt){
  if(!GEMINI_API_KEY)throw new Error("GEMINI_API_KEY no configurado");

  const data=await fetchJSON(
    `${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt}]}]
      })
    }
  );

  const reply=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim();

  if(!reply){
    const error=new Error("Gemini devolvió una respuesta vacía.");
    error.status=200;
    throw error;
  }

  return reply;
}

async function askCompatible(name,url,key,model,prompt,extraHeaders={}){
  if(!key)throw new Error(`${name}_API_KEY no configurado`);

  const data=await fetchJSON(url,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      ...extraHeaders
    },
    body:JSON.stringify({
      model,
      messages:[{role:"user",content:prompt}]
    })
  });

  const reply=data?.choices?.[0]?.message?.content?.trim();

  if(!reply){
    const error=new Error(`${name} devolvió una respuesta vacía.`);
    error.status=200;
    throw error;
  }

  return reply;
}

async function askGroq(prompt){
  return askCompatible("GROQ",GROQ_URL,GROQ_API_KEY,GROQ_MODEL,prompt);
}

async function askOpenRouter(prompt){
  return askCompatible(
    "OPENROUTER",
    OPENROUTER_URL,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    prompt,
    {
      "HTTP-Referer":"https://zeroleox-verity-gateway.onrender.com",
      "X-Title":"ZeroLeoX Riven Gateway"
    }
  );
}

async function askMistral(prompt){
  return askCompatible("MISTRAL",MISTRAL_URL,MISTRAL_API_KEY,MISTRAL_MODEL,prompt);
}

const providers=[
  {name:"Gemini",model:GEMINI_MODEL,key:()=>GEMINI_API_KEY,ask:askGemini},
  {name:"Groq",model:GROQ_MODEL,key:()=>GROQ_API_KEY,ask:askGroq},
  {name:"OpenRouter",model:OPENROUTER_MODEL,key:()=>OPENROUTER_API_KEY,ask:askOpenRouter},
  {name:"Mistral",model:MISTRAL_MODEL,key:()=>MISTRAL_API_KEY,ask:askMistral}
];

async function askAI(prompt){
  const errors=[];

  for(const provider of providers){
    if(!provider.key())continue;

    console.log(`[AI] Intentando ${provider.name} (${provider.model})`);

    try{
      const reply=await provider.ask(prompt);

      console.log(`[AI] ${provider.name} respondió correctamente.`);
      debugState.successfulRequests++;

      return{
        reply,
        provider:provider.name,
        model:provider.model,
        errors
      };
    }catch(error){
      const status=error.status||0;
      const type=classifyError(status,error.message);

      const info={
        provider:provider.name,
        model:provider.model,
        status,
        type,
        message:error.message
      };

      errors.push(info);
      addDebugError(info);

      console.error(
        `[AI] ${provider.name} falló | ${type} | HTTP ${status} | ${error.message}`
      );

      queueWebhookLog(
        `❌ **IA falló**\nProveedor: ${provider.name}\nModelo: ${provider.model}\nTipo: ${type}\nHTTP: ${status||"N/A"}\nError: ${error.message}\n➡️ Siguiente proveedor...`
      );
    }
  }

  debugState.failedRequests++;

  const error=new Error("Todos los proveedores de IA fallaron.");
  error.details=errors;
  throw error;
}

async function sendLog(content){
  if(!DISCORD_LOG_WEBHOOK)return false;

  try{
    await fetch(DISCORD_LOG_WEBHOOK,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({content:String(content).slice(0,1900)})
    });
    return true;
  }catch(error){
    originalError("[WEBHOOK ERROR]",error.message);
    return false;
  }
}

function cleanReply(text){
  return text?String(text).replace(/\0/g,"").trim():"";
}

function authorized(req){
  if(!GATEWAY_TOKEN)return true;

  const auth=req.headers.authorization||"";
  return auth===`Bearer ${GATEWAY_TOKEN}`||
    req.headers["x-gateway-token"]===GATEWAY_TOKEN;
}

function readBody(req){
  return new Promise((resolve,reject)=>{
    let body="";
    let size=0;

    req.on("data",chunk=>{
      size+=chunk.length;

      if(size>1024*1024){
        reject(new Error("Request body demasiado grande."));
        req.destroy();
        return;
      }

      body+=chunk;
    });

    req.on("end",()=>resolve(body));
    req.on("error",reject);
  });
}

function response(res,status,data){
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(data));
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==="GET"&&req.url==="/"){
      return response(res,200,{
        ok:true,
        service:"ZeroLeoX Riven Gateway"
      });
    }

    if(req.method==="GET"&&req.url==="/health"){
      return response(res,200,{
        ok:true,
        service:"ZeroLeoX Riven Gateway",
        ai:providers.some(x=>!!x.key()),
        providers:providers.filter(x=>!!x.key()).map(x=>({
          provider:x.name,
          model:x.model,
          configured:true
        })),
        githubMemory:!!GITHUB_TOKEN,
        webhook:!!DISCORD_LOG_WEBHOOK,
        uptime:process.uptime(),
        node:process.version,
        requests:debugState.requests,
        successfulRequests:debugState.successfulRequests,
        failedRequests:debugState.failedRequests,
        memoryUsers:Object.keys(memories).length
      });
    }

    if(req.method==="GET"&&req.url==="/debug"){
      if(!authorized(req))
        return response(res,401,{ok:false,error:"Unauthorized"});

      return response(res,200,{
        ok:true,
        gateway:{
          service:"ZeroLeoX Riven Gateway",
          uptime:process.uptime(),
          node:process.version
        },
        providers:providers.map(x=>({
          provider:x.name,
          model:x.model,
          configured:!!x.key(),
          errors:debugState.providerErrors[x.name]||[]
        })),
        github:{
          configured:!!GITHUB_TOKEN,
          file:MEMORY_FILE,
          branch:GITHUB_BRANCH,
          loaded:memorySha!==null
        },
        webhook:{
          configured:!!DISCORD_LOG_WEBHOOK,
          ready:webhookReady
        },
        requests:{
          total:debugState.requests,
          successful:debugState.successfulRequests,
          failed:debugState.failedRequests
        },
        recentErrors:debugState.lastErrors
      });
    }

    if(req.method==="POST"&&req.url==="/chat"){
      if(!authorized(req))
        return response(res,401,{ok:false,error:"Unauthorized"});

      debugState.requests++;

      const raw=await readBody(req);
      let body;

      try{
        body=JSON.parse(raw);
      }catch{
        return response(res,400,{ok:false,error:"JSON inválido."});
      }

      const userId=String(body.userId||body.user_id||"unknown");
      const message=String(body.message||body.content||"").trim();

      if(!message)
        return response(res,400,{ok:false,error:"Falta message."});

      const rememberMatch=message.match(
        /^(?:recuerda:|recuérdame|recuerdame|acuérdate de|acuerdate de)\s+(.+)$/i
      );

      if(rememberMatch){
        const value=rememberMatch[1].trim();
        const added=addMemory(userId,value);
        const reply=added?"Lo recordaré.":"Eso ya estaba en mi memoria.";

        addHistory(userId,"user",message);
        addHistory(userId,"assistant",reply);
        await saveMemory();

        console.log(`[MEMORY] ${userId} pidió recordar: ${value}`);

        await sendLog(
          `🧠 **Memoria actualizada**\nUsuario: ${userId}\nAcción: recordar\nContenido: ${value}`
        );

        return response(res,200,{
          ok:true,
          reply,
          memory:true
        });
      }

      const forgetMatch=message.match(
        /^(?:olvida:|olvídate de|olvidate de|borra de tu memoria)\s+(.+)$/i
      );

      if(forgetMatch){
        const value=forgetMatch[1].trim();
        const removed=removeMemory(userId,value);
        const reply=removed?"Lo he olvidado.":"No encontré esa memoria.";

        addHistory(userId,"user",message);
        addHistory(userId,"assistant",reply);
        await saveMemory();

        console.log(`[MEMORY] ${userId} pidió olvidar: ${value}`);

        return response(res,200,{
          ok:true,
          reply,
          memory:true
        });
      }

      if(/^(?:qué recuerdas|que recuerdas|qué sabes de mí|que sabes de mi|mis memorias|mis recuerdos)$/i.test(message)){
        const user=ensureUser(userId);

        const reply=user.memories.length
          ?"Esto es lo que recuerdo:\n"+user.memories.map((x,i)=>`${i+1}. ${x}`).join("\n")
          :"No tengo memorias guardadas sobre ti.";

        addHistory(userId,"user",message);
        addHistory(userId,"assistant",reply);
        await saveMemory();

        return response(res,200,{
          ok:true,
          reply,
          memory:true
        });
      }

      addHistory(userId,"user",message);

      const result=await askAI(buildPrompt(userId,message));
      const reply=cleanReply(result.reply);

      if(!reply)
        throw new Error("La IA devolvió una respuesta vacía.");

      addHistory(userId,"assistant",reply);
      await saveMemory();

      console.log(`[CHAT] ${userId} → ${result.provider}/${result.model}`);

      await sendLog(
        `💬 **Riven respondió**\nUsuario: ${userId}\nIA: ${result.provider}\nModelo: ${result.model}`
      );

      return response(res,200,{
        ok:true,
        reply,
        provider:result.provider,
        model:result.model
      });
    }

    return response(res,404,{
      ok:false,
      error:"Ruta no encontrada."
    });
  }catch(error){
    debugState.failedRequests++;

    console.error(
      "[SERVER ERROR]",
      error?.stack||error
    );

    addDebugError({
      system:"server",
      type:classifyError(error.status,error.message),
      status:error.status||0,
      message:error.message
    });

    await sendLog(
      `🚨 **ERROR DEL GATEWAY**\n<@${CREATOR}> <@${DEV2}>\nTipo: ${classifyError(error.status,error.message)}\nHTTP: ${error.status||"N/A"}\nError: ${error.message}`
    );

    return response(res,500,{
      ok:false,
      error:error.message||"Internal Server Error"
    });
  }
});

loadMemory().then(()=>{
  webhookReady=true;

  console.log("🚀 ZeroLeoX Riven Gateway iniciando...");
  console.log(`👑 Creator ID: ${CREATOR}`);
  console.log(`🛠️ Developer 2 ID: ${DEV2}`);

  console.log(
    `[AI] Proveedores: ${
      providers.filter(x=>!!x.key()).map(x=>x.name).join(", ")||"ninguno"
    }`
  );

  console.log(`[MEMORY] GitHub: ${GITHUB_TOKEN?"ACTIVO":"DESACTIVADO"}`);
  console.log(`[WEBHOOK] Logs: ${DISCORD_LOG_WEBHOOK?"ACTIVOS":"DESACTIVADOS"}`);

  server.listen(PORT,()=>{
    console.log(`✅ ZeroLeoX Riven Gateway listening on port ${PORT}`);

    queueWebhookLog(
      `🟢 **Riven Gateway iniciado**\nPuerto: ${PORT}\nNode: ${process.version}\nIA: ${
        providers.filter(x=>!!x.key()).map(x=>x.name).join(", ")||"ninguna"
      }\nGitHub Memory: ${GITHUB_TOKEN?"ON":"OFF"}`
    );
  });
}).catch(error=>{
  originalError("[FATAL] Error iniciando gateway:",error);
  process.exit(1);
});