import http from "node:http";
const server = http.createServer(async (req, res) => {
  if (req.method === "GET") { res.end("test provider"); return; }
  let body = ""; for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  const capture = { company:"合成截图科技",role:"Java 后端",location:"杭州",salary:"",deadline:"",jd:"岗位职责：使用 Java 开发接口。任职要求：熟悉 MySQL。",sourceUrl:"",evidence:[{field:"jd",quote:"使用 Java 开发接口"}],warnings:[] };
  if (req.url === "/responses") {
    if (!payload.text?.format?.json_schema?.schema) { res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"json_schema configuration is required"}}));return; }
    if (payload.input.includes("/slow-capture")) await new Promise((resolve) => setTimeout(resolve, 4500));
    const blocked = payload.input.includes("/restricted");
    const output = blocked ? {...capture,company:"",role:"",location:"",jd:"",evidence:[],warnings:["未取得网页正文"]} : {...capture,company:"合成链接科技", ...(payload.input.includes("/malformed") ? { classificationClues: [{ field: "companyNature", value: "private", quote: "" }] } : {})};
    res.setHeader("content-type","application/json");res.end(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(output)}]}],usage:{total_tokens:50}}));return;
  }
  const content = payload.messages?.find((m) => m.role === "user")?.content || "{}";
  if (Array.isArray(content)) {
    res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:"合成截图科技 Java 后端 杭州 使用 Java 开发接口 熟悉 MySQL 公司性质：民营企业"},finish_reason:"stop"}]}));return;
  }
  if (payload.response_format?.json_schema?.name === "job_capture_image_v1") {
    const classified = { ...capture, classificationClues: [{ field: "companyNature", value: "private", quote: "公司性质：民营企业" }] };
    res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(classified)},finish_reason:"stop"}],usage:{total_tokens:50}}));return;
  }
  const input = JSON.parse(content);
  let output;
  if (input.resumeBlocks) {
    const requirement = input.requirements[0];
    output = { suggestions: [{ key:"s1", category:"B", requirementRefs:[requirement.requirementId], evidenceRefs:[],
      resumeQuotes:[{blockId:input.resumeBlocks[0].id,quote:input.resumeBlocks[0].text}],resumeLocation:"第一段",
      issue:"补充项目中的个人行动和可验证结果",suggestedExpression:null,action:"add_evidence",questions:["是否有真实测量结果？"] }],warnings:[] };
  } else {
    const broken = input.blocks.some((b) => b.text.includes("BROKEN_REF"));
    const slow = input.blocks.some((b) => b.text.includes("SLOW"));
    if (slow) await new Promise(resolve => setTimeout(resolve,1200));
    output={complete:true,requirements:input.blocks.filter((b)=>b.text.includes("Java")||b.text.includes("Redis")).map((block,i)=>({
      key:"r"+i,type:"technical_skill",rawName:block.text.includes("Java")?"Java":"Redis",proposedName:block.text.includes("Java")?"Java":"Redis",
      importance:block.text.includes("加分")?"bonus":"must",depth:"",polarity:"required",condition:"",
      citations:[{blockId:block.id,quote:broken?"不存在的原文":block.text}],reviewReason:""
    })),groups:[],warnings:[]};
  }
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)},finish_reason:"stop"}],usage:{prompt_tokens:20,completion_tokens:30,total_tokens:50}}));
});
server.listen(4174,"127.0.0.1");
process.on("SIGTERM",()=>server.close());
