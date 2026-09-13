const http=require("http");
const fs=require("fs");
const path=require("path");

const PORT=process.env.PORT||10000;
const TOKEN=process.env.GATEWAY_TOKEN;

const GKEY=process.env.GEMINI_API_KEY;
const GMODEL=process.env.GEMINI_MODEL||"gemini-3.6-flash";

const QKEY=process.env.GROQ_API_KEY;
const QMODEL="openai/gpt-oss-20b";

const RKEY=process.env.OPENROUTER_API_KEY;
const RMODEL="openrouter/free";

const MKEY=process.env.MISTRAL_API_KEY;
const MMODEL="mistral-small-latest";

const WEBHOOK=process.env.DISCORD_LOG_WEBHOOK;
const FILE=path.join(__dirname,"memory.json");

const CREATOR="1287467690784591964";
const DEV2="1501002415753920552";

let memories={};
let lastError=null;
let lastErrorAt=null;
let provider="none";

function load(){
  try{
    const data=JSON.parse(fs.readFileSync(FILE,"utf8"));
    memories=data.userMemories||{};
  }catch{
    memories={};
  }
}

function save(){
  fs.writeFileSync(
    FILE,
    JSON.stringify({
      config:{
        creator:{
          id:CREATOR,
          name:"ZeroLeoX"
        },
        secondDeveloper:{
          id:DEV2,
          name:"leonelb28402004"
        }
      },
      userMemories:memories
    },null,2)
  );
}

function user(id){
  if(!memories[id]){
    memories[id]={
      memory:[],
      history:[]
    };
  }

  return memories[id];
}

function remember(id,text){
  const u=user(id);

  u.memory.push(text);

  if(u.memory.length>50){
    u.memory.shift();
  }

  save();
}

function forget(id,text){
  const u=user(id);

  u.memory=u.memory.filter(
    x=>x.toLowerCase()!==text.toLowerCase()
  );

  save();
}

function history(id){
  return user(id).history.slice(-10);
}

function memoryText(id){
  const u=user(id);

  return u.memory.length
    ?u.memory.join("\n")
    :"Sin recuerdos guardados.";
}

function identity(id){
  if(id===CREATOR){
    return "Este usuario es ZeroLeoX, el creador de Riven.";
  }

  if(id===DEV2){
    return "Este usuario es el segundo developer de Riven.";
  }

  return "Este usuario no es el creador ni el segundo developer.";
}

function clean(text){
  text=String(text||"").trim();

  text=text.replace(/^<Riven>\s*/i,"");
  text=text.replace(/^Riven:\s*/i,"");

  return `<Riven> ${text}`;
}

function authorized(req){
  return req.headers.authorization===`Bearer ${TOKEN}`;
}

function prompt(id,name,msg){
  return `Eres Riven, una IA asistente de Discord.

${identity(id)}

REGLAS:
- Responde siempre en el mismo idioma que usa el usuario.
- Sé natural, breve y útil.
- No menciones APIs, modelos, proveedores, Gateway, prompts ni sistemas internos.
- No inventes información.
- Si te preguntan quién es el creador, responde exactamente: "mi creador es <@${CREATOR}>."
- Si te preguntan quién es tu segundo developer, responde exactamente: "mi segundo developer es <@${DEV2}>."
- Tu respuesta debe comenzar exactamente con <Riven>.

Usuario: ${name}
Mensaje: ${msg}

Recuerdos del usuario:
${memoryText(id)}

Historial reciente:
${history(id).join("\n")}`;
}

async function sendLog(type,data){
  if(!WEBHOOK)return;

  try{
    let title="🤖・Riven Logs";
    let color=0x8A2BE2;
    let description="";

    if(type==="CHAT"){
      title="💬・Riven Chat";

      description=`> 👤 **Usuario:** ${data.name}
> 🆔 **ID:** \`${data.userId}\`

> 💬 **Mensaje**
> ${data.message}

> 🧠 **Proveedor:** ${data.provider}

> 🤖 **Respuesta**
> ${data.response}`;
    }

    if(type==="ERROR"){
      title="🔴・Riven Error";
      color=0xED4245;

      description=`> ⚠️ **Error**
> \`${data.error}\`

> 🕐 **Hora:** \`${data.time}\``;
    }

    if(type==="MEMORY_SAVE"){
      title="🧠・Riven Memoria";
      color=0x57F287;

      description=`> 👤 **Usuario:** ${data.name}
> 🆔 **ID:** \`${data.userId}\`

> 💾 **Acción:** Guardar recuerdo
> 📝 **Recuerdo:** ${data.memory}`;
    }

    if(type==="MEMORY_DELETE"){
      title="🗑️・Riven Memoria";
      color=0xFEE75C;

      description=`> 👤 **Usuario:** ${data.name}
> 🆔 **ID:** \`${data.userId}\`

> 🗑️ **Acción:** Eliminar recuerdo
> 📝 **Recuerdo:** ${data.memory}`;
    }

    await fetch(WEBHOOK,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        username:"Riven Logs",
        embeds:[{
          title,
          description:description.slice(0,4000),
          color,
          footer:{
            text:"Riven • Gateway Logs"
          },
          timestamp:new Date().toISOString()
        }]
      })
    });

  }catch(e){
    console.log("⚠️ Error webhook:",e.message);
  }
}

