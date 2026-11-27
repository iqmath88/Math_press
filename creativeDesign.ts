import type { JSONContent } from "@tiptap/core";
import type { MathPressDocument } from "./types";

export const blockTypes = [
  ["chapter","عنوان الفصل"], ["lesson","عنوان الدرس"], ["subtitle","عنوان فرعي"], ["definition","تعريف"],
  ["concept","مفهوم أساسي"], ["law","قانون"], ["theorem","نظرية"], ["proof","برهان"], ["property","خاصية"],
  ["rule","قاعدة"], ["example","مثال"], ["solution","حل"], ["note","ملاحظة"], ["warning","تنبيه"],
  ["idea","فكرة مهمة"], ["ministerial-idea","فكرة وزارية"], ["ministerial-question","سؤال وزاري"],
  ["exercise","تمرين"], ["check","اختبر فهمك"], ["summary","خلاصة"], ["homework","واجب"],
  ["illustration","وسيلة إيضاح"], ["custom","صندوق مخصص"]
] as const;
export const blockLabel = (kind: unknown) => blockTypes.find(([id]) => id === kind)?.[1] ?? "صندوق مخصص";

export const designs = [
  ["academic","أكاديمي أزرق","#193c6b","#eaf2fb","Noto Naskh Arabic","1.65","9px","3px"],
  ["minimal","عصري بسيط","#334155","#f3f5f7","Cairo","1.55","8px","1px"],
  ["emerald","أخضر تعليمي","#135643","#eaf6ef","Cairo","1.72","12px","2px"],
  ["ivory","عاجي وذهبي","#745411","#fff6e1","Amiri","1.8","13px","2px"],
  ["classic","رياضي كلاسيكي","#352b45","#f2eef5","Amiri","1.75","8px","3px"],
  ["economy","اقتصادي للطباعة","#171717","#ffffff","Noto Naskh Arabic","1.5","6px","1px"]
] as const;
export function designVariables(id: unknown): Record<string,string> {
  const design = designs.find(([name]) => name === id);
  if (!design) return {};
  const [, , accent, tint, font, leading, spacing, border] = design;
  return {"--creative-accent":accent,"--creative-tint":tint,"--creative-font":font,
    "--creative-leading":leading,"--creative-spacing":spacing,"--creative-border":border};
}

export const paragraph = (text: string): JSONContent => ({
  type:"paragraph", ...(text ? {content:[{type:"text",text}]} : {})
});
const heading = (text: string): JSONContent => ({type:"heading",attrs:{level:1},content:[{type:"text",text}]});
const equation = (latex: string): JSONContent => ({type:"mathBlock",attrs:{latex}});
export const educationBlock = (kind: string, content = [paragraph("")]): JSONContent =>
  ({type:"educationBlock",attrs:{kind},content});

export const creativeTemplates: { id: string; name: string; category: string; design: string; content: JSONContent[] }[] = [
  {id:"lesson", name:"تطبيقات التفاضل", category:"ملزمة", design:"academic", content:[
    heading("تطبيقات التفاضل"), educationBlock("definition",[paragraph("النقطة الحرجة تقع في مجال الدالة وتكون المشتقة عندها صفرًا أو غير موجودة.")]),
    educationBlock("law",[paragraph("نبحث عن تبدّل إشارة المشتقة لتصنيف النقطة الحرجة."),equation("f'(x)=0")]),
    educationBlock("example",[paragraph("أوجد القيمة الصغرى للدالة التربيعية."),equation("f(x)=x^2-4x+5")]),
    educationBlock("solution",[equation("f'(x)=2x-4"),paragraph("تتغير إشارة المشتقة من سالبة إلى موجبة عند ٢. إذن القيمة الصغرى هي ١.")]),
    {type:"pageBreak"}, educationBlock("lesson",[heading("٢. اختبار المشتقة الأولى")]),
    educationBlock("example",[paragraph("صنّف النقاط الحرجة للدالة التكعيبية."),equation("g(x)=x^3-3x")]),
    educationBlock("solution",[equation("g'(x)=3(x-1)(x+1)"),paragraph("المشتقة موجبة خارج الفترة من −١ إلى ١، وسالبة داخلها. عند −١ عظمى محلية، وعند ١ صغرى محلية.")]),
    {type:"graph",attrs:{spec:{xmin:-3,xmax:3,ymin:-4,ymax:4,axes:true,grid:true,equal:false,widthPct:64,
      caption:"منحنى يوضح القيمتين القصويين المحليتين",items:[{id:"derivative-cubic",type:"function",expr:"x^3-3*x",color:"#193c6b",dashed:false,from:"",to:""}]}}},
    {type:"pageBreak"}, educationBlock("lesson",[heading("٣. اختبار المشتقة الثانية")]),
    educationBlock("law",[paragraph("عند نقطة حرجة داخلية: إذا كانت المشتقة الثانية موجبة فهي نقطة صغرى محلية؛ وإذا كانت سالبة فهي نقطة عظمى محلية.")]),
    educationBlock("warning",[paragraph("إذا كانت المشتقة الثانية صفرًا فلا يمكن الحكم بهذا الاختبار وحده.")]),
    educationBlock("example",[equation("h(x)=x^4"),paragraph("المشتقة الثانية تساوي صفرًا عند الصفر، ومع ذلك توجد قيمة صغرى مطلقة عنده.")]),
    {type:"pageBreak"}, educationBlock("lesson",[heading("٤. مسألة المساحة العظمى")]),
    {type:"graph",attrs:{spec:{xmin:-1,xmax:9,ymin:-1,ymax:6,axes:false,grid:false,equal:true,widthPct:58,
      caption:"مستطيل يوضح متغيرَي المسألة",items:[{id:"max-area-rectangle",type:"polygon",pts:"A(0,0) B(8,0) C(8,4) D(0,4)",color:"#135643",fill:true}]}}},
    educationBlock("definition",[paragraph("مستطيل محيطه ٢٠ مترًا. أوجد بُعديه عندما تكون المساحة عظمى.")]),
    educationBlock("solution",[equation("A(x)=x(10-x)"),paragraph("تتغير إشارة المشتقة من موجبة إلى سالبة عند ٥. الشكل المطلوب مربع ضلعُه ٥ أمتار ومساحتُه ٢٥ مترًا مربعًا.")]),
    {type:"pageBreak"}, educationBlock("lesson",[heading("٥. مراجعة وتمارين")]),
    educationBlock("summary",[paragraph("حدّد المجال أولًا ثم النقاط الحرجة. افحص تغير إشارة المشتقة، وقارن قيم الأطراف إذا كان المجال مغلقًا.")]),
    educationBlock("exercise",[paragraph("أوجد القيمتين العظمى والصغرى المطلقَتين للدالة على الفترة [٠، ٤]."),equation("f(x)=x^2-4x+3")]),
    educationBlock("homework",[paragraph("اكتب مثالًا تكون فيه قيمة قصوى عند طرف الفترة، وفسّر لماذا يجب فحص الطرفين.")])
  ]},
  {id:"exam",name:"امتحان رياضيات متعدد الفروع",category:"امتحان",design:"economy",content:[
    heading("ورقة امتحان الرياضيات"), paragraph("المديرية: ______    المدرسة: ______    العام الدراسي: ______"),
    paragraph("المادة: الرياضيات   الصف: ______   الشعبة: ______   الفصل: ______"),
    paragraph("نوع الامتحان: ______   التاريخ: ______   الزمن: ______   الدرجة الكلية: ٤٠   المدرس: ______"),
    educationBlock("note",[paragraph("أجب عن الأسئلة جميعها، وبيّن خطوات الحل.")]),
    {type:"orderedList",attrs:{educationalList:"exam"},content:[
      ["أوجد مشتقة الدالة", "x^3-2x","هل توجد نقطة حرجة عند صفر؟"],
      ["أوجد قيمة التكامل", "\\int_0^1 2x\\,dx","تحقق باستخدام التكامل غير المحدد."],
      ["حل المعادلة", "x^2-5x+6=0","تحقق من الحلّين بالتعويض."],
      ["أوجد النهاية", "\\lim_{x\\to 0}\\frac{\\sin x}{x}","اذكر شرط قياس الزاوية."]
    ].map(([question,latex,branch])=>({type:"listItem",attrs:{points:"10"},content:[
      paragraph(question),equation(latex),
      {type:"orderedList",attrs:{educationalList:"branches"},content:[{type:"listItem",content:[paragraph(branch)]}]}
    ]}))},
    paragraph("مع تمنياتنا بالتوفيق.")
  ]},
  {id:"cover",name:"غلاف الفصل الدراسي",category:"غلاف",design:"ivory",content:[
    educationBlock("chapter",[heading("ملزمة الرياضيات"),paragraph("الفصل الدراسي: ______")]),
    educationBlock("subtitle",[paragraph("الصف: ______     إعداد: ______     العام الدراسي: ______")])
  ]},
  {id:"rules",name:"ورقة قوانين التفاضل",category:"ورقة عمل",design:"emerald",content:[
    heading("قوانين التفاضل"),educationBlock("law",[paragraph("قاعدة القوة"),equation("\\frac{d}{dx}x^n=nx^{n-1}")]),
    educationBlock("law",[paragraph("قاعدة حاصل الضرب"),equation("(uv)'=u'v+uv'")]),
    educationBlock("check",[paragraph("استخدم القاعدتين لتفاضل الدالة الآتية."),equation("f(x)=x^2(x+1)")])
  ]}
];

export type SavedCreativeTemplate = { name: string; content: JSONContent; design?: string };
export function makeTemplate(doc: MathPressDocument, id: string): MathPressDocument {
  const template = creativeTemplates.find(item => item.id === id);
  if (!template) return doc;
  return {...doc, title:template.name, schemaVersion:4,
    creativeDesign:template.design, content:{type:"doc",content:structuredClone(template.content)}};
}