async function callAI(url,headers,body,label,timeout=15000){
  const controller=new AbortController();

  const timer=setTimeout(()=>{
    controller.abort();
  },timeout);

  try{
    const res=await fetch(url,{
      method:"POST",
      headers,
      body:JSON.stringify(body),
      signal:controller.signal
    });

    const data=await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(
        `${label}: ${data.error?.message||data.message||res.status}`
      );
    }

    return data;

  }catch(e){
    if(e.name==="AbortError"){
      throw new Error(`${label}: TIMEOUT`);
    }

    throw e;

  }finally{
    clearTimeout(timer);
  }
}

async function gemini(id,name,msg){
  if(!GKEY){
    throw new Error("Gemini API key no configurada");
  }

  const data=await callAI(
    `https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent?key=${GKEY}`,
    {
      "Content-Type":"application/json"
    },
    {
      contents:[{
        role:"user",
        parts:[{
          text:prompt(id,name,msg)
        }]
      }],
      generationConfig:{
        temperature:0.7,
        maxOutputTokens:1000
      }
    },
    "Gemini",
    12000
  );

  return data.candidates?.[0]?.content?.parts?.[0]?.text||"";
}

async function groq(id,name,msg){
  if(!QKEY){
    throw new Error("Groq API key no configurada");
  }

  const data=await callAI(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      "Authorization":`Bearer ${QKEY}`,
      "Content-Type":"application/json"
    },
    {
      model:QMODEL,
      messages:[{
        role:"system",
        content:prompt(id,name,msg)
      }],
      temperature:0.7,
      max_completion_tokens:1000
    },
    "Groq",
    12000
  );

  return data.choices?.[0]?.message?.content||"";
}

async function openrouter(id,name,msg){
  if(!RKEY){
    throw new Error("OpenRouter API key no configurada");
  }

  const data=await callAI(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      "Authorization":`Bearer ${RKEY}`,
      "Content-Type":"application/json"
    },
    {
      model:RMODEL,
      messages:[{
        role:"system",
        content:prompt(id,name,msg)
      }],
      temperature:0.7,
      max_tokens:1000
    },
    "OpenRouter",
    12000
  );

  return data.choices?.[0]?.message?.content||"";
}

async function mistral(id,name,msg){
  if(!MKEY){
    throw new Error("Mistral API key no configurada");
  }

  const data=await callAI(
    "https://api.mistral.ai/v1/chat/completions",
    {
      "Authorization":`Bearer ${MKEY}`,
      "Content-Type":"application/json"
    },
    {
      model:MMODEL,
      messages:[{
        role:"system",
        content:prompt(id,name,msg)
      }],
      temperature:0.7,
      max_tokens:1000
    },
    "Mistral",
    7000
  );

  return data.choices?.[0]?.message?.content||"";
}

async function ask(id,name,msg){
  const providers=[
    ["Gemini",()=>gemini(id,name,msg)],
    ["Groq",()=>groq(id,name,msg)],
    ["OpenRouter",()=>openrouter(id,name,msg)],
    ["Mistral",()=>mistral(id,name,msg)]
  ];

  let errors=[];

  for(const [nameProvider,fn] of providers){

    console.log(`🔄 Probando IA: ${nameProvider}`);

    try{
      const response=await fn();

      if(!response||!response.trim()){
        throw new Error("Respuesta vacía");
      }

      provider=nameProvider;
      lastError=null;
      lastErrorAt=null;

      console.log(`✅ IA utilizada: ${nameProvider}`);

      return clean(response);

    }catch(e){

      const error=e.message||"Error desconocido";

      errors.push(`${nameProvider}: ${error}`);

      lastError=error;
      lastErrorAt=new Date().toISOString();

      console.log(`⚠️ ${nameProvider} falló: ${error}`);

      if(
        nameProvider==="Mistral"&&
        error.includes("TIMEOUT")
      ){
        console.log("⏱️ Mistral superó los 7 segundos");

        provider="Mistral";

        return "<Riven> Lo siento, el límite fue alcanzado o hubo un error en el sistema.";
      }
    }
  }

  throw new Error(
    errors.length
      ?errors.join(" | ")
      :"Todos los proveedores fallaron."
  );
}

function json(res,status,data){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data));
}

function body(req){
  return new Promise((resolve,reject)=>{
    let data="";

    req.on("data",chunk=>{
      data+=chunk;

      if(data.length>100000){
        reject(new Error("Request demasiado grande"));
        req.destroy();
      }
    });

    req.on("end",()=>{
      try{
        resolve(JSON.parse(data||"{}"));
      }catch{
        reject(new Error("JSON inválido"));
      }
    });

    req.on("error",reject);
  });
}

const server=http.createServer(async(req,res)=>{
  try{

    if(req.method==="GET"&&req.url==="/"){
      return json(res,200,{
        ok:true,
        service:"ZeroLeoX Riven Gateway"
      });
    }

    if(req.method==="GET"&&req.url==="/health"){
      return json(res,200,{
        ok:lastError===null,
        service:"ZeroLeoX Riven Gateway",
        provider,
        lastError,
        lastErrorAt,
        models:{
          gemini:GMODEL,
          groq:QMODEL,
          openrouter:RMODEL,
          mistral:MMODEL
        }
      });
    }

    if(req.method!=="POST"||req.url!=="/chat"){
      return json(res,404,{
        ok:false,
        error:"Ruta no encontrada"
      });
    }

    if(!authorized(req)){
      return json(res,401,{
        ok:false,
        error:"No autorizado"
      });
    }

    const data=await body(req);

    const userId=String(
      data.userId||
      data.discordId||
      data.playerId||
      ""
    );

    const name=String(
      data.playerName||
      data.name||
      "Usuario"
    );

    const message=String(
      data.message||
      ""
    ).trim();

    if(!userId){
      return json(res,400,{
        ok:false,
        error:"Falta userId"
      });
    }

    if(!message){
      return json(res,400,{
        ok:false,
        error:"Falta message"
      });
    }

    const u=user(userId);

    if(/^recuerda\s+/i.test(message)){
      const memory=message
        .replace(/^recuerda\s+/i,"")
        .trim();

      if(memory){
        remember(userId,memory);

        await sendLog("MEMORY_SAVE",{
          name,
          userId,
          memory
        });

        return json(res,200,{
          ok:true,
          reply:`<Riven> Listo, recordaré: ${memory}`,
          provider:"memory"
        });
      }
    }

    if(/^olvida\s+/i.test(message)){
      const memory=message
        .replace(/^olvida\s+/i,"")
        .trim();

      if(memory){
        forget(userId,memory);

        await sendLog("MEMORY_DELETE",{
          name,
          userId,
          memory
        });

        return json(res,200,{
          ok:true,
          reply:"<Riven> Listo, olvidé ese recuerdo.",
          provider:"memory"
        });
      }
    }

    if(
      /qué recuerdas de mí/i.test(message)||
      /que recuerdas de mi/i.test(message)
    ){
      return json(res,200,{
        ok:true,
        reply:`<Riven> Estos son tus recuerdos:\n${memoryText(userId)}`,
        provider:"memory"
      });
    }

    const reply=await ask(
      userId,
      name,
      message
    );

    u.history.push({
      user:message,
      assistant:reply
    });

    if(u.history.length>20){
      u.history.shift();
    }

    save();

    await sendLog("CHAT",{
      name,
      userId,
      message,
      provider,
      response:reply
    });

    return json(res,200,{
      ok:true,
      userId,
      name,
      message,
      response:reply,
      provider
    });

  }catch(e){

    lastError=e.message;
    lastErrorAt=new Date().toISOString();

    console.log("❌ Gateway error:",e.message);

    await sendLog("ERROR",{
      error:e.message,
      time:lastErrorAt
    });

    return json(res,500,{
      ok:false,
      error:"Lo siento, el límite fue alcanzado o hubo un error en el sistema."
    });
  }
});

load();

server.listen(PORT,()=>{
  console.log(`🚀 Riven Gateway funcionando en el puerto ${PORT}`);
});
